# Rediseño del Heatmap Horario de Costo por Resultado

## Objetivo

Reemplazar la tabla actual de "Costo por resultado objetivo y hora" por un heatmap que permita leer rápido qué combinaciones de día y hora son más baratas o más caras para un único objetivo de conversión.

## Problema actual

- La visualización se comporta como una tabla numérica, no como un heatmap real.
- La escala de color depende de `barColorAt`, por lo que el color cambia por posición y no por costo.
- El estado `—` mezcla escenarios distintos: sin datos, sin gasto y gasto sin resultados.
- El usuario no puede identificar rápido el mejor bloque horario ni distinguir huecos operativos de celdas con costo alto.

## Diseño aprobado

### Representación principal

- Mantener la matriz `día de semana × hora`.
- Usar una escala única y consistente de color para el CPA:
  - verde = más barato
  - ámbar = intermedio
  - rojo = más caro
- Mostrar el valor de CPA dentro de la celda cuando exista un valor válido.

### Estados de celda

- `CPA válido`: color por escala continua y valor visible.
- `Sin datos`: fondo gris suave y marca discreta.
- `Gasto sin resultados`: fondo neutro/alerta diferenciable, sin competir con la escala de CPA, con etiqueta corta.

### Contexto y lectura rápida

- Añadir leyenda visible `más barato -> más caro`.
- Añadir un resumen superior con:
  - mejor franja
  - peor franja
  - máximo observado
- Mantener detalle completo por `title`/tooltip:
  - CPA
  - gasto
  - resultados

## Ajuste de lógica

- Tratar `spend = 0` y `results > 0` como `CPA = 0`, no `null`.
- Separar en render los estados:
  - celda inexistente
  - celda con gasto pero sin resultados
  - celda con CPA calculable

## Restricciones

- El componente seguirá ocultándose si no existe un único objetivo de conversión claro.
- No se cambia el origen de datos, solo su agregación final y representación.

## Verificación

- Confirmar que el proyecto compila.
- Confirmar que el heatmap usa una escala consistente en todas las celdas.
- Confirmar que `sin datos` y `gasto sin resultados` no se ven iguales.
