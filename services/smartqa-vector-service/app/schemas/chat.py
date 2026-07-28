from typing import Literal, Optional
from pydantic import BaseModel


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class ChatIssueContext(BaseModel):
    id: str
    issueId: Optional[str] = None   # was required, now optional
    title: str
    body: Optional[str] = ""
    url: str
    state: str
    cluster_label: Optional[str] = None


class ChatRagRequest(BaseModel):
    query: str
    history: list[ChatMessage] = []
    issues: list[ChatIssueContext] = []


class ChatCitation(BaseModel):
    id: str
    issueId: Optional[str] = None
    title: str
    url: str


class ChatRagResponse(BaseModel):
    answer: str
    citations: list[ChatCitation]