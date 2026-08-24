"""Calibration metrics (GEH, RMSE, R^2) and a lightweight parameter optimizer."""

from __future__ import annotations

import itertools
import math
from collections.abc import Mapping, Sequence
from statistics import fmean
from typing import Any

__all__ = ["geh_statistic", "rmse", "r_squared", "calibrate"]

DEFAULT_SEARCH_SPACE: dict[str, list[float]] = {
    "flow_scale": [0.5, 0.65, 0.8, 0.9, 1.0, 1.1, 1.2, 1.35, 1.5],
    "speed_scale": [0.8, 0.9, 1.0, 1.1, 1.25],
}


def geh_statistic(observed: Sequence[float], simulated: Sequence[float]) -> float:
    """Mean GEH statistic across observation pairs.

    GEH = sqrt(2 * (M - C)^2 / (M + C)); pairs where C + M == 0 contribute 0.
    Rule of thumb: GEH < 5 is a good fit.
    """
    if len(observed) != len(simulated):
        raise ValueError("observed and simulated must have the same length")
    values: list[float] = []
    for obs, sim in zip(observed, simulated):
        c, m = float(obs), float(sim)
        denom = c + m
        if denom <= 0:
            continue
        values.append(math.sqrt(2.0 * (m - c) ** 2 / denom))
    return round(fmean(values), 4) if values else 0.0


def rmse(observed: Sequence[float], simulated: Sequence[float]) -> float:
    """Root mean square error between observed and simulated values."""
    if len(observed) != len(simulated):
        raise ValueError("observed and simulated must have the same length")
    if not observed:
        return 0.0
    squared = [(float(m) - float(c)) ** 2 for c, m in zip(observed, simulated)]
    return round(math.sqrt(fmean(squared)), 4)


def r_squared(observed: Sequence[float], simulated: Sequence[float]) -> float:
    """Coefficient of determination (1 - SS_res / SS_tot)."""
    if len(observed) != len(simulated) or not observed:
        return 0.0
    mean_obs = fmean(float(o) for o in observed)
    ss_res = sum((float(c) - float(m)) ** 2 for c, m in zip(observed, simulated))
    ss_tot = sum((float(c) - mean_obs) ** 2 for c in observed)
    if ss_tot == 0:
        return 0.0
    return round(1.0 - ss_res / ss_tot, 4)


def _edge_baseline_counts(network: Mapping[str, Any]) -> dict[str, float]:
    """Estimate a per-edge hourly volume baseline from network geometry."""
    baselines: dict[str, float] = {}
    edges = network.get("edges") or []
    default_baseline = 900.0
    for edge in edges:
        edge_id = str(edge.get("id"))
        lanes = max(1, int(edge.get("lanes", 1)))
        speed = max(5.0, float(edge.get("speed", 13.89)))
        # Saturation flow proxy (~1900 veh/h/lane) damped by free-flow speed.
        capacity = 1900.0 * lanes * min(1.25, speed / 13.89) ** 0.25
        baselines[edge_id] = round(capacity * 0.45, 1)
    return baselines or {"__default__": default_baseline}


def _predict(baseline: Sequence[float], params: Mapping[str, float]) -> list[float]:
    flow_scale = float(params.get("flow_scale", 1.0))
    return [max(0.0, b * flow_scale) for b in baseline]


def _score(observed: Sequence[float], predicted: Sequence[float]) -> float:
    """Combined objective: mean GEH plus normalized RMSE penalty."""
    mean_obs = max(1.0, fmean(float(o) for o in observed))
    return geh_statistic(observed, predicted) + 0.01 * rmse(observed, predicted) / mean_obs


def calibrate(
    field_data: Sequence[Mapping[str, Any]],
    network: Mapping[str, Any],
    config: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    """Calibrate demand/scale parameters against field counts.

    Parameters
    ----------
    field_data:
        Observations like ``[{"edge_id": "e1", "count": 812}, ...]``
        (counts are veh/hour or raw detector counts — be consistent).
    network:
        Our network JSON (used to derive baseline capacities when no
        ``baseline_counts`` are provided in ``config``).
    config:
        Optional overrides: ``baseline_counts`` ({edge_id: count}),
        ``search_space`` ({param: [values]}), ``max_evaluations``,
        ``method`` ("grid_search" | "scipy" | "auto").

    Returns a dict with ``optimized_params``, fit ``metrics`` and metadata.
    """
    config = dict(config or {})
    if not field_data:
        raise ValueError("field_data must contain at least one observation")

    baseline_counts = config.get("baseline_counts")
    if isinstance(baseline_counts, Mapping) and baseline_counts:
        baselines_map: dict[str, float] = {str(k): float(v) for k, v in baseline_counts.items()}
        fallback = fmean(baselines_map.values())
    else:
        baselines_map = _edge_baseline_counts(network)
        fallback = fmean(baselines_map.values())

    observed: list[float] = []
    baseline: list[float] = []
    skipped = 0
    for row in field_data:
        edge_id = str(row.get("edge_id") or row.get("edge") or "")
        try:
            count = float(row.get("count", 0))
        except (TypeError, ValueError) as exc:
            raise ValueError(f"Invalid count for edge '{edge_id}'") from exc
        if count <= 0:
            skipped += 1
            continue
        observed.append(count)
        baseline.append(baselines_map.get(edge_id, fallback))

    if not observed:
        raise ValueError("field_data contained no usable (positive-count) observations")

    search_space: dict[str, list[Any]] = {
        k: list(v) for k, v in (config.get("search_space") or DEFAULT_SEARCH_SPACE).items()
    }
    keys = sorted(search_space)
    grids = [list(search_space[k]) for k in keys]
    if not keys or any(not g for g in grids):
        best_params = {"flow_scale": 1.0}
    else:
        best_params = {"flow_scale": 1.0}

    method = str(config.get("method", "auto")).lower()
    max_evals = int(config.get("max_evaluations", 5000))
    evaluations = 0

    # ---- Grid search -------------------------------------------------- #
    best_score = float("inf")
    if keys and all(grids):
        for combo in itertools.product(*grids):
            candidate = dict(zip(keys, combo, strict=True))
            score = _score(observed, _predict(baseline, candidate))
            evaluations += 1
            if score < best_score:
                best_score, best_params = score, dict(candidate)
            if evaluations >= max_evals:
                break

    # ---- Optional continuous refinement via SciPy ---------------------- #
    refined_by = "grid_search"
    if method in ("auto", "scipy"):
        try:
            import numpy as np
            from scipy.optimize import minimize

            def objective(x: Any) -> float:
                fs = float(np.clip(x[0], 0.05, 5.0))
                return _score(observed, _predict(baseline, {"flow_scale": fs}))

            start_fs = float(best_params.get("flow_scale", 1.0))
            result = minimize(objective, np.array([start_fs]), method="Nelder-Mead")
            if result.success and float(result.fun) < best_score:
                best_score = float(result.fun)
                best_params = {"flow_scale": round(float(np.clip(result.x[0], 0.05, 5.0)), 4)}
                refined_by = "scipy:nelder-mead"
            evaluations += int(result.nfev)
        except ImportError:
            pass  # scipy unavailable — grid-search result stands

    predicted = _predict(baseline, best_params)
    return {
        "optimized_params": best_params,
        "metrics": {
            "geh": geh_statistic(observed, predicted),
            "rmse": rmse(observed, predicted),
            "r_squared": r_squared(observed, predicted),
        },
        "evaluations": evaluations,
        "method": refined_by,
        "observations_used": len(observed),
        "observations_skipped": skipped,
        "notes": (
            "flow_scale multiplies modeled edge volumes; add IDM parameters "
            "(accel/decel/tau) to 'search_space' when running against SUMO."
        ),
    }
