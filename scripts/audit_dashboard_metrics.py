#!/usr/bin/env python3
"""
Auditoría automatizada de coherencia de métricas del dashboard Meta.

Uso:
  python3 scripts/audit_dashboard_metrics.py \
    --base-url http://localhost:8000 \
    --account-id act_131112367482947 \
    --page-id 1506380769434870 \
    --presets last_7d,last_30d,last_90d,maximum \
    --max-loops 8 \
    --sleep-seconds 2
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from dataclasses import dataclass
from datetime import date, timedelta
from pathlib import Path
from typing import Any
from urllib.parse import urlencode
from urllib.request import urlopen


OBJECTIVE_METRICS = [
    "messaging_conversation_started",
    "messaging_first_reply",
]


@dataclass
class Finding:
    severity: str  # critical|high|medium|low
    code: str
    endpoint: str
    message: str
    context: dict[str, Any]


def get_json(url: str) -> dict[str, Any]:
    with urlopen(url, timeout=60) as resp:
        body = resp.read().decode("utf-8")
    return json.loads(body)


def fetch(base_url: str, path: str, **params: str) -> dict[str, Any]:
    q = urlencode({k: v for k, v in params.items() if v not in ("", None)})
    url = f"{base_url}{path}"
    if q:
        url = f"{url}?{q}"
    return get_json(url)


def num(v: Any) -> float:
    try:
        return float(v)
    except Exception:
        return 0.0


def parse_rows(payload: dict[str, Any]) -> list[dict[str, Any]]:
    data = payload.get("data")
    return data if isinstance(data, list) else []


def period_from_preset(preset: str) -> tuple[str, str] | None:
    today = date.today()
    if preset == "today":
        return today.isoformat(), today.isoformat()
    if preset == "last_7d":
        return (today - timedelta(days=6)).isoformat(), today.isoformat()
    if preset == "last_30d":
        return (today - timedelta(days=29)).isoformat(), today.isoformat()
    if preset == "last_90d":
        return (today - timedelta(days=89)).isoformat(), today.isoformat()
    return None


def payload_bounds(rows: list[dict[str, Any]]) -> tuple[str, str] | None:
    if not rows:
        return None
    start = str(rows[0].get("date_start") or "").strip()
    stop = str(rows[0].get("date_stop") or "").strip()
    if start and stop:
        return start, stop
    return None


def prev_period(start_iso: str, stop_iso: str) -> tuple[str, str]:
    start = date.fromisoformat(start_iso)
    stop = date.fromisoformat(stop_iso)
    span_days = (stop - start).days + 1
    prev_stop = start - timedelta(days=1)
    prev_start = prev_stop - timedelta(days=span_days - 1)
    return prev_start.isoformat(), prev_stop.isoformat()


def nearly_equal(a: float, b: float, eps: float = 0.02) -> bool:
    return abs(a - b) <= eps


def relative_close(a: float, b: float, rel: float = 0.005, abs_eps: float = 0.01) -> bool:
    diff = abs(a - b)
    return diff <= max(abs_eps, max(abs(a), abs(b)) * rel)


def sum_key(rows: list[dict[str, Any]], key: str) -> float:
    return round(sum(num(r.get(key)) for r in rows), 2)


def rows_masked_for_objective(rows: list[dict[str, Any]]) -> bool:
    return all(r.get("results") is None and r.get("cpa") is None for r in rows)


def audit_page_preset(
    base_url: str,
    account_id: str,
    page_id: str,
    preset: str,
    objective_metric: str,
) -> list[Finding]:
    findings: list[Finding] = []
    page_base = f"/api/v1/accounts/{account_id}/pages/{page_id}"

    insights = fetch(base_url, f"{page_base}/insights", date_preset=preset)
    timeseries = fetch(base_url, f"{page_base}/timeseries", date_preset=preset)
    conv = fetch(
        base_url,
        f"{page_base}/conversion-timeseries",
        date_preset=preset,
    )
    funnel = fetch(base_url, f"{page_base}/funnel", date_preset=preset)
    traffic = fetch(base_url, f"{page_base}/traffic-quality", date_preset=preset)
    traffic_ts = fetch(
        base_url,
        f"{page_base}/traffic-quality/timeseries",
        date_preset=preset,
    )
    geo = fetch(
        base_url,
        f"{page_base}/geo",
        date_preset=preset,
        objective_metric=objective_metric,
    )
    demo = fetch(
        base_url,
        f"{page_base}/demographics",
        date_preset=preset,
        breakdown="age",
        objective_metric=objective_metric,
    )

    insights_rows = parse_rows(insights)
    ts_rows = sorted(parse_rows(timeseries), key=lambda r: str(r.get("date_start") or r.get("date_stop") or ""))
    conv_rows = sorted(parse_rows(conv), key=lambda r: str(r.get("date") or ""))
    traffic_rows = sorted(parse_rows(traffic_ts), key=lambda r: str(r.get("date") or ""))
    geo_rows = parse_rows(geo)
    demo_rows = parse_rows(demo)

    spend_ins = sum_key(insights_rows, "spend")
    impressions_ins = round(sum(num(r.get("impressions")) for r in insights_rows), 2)
    spend_conv = sum_key(conv_rows, "spend")
    spend_ts = sum_key(ts_rows, "spend")
    impressions_ts = round(sum(num(r.get("impressions")) for r in ts_rows), 2)
    spend_traffic_ts = sum_key(traffic_rows, "spend")
    outbound_traffic_ts = round(sum(num(r.get("outbound_clicks")) for r in traffic_rows), 2)
    funnel_started = num(funnel.get("conversations_started"))
    funnel_first = num(funnel.get("first_replies"))

    if not insights_rows and spend_ins == 0 and funnel_started == 0 and num(traffic.get("spend")) == 0:
        pass
    elif not conv_rows and (spend_ins > 0 or funnel_started > 0):
        findings.append(
            Finding(
                "high",
                "NO_CONV_ROWS_WITH_ACTIVITY",
                "page/conversion-timeseries",
                "Faltan filas en conversion-timeseries aunque el periodo sí tiene actividad.",
                {"preset": preset, "objective_metric": objective_metric, "spend": spend_ins, "conversations_started": funnel_started},
            )
        )

    for row in conv_rows:
        spend = num(row.get("spend"))
        conversions = num(row.get("conversions"))
        cpa = num(row.get("cpa"))
        expected = round(spend / conversions, 2) if conversions > 0 else 0.0
        if not nearly_equal(cpa, expected):
            findings.append(
                Finding(
                    "high",
                    "PAGE_CPA_FORMULA_MISMATCH",
                    "page/conversion-timeseries",
                    "CPA diario no coincide con spend/conversions.",
                    {"preset": preset, "date": row.get("date"), "cpa": cpa, "expected": expected},
                )
            )

    if conv_rows and not nearly_equal(spend_conv, spend_ins, eps=0.25):
        findings.append(
            Finding(
                "high",
                "PAGE_SPEND_CONV_VS_INSIGHTS",
                "page/conversion-timeseries+insights",
                "El gasto agregado de conversion-timeseries no coincide con insights.",
                {"preset": preset, "conv_spend": spend_conv, "insights_spend": spend_ins},
            )
        )

    if ts_rows and not nearly_equal(spend_ts, spend_ins, eps=0.25):
        findings.append(
            Finding(
                "high",
                "PAGE_SPEND_TS_VS_INSIGHTS",
                "page/timeseries+insights",
                "El gasto agregado de la serie diaria no coincide con insights.",
                {"preset": preset, "timeseries_spend": spend_ts, "insights_spend": spend_ins},
            )
        )

    if ts_rows and not nearly_equal(impressions_ts, impressions_ins, eps=1.0):
        findings.append(
            Finding(
                "medium",
                "PAGE_IMPRESSIONS_TS_VS_INSIGHTS",
                "page/timeseries+insights",
                "Las impresiones agregadas de la serie diaria no coinciden con insights.",
                {"preset": preset, "timeseries_impressions": impressions_ts, "insights_impressions": impressions_ins},
            )
        )

    if funnel_first > funnel_started:
        findings.append(
            Finding(
                "high",
                "PAGE_FUNNEL_REPLY_GT_STARTED",
                "page/funnel",
                "first_replies es mayor que conversations_started.",
                {"preset": preset, "first_replies": funnel_first, "conversations_started": funnel_started},
            )
        )

    outbound_clicks = num(traffic.get("outbound_clicks"))
    cpo = num(traffic.get("cost_per_outbound_click"))
    traffic_spend = num(traffic.get("spend"))
    expected_cpo = round(traffic_spend / outbound_clicks, 2) if outbound_clicks > 0 else 0.0
    if not nearly_equal(cpo, expected_cpo):
        findings.append(
            Finding(
                "medium",
                "PAGE_TRAFFIC_CPO_MISMATCH",
                "page/traffic-quality",
                "cost_per_outbound_click no coincide con spend/outbound_clicks.",
                {"preset": preset, "cpo": cpo, "expected": expected_cpo, "outbound_clicks": outbound_clicks, "spend": traffic_spend},
            )
        )

    if traffic_rows and not nearly_equal(spend_traffic_ts, traffic_spend, eps=0.25):
        findings.append(
            Finding(
                "medium",
                "PAGE_TRAFFIC_TS_SPEND_MISMATCH",
                "page/traffic-quality+timeseries",
                "La serie diaria de calidad de tráfico no coincide en gasto con el agregado.",
                {"preset": preset, "timeseries_spend": spend_traffic_ts, "aggregate_spend": traffic_spend},
            )
        )

    if traffic_rows and not nearly_equal(outbound_traffic_ts, outbound_clicks, eps=1.0):
        findings.append(
            Finding(
                "medium",
                "PAGE_TRAFFIC_TS_OUTBOUND_MISMATCH",
                "page/traffic-quality+timeseries",
                "La serie diaria de outbound clicks no coincide con el agregado.",
                {"preset": preset, "timeseries_outbound": outbound_traffic_ts, "aggregate_outbound": outbound_clicks},
            )
        )

    geo_meta = geo.get("metadata") if isinstance(geo.get("metadata"), dict) else {}
    geo_total = round(sum(num(r.get("results")) for r in geo_rows if r.get("results") is not None), 2)
    geo_expected = num(geo_meta.get("objective_results_total"))
    if geo_meta.get("objective_breakdown_complete") is False:
        if not geo_meta.get("warning") or not rows_masked_for_objective(geo_rows):
            findings.append(
                Finding(
                    "high",
                    "PAGE_GEO_OBJECTIVE_WARNING_INCOMPLETE",
                    "page/geo",
                    "El breakdown geográfico no cubre la métrica objetivo y la respuesta no quedó protegida.",
                    {"preset": preset, "objective_metric": objective_metric, "metadata": geo_meta},
                )
            )
    elif geo_rows and geo_expected > 0 and not relative_close(geo_total, geo_expected):
        findings.append(
            Finding(
                "high",
                "PAGE_GEO_TOTAL_MISMATCH",
                "page/geo",
                "Los resultados agregados del breakdown geo no coinciden con el total esperado del objetivo.",
                {"preset": preset, "objective_metric": objective_metric, "geo_total": geo_total, "expected": geo_expected},
            )
        )

    demo_total = round(sum(num(r.get("results")) for r in demo_rows if r.get("results") is not None), 2)
    if demo.get("objective_metric") != objective_metric:
        findings.append(
            Finding(
                "high",
                "PAGE_DEMO_OBJECTIVE_MISMATCH",
                "page/demographics",
                "El endpoint demográfico no reporta el objective_metric solicitado.",
                {"preset": preset, "expected": objective_metric, "actual": demo.get("objective_metric")},
            )
        )
    else:
        expected_demo_total = funnel_first if objective_metric == "messaging_first_reply" else funnel_started
        if expected_demo_total > 0 and not relative_close(demo_total, expected_demo_total):
            findings.append(
                Finding(
                    "medium",
                    "PAGE_DEMO_RESULTS_VS_FUNNEL",
                    "page/demographics+funnel",
                    "La suma de resultados demográficos no coincide con la métrica equivalente del embudo.",
                    {
                        "preset": preset,
                        "objective_metric": objective_metric,
                        "demographics_total": demo_total,
                        "expected_funnel_total": expected_demo_total,
                    },
                )
            )

    bounds = payload_bounds(insights_rows) or period_from_preset(preset)
    if bounds is not None and preset != "maximum":
        curr_start, curr_stop = bounds
        for row in conv_rows:
            d = str(row.get("date") or "")
            if d and not (curr_start <= d <= curr_stop):
                findings.append(
                    Finding(
                        "high",
                        "PAGE_CURRENT_RANGE_LEAK",
                        "page/conversion-timeseries",
                        "La serie actual contiene fechas fuera del preset solicitado.",
                        {"preset": preset, "date": d, "expected_start": curr_start, "expected_stop": curr_stop},
                    )
                )
        prev_start, prev_stop = prev_period(curr_start, curr_stop)
        prev_payload = fetch(
            base_url,
            f"{page_base}/conversion-timeseries",
            date_start=prev_start,
            date_stop=prev_stop,
        )
        for row in parse_rows(prev_payload):
            d = str(row.get("date") or "")
            if d and not (prev_start <= d <= prev_stop):
                findings.append(
                    Finding(
                        "critical",
                        "PAGE_PREV_RANGE_LEAK",
                        "page/conversion-timeseries(previous)",
                        "El periodo anterior devolvió fechas fuera del rango solicitado.",
                        {"preset": preset, "date": d, "expected_start": prev_start, "expected_stop": prev_stop},
                    )
                )

    return findings


def audit_account_preset(
    base_url: str,
    account_id: str,
    preset: str,
    objective_metric: str,
) -> list[Finding]:
    findings: list[Finding] = []
    base = f"/api/v1/accounts/{account_id}"
    dashboard = fetch(base_url, f"{base}/dashboard", date_preset=preset, objective_metric=objective_metric)
    ranking = fetch(base_url, f"{base}/ads/performance", date_preset=preset, objective_metric=objective_metric)
    entity = fetch(
        base_url,
        f"{base}/insights/entity-summary",
        date_preset=preset,
        level="campaign",
        objective_metric=objective_metric,
    )
    geo = fetch(base_url, f"{base}/insights/geo", date_preset=preset, objective_metric=objective_metric)
    demo = fetch(
        base_url,
        f"{base}/insights/demographics",
        date_preset=preset,
        breakdown="age",
        objective_metric=objective_metric,
    )

    ads_rows = parse_rows(ranking)
    entity_rows = parse_rows(entity)
    geo_rows = parse_rows(geo)
    demo_rows = parse_rows(demo)

    dash_spend = num(dashboard.get("summary", {}).get("spend"))
    dash_results = num(dashboard.get("derived", {}).get("results"))
    dash_cpa = dashboard.get("derived", {}).get("cpa")

    ads_spend = sum_key(ads_rows, "spend")
    entity_spend = sum_key(entity_rows, "spend")
    ads_results = round(sum(num(r.get("results")) for r in ads_rows), 2)
    entity_results = round(sum(num(r.get("results")) for r in entity_rows), 2)
    demo_results = round(sum(num(r.get("results")) for r in demo_rows if r.get("results") is not None), 2)

    if not nearly_equal(dash_spend, ads_spend, eps=0.25):
        findings.append(
            Finding(
                "high",
                "ACCOUNT_SPEND_DASHBOARD_VS_ADS",
                "account/dashboard+ads/performance",
                "El spend del dashboard no coincide con la suma del ranking de anuncios.",
                {"preset": preset, "objective_metric": objective_metric, "dashboard_spend": dash_spend, "ads_spend": ads_spend},
            )
        )
    if not nearly_equal(dash_spend, entity_spend, eps=0.25):
        findings.append(
            Finding(
                "high",
                "ACCOUNT_SPEND_DASHBOARD_VS_ENTITY",
                "account/dashboard+entity-summary",
                "El spend del dashboard no coincide con la suma del resumen por campaña.",
                {"preset": preset, "objective_metric": objective_metric, "dashboard_spend": dash_spend, "entity_spend": entity_spend},
            )
        )
    if not relative_close(dash_results, ads_results):
        findings.append(
            Finding(
                "high",
                "ACCOUNT_RESULTS_DASHBOARD_VS_ADS",
                "account/dashboard+ads/performance",
                "Los resultados del dashboard no coinciden con la suma del ranking de anuncios.",
                {"preset": preset, "objective_metric": objective_metric, "dashboard_results": dash_results, "ads_results": ads_results},
            )
        )
    if not relative_close(dash_results, entity_results):
        findings.append(
            Finding(
                "high",
                "ACCOUNT_RESULTS_DASHBOARD_VS_ENTITY",
                "account/dashboard+entity-summary",
                "Los resultados del dashboard no coinciden con la suma del resumen por campaña.",
                {"preset": preset, "objective_metric": objective_metric, "dashboard_results": dash_results, "entity_results": entity_results},
            )
        )
    if dash_results > 0:
        expected_cpa = round(dash_spend / dash_results, 4)
        if dash_cpa is None or not nearly_equal(num(dash_cpa), expected_cpa, eps=0.02):
            findings.append(
                Finding(
                    "high",
                    "ACCOUNT_DASHBOARD_CPA_MISMATCH",
                    "account/dashboard",
                    "El CPA derivado del dashboard no coincide con spend/results.",
                    {"preset": preset, "objective_metric": objective_metric, "cpa": dash_cpa, "expected": expected_cpa},
                )
            )
    if demo_rows and not relative_close(demo_results, dash_results):
        findings.append(
            Finding(
                "medium",
                "ACCOUNT_DEMO_RESULTS_MISMATCH",
                "account/demographics",
                "La suma del breakdown demográfico no coincide con resultados del dashboard.",
                {"preset": preset, "objective_metric": objective_metric, "demographics_results": demo_results, "dashboard_results": dash_results},
            )
        )

    geo_meta = geo.get("metadata") if isinstance(geo.get("metadata"), dict) else {}
    geo_total = round(sum(num(r.get("results")) for r in geo_rows if r.get("results") is not None), 2)
    geo_expected = num(geo_meta.get("objective_results_total"))
    if geo_meta.get("objective_breakdown_complete") is False:
        if not geo_meta.get("warning") or not rows_masked_for_objective(geo_rows):
            findings.append(
                Finding(
                    "high",
                    "ACCOUNT_GEO_OBJECTIVE_WARNING_INCOMPLETE",
                    "account/geo",
                    "El breakdown geo no cubre la métrica objetivo y la respuesta no quedó protegida.",
                    {"preset": preset, "objective_metric": objective_metric, "metadata": geo_meta},
                )
            )
    elif geo_rows and geo_expected > 0 and not relative_close(geo_total, geo_expected):
        findings.append(
            Finding(
                "high",
                "ACCOUNT_GEO_TOTAL_MISMATCH",
                "account/geo",
                "Los resultados del breakdown geo no coinciden con el total esperado del objetivo.",
                {"preset": preset, "objective_metric": objective_metric, "geo_total": geo_total, "expected": geo_expected},
            )
        )

    campaign_rows = [r for r in entity_rows if str(r.get("campaign_id") or r.get("entity_id") or "").strip()]
    campaign_rows = [r for r in campaign_rows if num(r.get("spend")) > 0][:3]
    for row in campaign_rows:
        campaign_id = str(row.get("campaign_id") or row.get("entity_id") or "").strip()
        if not campaign_id:
            continue
        dash_filtered = fetch(
            base_url,
            f"{base}/dashboard",
            date_preset=preset,
            objective_metric=objective_metric,
            campaign_id=campaign_id,
        )
        ranking_filtered = fetch(
            base_url,
            f"{base}/ads/performance",
            date_preset=preset,
            objective_metric=objective_metric,
            campaign_id=campaign_id,
        )
        filtered_spend = num(dash_filtered.get("summary", {}).get("spend"))
        filtered_results = num(dash_filtered.get("derived", {}).get("results"))
        expected_spend = num(row.get("spend"))
        expected_results = num(row.get("results"))
        if not nearly_equal(filtered_spend, expected_spend, eps=0.25):
            findings.append(
                Finding(
                    "high",
                    "CAMPAIGN_FILTER_SPEND_MISMATCH",
                    "account/dashboard(campaign)",
                    "El filtro por campaña no conserva el mismo spend que el resumen por campaña.",
                    {"preset": preset, "objective_metric": objective_metric, "campaign_id": campaign_id, "dashboard_spend": filtered_spend, "entity_spend": expected_spend},
                )
            )
        if not relative_close(filtered_results, expected_results):
            findings.append(
                Finding(
                    "high",
                    "CAMPAIGN_FILTER_RESULTS_MISMATCH",
                    "account/dashboard(campaign)",
                    "El filtro por campaña no conserva los mismos resultados que el resumen por campaña.",
                    {"preset": preset, "objective_metric": objective_metric, "campaign_id": campaign_id, "dashboard_results": filtered_results, "entity_results": expected_results},
                )
            )

        ranking_filtered_rows = parse_rows(ranking_filtered)
        ranking_filtered_spend = sum_key(ranking_filtered_rows, "spend")
        ranking_filtered_results = round(sum(num(r.get("results")) for r in ranking_filtered_rows), 2)
        if not nearly_equal(ranking_filtered_spend, expected_spend, eps=0.25):
            findings.append(
                Finding(
                    "high",
                    "CAMPAIGN_FILTER_RANKING_SPEND_MISMATCH",
                    "account/ads/performance(campaign)",
                    "El ranking filtrado por campaña no cuadra con el resumen por campaña.",
                    {"preset": preset, "objective_metric": objective_metric, "campaign_id": campaign_id, "ranking_spend": ranking_filtered_spend, "entity_spend": expected_spend},
                )
            )
        if not relative_close(ranking_filtered_results, expected_results):
            findings.append(
                Finding(
                    "high",
                    "CAMPAIGN_FILTER_RANKING_RESULTS_MISMATCH",
                    "account/ads/performance(campaign)",
                    "Los resultados del ranking filtrado no cuadran con el resumen por campaña.",
                    {"preset": preset, "objective_metric": objective_metric, "campaign_id": campaign_id, "ranking_results": ranking_filtered_results, "entity_results": expected_results},
                )
            )

    return findings


def summarize(findings: list[Finding]) -> dict[str, int]:
    out = {"critical": 0, "high": 0, "medium": 0, "low": 0}
    for finding in findings:
        out[finding.severity] = out.get(finding.severity, 0) + 1
    return out


def write_markdown_report(path: Path, loops: int, findings: list[Finding], summary: dict[str, int]) -> None:
    lines: list[str] = []
    lines.append("# Auditoría de métricas del dashboard")
    lines.append("")
    lines.append(f"- Loops ejecutados: **{loops}**")
    lines.append(
        f"- Resumen: critical={summary['critical']}, high={summary['high']}, medium={summary['medium']}, low={summary['low']}"
    )
    lines.append("")
    lines.append("## Hallazgos")
    lines.append("")
    if not findings:
        lines.append("Sin hallazgos. Todas las validaciones pasaron.")
    else:
        for finding in findings:
            lines.append(
                f"- **[{finding.severity.upper()}] {finding.code}** · `{finding.endpoint}` · {finding.message}"
            )
            lines.append(
                f"  - Contexto: `{json.dumps(finding.context, ensure_ascii=False)}`"
            )
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(lines), encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", default="http://localhost:8000")
    parser.add_argument("--account-id", required=True)
    parser.add_argument("--page-id", required=True)
    parser.add_argument("--presets", default="last_7d,last_30d,last_90d")
    parser.add_argument("--max-loops", type=int, default=5)
    parser.add_argument("--sleep-seconds", type=int, default=2)
    parser.add_argument("--report-path", default="docs/metrics-audit/LATEST_AUDIT_REPORT.md")
    args = parser.parse_args()

    presets = [p.strip() for p in args.presets.split(",") if p.strip()]
    all_findings: list[Finding] = []
    loops = 0

    for i in range(1, args.max_loops + 1):
        loops = i
        findings: list[Finding] = []
        for preset in presets:
            for objective_metric in OBJECTIVE_METRICS:
                findings.extend(
                    audit_account_preset(
                        args.base_url,
                        args.account_id,
                        preset,
                        objective_metric,
                    )
                )
                findings.extend(
                    audit_page_preset(
                        args.base_url,
                        args.account_id,
                        args.page_id,
                        preset,
                        objective_metric,
                    )
                )

        all_findings = findings
        summary = summarize(findings)
        print(
            f"[loop {i}] critical={summary['critical']} high={summary['high']} "
            f"medium={summary['medium']} low={summary['low']}",
            flush=True,
        )
        if summary["critical"] == 0 and summary["high"] == 0:
            break
        if i < args.max_loops:
            time.sleep(args.sleep_seconds)

    final_summary = summarize(all_findings)
    report_path = Path(args.report_path)
    write_markdown_report(report_path, loops, all_findings, final_summary)
    print(f"Reporte guardado en: {report_path}", flush=True)

    if final_summary["critical"] > 0 or final_summary["high"] > 0:
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
