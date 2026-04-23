# Plan de escritura: filtro por campana y separacion de inteligencia competitiva

## 1. Objetivo

Validar que el filtro por campana se aplique en la vista de pagina y mejorar la separacion visual entre el bloque de filtro y el bloque de "Buscar competidor".

## 2. Alcance

- Ruta objetivo: `frontend/src/routes/PageDashboardPage.tsx`.
- Revisar propagacion de `campaignId` en queries y funciones API llamadas desde esta vista.
- Ajustar espaciado horizontal del bloque "Inteligencia competitiva" respecto al bloque "Filtrar por campana".

## 3. Fuera de alcance

- No cambiar contratos de backend ni endpoints.
- No modificar la logica funcional del modulo de competidores.
- No tocar dashboard de cuenta (`frontend/src/routes/DashboardPage.tsx`).

## 4. Hipotesis de validacion

- Al cambiar `campaignSelect`, se recalcula `campaignId`.
- `campaignId` participa en `queryKey` y en `opts` usados por las llamadas de datos de pagina.
- Por lo tanto, React Query invalida/refresca con el nuevo filtro y los modulos se actualizan.

## 5. Pasos de implementacion

- [x] Auditar uso de `campaignId` en `PageDashboardPage`.
- [x] Confirmar inclusion de `campaignId` en `opts` para los fetch de la vista.
- [x] Confirmar inclusion de `campaignId` en `queryKey` de los queries principales.
- [x] Ajustar clases CSS para separar a la derecha el bloque "Inteligencia competitiva".
- [ ] Ejecutar build del frontend para verificar que no haya regresiones.

## 6. Criterios de aceptacion

- El bloque de "Buscar competidor" ya no se ve pegado al filtro de campana.
- Al elegir una campana, los modulos de la vista se refrescan con ese `campaignId`.
- La build del frontend compila sin errores.
