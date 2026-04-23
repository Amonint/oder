# Informe Ejecutivo de Entrega

## Proyecto: Plataforma de auditoría de anuncios para Oderbiz

## 1) Resumen para Dirección

Este documento resume, en lenguaje no técnico, qué problema resolvimos, qué decisiones estructurales se tomaron, qué quedó operativo en la plataforma y cómo usarla para decidir semanalmente con más velocidad y menos ambiguedad.

**Estado de entrega:** Implementación funcional y operativa.  
**Acceso del proyecto:** `[URL de la plataforma de Oderbiz]`  
**Cliente:** Oderbiz

---

## 2) Contexto del negocio y problema inicial

### Situación detectada

Oderbiz tenía información publicitaria disponible, pero repartida en múltiples vistas y con demasiada carga técnica para una lectura ejecutiva rápida.  
Eso dificultaba detectar desvíos de rendimiento (costo, saturación, calidad de tráfico, cierre comercial) dentro de la misma semana.

### Necesidad del cliente

Conectar datos de Meta Ads con una lectura orientada a negocio y habilitar auditoría competitiva para:

- Saber qué está funcionando y qué no.
- Entender dónde se pierde presupuesto.
- Comparar desempeño propio vs señales observables del mercado/competencia.
- Priorizar acciones concretas con responsables y fecha.

---

## 3) Objetivo acordado

Construir una plataforma de lectura ejecutiva que permitiera a Oderbiz:

1. Ver rendimiento de cuenta y páginas en un mismo sistema.
2. Pasar de datos sueltos a diagnósticos accionables.
3. Tomar decisiones semanales con evidencia comparable por periodos.
4. Estandarizar una rutina repetible de auditoría competitiva y comercial.

---

## 4) Qué se hizo (entregable)

Se entregó una plataforma funcional, estructurada desde el frontend para lectura por capas (resumen -> diagnóstico -> acción), con estos módulos activos:

- **Flujo principal de uso:** token -> cuentas -> dashboard por cuenta -> dashboard por página.
- **Pestañas ejecutivas en cuenta:** Resumen, Creatividades, Audiencia, Comercial, Avanzado (y Decisiones cuando está habilitado el modo unificado).
- **KPIs con contexto:** etiquetas claras, tooltips de fórmula/fuente y deltas contra periodo anterior.
- **Series y estabilidad:** gasto diario, análisis temporal y control de estabilidad de CAC.
- **Diagnóstico de creatividades:** ranking por anuncio, fatiga, métricas derivadas (CPA/ROAS) y filtros de calidad.
- **Audiencia y geografía:** placements, demografía, mapas por impresiones/gasto/CPA/resultados.
- **Comercial (sin CRM):** carga manual de etapas de ventas para calcular métricas reales de cierre.
- **Inteligencia competitiva:** búsqueda y resolución de competidores + panel comparativo.

Además, se dejó una lógica de operación para que el equipo pueda usar la herramienta sin depender de perfiles técnicos en cada análisis.

---

## 5) Cronología resumida de decisiones (antecedentes -> decisión -> resultado)

### Fase 1: Identificación del problema (inicios de abril 2026)

**Hallazgo:** La lectura de campañas era fragmentada y tardaba en traducirse en decisiones.  
**Decisión:** Centralizar la operación en un dashboard único con navegación por cuenta y por página.

### Fase 2: Diseño del enfoque (primera mitad de abril 2026)

**Hallazgo:** Se necesitaban niveles distintos de lectura (directiva y operativa).  
**Decisión:** Diseñar una arquitectura por capas: resumen ejecutivo, diagnóstico por dimensión y módulo de acción comercial.

### Fase 3: Implementación y ajustes (segunda mitad de abril 2026)

**Hallazgo:** Parte de la señal técnica no era obvia para usuarios no técnicos.  
**Decisión:** Estandarizar nombres, leyendas, alertas, badges de calidad de dato y explicaciones de fórmula/fuente.

### Fase 4: Cierre de entrega (actual)

**Resultado:** Plataforma operativa para seguimiento semanal, con módulos de lectura, diagnóstico y soporte de ejecución.

---

## 6) Por qué estructuramos la información así

La estructura se definió para responder a cómo decide una empresa, no a cómo luce una base de datos o una API.

### Lógica de diseño de negocio

1. **Primero estado general:** ¿vamos mejor o peor que el periodo anterior?
2. **Luego diagnóstico causal:** ¿el problema es de mercado, creatividad, audiencia, atribución o proceso comercial?
3. **Finalmente acción priorizada:** ¿qué ajustar esta semana y qué hipótesis probar después?

### Esquemas de lectura y acciones (aclaración solicitada)

La plataforma usa tres esquemas prácticos:

1. **Esquema de señal (qué pasa):** KPIs, tendencias, comparaciones y alertas por color/severidad.
2. **Esquema de explicación (por qué pasa):** distribución por anuncio/campaña, placements, geografía, audiencia, fatiga y atribución.
3. **Esquema de acción (qué hacer):** recomendaciones sugeridas por diagnóstico, más indicadores comerciales para decidir recorte, escalado o prueba.

Respecto a “acciones”, hoy existen dos niveles:

- **Acciones de datos Meta:** eventos (`action_type`) que se agrupan y se traducen a lenguaje de negocio para entender qué resultados se están generando.
- **Acciones de gestión:** recomendaciones operativas (por ejemplo, rotar creatividades, ajustar segmentación, revisar embudo comercial o cambiar ventana de atribución).

**Estado actual de madurez:** el esquema de lectura está operativo y útil; la capa de “motor de acciones” todavía está en etapa de reglas guiadas (no totalmente cerrada como playbook automático integral).

### Beneficio para Oderbiz

- Menor tiempo de análisis semanal.
- Menos interpretación subjetiva entre áreas.
- Mayor foco en decisiones con impacto medible.

---

## 7) Preguntas que ahora puede responder Oderbiz con la plataforma

La herramienta permite responder, con evidencia consolidada, preguntas como:

1. ¿Estamos invirtiendo mejor esta semana que la semana anterior?
2. ¿Qué campañas, conjuntos o anuncios están aportando resultados reales?
3. ¿Dónde se está desperdiciando presupuesto?
4. ¿Qué señales apuntan a fatiga creativa o saturación de frecuencia?
5. ¿Qué tipo de audiencia y qué placements responden mejor?
6. ¿Qué zonas geográficas dan mejor retorno por gasto?
7. ¿Cómo cambia el rendimiento según ventana de atribución y periodo?
8. ¿Qué parte del embudo comercial está frenando el cierre?
9. ¿Qué diferencia hay entre desempeño de cuenta y desempeño por página?
10. ¿Cómo se posiciona la marca frente a actividad creativa de competidores?

Preguntas parcialmente maduras (a terminar de cerrar en próximas iteraciones):

- ¿Qué acción exacta y priorizada debe ejecutar cada rol (media, contenido, ventas) sin revisión manual adicional?
- ¿Qué esquema final de acciones automáticas conviene institucionalizar como protocolo único?

---

## 8) Glosario simple (términos de negocio explicados)

> Nota: aquí se traducen términos comunes para lectura no técnica.

- **CPA (Costo por Adquisición):** cuánto cuesta conseguir una acción valiosa (por ejemplo, un lead).  
*(Sirve para saber si adquirir resultados está siendo caro o rentable).*
- **CTR (Tasa de clics):** porcentaje de personas que hicieron clic al ver un anuncio.  
*(Sirve para entender qué tan atractivo/relevante es el anuncio).*
- **CPC (Costo por clic):** cuánto cuesta cada clic recibido.  
*(Sirve para controlar eficiencia de tráfico).*
- **CPM (Costo por mil impresiones):** costo de mostrar el anuncio mil veces.  
*(Sirve para evaluar presión de costo de visibilidad).*
- **Frecuencia:** promedio de veces que una persona vio el anuncio.  
*(Sirve para detectar saturación o fatiga).*
- **Embudo:** recorrido desde ver el anuncio hasta generar resultado.  
*(Sirve para ubicar dónde se pierden oportunidades).*
- **Fatiga creativa:** caída de rendimiento porque el anuncio ya se volvió repetitivo para la audiencia.  
*(Sirve para saber cuándo renovar piezas/mensajes).*
- **Atribución:** regla temporal que define a qué anuncio se le acredita una conversión.  
*(Sirve para comparar periodos sin mezclar criterios distintos).*
- **Action Type (Meta):** tipo técnico de acción registrada (clic, lead, reply, compra, etc.).  
*(Sirve para traducir eventos técnicos a categorías de negocio y priorizar acciones).*

---

## 9) Cómo se usa en la práctica (modo ejecutivo semanal)

### Rutina recomendada (60 minutos)

1. **Resumen (15 min):** revisar KPIs críticos y cambios vs periodo anterior.
2. **Diagnóstico (20 min):** validar causa principal en Creatividades, Audiencia y Avanzado.
3. **Comercial (10 min):** contrastar señal de pauta con métricas reales de embudo de ventas.
4. **Plan de acción (10 min):** seleccionar 3 decisiones con responsable y fecha.
5. **Control (5 min):** fijar qué indicador confirmará si la acción funcionó.

### Resultado esperado de esta rutina

Un ciclo de mejora continua: **leer -> diagnosticar -> decidir -> ejecutar -> medir**.

---

## 10) Skills de Claude Code configuradas como parte de la entrega

Además de la plataforma, se dejaron skills de apoyo para acelerar trabajo de marketing y análisis.

## Qué son en simple

Son “asistentes especializados” que ayudan al equipo a producir análisis y propuestas más rápido, con una metodología consistente.

## Skills clave (explicadas en lenguaje no técnico)

- **Marketing Strategy / Ideas de crecimiento**  
Ayuda a proponer acciones concretas para crecer según el contexto del negocio.
- **SEO Audit**  
Revisa oportunidades de posicionamiento y prioriza mejoras para atraer tráfico de calidad.
- **Copywriting / Copy Editing**  
Ayuda a redactar y mejorar mensajes comerciales para anuncios, páginas y comunicaciones.
- **Ad Creative**  
Genera variaciones de anuncios para probar enfoques de mensaje y creatividad.
- **Analytics Tracking**  
Ordena qué medir para que el equipo sepa qué decisiones sí generan impacto.
- **A/B Test Setup**  
Estructura pruebas de hipótesis para comparar versiones y aprender con evidencia.
- **Competitor Profiling**  
Organiza análisis competitivo para detectar diferencias y oportunidades de posicionamiento.

## Qué puede generar Oderbiz con estas skills

- Planes de acción semanales de marketing.
- Propuestas de anuncios y mensajes.
- Auditorías y recomendaciones de mejora.
- Hipótesis de pruebas para optimización continua.
- Borradores de decisiones y experimentos alineados al tablero de métricas.

---

## 11) Decisiones de negocio ya habilitadas con la entrega

Con esta implementación Oderbiz ya puede:

- Priorizar inversión en campañas/anuncios con mejor señal costo-resultado.
- Corregir antes problemas de fatiga, frecuencia y caída de CTR.
- Detectar si un problema viene de pauta o del proceso comercial.
- Comparar rendimiento de cuenta vs rendimiento por página para decidir foco.
- Ejecutar auditoría competitiva con una base más estructurada.
- Mantener disciplina semanal de mejora continua.

---

## 12) Cierre y recomendación

La solución se construyó para convertir datos publicitarios en decisiones claras de negocio, con una interfaz entendible para usuarios no técnicos y suficiente profundidad para el equipo operativo.

La recomendación ejecutiva es sostener una cadencia semanal de revisión y decisión, apoyándose en:

1. La plataforma como fuente principal de lectura.
2. Las skills configuradas como aceleradores de análisis y ejecución.

Para cerrar completamente la capa de “esquemas y acciones”, el siguiente paso recomendado es formalizar un playbook único de acciones por escenario (por ejemplo: CTR cae + frecuencia alta + CPM estable), con responsables por área y criterio de éxito.

De esta forma, Oderbiz no solo “ve datos”, sino que opera un sistema continuo de decisión para mejorar resultados comerciales.