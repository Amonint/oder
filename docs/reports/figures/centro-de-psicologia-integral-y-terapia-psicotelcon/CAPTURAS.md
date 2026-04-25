# Evidencia visual requerida

Usa esta plantilla para registrar capturas trazables que respalden el reporte.

## Convencion de nombres

- `fig-<seccion>-<competidor-o-fuente>-<YYYYMMDD>-vN.png`

Ejemplos:

- `fig-panorama-psico-org-20260425-v1.png`
- `fig-competencia-aprendiendo-juntos-20260425-v1.png`

## Registro minimo por captura

1. `ruta_local`: `docs/reports/figures/centro-de-psicologia-integral-y-terapia-psicotelcon/<archivo>.png`
2. `url`
3. `fecha_hora_captura` (ISO 8601, zona local)
4. `contexto` (que evidencia soporta)
5. `tipo_evidencia` (`observado` o `inferencia-soporte`)

## Plantilla (copiar y completar)

```yaml
- ruta_local: docs/reports/figures/centro-de-psicologia-integral-y-terapia-psicotelcon/fig-panorama-psico-org-20260425-v1.png
  url: https://www.psico.org/centro-52334
  fecha_hora_captura: 2026-04-25T11:40:00-05:00
  contexto: Evidencia de posicionamiento y propuesta de valor del centro en directorio.
  tipo_evidencia: observado

- ruta_local: docs/reports/figures/centro-de-psicologia-integral-y-terapia-psicotelcon/fig-panorama-terappio-20260425-v1.png
  url: https://www.terappio.com/ec/Psychologists/services/child-therapy/ecuador/loja
  fecha_hora_captura: 2026-04-25T11:42:00-05:00
  contexto: Evidencia de comparacion de precios y oferta en marketplace.
  tipo_evidencia: observado
```

## Registro ejecucion v4 (automatico)

```yaml
- ruta_local: docs/reports/figures/centro-de-psicologia-integral-y-terapia-psicotelcon/fig-panorama-psicologiaymente-marizol-20260425-v1.png
  url: https://psicologiaymente.com/psicologos/2069561/dra-marizol-jimenez-luzon
  fecha_hora_captura: 2026-04-25T12:03:00-05:00
  contexto: Evidencia de posicionamiento de perfil profesional y propuesta de especialidad.
  tipo_evidencia: observado

- ruta_local: docs/reports/figures/centro-de-psicologia-integral-y-terapia-psicotelcon/fig-panorama-psicoorg-directorio-loja-20260425-v1.png
  url: https://www.psico.org/ec/directorio/loja
  fecha_hora_captura: 2026-04-25T12:04:00-05:00
  contexto: Evidencia de competencia agregada en directorio local por ciudad y especialidad.
  tipo_evidencia: observado

- ruta_local: docs/reports/figures/centro-de-psicologia-integral-y-terapia-psicotelcon/fig-panorama-terappio-loja-20260425-v1.png
  url: https://www.terappio.com/ec/family-therapist/ecuador/loja
  fecha_hora_captura: 2026-04-25T12:05:00-05:00
  contexto: Evidencia de oferta competitiva y referencias de precio en marketplace.
  tipo_evidencia: observado

- ruta_local: docs/reports/figures/centro-de-psicologia-integral-y-terapia-psicotelcon/fig-panorama-la-cabana-20260425-v1.png
  url: https://tecnologicosudamericano.edu.ec/bienestar-estudiantil/centro-psicoterapeutico-la-cabana/
  fecha_hora_captura: 2026-04-25T12:06:00-05:00
  contexto: Evidencia de portafolio de servicios y estructura de tarifas publicadas.
  tipo_evidencia: observado

- ruta_local: docs/reports/figures/centro-de-psicologia-integral-y-terapia-psicotelcon/fig-activo-propio-facebook-psicotelcon-20260425-v1.png
  url: https://facebook.com/PsicotelconTerapias
  fecha_hora_captura: 2026-04-25T12:07:00-05:00
  contexto: Evidencia de activo propio de marca y presencia publica de pagina.
  tipo_evidencia: observado
```

