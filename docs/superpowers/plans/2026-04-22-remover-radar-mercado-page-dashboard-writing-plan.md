# Plan de escritura: retirar "Radar de mercado" en dashboard de Página

## 1. Objetivo

Eliminar la funcionalidad de **Radar de mercado** en la vista de página y mantener solo **Inteligencia competitiva**, corrigiendo detalles de alineación visual y simplificando el contexto mostrado.

## 2. Alcance

- Ruta: `frontend/src/routes/PageDashboardPage.tsx`.
- Mantener: búsqueda y panel de `CompetitorPanel`.
- Quitar: estado, botón y render de `MarketRadarPanel`.
- Quitar: franja contextual `Periodo · Moneda · Atribución` en esta vista.
- Ajustar: separación visual entre etiqueta "Inteligencia competitiva" y su botón/entrada.

## 3. Fuera de alcance

- No modificar funcionalidades de dashboard de cuenta (`DashboardPage`).
- No eliminar utilidades globales de contexto (`DashboardContextStrip`) usadas en otras vistas.
- No cambiar endpoints backend ni contratos API.

## 4. Cambios de copy/UI

- Eliminar copy de "Radar de Mercado" y CTA "🎯 Radar de Mercado".
- Conservar "Inteligencia competitiva" como único bloque de módulo competitivo.
- Mejorar espaciado vertical del bloque de inteligencia competitiva para evitar texto pegado al botón.

## 5. Pasos de implementación

- [ ] Remover imports y estado asociados a market radar en `PageDashboardPage`.
- [ ] Eliminar handlers y JSX del bloque "Radar de Mercado".
- [ ] Eliminar render condicional de `MarketRadarPanel`.
- [ ] Sustituir condición de layout lateral para depender solo de `selectedCompetitor`.
- [ ] Retirar `DashboardContextStrip` de `mainContent`.
- [ ] Ajustar clases de espaciado en el bloque de "Inteligencia competitiva".
- [ ] Ejecutar verificación TypeScript (`npx tsc -p tsconfig.app.json --noEmit`).

## 6. Criterios de aceptación

- No aparece ningún botón o panel de "Radar de mercado" en la vista de página.
- "Inteligencia competitiva" sigue funcional (buscar, seleccionar y cerrar competidor).
- El texto de contexto `Periodo: ... · Moneda: ... · Atribución: ...` no se muestra en esta pantalla.
- El espaciado entre etiqueta y control de "Inteligencia competitiva" es visible y consistente.
- Build TypeScript del frontend pasa sin errores.
