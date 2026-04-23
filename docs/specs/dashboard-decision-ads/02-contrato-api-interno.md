# Contrato API interno — Dashboard de decision Ads

**Fecha:** 2026-04-23  
**Version de contrato:** v1  
**Base path:** `/api/v1/accounts/{id}`  
**Formato:** `application/json; charset=utf-8`

---

## 1) Convenciones comunes

### 1.1 Query params comunes

- `since` (string, `YYYY-MM-DD`, requerido)
- `until` (string, `YYYY-MM-DD`, requerido)
- `attribution_window` (string, requerido): `1d_click`, `7d_click`, `28d_click`, `1d_view`, `7d_view`
- `timezone` (string, opcional, default cuenta)
- `currency` (string, opcional, default cuenta)

### 1.2 Objeto de error estandar

```json
{
  "error": {
    "code": "invalid_query_params",
    "message": "since must be <= until",
    "details": {
      "field": "since"
    }
  }
}
```

### 1.3 Codigos de error comunes

- `400 Bad Request` - parametros invalidos.
- `401 Unauthorized` - token invalido o ausente.
- `403 Forbidden` - acceso denegado a cuenta.
- `404 Not Found` - cuenta o recurso no encontrado.
- `409 Conflict` - parametros incompatibles (ej. comparabilidad).
- `422 Unprocessable Entity` - datos insuficientes para calculo solicitado.
- `429 Too Many Requests` - limite de rate.
- `500 Internal Server Error` - error interno.
- `503 Service Unavailable` - dependencia temporalmente indisponible.

---

## 2) GET `/api/v1/accounts/{id}/ads/decision`

Retorna clasificacion por anuncio: `keep` | `test` | `pause`.

### Query params

- comunes +
- `limit` (int, opcional, default `50`, max `500`)
- `offset` (int, opcional, default `0`)
- `sort_by` (string, opcional): `spend` | `cost_per_result` | `roas` | `confidence_score`
- `sort_order` (string, opcional): `asc` | `desc`
- `status_filter` (string, opcional): `keep` | `test` | `pause` | `all` (default `all`)
- `comparison_mode` (string, opcional): `previous_period` | `none` (default `previous_period`)

### 200 OK (ejemplo)

```json
{
  "account_id": "act_123456",
  "period": {
    "since": "2026-04-01",
    "until": "2026-04-21"
  },
  "attribution_window": "7d_click",
  "comparison_mode": "previous_period",
  "summary": {
    "keep": 12,
    "test": 28,
    "pause": 9
  },
  "items": [
    {
      "ad_id": "120001",
      "ad_name": "Video UGC A",
      "decision_status": "keep",
      "decision_reason_code": "efficient_cpr_vs_benchmark",
      "recommended_action": "Mantener activo y monitorear estabilidad",
      "primary_driver": "results",
      "confidence_level": "high",
      "confidence_score": 0.82,
      "metrics": {
        "spend": 350.25,
        "impressions": 45210,
        "clicks": 1220,
        "ctr": 2.7,
        "cpm": 7.75,
        "frequency": 1.9,
        "results": 42,
        "cost_per_result": 8.34,
        "roas": 2.45
      },
      "benchmark": {
        "cost_per_result_p50": 10.9,
        "roas_p50": 1.9
      }
    }
  ],
  "pagination": {
    "limit": 50,
    "offset": 0,
    "total": 49
  }
}
```

---

## 3) GET `/api/v1/accounts/{id}/insights/benchmark`

Retorna benchmark historico por KPI para la cuenta.

### Query params

- comunes +
- `kpis` (csv, opcional, default: `ctr,cpm,cost_per_result,roas,frequency`)
- `lookback_days` (int, opcional, default `180`, min `30`, max `730`)
- `comparison_mode` (string, opcional): `period_vs_history` | `none` (default `period_vs_history`)

### 200 OK (ejemplo)

```json
{
  "account_id": "act_123456",
  "period": {
    "since": "2026-04-01",
    "until": "2026-04-21"
  },
  "attribution_window": "7d_click",
  "lookback_days": 180,
  "kpis": [
    {
      "name": "cost_per_result",
      "current_value": 11.4,
      "unit": "currency",
      "distribution": {
        "p25": 9.8,
        "p50": 10.9,
        "p75": 12.7
      },
      "position": "between_p50_p75",
      "comparable": true,
      "caveat": null
    }
  ]
}
```

---

## 4) GET `/api/v1/accounts/{id}/insights/drivers`

Retorna descomposicion de cambio entre periodo actual y periodo comparativo.

### Query params

- comunes +
- `compare_since` (string, `YYYY-MM-DD`, requerido)
- `compare_until` (string, `YYYY-MM-DD`, requerido)
- `kpi` (string, requerido): `cost_per_result` | `roas` | `ctr`
- `level` (string, opcional, default `account`): `account` | `campaign` | `adset` | `ad`
- `top_n` (int, opcional, default `5`, max `20`)

### 200 OK (ejemplo)

```json
{
  "account_id": "act_123456",
  "current_period": {
    "since": "2026-04-01",
    "until": "2026-04-21"
  },
  "comparison_period": {
    "since": "2026-03-11",
    "until": "2026-03-31"
  },
  "attribution_window": "7d_click",
  "kpi": "cost_per_result",
  "delta": {
    "absolute": 1.6,
    "relative_pct": 16.3
  },
  "primary_driver": "ctr",
  "drivers": [
    {
      "name": "ctr",
      "direction": "negative",
      "contribution_pct": 47.0,
      "explanation": "Menor CTR incremento costo por resultado"
    }
  ],
  "comparable": true,
  "caveat": null
}
```

---

## 5) GET `/api/v1/accounts/{id}/insights/confidence`

Retorna nivel de confianza por insight.

### Query params

- comunes +
- `scope` (string, opcional, default `account`): `account` | `campaign` | `adset` | `ad`
- `insight_types` (csv, opcional): `decision,benchmark,drivers`
- `min_sample_days` (int, opcional, default `7`, min `1`, max `90`)

### 200 OK (ejemplo)

```json
{
  "account_id": "act_123456",
  "period": {
    "since": "2026-04-01",
    "until": "2026-04-21"
  },
  "attribution_window": "7d_click",
  "scope": "ad",
  "items": [
    {
      "entity_id": "120001",
      "insight_type": "decision",
      "confidence_level": "high",
      "confidence_score": 0.84,
      "factors": {
        "volume_score": 0.9,
        "consistency_score": 0.78,
        "completeness_score": 0.86
      },
      "reason": "Volumen y consistencia suficientes en la ventana analizada"
    }
  ]
}
```

---

## 6) Errores especificos por endpoint

### `/ads/decision`

- `422 insufficient_data` - sin minimo para clasificacion robusta.

### `/insights/benchmark`

- `409 non_comparable_window` - mezcla de ventanas de atribucion en historico solicitado.

### `/insights/drivers`

- `400 invalid_comparison_period` - periodos invalidos o desalineados.

### `/insights/confidence`

- `422 confidence_not_computable` - faltan senales para score.

---

## 7) Notas de contrato

- La `attribution_window` debe venir siempre en request y response.
- Si no hay evidencia suficiente, devolver payload valido con `confidence_level = low` y mensajes de insuficiencia; no fallar salvo imposibilidad tecnica.
- El contrato es neutral: informa senales, no ejecuta cambios en campanas.
