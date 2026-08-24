"""PDF report generation for simulation runs (reportlab based).

Sections: Executive Summary, Methodology, Network Description, Results (KPIs),
Charts, Conclusion. Returns raw PDF bytes.
"""

from __future__ import annotations

import io
from collections.abc import Mapping
from datetime import datetime, timezone
from typing import Any


class ReportGenerationError(RuntimeError):
    """Raised when a report cannot be generated (e.g. missing dependency)."""


def _get(obj: Mapping[str, Any] | Any, key: str, default: Any = None) -> Any:
    if isinstance(obj, Mapping):
        return obj.get(key, default)
    return getattr(obj, key, default)


def _fmt(value: Any, digits: int = 2) -> str:
    try:
        return f"{float(value):.{digits}f}"
    except (TypeError, ValueError):
        return "—" if value is None else str(value)


def _kpi_rows(results: Mapping[str, Any]) -> list[list[str]]:
    skip_keys = {"per_edge", "timesteps", "trajectory", "metrics"}
    rows: list[list[str]] = []
    for key, value in results.items():
        if key in skip_keys:
            continue
        if isinstance(value, bool | int | float | str):
            pretty = key.replace("_", " ").title()
            rows.append([pretty, _fmt(value) if isinstance(value, int | float) else str(value)])
    return rows


def generate_pdf(
    simulation_results: Mapping[str, Any] | None,
    scenario: Mapping[str, Any] | Any,
    network: Mapping[str, Any] | Any,
) -> bytes:
    """Render a full simulation report as PDF bytes."""
    try:
        from reportlab.graphics.charts.barcharts import VerticalBarChart
        from reportlab.graphics.shapes import Drawing, String
        from reportlab.lib import colors
        from reportlab.lib.pagesizes import A4
        from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
        from reportlab.lib.units import mm
        from reportlab.platypus import (
            Paragraph,
            SimpleDocTemplate,
            Spacer,
            Table,
            TableStyle,
        )
    except ImportError as exc:
        raise ReportGenerationError(
            "The 'reportlab' package is required to generate reports (pip install reportlab)."
        ) from exc

    results = dict(simulation_results or {})
    scenario_name = str(_get(scenario, "name", "Unnamed scenario"))
    scenario_version = int(_get(scenario, "version", 1) or 1)
    scenario_params = _get(scenario, "params") or {}
    network_name = str(_get(network, "name", "network"))
    network_format = str(_get(network, "format", "json"))
    network_data = _get(network, "data") or {}
    nodes = network_data.get("nodes") or [] if isinstance(network_data, Mapping) else []
    edges = network_data.get("edges") or [] if isinstance(network_data, Mapping) else []

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle("ReportTitle", parent=styles["Title"], fontSize=18, spaceAfter=10)
    h2_style = ParagraphStyle("SectionHeading", parent=styles["Heading2"], spaceBefore=14, spaceAfter=4)
    body_style = styles["BodyText"]

    meta_table_style = TableStyle(
        [
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTNAME", (1, 0), (-1, -1), "Helvetica-Bold"),
            ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#cbd5e1")),
            ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#f1f5f9")),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ]
    )

    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=18 * mm,
        rightMargin=18 * mm,
        topMargin=16 * mm,
        bottomMargin=16 * mm,
        title=f"SAE AutoSim Hub - {scenario_name}",
        author="SAE AutoSim Hub",
    )
    story: list[Any] = []

    # ---------------- Header + meta ---------------- #
    story.append(Paragraph("SAE AutoSim Hub - Traffic Simulation Report", title_style))
    meta = [
        ["Generated", datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")],
        ["Scenario", f"{scenario_name} (v{scenario_version})"],
        ["Network", f"{network_name} ({network_format})"],
    ]
    story.append(Table(meta, colWidths=[35 * mm, 120 * mm], style=meta_table_style))
    story.append(Spacer(1, 6))

    # ---------------- Executive Summary ---------------- #
    story.append(Paragraph("Executive Summary", h2_style))
    avg_speed = results.get("avg_speed_kmh")
    vehicles = results.get("vehicles_total")
    distance = results.get("total_distance_km")
    duration = results.get("duration_s")
    geh_value = (results.get("metrics") or {}).get("geh") if isinstance(results.get("metrics"), Mapping) else None
    summary_bits = [
        f"This report summarizes microsimulation run for scenario '{scenario_name}' "
        f"(version {scenario_version}) on network '{network_name}'.",
        f"The simulation moved {_fmt(vehicles, 0)} vehicles over {_fmt(duration, 0)} simulated seconds, "
        f"covering roughly {_fmt(distance)} km in total at an average speed of {_fmt(avg_speed)} km/h.",
    ]
    if geh_value is not None:
        fit = "good" if float(geh_value) < 5 else "acceptable/poor"
        summary_bits.append(f"Calibrated model fit: mean GEH {_fmt(geh_value)} ({fit} by the GEH < 5 criterion).")
    story.append(Paragraph(" ".join(summary_bits), body_style))

    # ---------------- Methodology ---------------- #
    story.append(Paragraph("Methodology", h2_style))
    idm_params = scenario_params.get("idm") if isinstance(scenario_params, Mapping) else {}
    idm_note = (
        ", ".join(f"{k}={_fmt(v)}" for k, v in sorted(idm_params.items()))
        if isinstance(idm_params, Mapping) and idm_params
        else "defaults"
    )
    story.append(
        Paragraph(
            "Vehicle movements follow the Intelligent Driver Model (IDM) executed through the "
            "SUMO microsimulation engine (or the built-in fallback simulator when SUMO is not "
            f"available). Active IDM parameters: {idm_note}. Demand was loaded from the scenario "
            "definition; outputs were aggregated into network KPIs and per-edge statistics. "
            "Model quality is assessed with the GEH statistic, RMSE and R-squared where field "
            "counts are available.",
            body_style,
        )
    )

    # ---------------- Network Description ---------------- #
    total_length_km = sum(float(e.get("length", 0)) for e in edges if isinstance(e, Mapping))
    network_rows = [
        ["Nodes", str(len(nodes))],
        ["Edges", str(len(edges))],
        ["Total edge length (km)", _fmt(total_length_km / 1000.0)],
        ["Bounding box", str(_get(network, "bounds") or "n/a")],
        ["Source format", network_format],
    ]
    story.append(Paragraph("Network Description", h2_style))
    story.append(Table(network_rows, colWidths=[55 * mm, 100 * mm], style=meta_table_style))

    # ---------------- Results / KPIs ---------------- #
    story.append(Paragraph("Results", h2_style))
    kpi_rows = _kpi_rows(results)
    if kpi_rows:
        story.append(Table([["KPI", "Value"], *kpi_rows], colWidths=[70 * mm, 85 * mm], style=meta_table_style))
    else:
        story.append(Paragraph("No aggregated KPIs were recorded for this run.", body_style))

    # ---------------- Charts ---------------- #
    story.append(Paragraph("Charts", h2_style))
    chart_values: list[float] = []
    chart_labels: list[str] = []
    per_edge = results.get("per_edge")
    if isinstance(per_edge, Mapping) and per_edge:
        top = sorted(per_edge.items(), key=lambda kv: kv[1].get("samples", 0), reverse=True)[:12]
        for edge_id, stats in top:
            speed = stats.get("mean_speed_kmh") if isinstance(stats, Mapping) else None
            if isinstance(speed, int | float):
                chart_values.append(float(speed))
                chart_labels.append(str(edge_id)[:12])
        chart_title = "Mean speed by edge (km/h)"
    else:
        for label, key in (("Avg speed", "avg_speed_kmh"), ("Max speed", "max_speed_kmh")):
            value = results.get(key)
            if isinstance(value, int | float):
                chart_labels.append(label)
                chart_values.append(float(value))
        chart_title = "Key speeds (km/h)"

    if chart_values:
        drawing = Drawing(430, 220)
        chart = VerticalBarChart()
        chart.x, chart.y = 45, 40
        chart.width, chart.height = 360, 150
        chart.data = [chart_values]
        chart.categoryAxis.categoryNames = chart_labels
        chart.categoryAxis.labels.fontName = "Helvetica"
        chart.categoryAxis.labels.fontSize = 7
        chart.valueAxis.valueMin = 0
        chart.valueAxis.valueMax = max(chart_values) * 1.2 or 1.0
        chart.valueAxis.valueStep = max(1.0, max(chart_values) * 1.2 / 5)
        chart.bars[(0, 0)].fillColor = colors.HexColor("#2563eb")
        drawing.add(chart)
        drawing.add(String(45, 200, chart_title, fontName="Helvetica-Bold", fontSize=11))
        story.append(drawing)
    else:
        story.append(Paragraph("Not enough numeric data to draw charts.", body_style))

    # ---------------- Conclusion ---------------- #
    story.append(Paragraph("Conclusion", h2_style))
    throughput_ok = isinstance(vehicles, int | float) and vehicles > 0
    conclusion = (
        "The simulation produced usable output and KPIs are within expected ranges."
        if throughput_ok
        else "The simulation produced little or no traffic; review demand parameters before re-running."
    )
    if geh_value is not None:
        conclusion += (
            " Calibration metrics indicate the model "
            + ("meets" if float(geh_value) < 5 else "does not fully meet")
            + " the GEH < 5 acceptance threshold."
        )
    conclusion += " Next steps: refine signal timings and demand matrices, then validate against additional field counts."
    story.append(Paragraph(conclusion, body_style))

    doc.build(story)
    return buffer.getvalue()
