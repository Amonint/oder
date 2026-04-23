from __future__ import annotations


def diagnose_from_kpis(
    *,
    cpm_delta: float | None,
    ctr_delta: float | None,
    conversion_rate_delta: float | None,
    frequency: float | None,
) -> list[dict[str, object]]:
    insights: list[dict[str, object]] = []

    if cpm_delta is not None and ctr_delta is not None and cpm_delta > 10 and abs(ctr_delta) < 5:
        insights.append(
            {
                "severity": "medium",
                "finding": "CPM sube con CTR estable",
                "recommendation": "Mercado mas caro o audiencia mas competida. Revisar pujas y segmentos.",
            }
        )
    if ctr_delta is not None and cpm_delta is not None and ctr_delta < -10 and abs(cpm_delta) < 5:
        insights.append(
            {
                "severity": "high",
                "finding": "CTR cae con CPM estable",
                "recommendation": "Probable desgaste creativo o mensaje. Rotar copies/creativos.",
            }
        )
    if frequency is not None and frequency >= 3.5 and ctr_delta is not None and ctr_delta < -5:
        insights.append(
            {
                "severity": "high",
                "finding": "Frecuencia alta con CTR en caida",
                "recommendation": "Riesgo de fatiga creativa. Limitar frecuencia y renovar anuncios.",
            }
        )
    if conversion_rate_delta is not None and conversion_rate_delta < -10 and ctr_delta is not None and ctr_delta >= 0:
        insights.append(
            {
                "severity": "medium",
                "finding": "CTR estable pero conversion baja",
                "recommendation": "Revisar landing, checkout y senal de conversion.",
            }
        )

    return insights

