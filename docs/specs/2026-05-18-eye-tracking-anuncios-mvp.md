# Eye Tracking anuncios MVP (2026-05-18)

## Contrato API MVP

- `POST /api/v1/ad-validation/studies`
- `GET /api/v1/ad-validation/studies`
- `GET /api/v1/ad-validation/studies/{id}/dashboard`
- `GET /api/v1/ad-validation/studies/{id}/export.csv`
- `GET /api/v1/ad-validation/public/{token}/study`
- `POST /api/v1/ad-validation/public/{token}/sessions/start`
- `POST /api/v1/ad-validation/public/sessions/{id}/events`
- `POST /api/v1/ad-validation/public/sessions/{id}/complete`

## Definición de sesión válida

- `calibration_score >= 0.75`
- `gaze_points >= 120`
- `duration_ms >= 5000`

## Reglas de confianza en dashboard

- Sin sesiones válidas: no mostrar heatmap, nota `Sin sesiones válidas`.
- Muestra pequeña: menos de 5 sesiones válidas, nota `Muestra pequeña`.
- Muestra suficiente: 5 o más sesiones válidas.

## Limitaciones explícitas

- Precisión depende de webcam, iluminación y movimiento del participante.
- No se envía video, solo eventos agregados (gaze/fixation/blink/face signals opcionales).
- Señales emocionales son opcionales y no diagnósticas.
