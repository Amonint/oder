from pydantic import BaseModel


class AdAccount(BaseModel):
    id: str  # e.g. act_123
    name: str
    account_id: str
    currency: str | None = None
