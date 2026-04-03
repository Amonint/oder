# Oderbiz Analytics Backend

## Requisitos previos

- **Python 3.12+**: Asegúrate de tener Python 3.12 o superior instalado

## Configuración de entorno

1. Copia el archivo de ejemplo:
   ```bash
   cp .env.example .env
   ```

2. Rellena los valores requeridos en `.env`:
   - `META_ACCESS_TOKEN`: Tu token de acceso de larga duración de Meta

3. (Opcional) Configura las variables opcionales si necesitas valores diferentes a los defaults

## Instalación

```bash
cd backend
python3.12 -m pip install -e ".[dev]"
```

## Cómo correr tests

```bash
python3.12 -m pytest
```

## Estructura del proyecto

```
backend/
├── src/oderbiz_analytics/     # Código principal de la aplicación
├── tests/                      # Tests unitarios e integración
├── pyproject.toml             # Configuración del proyecto
├── README.md                  # Este archivo
└── .env.example               # Ejemplo de variables de entorno
```

## Base de datos — DuckDB

El backend usa DuckDB como base analítica local. El archivo se crea automáticamente
al iniciar la app o el job de ingesta en la ruta configurada por `DUCKDB_PATH`
(default: `/data/analytics.duckdb`).

No se requiere migración manual. Las tablas se crean con `init_db()` al arrancar.
