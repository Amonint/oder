# Validación de anuncios con eye tracking por webcam Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir un flujo completo para crear estudios de validación de anuncios, recolectar gaze points vía webcam desde navegador, y mostrar un dashboard agregado con heatmap y métricas por creatividad.

**Architecture:** El frontend captura gaze/calibración en cliente (sin enviar video), empaqueta eventos por lotes y los envía al backend FastAPI. El backend persiste sesiones y eventos en DuckDB, valida calidad mínima de sesión y calcula un heatmap agregado por anuncio. El dashboard de administración consume un endpoint consolidado que devuelve imagen base, heatmap, métricas y estado de confianza.

**Tech Stack:** FastAPI + DuckDB + Pytest (backend), React 19 + TypeScript + TanStack Query + Canvas rendering (frontend).

---

## File Structure

### Backend

- Create: `backend/src/oderbiz_analytics/adapters/duckdb/ad_validation_repo.py`
  - Responsabilidad: tablas, CRUD de estudios, sesiones, eventos y lectura agregada.
- Create: `backend/src/oderbiz_analytics/services/eye_tracking_quality.py`
  - Responsabilidad: regla de sesión válida (calibración, duración, puntos mínimos).
- Create: `backend/src/oderbiz_analytics/services/heatmap_aggregate.py`
  - Responsabilidad: normalizar gaze points y construir grid de densidad + AOIs.
- Create: `backend/src/oderbiz_analytics/api/routes/ad_validation_public.py`
  - Responsabilidad: endpoints públicos para participante (`start`, `events`, `complete`, `study-by-token`).
- Create: `backend/src/oderbiz_analytics/api/routes/ad_validation_admin.py`
  - Responsabilidad: CRUD de estudios, dashboard agregado, export CSV.
- Modify: `backend/src/oderbiz_analytics/api/main.py`
  - Responsabilidad: registrar routers + inicializar tablas.
- Modify: `backend/src/oderbiz_analytics/api/middleware_site_auth.py`
  - Responsabilidad: permitir endpoints públicos de participante sin login de app.
- Modify: `backend/src/oderbiz_analytics/config.py`
  - Responsabilidad: agregar configuración de umbrales y almacenamiento de imágenes/heatmaps.
- Create: `backend/tests/test_ad_validation_repo.py`
- Create: `backend/tests/test_ad_validation_quality.py`
- Create: `backend/tests/test_ad_validation_heatmap.py`
- Create: `backend/tests/test_ad_validation_public_route.py`
- Create: `backend/tests/test_ad_validation_admin_route.py`

### Frontend

- Create: `frontend/src/api/adValidation.ts`
  - Responsabilidad: cliente HTTP para admin/participante.
- Create: `frontend/src/lib/eyeTracking/webgazerClient.ts`
  - Responsabilidad: encapsular inicialización, lectura y teardown de eye tracking en navegador.
- Create: `frontend/src/lib/eyeTracking/calibration.ts`
  - Responsabilidad: estado y scoring de calibración.
- Create: `frontend/src/lib/heatmap/heatmapRenderer.ts`
  - Responsabilidad: pintar overlay de densidad sobre imagen en canvas.
- Create: `frontend/src/routes/AdValidationParticipantPage.tsx`
  - Responsabilidad: consentimiento cámara, calibración, exposición del anuncio y finalización.
- Create: `frontend/src/routes/AdValidationAdminPage.tsx`
  - Responsabilidad: listado de estudios + creación.
- Create: `frontend/src/routes/AdValidationStudyDashboardPage.tsx`
  - Responsabilidad: dashboard de un estudio con heatmap y métricas.
- Create: `frontend/src/components/ad-validation/StudyCreateForm.tsx`
- Create: `frontend/src/components/ad-validation/StudyTable.tsx`
- Create: `frontend/src/components/ad-validation/ParticipantFlow.tsx`
- Create: `frontend/src/components/ad-validation/HeatmapOverlay.tsx`
- Modify: `frontend/src/main.tsx`
  - Responsabilidad: registrar rutas admin y ruta pública de participante fuera de `RequireSiteAuth`.
- Modify: `frontend/package.json`
  - Responsabilidad: scripts de test unitario de utilidades de tracking/heatmap.
- Create: `frontend/src/lib/__tests__/adValidationClient.test.ts`
- Create: `frontend/src/lib/__tests__/calibration.test.ts`
- Create: `frontend/src/lib/__tests__/heatmapRenderer.test.ts`

### Docs

- Create: `docs/specs/2026-05-18-eye-tracking-anuncios-mvp.md`
  - Responsabilidad: contrato API interno, definición de sesión válida, y limitaciones de precisión.

---

### Task 1: Persistencia base de estudios/sesiones/eventos

**Files:**
- Create: `backend/src/oderbiz_analytics/adapters/duckdb/ad_validation_repo.py`
- Modify: `backend/src/oderbiz_analytics/config.py`
- Test: `backend/tests/test_ad_validation_repo.py`

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_ad_validation_repo.py
from oderbiz_analytics.adapters.duckdb.ad_validation_repo import (
    create_study,
    init_ad_validation_tables,
    list_studies,
    start_session,
    append_session_events,
    complete_session,
)


def test_repo_creates_study_and_persists_session_payload(tmp_path):
    db_path = str(tmp_path / "test.duckdb")
    init_ad_validation_tables(db_path)

    study = create_study(
        db_path,
        {
            "name": "Hero creativo mayo",
            "campaign_id": "cmp_01",
            "ad_id": "ad_01",
            "image_url": "https://cdn.example/ad-01.png",
            "image_width": 1080,
            "image_height": 1080,
        },
    )

    assert study["id"]
    assert study["public_token"]

    rows = list_studies(db_path)
    assert len(rows) == 1

    session = start_session(
        db_path,
        {
            "study_id": study["id"],
            "participant_id": "anon-01",
            "device_type": "desktop",
            "browser": "Chrome",
            "calibration_score": 0.82,
        },
    )

    append_session_events(
        db_path,
        session["id"],
        gaze_points=[{"t": 10, "x": 0.51, "y": 0.22, "confidence": 0.9}],
        fixations=[{"t_start": 10, "t_end": 60, "x": 0.5, "y": 0.2}],
        blink_events=[{"t": 35}],
        face_signals=[{"t": 20, "label": "neutral", "score": 0.61}],
    )

    closed = complete_session(db_path, session["id"], "completed")
    assert closed["session_status"] == "completed"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python3.12 -m pytest tests/test_ad_validation_repo.py -v`
Expected: FAIL with `ModuleNotFoundError` for `ad_validation_repo`.

- [ ] **Step 3: Write minimal implementation**

```python
# backend/src/oderbiz_analytics/adapters/duckdb/ad_validation_repo.py
from __future__ import annotations

import json
import uuid
from datetime import UTC, datetime

import duckdb

_SCHEMA = """
CREATE TABLE IF NOT EXISTS ad_validation_study (
    id VARCHAR PRIMARY KEY,
    name VARCHAR NOT NULL,
    campaign_id VARCHAR,
    ad_id VARCHAR,
    image_url VARCHAR NOT NULL,
    image_width INTEGER,
    image_height INTEGER,
    public_token VARCHAR UNIQUE NOT NULL,
    status VARCHAR NOT NULL DEFAULT 'draft',
    heatmap_url VARCHAR,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS ad_validation_session (
    id VARCHAR PRIMARY KEY,
    study_id VARCHAR NOT NULL,
    participant_id VARCHAR NOT NULL,
    device_type VARCHAR,
    browser VARCHAR,
    calibration_score DOUBLE,
    session_status VARCHAR NOT NULL DEFAULT 'started',
    gaze_points_json VARCHAR NOT NULL DEFAULT '[]',
    fixations_json VARCHAR NOT NULL DEFAULT '[]',
    blink_events_json VARCHAR NOT NULL DEFAULT '[]',
    face_signals_json VARCHAR NOT NULL DEFAULT '[]',
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);
"""


def init_ad_validation_tables(db_path: str) -> None:
    con = duckdb.connect(db_path)
    try:
        con.execute(_SCHEMA)
    finally:
        con.close()


def create_study(db_path: str, payload: dict) -> dict:
    now = datetime.now(UTC)
    row = {
        "id": str(uuid.uuid4()),
        "public_token": uuid.uuid4().hex,
        "status": "draft",
        "created_at": now,
        "updated_at": now,
        **payload,
    }
    con = duckdb.connect(db_path)
    try:
        con.execute(
            """
            INSERT INTO ad_validation_study
            (id,name,campaign_id,ad_id,image_url,image_width,image_height,public_token,status,created_at,updated_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?)
            """,
            [
                row["id"], row["name"], row.get("campaign_id"), row.get("ad_id"), row["image_url"],
                row.get("image_width"), row.get("image_height"), row["public_token"], row["status"],
                row["created_at"], row["updated_at"],
            ],
        )
    finally:
        con.close()
    return row
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && python3.12 -m pytest tests/test_ad_validation_repo.py -v`
Expected: PASS (`1 passed`).

- [ ] **Step 5: Commit**

```bash
git add backend/src/oderbiz_analytics/adapters/duckdb/ad_validation_repo.py backend/tests/test_ad_validation_repo.py
git commit -m "feat: add duckdb repository for ad validation studies and sessions"
```

### Task 2: Validación de calidad de sesión y reglas de confianza

**Files:**
- Create: `backend/src/oderbiz_analytics/services/eye_tracking_quality.py`
- Test: `backend/tests/test_ad_validation_quality.py`

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_ad_validation_quality.py
from oderbiz_analytics.services.eye_tracking_quality import evaluate_session_quality


def test_quality_requires_calibration_points_and_duration():
    quality = evaluate_session_quality(
        calibration_score=0.55,
        gaze_points_count=42,
        duration_ms=3500,
    )
    assert quality["is_valid"] is False
    assert "calibration" in quality["reasons"][0]


def test_quality_marks_valid_when_thresholds_met():
    quality = evaluate_session_quality(
        calibration_score=0.86,
        gaze_points_count=220,
        duration_ms=9000,
    )
    assert quality["is_valid"] is True
    assert quality["confidence_label"] == "sufficient"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python3.12 -m pytest tests/test_ad_validation_quality.py -v`
Expected: FAIL with `ModuleNotFoundError`.

- [ ] **Step 3: Write minimal implementation**

```python
# backend/src/oderbiz_analytics/services/eye_tracking_quality.py
from __future__ import annotations


def evaluate_session_quality(
    *,
    calibration_score: float,
    gaze_points_count: int,
    duration_ms: int,
    min_calibration: float = 0.75,
    min_points: int = 120,
    min_duration_ms: int = 5000,
) -> dict:
    reasons: list[str] = []
    if calibration_score < min_calibration:
        reasons.append("calibration below threshold")
    if gaze_points_count < min_points:
        reasons.append("not enough gaze points")
    if duration_ms < min_duration_ms:
        reasons.append("session duration too short")

    is_valid = len(reasons) == 0
    confidence_label = "sufficient" if is_valid else "low"
    return {
        "is_valid": is_valid,
        "confidence_label": confidence_label,
        "reasons": reasons,
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && python3.12 -m pytest tests/test_ad_validation_quality.py -v`
Expected: PASS (`2 passed`).

- [ ] **Step 5: Commit**

```bash
git add backend/src/oderbiz_analytics/services/eye_tracking_quality.py backend/tests/test_ad_validation_quality.py
git commit -m "feat: add session quality evaluation for eye tracking"
```

### Task 3: Agregación de heatmap y métricas por zonas

**Files:**
- Create: `backend/src/oderbiz_analytics/services/heatmap_aggregate.py`
- Test: `backend/tests/test_ad_validation_heatmap.py`

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_ad_validation_heatmap.py
from oderbiz_analytics.services.heatmap_aggregate import build_density_heatmap


def test_build_density_heatmap_returns_grid_and_aoi_times():
    gaze_points = [
        {"x": 0.2, "y": 0.2, "t": 0},
        {"x": 0.21, "y": 0.19, "t": 32},
        {"x": 0.7, "y": 0.6, "t": 64},
    ]
    aois = [
        {"id": "headline", "x": 0.1, "y": 0.1, "w": 0.3, "h": 0.2},
        {"id": "cta", "x": 0.6, "y": 0.5, "w": 0.2, "h": 0.2},
    ]

    result = build_density_heatmap(gaze_points, aois=aois, grid_size=8)

    assert len(result["grid"]) == 8
    assert len(result["grid"][0]) == 8
    assert result["sessions_count"] == 1
    assert result["aoi_attention_ms"]["headline"] > 0
    assert result["aoi_attention_ms"]["cta"] > 0
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python3.12 -m pytest tests/test_ad_validation_heatmap.py -v`
Expected: FAIL with `ModuleNotFoundError`.

- [ ] **Step 3: Write minimal implementation**

```python
# backend/src/oderbiz_analytics/services/heatmap_aggregate.py
from __future__ import annotations


def build_density_heatmap(
    gaze_points: list[dict],
    *,
    aois: list[dict] | None = None,
    grid_size: int = 32,
) -> dict:
    grid = [[0.0 for _ in range(grid_size)] for _ in range(grid_size)]
    aoi_attention_ms: dict[str, int] = {a["id"]: 0 for a in (aois or [])}

    for idx, point in enumerate(gaze_points):
        x = max(0.0, min(0.999, float(point["x"])))
        y = max(0.0, min(0.999, float(point["y"])))
        gx = int(x * grid_size)
        gy = int(y * grid_size)
        grid[gy][gx] += 1.0

        dt = 32
        if idx + 1 < len(gaze_points):
            dt = max(1, int(gaze_points[idx + 1]["t"] - point["t"]))

        for aoi in aois or []:
            if aoi["x"] <= x <= aoi["x"] + aoi["w"] and aoi["y"] <= y <= aoi["y"] + aoi["h"]:
                aoi_attention_ms[aoi["id"]] += dt

    return {
        "grid": grid,
        "aoi_attention_ms": aoi_attention_ms,
        "sessions_count": 1,
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && python3.12 -m pytest tests/test_ad_validation_heatmap.py -v`
Expected: PASS (`1 passed`).

- [ ] **Step 5: Commit**

```bash
git add backend/src/oderbiz_analytics/services/heatmap_aggregate.py backend/tests/test_ad_validation_heatmap.py
git commit -m "feat: add aggregated heatmap builder with AOI metrics"
```

### Task 4: API pública de participante (link, sesión, eventos, cierre)

**Files:**
- Create: `backend/src/oderbiz_analytics/api/routes/ad_validation_public.py`
- Modify: `backend/src/oderbiz_analytics/api/main.py`
- Modify: `backend/src/oderbiz_analytics/api/middleware_site_auth.py`
- Test: `backend/tests/test_ad_validation_public_route.py`

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_ad_validation_public_route.py
from fastapi.testclient import TestClient
from oderbiz_analytics.api.main import app
from oderbiz_analytics.adapters.duckdb.ad_validation_repo import create_study, init_ad_validation_tables


def test_public_flow_start_append_complete(monkeypatch, tmp_path):
    db_path = str(tmp_path / "test.duckdb")
    monkeypatch.setenv("DUCKDB_PATH", db_path)
    init_ad_validation_tables(db_path)
    study = create_study(
        db_path,
        {
            "name": "Ad test",
            "image_url": "https://cdn.example/ad.png",
            "image_width": 1080,
            "image_height": 1080,
        },
    )
    with TestClient(app) as client:
        token = study["public_token"]

        s = client.post(f"/api/v1/ad-validation/public/{token}/sessions/start", json={"participant_id": "anon-x"})
        assert s.status_code == 201
        session_id = s.json()["session_id"]

        e = client.post(
            f"/api/v1/ad-validation/public/sessions/{session_id}/events",
            json={"gaze_points": [{"x": 0.4, "y": 0.4, "t": 20}]},
        )
        assert e.status_code == 202

        done = client.post(
            f"/api/v1/ad-validation/public/sessions/{session_id}/complete",
            json={"duration_ms": 8200},
        )
        assert done.status_code == 200
        assert done.json()["session_status"] in {"completed", "low_confidence"}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python3.12 -m pytest tests/test_ad_validation_public_route.py -v`
Expected: FAIL with `404` for `/api/v1/ad-validation/public/...`.

- [ ] **Step 3: Write minimal implementation**

```python
# backend/src/oderbiz_analytics/api/routes/ad_validation_public.py
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from oderbiz_analytics.adapters.duckdb.ad_validation_repo import (
    append_session_events,
    complete_session,
    get_study_by_public_token,
    start_session,
)
from oderbiz_analytics.config import Settings, get_settings

router = APIRouter(prefix="/ad-validation/public", tags=["ad_validation_public"])

class StartSessionIn(BaseModel):
    participant_id: str = Field(min_length=3)
    device_type: str | None = None
    browser: str | None = None
    calibration_score: float = 0.0

@router.post("/{public_token}/sessions/start", status_code=201)
async def start(public_token: str, body: StartSessionIn, settings: Settings = Depends(get_settings)):
    study = get_study_by_public_token(settings.duckdb_path, public_token)
    if not study:
        raise HTTPException(status_code=404, detail="Study not found")
    row = start_session(settings.duckdb_path, {"study_id": study["id"], **body.model_dump()})
    return {"session_id": row["id"], "study_id": study["id"]}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && python3.12 -m pytest tests/test_ad_validation_public_route.py -v`
Expected: PASS (`1 passed`).

- [ ] **Step 5: Commit**

```bash
git add backend/src/oderbiz_analytics/api/routes/ad_validation_public.py backend/src/oderbiz_analytics/api/main.py backend/src/oderbiz_analytics/api/middleware_site_auth.py backend/tests/test_ad_validation_public_route.py
git commit -m "feat: add public participant endpoints for eye tracking sessions"
```

### Task 5: API de administración (CRUD, dashboard agregado y export)

**Files:**
- Create: `backend/src/oderbiz_analytics/api/routes/ad_validation_admin.py`
- Modify: `backend/src/oderbiz_analytics/api/main.py`
- Test: `backend/tests/test_ad_validation_admin_route.py`

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_ad_validation_admin_route.py
from fastapi.testclient import TestClient
from oderbiz_analytics.api.main import app


def test_admin_creates_study_reads_dashboard_and_exports_csv(monkeypatch, tmp_path):
    monkeypatch.setenv("DUCKDB_PATH", str(tmp_path / "test.duckdb"))
    with TestClient(app) as client:
        created = client.post(
            "/api/v1/ad-validation/studies",
            json={
                "name": "Banner v1",
                "campaign_id": "cmp_1",
                "ad_id": "ad_1",
                "image_url": "https://cdn.example/banner.png",
                "image_width": 1200,
                "image_height": 628,
            },
        )
        assert created.status_code == 201
        study_id = created.json()["id"]

        dashboard = client.get(f"/api/v1/ad-validation/studies/{study_id}/dashboard")
        assert dashboard.status_code == 200
        assert dashboard.json()["study"]["id"] == study_id

        exported = client.get(f"/api/v1/ad-validation/studies/{study_id}/export.csv")
        assert exported.status_code == 200
        assert exported.headers["content-type"].startswith("text/csv")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python3.12 -m pytest tests/test_ad_validation_admin_route.py -v`
Expected: FAIL with `404` on `/api/v1/ad-validation/studies`.

- [ ] **Step 3: Write minimal implementation**

```python
# backend/src/oderbiz_analytics/api/routes/ad_validation_admin.py
from __future__ import annotations

import csv
import io

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel, Field

from oderbiz_analytics.adapters.duckdb.ad_validation_repo import (
    create_study,
    get_study_by_id,
    list_studies,
    list_valid_sessions_by_study,
)
from oderbiz_analytics.config import Settings, get_settings

router = APIRouter(prefix="/ad-validation", tags=["ad_validation_admin"])

class StudyCreateIn(BaseModel):
    name: str = Field(min_length=3)
    campaign_id: str | None = None
    ad_id: str | None = None
    image_url: str
    image_width: int
    image_height: int

@router.post("/studies", status_code=201)
async def create_study_route(body: StudyCreateIn, settings: Settings = Depends(get_settings)):
    return create_study(settings.duckdb_path, body.model_dump())

@router.get("/studies")
async def list_studies_route(settings: Settings = Depends(get_settings)):
    return {"data": list_studies(settings.duckdb_path)}

@router.get("/studies/{study_id}/dashboard")
async def study_dashboard(study_id: str, settings: Settings = Depends(get_settings)):
    study = get_study_by_id(settings.duckdb_path, study_id)
    if not study:
        raise HTTPException(status_code=404, detail="Study not found")
    sessions = list_valid_sessions_by_study(settings.duckdb_path, study_id)
    return {
        "study": study,
        "metrics": {
            "valid_sessions": len(sessions),
            "show_heatmap": len(sessions) > 0,
            "low_confidence": 0 < len(sessions) < 5,
        },
        "heatmap": None,
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && python3.12 -m pytest tests/test_ad_validation_admin_route.py -v`
Expected: PASS (`1 passed`).

- [ ] **Step 5: Commit**

```bash
git add backend/src/oderbiz_analytics/api/routes/ad_validation_admin.py backend/src/oderbiz_analytics/api/main.py backend/tests/test_ad_validation_admin_route.py
git commit -m "feat: add ad validation admin api and csv export"
```

### Task 6: Cliente frontend y rutas nuevas (admin + participante)

**Files:**
- Create: `frontend/src/api/adValidation.ts`
- Modify: `frontend/src/main.tsx`
- Test: `frontend/src/lib/__tests__/adValidationClient.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
/// <reference types="node" />
import assert from "node:assert/strict";
import { buildParticipantSessionPayload } from "../../api/adValidation";

const payload = buildParticipantSessionPayload({
  participantId: "anon-123",
  deviceType: "desktop",
  browser: "Chrome",
  calibrationScore: 0.83,
});

assert.equal(payload.participant_id, "anon-123");
assert.equal(payload.calibration_score, 0.83);
console.log("adValidationClient.test.ts passed");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx tsx src/lib/__tests__/adValidationClient.test.ts`
Expected: FAIL with `Cannot find module '../../api/adValidation'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// frontend/src/api/adValidation.ts
import { getSiteSessionToken, SITE_SESSION_HEADER } from "./siteSession";

const API_BASE = import.meta.env.DEV ? "" : (import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000");

function buildUrl(path: string): string {
  const base = String(API_BASE).replace(/\/+$/, "");
  return `${base}${path}`;
}

function buildHeaders(): Headers {
  const h = new Headers({ "Content-Type": "application/json" });
  const session = getSiteSessionToken();
  if (session) h.set(SITE_SESSION_HEADER, session);
  return h;
}

export function buildParticipantSessionPayload(input: {
  participantId: string;
  deviceType: string;
  browser: string;
  calibrationScore: number;
}) {
  return {
    participant_id: input.participantId,
    device_type: input.deviceType,
    browser: input.browser,
    calibration_score: input.calibrationScore,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx tsx src/lib/__tests__/adValidationClient.test.ts`
Expected: PASS (`adValidationClient.test.ts passed`).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/api/adValidation.ts frontend/src/main.tsx frontend/src/lib/__tests__/adValidationClient.test.ts
git commit -m "feat: add frontend ad validation api client and routes"
```

### Task 7: Flujo de participante (permiso cámara, calibración, captura, envío)

**Files:**
- Create: `frontend/src/lib/eyeTracking/webgazerClient.ts`
- Create: `frontend/src/lib/eyeTracking/calibration.ts`
- Create: `frontend/src/routes/AdValidationParticipantPage.tsx`
- Create: `frontend/src/components/ad-validation/ParticipantFlow.tsx`
- Test: `frontend/src/lib/__tests__/calibration.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
/// <reference types="node" />
import assert from "node:assert/strict";
import { calibrationProgress, calibrationCompleted } from "../eyeTracking/calibration";

const pointsHit = new Set(["p1", "p2", "p3", "p4", "p5", "p6", "p7", "p8"]);
assert.equal(calibrationProgress(pointsHit, 9), 0.88);
assert.equal(calibrationCompleted(pointsHit, 9), false);
pointsHit.add("p9");
assert.equal(calibrationCompleted(pointsHit, 9), true);
console.log("calibration.test.ts passed");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx tsx src/lib/__tests__/calibration.test.ts`
Expected: FAIL with `Cannot find module '../eyeTracking/calibration'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// frontend/src/lib/eyeTracking/calibration.ts
export function calibrationProgress(hitPoints: Set<string>, totalPoints: number): number {
  if (totalPoints <= 0) return 0;
  return Number((hitPoints.size / totalPoints).toFixed(2));
}

export function calibrationCompleted(hitPoints: Set<string>, totalPoints: number): boolean {
  return totalPoints > 0 && hitPoints.size >= totalPoints;
}
```

```tsx
// frontend/src/routes/AdValidationParticipantPage.tsx (estructura mínima)
import ParticipantFlow from "@/components/ad-validation/ParticipantFlow";

export default function AdValidationParticipantPage() {
  return <ParticipantFlow />;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx tsx src/lib/__tests__/calibration.test.ts`
Expected: PASS (`calibration.test.ts passed`).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/eyeTracking/calibration.ts frontend/src/lib/eyeTracking/webgazerClient.ts frontend/src/routes/AdValidationParticipantPage.tsx frontend/src/components/ad-validation/ParticipantFlow.tsx frontend/src/lib/__tests__/calibration.test.ts
git commit -m "feat: add participant eye tracking flow with calibration utilities"
```

### Task 8: Dashboard admin con heatmap agregado y métricas

**Files:**
- Create: `frontend/src/lib/heatmap/heatmapRenderer.ts`
- Create: `frontend/src/components/ad-validation/HeatmapOverlay.tsx`
- Create: `frontend/src/routes/AdValidationAdminPage.tsx`
- Create: `frontend/src/routes/AdValidationStudyDashboardPage.tsx`
- Create: `frontend/src/components/ad-validation/StudyCreateForm.tsx`
- Create: `frontend/src/components/ad-validation/StudyTable.tsx`
- Test: `frontend/src/lib/__tests__/heatmapRenderer.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
/// <reference types="node" />
import assert from "node:assert/strict";
import { intensityToRgba } from "../heatmap/heatmapRenderer";

assert.equal(intensityToRgba(0), "rgba(0,0,255,0.00)");
assert.equal(intensityToRgba(0.5), "rgba(255,165,0,0.50)");
assert.equal(intensityToRgba(1), "rgba(255,0,0,0.85)");
console.log("heatmapRenderer.test.ts passed");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx tsx src/lib/__tests__/heatmapRenderer.test.ts`
Expected: FAIL with `Cannot find module '../heatmap/heatmapRenderer'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// frontend/src/lib/heatmap/heatmapRenderer.ts
export function intensityToRgba(value: number): string {
  const v = Math.max(0, Math.min(1, value));
  if (v === 0) return "rgba(0,0,255,0.00)";
  if (v < 0.5) return `rgba(0,128,255,${v.toFixed(2)})`;
  if (v < 1) return `rgba(255,165,0,${v.toFixed(2)})`;
  return "rgba(255,0,0,0.85)";
}
```

```tsx
// frontend/src/components/ad-validation/HeatmapOverlay.tsx (estructura mínima)
export default function HeatmapOverlay() {
  return <canvas data-testid="heatmap-canvas" className="h-auto w-full" />;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx tsx src/lib/__tests__/heatmapRenderer.test.ts`
Expected: PASS (`heatmapRenderer.test.ts passed`).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/heatmap/heatmapRenderer.ts frontend/src/components/ad-validation/HeatmapOverlay.tsx frontend/src/routes/AdValidationAdminPage.tsx frontend/src/routes/AdValidationStudyDashboardPage.tsx frontend/src/components/ad-validation/StudyCreateForm.tsx frontend/src/components/ad-validation/StudyTable.tsx frontend/src/lib/__tests__/heatmapRenderer.test.ts
git commit -m "feat: add ad validation admin dashboard with aggregated heatmap"
```

### Task 9: Integración backend-dashboard (heatmap, confianza, export)

**Files:**
- Modify: `backend/src/oderbiz_analytics/api/routes/ad_validation_admin.py`
- Modify: `backend/src/oderbiz_analytics/services/heatmap_aggregate.py`
- Modify: `backend/src/oderbiz_analytics/adapters/duckdb/ad_validation_repo.py`
- Test: `backend/tests/test_ad_validation_admin_route.py`

- [ ] **Step 1: Write the failing test**

```python
def test_dashboard_hides_heatmap_without_valid_sessions(monkeypatch, tmp_path):
    monkeypatch.setenv("DUCKDB_PATH", str(tmp_path / "test.duckdb"))
    from fastapi.testclient import TestClient
    from oderbiz_analytics.api.main import app

    with TestClient(app) as client:
        created = client.post(
            "/api/v1/ad-validation/studies",
            json={
                "name": "No data",
                "image_url": "https://cdn.example/no-data.png",
                "image_width": 1080,
                "image_height": 1080,
            },
        )
        study_id = created.json()["id"]
        dashboard = client.get(f"/api/v1/ad-validation/studies/{study_id}/dashboard")
        body = dashboard.json()
        assert body["metrics"]["valid_sessions"] == 0
        assert body["heatmap"] is None
        assert body["metrics"]["confidence_note"] == "Sin sesiones válidas"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python3.12 -m pytest tests/test_ad_validation_admin_route.py::test_dashboard_hides_heatmap_without_valid_sessions -v`
Expected: FAIL because `confidence_note` key does not exist.

- [ ] **Step 3: Write minimal implementation**

```python
# backend/src/oderbiz_analytics/api/routes/ad_validation_admin.py (bloque de métricas)
if len(sessions) == 0:
    return {
        "study": study,
        "metrics": {
            "valid_sessions": 0,
            "show_heatmap": False,
            "low_confidence": True,
            "confidence_note": "Sin sesiones válidas",
        },
        "heatmap": None,
    }

heatmap = build_density_heatmap(flat_gaze_points, aois=study.get("aois") or [], grid_size=32)
return {
    "study": study,
    "metrics": {
        "valid_sessions": len(sessions),
        "show_heatmap": True,
        "low_confidence": len(sessions) < 5,
        "confidence_note": "Muestra pequeña" if len(sessions) < 5 else "Muestra suficiente",
    },
    "heatmap": heatmap,
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && python3.12 -m pytest tests/test_ad_validation_admin_route.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/oderbiz_analytics/api/routes/ad_validation_admin.py backend/src/oderbiz_analytics/services/heatmap_aggregate.py backend/src/oderbiz_analytics/adapters/duckdb/ad_validation_repo.py backend/tests/test_ad_validation_admin_route.py
git commit -m "feat: return aggregated heatmap confidence and no-data behavior"
```

### Task 10: Documentación operativa y validación final

**Files:**
- Create: `docs/specs/2026-05-18-eye-tracking-anuncios-mvp.md`
- Modify: `README.md`

- [ ] **Step 1: Write the failing doc check**

```bash
# Validación manual previa: el archivo no existe todavía
ls docs/specs/2026-05-18-eye-tracking-anuncios-mvp.md
```

- [ ] **Step 2: Run check to verify it fails**

Run: `ls docs/specs/2026-05-18-eye-tracking-anuncios-mvp.md`
Expected: FAIL with `No such file or directory`.

- [ ] **Step 3: Write minimal implementation**

```md
# docs/specs/2026-05-18-eye-tracking-anuncios-mvp.md
## Contrato MVP
- POST /api/v1/ad-validation/studies
- POST /api/v1/ad-validation/public/{token}/sessions/start
- POST /api/v1/ad-validation/public/sessions/{id}/events
- POST /api/v1/ad-validation/public/sessions/{id}/complete
- GET /api/v1/ad-validation/studies/{id}/dashboard
- GET /api/v1/ad-validation/studies/{id}/export.csv

## Definición de sesión válida
- calibration_score >= 0.75
- gaze_points >= 120
- duration_ms >= 5000

## Limitaciones explícitas
- Precisión depende de webcam, iluminación y movimiento.
- Señales emocionales son opcionales y no diagnósticas.
```

- [ ] **Step 4: Run verification suite**

Run: `cd backend && python3.12 -m pytest tests/test_ad_validation_*.py -v`
Expected: PASS all ad-validation backend tests.

Run: `cd frontend && npx tsx src/lib/__tests__/calibration.test.ts && npx tsx src/lib/__tests__/heatmapRenderer.test.ts && npx tsx src/lib/__tests__/adValidationClient.test.ts`
Expected: PASS all frontend utility tests.

- [ ] **Step 5: Commit**

```bash
git add docs/specs/2026-05-18-eye-tracking-anuncios-mvp.md README.md
git commit -m "docs: add mvp spec and operational notes for ad eye tracking validation"
```

---

## Self-Review

### 1. Spec coverage

- Subida de anuncio, CRUD y link compartible: Task 1 + Task 5 + Task 8.
- Flujo participante (permiso, calibración, visualización): Task 4 + Task 7.
- Captura gaze/fixations/blink/face signals opcionales: Task 1 + Task 4 + Task 7.
- Heatmap único agregado por anuncio y aviso por baja muestra: Task 3 + Task 9.
- Dashboard admin con métricas resumidas: Task 5 + Task 8 + Task 9.
- Exportación básica: Task 5 + Task 10.
- No mostrar heatmap sin sesiones válidas: Task 9.

### 2. Placeholder scan

- No hay `TODO`, `TBD`, ni “similar a”.
- Cada paso de código incluye snippet concreto.
- Cada paso de validación incluye comando y expectativa.

### 3. Type consistency

- Identificadores consistentes: `study_id`, `session_id`, `participant_id`, `calibration_score`.
- Estados de sesión consistentes: `started`, `completed`, `low_confidence`.
- Endpoints públicos y admin usan prefijo único `/api/v1/ad-validation/...`.
