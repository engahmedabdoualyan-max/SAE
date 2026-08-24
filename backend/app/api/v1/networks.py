"""Networks endpoints: upload, list, get, delete + OpenDRIVE/SUMO importers."""

from __future__ import annotations

import json
import math
import xml.etree.ElementTree as ET
from datetime import datetime
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.v1.auth import CurrentUser
from app.api.v1.projects import _get_owned_project
from app.core.database import get_db
from app.models.network import Network

router = APIRouter()

DbSession = Annotated[Session, Depends(get_db)]

MAX_UPLOAD_BYTES = 10 * 1024 * 1024  # 10 MB

NetworkFormat = Literal["json", "opendrive", "sumo", "osm"]


# --------------------------------------------------------------------------- #
# Schemas
# --------------------------------------------------------------------------- #


class NodeOut(BaseModel):
    id: str
    x: float
    y: float


class EdgeOut(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str
    from_node: str = Field(alias="from")
    to_node: str = Field(alias="to")
    length: float = 0.0
    speed: float = 13.89
    lanes: int = 1
    shape: list[tuple[float, float]] | None = None


class NetworkDataOut(BaseModel):
    nodes: list[NodeOut] = Field(default_factory=list)
    edges: list[EdgeOut] = Field(default_factory=list)
    meta: dict[str, Any] = Field(default_factory=dict)


class NetworkOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    project_id: int
    name: str
    format: str
    bounds: str | None
    created_at: datetime
    data: NetworkDataOut


class NetworkSummaryOut(BaseModel):
    id: int
    project_id: int
    name: str
    format: str
    bounds: str | None
    created_at: datetime
    node_count: int
    edge_count: int


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #


def _compute_bounds(nodes: list[dict[str, Any]]) -> str | None:
    xs = [float(n["x"]) for n in nodes if "x" in n]
    ys = [float(n["y"]) for n in nodes if "y" in n]
    if not xs or not ys:
        return None
    return f"{min(xs):.3f},{min(ys):.3f},{max(xs):.3f},{max(ys):.3f}"


def _polyline_length(points: list[tuple[float, float]]) -> float:
    total = 0.0
    for (x1, y1), (x2, y2) in zip(points, points[1:]):
        total += math.hypot(x2 - x1, y2 - y1)
    return total


def _parse_shape(raw: str | None) -> list[tuple[float, float]]:
    if not raw:
        return []
    points: list[tuple[float, float]] = []
    for pair in raw.split():
        parts = pair.split(",")
        if len(parts) >= 2:
            try:
                points.append((float(parts[0]), float(parts[1])))
            except ValueError:
                continue
    return points


def _geom_end_point(geometry: ET.Element) -> tuple[float, float, float]:
    """Return the end (x, y, heading) of an OpenDRIVE <geometry> element."""
    x = float(geometry.get("x", "0"))
    y = float(geometry.get("y", "0"))
    heading = float(geometry.get("hdg", "0"))
    length = float(geometry.get("length", "0"))

    children = list(geometry)
    tag = children[0].tag.lower() if children else "line"
    child = children[0] if children else None

    if tag == "arc" and child is not None:
        curvature = float(child.get("curvature", "0"))
        steps = max(2, int(abs(length) / 2.0) + 1)
        ds = length / steps
        px, py, h = x, y, heading
        for _ in range(steps):
            h += curvature * ds / 2.0
            px += math.cos(h) * ds
            py += math.sin(h) * ds
            h += curvature * ds / 2.0
        return px, py, h

    if tag == "spiral" and child is not None:
        curv_start = float(child.get("curvStart", "0"))
        curv_end = float(child.get("curvEnd", "0"))
        steps = max(2, int(abs(length) / 2.0) + 1)
        ds = length / steps
        px, py, h = x, y, heading
        for i in range(steps):
            s = (i + 0.5) * ds
            k = curv_start + (curv_end - curv_start) * (s / length if length else 0.0)
            h += k * ds
            px += math.cos(h) * ds
            py += math.sin(h) * ds
        return px, py, h

    # <line/> (and fallback for poly3/poly5): straight segment
    return x + math.cos(heading) * length, y + math.sin(heading) * length, heading


def parse_opendrive(xml_text: str) -> dict[str, Any]:
    """Convert an OpenDRIVE XML document into our network JSON format."""
    root = ET.fromstring(xml_text)

    nodes: list[dict[str, Any]] = []
    edges: list[dict[str, Any]] = []

    for road in root.iter("road"):
        road_id = road.get("id") or f"road{len(edges)}"
        type_el = road.find("type")
        speed = float(type_el.get("max", "50")) / 3.6 if type_el is not None else 13.89

        lanes_el = road.find("lanes")
        lane_count = 1
        if lanes_el is not None:
            sections = lanes_el.findall("laneSection")
            if sections:
                right = sections[-1].find("right")
                if right is not None:
                    lane_count = max(1, len(right.findall("lane")))

        plan_view = road.find("planView")
        geometries = list(plan_view.iter("geometry")) if plan_view is not None else []
        if not geometries:
            continue

        node_coords: dict[str, tuple[float, float]] = {}
        node_ids: list[str] = []
        for index, geometry in enumerate(geometries):
            node_id = f"{road_id}.{index}"
            coords = (round(float(geometry.get("x", "0")), 3), round(float(geometry.get("y", "0")), 3))
            nodes.append({"id": node_id, "x": coords[0], "y": coords[1]})
            node_ids.append(node_id)
            node_coords[node_id] = coords

        end_x, end_y, _ = _geom_end_point(geometries[-1])
        end_id = f"{road_id}.end"
        nodes.append({"id": end_id, "x": round(end_x, 3), "y": round(end_y, 3)})
        node_ids.append(end_id)
        node_coords[end_id] = (round(end_x, 3), round(end_y, 3))

        for i in range(len(node_ids) - 1):
            geometry = geometries[i]
            length = float(geometry.get("length", "0"))
            if length <= 0:
                x1, y1 = node_coords[node_ids[i]]
                x2, y2 = node_coords[node_ids[i + 1]]
                length = math.hypot(x2 - x1, y2 - y1)
            edges.append(
                {
                    "id": f"{road_id}_{i}",
                    "from": node_ids[i],
                    "to": node_ids[i + 1],
                    "length": round(length, 2),
                    "speed": round(speed, 3),
                    "lanes": lane_count,
                }
            )

    return {
        "nodes": nodes,
        "edges": edges,
        "meta": {
            "source": "opendrive",
            "roads": len(list(root.iter("road"))),
            "bounds": _compute_bounds(nodes),
        },
    }


def parse_sumo_net(xml_text: str) -> dict[str, Any]:
    """Convert a SUMO .net.xml document into our network JSON format."""
    root = ET.fromstring(xml_text)

    nodes: list[dict[str, Any]] = []
    edges: list[dict[str, Any]] = []

    location = root.find("location")
    bounds_raw = location.get("convBoundary") if location is not None else None

    for junction in root.iter("junction"):
        if junction.get("type") == "internal":
            continue
        nodes.append(
            {
                "id": junction.get("id") or "",
                "x": float(junction.get("x", "0")),
                "y": float(junction.get("y", "0")),
            }
        )

    for edge in root.iter("edge"):
        if edge.get("function") == "internal":
            continue
        lanes = list(edge.iter("lane"))
        if not lanes:
            continue
        speed = float(lanes[0].get("speed", "13.89"))
        lengths = [float(lane.get("length", "0")) for lane in lanes]
        shape = _parse_shape(lanes[0].get("shape"))
        length = max(lengths) if any(lengths) else _polyline_length(shape)

        edge_entry: dict[str, Any] = {
            "id": edge.get("id") or "",
            "from": edge.get("from") or "",
            "to": edge.get("to") or "",
            "length": round(length, 2),
            "speed": speed,
            "lanes": len(lanes),
        }
        if shape:
            edge_entry["shape"] = shape
        edges.append(edge_entry)

    bounds = None
    if bounds_raw:
        try:
            min_x, min_y, max_x, max_y = (float(v) for v in bounds_raw.split(","))
            bounds = f"{min_x:.3f},{min_y:.3f},{max_x:.3f},{max_y:.3f}"
        except ValueError:
            bounds = None

    return {
        "nodes": nodes,
        "edges": edges,
        "meta": {
            "source": "sumo",
            "edges": len(edges),
            "bounds": bounds or _compute_bounds(nodes),
        },
    }


# --------------------------------------------------------------------------- #
# Endpoints
# --------------------------------------------------------------------------- #


@router.post("/upload", response_model=NetworkOut, status_code=status.HTTP_201_CREATED)
async def upload_network(
    project_id: Annotated[int, Form()],
    name: Annotated[str, Form(min_length=1, max_length=255)],
    fmt: Annotated[NetworkFormat, Form(alias="format")],
    file: Annotated[UploadFile, File(description="Raw network file")],
    db: DbSession,
    current_user: CurrentUser,
) -> Network:
    """Upload a network file (JSON graph, OpenDRIVE, SUMO .net.xml or OSM)."""
    _get_owned_project(db, current_user, project_id)

    raw = await file.read()
    if len(raw) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="File too large (max 10 MB)")
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="File must be UTF-8 text") from exc

    meta_extra: dict[str, Any] = {}
    if fmt == "json":
        try:
            parsed = json.loads(text)
        except json.JSONDecodeError as exc:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"Invalid JSON: {exc}") from exc
        if not isinstance(parsed, dict) or not isinstance(parsed.get("nodes"), list) or not isinstance(parsed.get("edges"), list):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail='JSON network must be an object with "nodes" and "edges" lists',
            )
        meta_extra = parsed.get("meta") if isinstance(parsed.get("meta"), dict) else {}
        nodes_data = parsed["nodes"]
        edges_data = parsed["edges"]
    elif fmt == "opendrive":
        try:
            parsed = parse_opendrive(text)
        except ET.ParseError as exc:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"Invalid OpenDRIVE XML: {exc}") from exc
        nodes_data, edges_data, meta_extra = parsed["nodes"], parsed["edges"], parsed["meta"]
    elif fmt == "sumo":
        try:
            parsed = parse_sumo_net(text)
        except ET.ParseError as exc:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"Invalid SUMO net XML: {exc}") from exc
        nodes_data, edges_data, meta_extra = parsed["nodes"], parsed["edges"], parsed["meta"]
    else:  # osm — raw storage; full OSM parsing handled upstream by osmium tooling
        nodes_data, edges_data = [], []
        meta_extra = {"source": "osm", "raw_size_bytes": len(raw)}

    data: dict[str, Any] = {"nodes": nodes_data, "edges": edges_data, "meta": meta_extra}
    if fmt == "osm":
        data["osm_xml"] = text

    network = Network(
        project_id=project_id,
        name=name.strip(),
        format=fmt,
        data=data,
        bounds=meta_extra.get("bounds") or _compute_bounds(nodes_data),
    )
    db.add(network)
    db.commit()
    db.refresh(network)
    return network


@router.get("/", response_model=list[NetworkSummaryOut])
def list_networks(db: DbSession, current_user: CurrentUser, project_id: int | None = None) -> list[NetworkSummaryOut]:
    stmt = select(Network).order_by(Network.id.desc())
    if project_id is not None:
        stmt = stmt.where(Network.project_id == project_id)
    summaries: list[NetworkSummaryOut] = []
    for network in db.scalars(stmt).all():
        data = network.data or {}
        summaries.append(
            NetworkSummaryOut(
                id=network.id,
                project_id=network.project_id,
                name=network.name,
                format=network.format,
                bounds=network.bounds,
                created_at=network.created_at,
                node_count=len(data.get("nodes") or []),
                edge_count=len(data.get("edges") or []),
            )
        )
    return summaries


@router.get("/{network_id}", response_model=NetworkOut)
def get_network(network_id: int, db: DbSession, current_user: CurrentUser) -> Network:
    network = db.get(Network, network_id)
    if network is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Network not found")
    return network


@router.delete("/{network_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_network(network_id: int, db: DbSession, current_user: CurrentUser) -> None:
    network = db.get(Network, network_id)
    if network is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Network not found")
    db.delete(network)
    db.commit()


@router.post("/import/opendrive", response_model=NetworkDataOut)
async def import_opendrive(file: Annotated[UploadFile, File()], current_user: CurrentUser) -> NetworkDataOut:
    """Parse an OpenDRIVE XML file and return our normalized network format (not persisted)."""
    raw = await file.read()
    if len(raw) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="File too large (max 10 MB)")
    try:
        parsed = parse_opendrive(raw.decode("utf-8"))
    except UnicodeDecodeError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="File must be UTF-8 text") from exc
    except ET.ParseError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"Invalid OpenDRIVE XML: {exc}") from exc
    return NetworkDataOut.model_validate(parsed)


@router.post("/import/sumo", response_model=NetworkDataOut)
async def import_sumo(file: Annotated[UploadFile, File()], current_user: CurrentUser) -> NetworkDataOut:
    """Parse a SUMO .net.xml file and return our normalized network format (not persisted)."""
    raw = await file.read()
    if len(raw) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="File too large (max 10 MB)")
    try:
        parsed = parse_sumo_net(raw.decode("utf-8"))
    except UnicodeDecodeError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="File must be UTF-8 text") from exc
    except ET.ParseError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"Invalid SUMO net XML: {exc}") from exc
    return NetworkDataOut.model_validate(parsed)
