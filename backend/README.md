# Oderbiz Analytics Backend

## Requisitos previos

- **Python 3.12+**: Asegúrate de tener Python 3.12 o superior instalado
- **Google Cloud Account**: Se requiere una cuenta de GCP con un service account que tenga los permisos `bigquery.dataEditor`

## Configuración de entorno

1. Copia el archivo de ejemplo:
   ```bash
   cp .env.example .env
   ```

2. Rellena los valores requeridos en `.env`:
   - `GCP_PROJECT_ID`: Tu ID del proyecto de GCP
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
