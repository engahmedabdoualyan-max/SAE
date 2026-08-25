"""Subprocess-based integration with Eclipse SUMO.

Pipeline:
    our JSON network -> plain XML (nodes/edges) -> `netconvert` -> network.net.xml
    demand dict      -> routes.rou.xml
    batch run        -> `sumo` subprocess with FCD + tripinfo output
    FCD output       -> vehicle trajectories + per-edge aggregates

Requires the SUMO tools `sumo` and `netconvert` on PATH (or pass explicit
binary paths). Interactive stepping additionally requires the `traci` package.
"""

from __future__ import annotations

import argparse
import json
import math
import shutil
import statistics
import subprocess
import sys
import tempfile
import xml.etree.ElementTree as ET
from collections.abc import Mapping
from pathlib import Path
from typing import Any

_RUN_TIMEOUT_SECONDS = 900
_CONVERT_TIMEOUT_SECONDS = 300
_XML_HEADER = '<?xml version="1.0" encoding="UTF-8"?>\n'


class SUMOBridgeError(RuntimeError):
    """Raised when SUMO tooling is missing or a conversion/run step fails."""


def _xml_tostring(element: ET.Element) -> str:
    ET.indent(element)
    return _XML_HEADER + ET.tostring(element, encoding="unicode")


class SUMOBridge:
    """Drive a SUMO simulation as an external subprocess."""

    def __init__(
        self,
        sumo_binary: str | None = None,
        netconvert_binary: str | None = None,
        workdir: str | None = None,
        label: str = "sae-sumo",
    ) -> None:
        self.sumo_binary = sumo_binary or shutil.which("sumo") or shutil.which("sumo-gui")
        self.netconvert_binary = netconvert_binary or shutil.which("netconvert")
        self._owns_workdir = workdir is None
        self.workdir = Path(workdir or tempfile.mkdtemp(prefix=f"{label}-"))
        self.workdir.mkdir(parents=True, exist_ok=True)

        self.net_path = self.workdir / "network.net.xml"
        self.route_path = self.workdir / "routes.rou.xml"
        self.cfg_path = self.workdir / "run.sumocfg"
        self.fcd_path = self.workdir / "fcd_output.xml"
        self.tripinfo_path = self.workdir / "tripinfo_output.xml"

        self.edge_ids: list[str] = []
        self._network_loaded = False
        self._routes_loaded = False
        self._process: subprocess.Popen[str] | None = None
        self._fcd_cache: list[dict[str, Any]] | None = None

    # ------------------------------------------------------------------ #
    # Lifecycle
    # ------------------------------------------------------------------ #

    def start(self) -> None:
        """Validate the environment and prepare the working directory."""
        if self.sumo_binary is None:
            raise SUMOBridgeError(
                "SUMO binary not found on PATH. Install SUMO (https://eclipse.dev/sumo) "
                "or pass sumo_binary=/path/to/sumo."
            )
        self.workdir.mkdir(parents=True, exist_ok=True)

    def stop(self) -> None:
        """Terminate the simulator process and clean up temporary files."""
        if self._process is not None and self._process.poll() is None:
            self._process.terminate()
            try:
                self._process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                self._process.kill()
        self._process = None
        if self._owns_workdir:
            shutil.rmtree(self.workdir, ignore_errors=True)

    def __enter__(self) -> SUMOBridge:
        self.start()
        return self

    def __exit__(self, *exc_info: object) -> None:
        self.stop()

    # ------------------------------------------------------------------ #
    # Conversion: our JSON -> SUMO input files
    # ------------------------------------------------------------------ #

    @staticmethod
    def _to_local_meters(network: Mapping[str, Any]) -> list[dict[str, Any]]:
        """Project node lon/lat degrees into a local meter frame.

        netconvert interprets plain-XML coordinates as cartesian metres; raw
        geographic degrees collapse the network to centimetres, producing
        degenerate 5-metre edges. A local equirectangular projection around
        the first node preserves relative geometry (accurate to <0.1% at
        city scale) without adding a pyproj dependency.
        """
        nodes = [dict(n) for n in (network.get("nodes") or [])]
        if not nodes:
            return nodes
        lat0 = float(nodes[0].get("y", nodes[0].get("lat", 0.0)) or 0.0)
        lng0 = float(nodes[0].get("x", nodes[0].get("lng", 0.0)) or 0.0)
        m_per_deg_lat = 110_540.0
        m_per_deg_lng = max(1.0, 111_320.0 * math.cos(math.radians(lat0)))
        for n in nodes:
            lat = float(n.get("y", n.get("lat", 0.0)) or 0.0)
            lng = float(n.get("x", n.get("lng", 0.0)) or 0.0)
            n["x"] = (lng - lng0) * m_per_deg_lng
            n["y"] = (lat - lat0) * m_per_deg_lat
        for n in nodes:  # keep SUMO's positive-quadrant preference
            n["x"] = round(n["x"] + 1000.0, 3)
            n["y"] = round(n["y"] + 1000.0, 3)
        return nodes

    @staticmethod
    def network_to_nodes_xml_from(projected: list[dict[str, Any]]) -> str:
        root = ET.Element("nodes")
        for node in projected:
            ET.SubElement(
                root,
                "node",
                attrib={
                    "id": str(node["id"]),
                    "x": f"{float(node.get('x', 0.0)):.3f}",
                    "y": f"{float(node.get('y', 0.0)):.3f}",
                    "type": "priority",
                },
            )
        return _xml_tostring(root)

    @staticmethod
    def network_to_nodes_xml(network: Mapping[str, Any]) -> str:
        root = ET.Element("nodes")
        for node in network.get("nodes") or []:
            ET.SubElement(
                root,
                "node",
                attrib={
                    "id": str(node["id"]),
                    "x": f"{float(node.get('x', 0.0)):.3f}",
                    "y": f"{float(node.get('y', 0.0)):.3f}",
                    "type": "priority",
                },
            )
        return _xml_tostring(root)

    @staticmethod
    def network_to_edges_xml(network: Mapping[str, Any]) -> str:
        root = ET.Element("edges")
        for edge in network.get("edges") or []:
            attrib: dict[str, str] = {
                "id": str(edge["id"]),
                "from": str(edge["from"]),
                "to": str(edge["to"]),
                "numLanes": str(max(1, int(edge.get("lanes", 1)))),
                "speed": f"{float(edge.get('speed', 13.89)):.2f}",
            }
            shape = edge.get("shape")
            if isinstance(shape, list) and shape:
                attrib["shape"] = " ".join(f"{float(x):.2f},{float(y):.2f}" for x, y in shape)
            elif isinstance(shape, str) and shape:
                attrib["shape"] = shape
            ET.SubElement(root, "edge", attrib=attrib)
        return _xml_tostring(root)

    def load_network(self, network: Mapping[str, Any]) -> Path:
        """Convert our network JSON to plain XML and build a .net.xml via netconvert."""
        nodes = network.get("nodes") or []
        edges = network.get("edges") or []
        if not nodes or not edges:
            raise SUMOBridgeError("Network must contain non-empty 'nodes' and 'edges' lists")

        nod_path = self.workdir / "nodes.nod.xml"
        edg_path = self.workdir / "edges.edg.xml"
        nod_path.write_text(
            self.network_to_nodes_xml_from(self._to_local_meters(network)),
            encoding="utf-8",
        )
        edg_path.write_text(self.network_to_edges_xml(network), encoding="utf-8")

        if self.netconvert_binary is None:
            raise SUMOBridgeError(
                "'netconvert' not found on PATH. It ships with SUMO - install it from "
                "https://eclipse.dev/sumo or set SUMO_HOME."
            )

        cmd = [
            self.netconvert_binary,
            "--node-files", nod_path.name,
            "--edge-files", edg_path.name,
            "--output-file", self.net_path.name,
            "--offset.disable-normalization", "true",
            "--no-turnarounds", "true",
        ]
        result = subprocess.run(
            cmd, cwd=self.workdir, capture_output=True, text=True,
            timeout=_CONVERT_TIMEOUT_SECONDS, check=False,
        )
        if result.returncode != 0 or not self.net_path.exists():
            raise SUMOBridgeError(f"netconvert failed: {result.stderr.strip()[:2000]}")

        self.edge_ids = [str(edge["id"]) for edge in edges]
        self._network_loaded = True
        return self.net_path

    # ------------------------------------------------------------------ #
    # Demand -> routes.rou.xml
    # ------------------------------------------------------------------ #

    @staticmethod
    def demand_to_routes_xml(
        demand: Mapping[str, Any],
        *,
        valid_edges: list[str] | None = None,
        duration: float = 600.0,
        idm_params: Mapping[str, Any] | None = None,
        departure_rate_per_edge: float = 0.02,
        max_vehicles: int = 1500,
    ) -> str:
        """Build a .rou.xml file from our demand definition.

        Supported keys: ``types`` (vType attrs), ``vehicles`` [{id, depart,
        route, type}], ``flows`` [{id, begin, end, number|vehsPerHour, route}].
        When neither vehicles nor flows are given, uniform flows are
        synthesized on every known edge so the run still produces output.
        """
        idm = dict(idm_params or {})
        root = ET.Element("routes")

        ET.SubElement(
            root,
            "vType",
            attrib={
                "id": "car",
                "accel": f"{float(idm.get('accel', 2.6)):.2f}",
                "decel": f"{float(idm.get('decel', 4.5)):.2f}",
                "tau": f"{float(idm.get('tau', 1.0)):.2f}",
                "length": "5.0",
                "minGap": "2.5",
                "maxSpeed": f"{float(idm.get('maxSpeed', 55.55)):.2f}",
            },
        )
        for custom in demand.get("types") or []:
            ET.SubElement(root, "vType", attrib={k: str(v) for k, v in custom.items()})

        allowed = set(valid_edges or [])

        def route_edges(route: Any) -> list[str]:
            if route is None:
                return []
            items = route.split() if isinstance(route, str) else [str(r) for r in route]
            return [e for e in items if not allowed or e in allowed]

        vehicle_count = 0

        for flow in demand.get("flows") or []:
            edges = route_edges(flow.get("route"))
            number = int(flow.get("number", 0))
            if not number and flow.get("vehsPerHour"):
                span = float(flow.get("end", duration)) - float(flow.get("begin", 0))
                number = max(1, int(float(flow["vehsPerHour"]) * max(span, 1.0) / 3600.0))
            if not edges or number <= 0 or vehicle_count >= max_vehicles:
                continue
            number = min(number, max_vehicles - vehicle_count)
            flow_el = ET.SubElement(
                root,
                "flow",
                attrib={
                    "id": str(flow.get("id", f"flow{vehicle_count}")),
                    "begin": f"{float(flow.get('begin', 0)):.2f}",
                    "end": f"{float(flow.get('end', duration)):.2f}",
                    "number": str(number),
                    "departSpeed": "max",
                    "departLane": "best",
                    "type": str(flow.get("type", "car")),
                },
            )
            ET.SubElement(flow_el, "route", attrib={"edges": " ".join(edges)})
            vehicle_count += number

        for vehicle in demand.get("vehicles") or []:
            if vehicle_count >= max_vehicles:
                break
            edges = route_edges(vehicle.get("route"))
            if not edges and allowed:
                edges = [sorted(allowed)[vehicle_count % len(allowed)]]
            if not edges:
                raise SUMOBridgeError(
                    f"Vehicle '{vehicle.get('id')}' has no resolvable route and no network edges are known."
                )
            veh_el = ET.SubElement(
                root,
                "vehicle",
                attrib={
                    "id": str(vehicle.get("id", f"veh{vehicle_count}")),
                    "depart": f"{float(vehicle.get('depart', 0)):.2f}",
                    "type": str(vehicle.get("type", "car")),
                    "departSpeed": "max",
                    "departLane": "best",
                },
            )
            ET.SubElement(veh_el, "route", attrib={"edges": " ".join(edges)})
            vehicle_count += 1

        if vehicle_count == 0 and allowed:
            per_edge = max(1, int(departure_rate_per_edge * max(duration, 1.0)))
            for index, edge_id in enumerate(sorted(allowed)):
                remaining = max_vehicles - vehicle_count
                if remaining <= 0:
                    break
                flow_el = ET.SubElement(
                    root,
                    "flow",
                    attrib={
                        "id": f"synth-flow-{index}",
                        "begin": "0.00",
                        "end": f"{duration:.2f}",
                        "number": str(min(per_edge, remaining)),
                        "departSpeed": "max",
                        "departLane": "best",
                        "type": "car",
                    },
                )
                ET.SubElement(flow_el, "route", attrib={"edges": edge_id})
                vehicle_count += min(per_edge, remaining)

        return _xml_tostring(root)

    def load_routes(
        self,
        demand: Mapping[str, Any],
        *,
        duration: float = 600.0,
        idm_params: Mapping[str, Any] | None = None,
    ) -> Path:
        """Materialize our demand definition into routes.rou.xml."""
        xml_text = self.demand_to_routes_xml(
            demand,
            valid_edges=self.edge_ids or None,
            duration=duration,
            idm_params=idm_params,
        )
        self.route_path.write_text(xml_text, encoding="utf-8")
        self._routes_loaded = True
        return self.route_path

    # ------------------------------------------------------------------ #
    # Running
    # ------------------------------------------------------------------ #

    def _write_config(self, *, begin: float, end: float, step_length: float) -> None:
        root = ET.Element("configuration")
        time_el = ET.SubElement(root, "time")
        ET.SubElement(time_el, "begin", attrib={"value": f"{begin:.2f}"})
        ET.SubElement(time_el, "end", attrib={"value": f"{end:.2f}"})
        ET.SubElement(time_el, "step-length", attrib={"value": f"{step_length:.2f}"})
        input_el = ET.SubElement(root, "input")
        ET.SubElement(input_el, "net-file", attrib={"value": self.net_path.name})
        ET.SubElement(input_el, "route-files", attrib={"value": self.route_path.name})
        self.cfg_path.write_text(_xml_tostring(root), encoding="utf-8")

    def run(
        self,
        *,
        begin: float = 0.0,
        end: float = 600.0,
        step_length: float = 1.0,
        extra_args: list[str] | None = None,
        timeout: float = _RUN_TIMEOUT_SECONDS,
    ) -> Path:
        """Run the whole simulation to completion; returns the FCD output path."""
        if not (self._network_loaded and self._routes_loaded):
            raise SUMOBridgeError("Load network and routes before running the simulation.")

        self._write_config(begin=begin, end=end, step_length=step_length)
        cmd = [
            self.sumo_binary or "sumo",
            "-c", self.cfg_path.name,
            "--no-step-log", "true",
            "--duration-log.disable", "true",
            "--ignore-route-errors", "true",
            "--time-to-teleport", "300",
            "--fcd-output", self.fcd_path.name,
            "--tripinfo-output", self.tripinfo_path.name,
        ]
        cmd.extend(extra_args or [])

        self.fcd_path.unlink(missing_ok=True)
        self.tripinfo_path.unlink(missing_ok=True)
        self._process = subprocess.Popen(
            cmd, cwd=self.workdir, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True
        )
        try:
            _, stderr = self._process.communicate(timeout=timeout)
        except subprocess.TimeoutExpired as exc:
            self.stop()
            raise SUMOBridgeError(f"SUMO run timed out after {timeout}s") from exc

        assert self._process is not None
        if self._process.returncode != 0:
            code = self._process.returncode
            self._process = None
            raise SUMOBridgeError(f"SUMO exited with code {code}: {stderr.strip()[:2000]}")
        self._process = None
        self._fcd_cache = None
        return self.fcd_path

    def start_interactive(self, *, begin: float = 0.0, end: float = 600.0, step_length: float = 1.0) -> None:
        """Prepare and boot SUMO under TraCI for step-by-step control."""
        try:
            import traci  # type: ignore[import-not-found]
        except ImportError as exc:
            raise SUMOBridgeError(
                "Interactive stepping requires the 'traci' package (ships with SUMO's python tools)."
            ) from exc
        if not (self._network_loaded and self._routes_loaded):
            raise SUMOBridgeError("Load network and routes before starting an interactive session.")
        self._write_config(begin=begin, end=end, step_length=step_length)
        traci.start([self.sumo_binary or "sumo", "-c", self.cfg_path.name])
        self._interactive_end = end

    def run_step(self, seconds: float = 1.0) -> bool:
        """Advance an interactive session by `seconds`. Returns True when finished."""
        try:
            import traci  # type: ignore[import-not-found]
        except ImportError as exc:
            raise SUMOBridgeError("'traci' package required for run_step().") from exc
        traci.simulationStep(seconds)
        self._fcd_cache = None
        return float(traci.simulation.getTime()) >= getattr(self, "_interactive_end", float("inf"))

    # ------------------------------------------------------------------ #
    # Output parsing
    # ------------------------------------------------------------------ #

    @staticmethod
    def parse_fcd(path: Path) -> list[dict[str, Any]]:
        """Parse a SUMO FCD XML file into timestep/vehicle-position records."""
        timesteps: list[dict[str, Any]] = []
        for _, element in ET.iterparse(path, events=("end",)):
            if element.tag != "timestep":
                continue
            vehicles: list[dict[str, Any]] = []
            for veh in element.iterfind("vehicle"):
                lane = veh.get("lane", "")
                edge = lane.rsplit("_", 1)[0] if "_" in lane else lane
                vehicles.append(
                    {
                        "id": veh.get("id"),
                        "type": veh.get("type"),
                        "x": round(float(veh.get("x", 0)), 3),
                        "y": round(float(veh.get("y", 0)), 3),
                        "angle": round(float(veh.get("angle", 0)), 2),
                        "speed": round(float(veh.get("speed", 0)), 3),
                        "pos": round(float(veh.get("pos", 0)), 2),
                        "edge": edge,
                        "lane": lane,
                    }
                )
            timesteps.append({"time": round(float(element.get("t", 0)), 3), "vehicles": vehicles})
            element.clear()
        return timesteps

    @staticmethod
    def parse_tripinfo(path: Path) -> dict[str, Any]:
        """Summarize a SUMO tripinfo XML file (completed trips)."""
        durations: list[float] = []
        lengths: list[float] = []
        if path.exists():
            for _, element in ET.iterparse(path, events=("end",)):
                if element.tag != "tripinfo":
                    continue
                durations.append(float(element.get("duration", 0)))
                lengths.append(float(element.get("routeLength", 0)))
                element.clear()
        return {
            "arrived_vehicles": len(durations),
            "avg_duration_s": round(statistics.fmean(durations), 2) if durations else 0.0,
            "avg_route_length_m": round(statistics.fmean(lengths), 2) if lengths else 0.0,
        }

    def get_vehicle_positions(self, force_refresh: bool = False) -> list[dict[str, Any]]:
        """Return parsed FCD timesteps (cached after first parse)."""
        if self._fcd_cache is None or force_refresh:
            self._fcd_cache = self.parse_fcd(self.fcd_path) if self.fcd_path.exists() else []
        return self._fcd_cache

    def get_edge_data(self) -> dict[str, dict[str, Any]]:
        """Aggregate per-edge statistics from the FCD output."""
        speeds: dict[str, list[float]] = {}
        vehicles_on_edge: dict[str, set[str]] = {}
        entries: dict[str, int] = {}
        seen_vehicles: set[str] = set()

        for timestep in self.get_vehicle_positions():
            for vehicle in timestep["vehicles"]:
                edge = str(vehicle.get("edge") or "")
                vid = str(vehicle.get("id"))
                if not edge:
                    continue
                speeds.setdefault(edge, []).append(float(vehicle["speed"]))
                vehicles_on_edge.setdefault(edge, set()).add(vid)
                if vid not in seen_vehicles:
                    seen_vehicles.add(vid)
                    entries[edge] = entries.get(edge, 0) + 1

        return {
            edge: {
                "mean_speed": round(statistics.fmean(values), 3),
                "max_speed": round(max(values), 3),
                "samples": len(values),
                "unique_vehicles": len(vehicles_on_edge[edge]),
                "entries": entries.get(edge, 0),
            }
            for edge, values in speeds.items()
        }


# ---------------------------------------------------------------------- #
# CLI: single-run mode + long-lived NDJSON worker (docker-compose `sumo`)
# ---------------------------------------------------------------------- #


def _run_once(network_path: Path, demand_path: Path, *, end: float, step_length: float) -> dict[str, Any]:
    """Execute one batch simulation from JSON files and return a summary dict."""
    bridge = SUMOBridge()
    try:
        bridge.start()
        bridge.load_network(json.loads(network_path.read_text(encoding="utf-8")))
        bridge.load_routes(
            json.loads(demand_path.read_text(encoding="utf-8")),
            duration=end,
        )
        fcd = bridge.run(begin=0.0, end=end, step_length=step_length)
        timesteps = SUMOBridge.parse_fcd(fcd)
        return {
            "timesteps": len(timesteps),
            "tripinfo": SUMOBridge.parse_tripinfo(bridge.tripinfo_path),
            "edge_data": bridge.get_edge_data(),
        }
    finally:
        bridge.stop()


def _serve_worker() -> None:
    """NDJSON request/response loop over stdin/stdout.

    Request lines::

        {"action": "ping"}
        {"action": "run", "payload": {"network": {...}, "demand": {...},
                                      "config": {"begin": 0, "end": 600,
                                                 "stepLength": 1.0}}}

    Each request produces exactly one response line::

        {"ok": true, ...result} | {"ok": false, "error": "..."}
    """
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            request = json.loads(line)
        except json.JSONDecodeError as exc:
            print(json.dumps({"ok": False, "error": f"invalid JSON: {exc}"}), flush=True)
            continue

        action = str(request.get("action", "")).lower()
        try:
            if action == "ping":
                response: dict[str, Any] = {"ok": True, "pong": True}
            elif action == "shutdown":
                print(json.dumps({"ok": True, "bye": True}), flush=True)
                return
            elif action == "run":
                payload = request.get("payload") or {}
                network = payload.get("network")
                demand = payload.get("demand") or {}
                config = payload.get("config") or {}
                if not isinstance(network, Mapping):
                    raise SUMOBridgeError("payload.network must be an object")
                bridge = SUMOBridge()
                try:
                    bridge.start()
                    bridge.load_network(network)
                    bridge.load_routes(demand, duration=float(config.get("end", 600.0)))
                    fcd = bridge.run(
                        begin=float(config.get("begin", 0.0)),
                        end=float(config.get("end", 600.0)),
                        step_length=float(config.get("stepLength", 1.0)),
                    )
                    response = {
                        "ok": True,
                        "timesteps": len(SUMOBridge.parse_fcd(fcd)),
                        "tripinfo": SUMOBridge.parse_tripinfo(bridge.tripinfo_path),
                        "edge_data": bridge.get_edge_data(),
                    }
                finally:
                    bridge.stop()
            else:
                raise SUMOBridgeError(f"unknown action '{action}' (expected ping|run|shutdown)")
        except Exception as exc:  # noqa: BLE001 - report every failure to the caller
            response = {"ok": False, "error": str(exc)}
        print(json.dumps(response), flush=True)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="python -m app.services.sumo_bridge",
        description="Run SUMO simulations driven by the SAE network/demand JSON format.",
    )
    parser.add_argument(
        "--worker",
        action="store_true",
        help="long-lived mode: read NDJSON jobs from stdin, write NDJSON results to stdout",
    )
    parser.add_argument("--network", type=Path, help="network JSON file (single-run mode)")
    parser.add_argument("--demand", type=Path, help="demand JSON file (single-run mode)")
    parser.add_argument("--end", type=float, default=600.0, help="simulation end time [s]")
    parser.add_argument("--step-length", type=float, default=1.0, help="simulation step length [s]")
    args = parser.parse_args(argv)

    if args.worker:
        _serve_worker()
        return 0

    if args.network and args.demand:
        result = _run_once(args.network, args.demand, end=args.end, step_length=args.step_length)
        print(json.dumps(result))
        return 0

    parser.error("either --worker or both --network and --demand are required")
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
