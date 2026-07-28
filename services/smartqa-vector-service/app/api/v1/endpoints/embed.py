from fastapi import APIRouter, HTTPException

from app.schemas.embed import EmbedRequest, EmbedResponse
from app.services.data_preparation import data_preparation_service
from app.services.embedding import embedding_service

router = APIRouter()


@router.post("/embed", response_model=EmbedResponse)
def embed_issue(payload: EmbedRequest) -> EmbedResponse:
    try:
        clean_text, relevant, reason = data_preparation_service.prepare(
            issue_title=payload.issue_title,
            issue_body=payload.issue_body,
        )

        if not relevant:
            return EmbedResponse(
                issue_url= payload.issue_url,
                clean_text="",
                embedding=[],
                is_relevant=False,
                rejection_reason=reason,
            )

        embedding = embedding_service.embed(clean_text)

        return EmbedResponse(
            issue_url= payload.issue_url,
            clean_text=clean_text,
            embedding=embedding,
            is_relevant=True,
        )
    except Exception as e:
        raise HTTPException(
            detail=f"Embedding service failed: {str(e)}"
        )
    
# In your embed router — add this endpoint
from app.schemas.search import SearchEmbedRequest, SearchEmbedResponse

@router.post("/search/embed", response_model=SearchEmbedResponse)
def embed_search_query(payload: SearchEmbedRequest) -> SearchEmbedResponse:
    """
    Lightweight embed for search queries — skips the domain-relevance
    filter and length checks that apply to issues. We always embed the
    query as-is so the user can search for anything.
    """
    try:
        query = payload.query.strip()
        if not query:
            raise HTTPException(status_code=400, detail="Query cannot be empty")

        # Minimal clean: strip URLs and HTML, lowercase — no domain filter
        import re
        clean = re.sub(r"https?://\S+", " ", query)
        clean = re.sub(r"<[^>]+>", " ", clean)
        clean = re.sub(r"\s+", " ", clean).strip()

        embedding = embedding_service.embed(clean)
        return SearchEmbedResponse(embedding=embedding, clean_query=clean)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Search embed failed: {str(e)}")