from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from oderbiz_analytics.adapters.meta.client import MetaGraphClient
from oderbiz_analytics.config import Settings, get_settings

http_bearer = HTTPBearer(auto_error=False)


def get_meta_access_token(
    credentials: HTTPAuthorizationCredentials | None = Depends(http_bearer),
    settings: Settings = Depends(get_settings),
) -> str:
    if credentials and credentials.credentials:
        token = credentials.credentials.strip()
    else:
        token = (settings.meta_access_token or "").strip()
    if not token:
        raise HTTPException(
            status_code=401,
            detail=(
                "Falta el token de Meta. En la app web usa Conectar y envía "
                "Authorization: Bearer <token>, o define META_ACCESS_TOKEN en el servidor."
            ),
        )
    return token


def get_meta_graph_client(
    settings: Settings = Depends(get_settings),
    access_token: str = Depends(get_meta_access_token),
) -> MetaGraphClient:
    base = f"https://graph.facebook.com/{settings.meta_graph_version}"
    return MetaGraphClient(base_url=base, access_token=access_token)
