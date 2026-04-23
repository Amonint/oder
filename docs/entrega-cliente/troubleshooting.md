# Troubleshooting

## Objetivo

Resolver incidencias frecuentes sin bloquear la operación.

## Casos comunes

### 1) No aparecen datos en dashboard

- Verificar periodo seleccionado.
- Verificar token/permisos de Meta.
- Confirmar que la cuenta/página tenga actividad en el rango.

### 2) Métricas no cuadran entre vistas

- Revisar filtros activos (campaña/página).
- Revisar ventana de atribución usada como referencia.
- Confirmar si la métrica es derivada o nativa.

### 3) Cambios de UI no visibles

- Si se usa Docker, reconstruir servicio `web`.
- Forzar recarga del navegador (`Cmd + Shift + R`).

### 4) Respuesta lenta o error temporal

- Reintentar consulta.
- Revisar estado de API backend.
- Validar conectividad a servicios externos.

## Escalamiento sugerido

Si el incidente persiste, reportar:

- Pantalla afectada.
- Periodo/filtros aplicados.
- Mensaje de error (si existe).
- Hora aproximada del evento.