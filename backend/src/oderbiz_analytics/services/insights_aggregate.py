"""Utility functions for aggregating Meta Ads insight rows."""
from __future__ import annotations

from collections import defaultdict
from decimal import Decimal, InvalidOperation

MESSAGING_ACTION_PREFIXES = (
    "onsite_conversion.messaging",
    "onsite_conversion.total_messaging",
)


def _safe_float(val: object) -> float:
    try:
        return float(val)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return 0.0


def _add_actions(dest: list[dict], src: list[dict]) -> list[dict]:
    """Merge src actions into dest list, summing values for matching action_type."""
    by_type: dict[str, float] = {a["action_type"]: _safe_float(a.get("value")) for a in dest}
    for action in src:
        t = action.get("action_type", "")
        by_type[t] = by_type.get(t, 0.0) + _safe_float(action.get("value"))
    return [{"action_type": t, "value": str(v)} for t, v in by_type.items()]


def aggregate_ad_rows(rows: list[dict]) -> list[dict]:
    """
    Aggregate daily rows (time_increment=1) into one row per ad_id.
    Numeric fields are summed; actions and cost_per_action_type are merged.
    """
    SUM_FIELDS = {"impressions", "clicks", "reach"}
    DECIMAL_FIELDS = {"spend"}

    buckets: dict[str, dict] = {}

    for row in rows:
        ad_id = row.get("ad_id") or row.get("id", "")
        if not ad_id:
            continue

        if ad_id not in buckets:
            buckets[ad_id] = {
                "ad_id": ad_id,
                "ad_name": row.get("ad_name", ""),
                "adset_id": row.get("adset_id", ""),
                "adset_name": row.get("adset_name", ""),
                "campaign_id": row.get("campaign_id", ""),
                "campaign_name": row.get("campaign_name", ""),
                "impressions": 0,
                "clicks": 0,
                "reach": 0,
                "spend": Decimal("0"),
                "actions": [],
                "cost_per_action_type": [],
            }

        b = buckets[ad_id]

        for f in SUM_FIELDS:
            b[f] = b[f] + int(row.get(f) or 0)

        for f in DECIMAL_FIELDS:
            try:
                b[f] = b[f] + Decimal(str(row.get(f) or "0"))
            except InvalidOperation:
                pass

        if row.get("actions"):
            b["actions"] = _add_actions(b["actions"], row["actions"])

        if row.get("cost_per_action_type"):
            b["cost_per_action_type"] = _add_actions(
                b["cost_per_action_type"], row["cost_per_action_type"]
            )

    result = []
    for b in buckets.values():
        b["spend"] = str(b["spend"])
        impr = b["impressions"] or 1
        clicks = b["clicks"]
        b["ctr"] = f"{clicks / impr * 100:.4f}"
        result.append(b)

    result.sort(key=lambda r: _safe_float(r.get("spend", 0)), reverse=True)
    return result


def summarize_messaging_actions(rows: list[dict]) -> dict[str, float]:
    """Sum messaging action values across all rows."""
    totals: dict[str, float] = defaultdict(float)
    for row in rows:
        for action in row.get("actions") or []:
            t = action.get("action_type", "")
            if any(t.startswith(p) for p in MESSAGING_ACTION_PREFIXES):
                totals[t] += _safe_float(action.get("value"))
    return dict(totals)
