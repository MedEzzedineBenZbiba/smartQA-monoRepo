from pydantic import BaseModel
from typing import Optional


class EmbedRequest(BaseModel):
    issue_url : str
    issue_title: str
    issue_body: str


class EmbedResponse(BaseModel):
    issue_url : str
    clean_text: str
    embedding: list[float]
    is_relevant: bool
    rejection_reason: Optional[str] = None
