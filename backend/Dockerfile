# backend/Dockerfile
FROM python:3.12-slim

WORKDIR /app

# Instalar dependencias del sistema mínimas
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Copiar solo lo necesario para instalar dependencias primero (capa cacheada)
COPY pyproject.toml .
COPY src/ src/

# Instalar el paquete (sin extras dev)
RUN pip install --no-cache-dir -e .

# Crear directorio de datos (será sobreescrito por el volumen en Docker)
RUN mkdir -p /data

EXPOSE 8000

CMD ["uvicorn", "oderbiz_analytics.api.main:app", "--host", "0.0.0.0", "--port", "8000"]
