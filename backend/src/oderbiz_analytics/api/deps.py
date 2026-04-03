from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from oderbiz_analytics.config import Settings, get_settings

http_bearer = HTTPBearer(auto_error=False)


def get_meta_access_token(
    credentials: HTTPAuthorizationCredentials | None = Depends(http_bearer),
    settings: Settings = Depends(get_settings),
) -> str:
    if credentials and credentials.credentials:
        return credentials.credentials
    return settings.meta_access_token
