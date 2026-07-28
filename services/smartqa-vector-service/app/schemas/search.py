# app/schemas/search.py
from pydantic import BaseModel

class SearchEmbedRequest(BaseModel):
    query: str

class SearchEmbedResponse(BaseModel):
    embedding: list[float]
    clean_query: str