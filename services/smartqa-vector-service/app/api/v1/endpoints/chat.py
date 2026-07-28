import json
import re
from fastapi import APIRouter, HTTPException
from google import genai

from app.core.config import settings
from app.schemas.chat import ChatRagRequest, ChatRagResponse, ChatCitation

router = APIRouter()

_client: genai.Client | None = None


def _get_client() -> genai.Client:
    global _client
    if _client is None:
        if not settings.GEMINI_API_KEY:
            raise HTTPException(status_code=503, detail="Gemini not configured")
        _client = genai.Client(api_key=settings.GEMINI_API_KEY)
    return _client


def _build_context_block(issues) -> str:
    blocks = []
    for i, issue in enumerate(issues, start=1):
        body = (issue.body or "")[:400].replace("\n", " ").strip()
        blocks.append(
            f"[{i}] id={issue.id} | state={issue.state} | "
            f"cluster={issue.cluster_label or 'none'}\n"
            f"Title: {issue.title}\n"
            f"Body: {body}"
        )
    return "\n\n".join(blocks) if blocks else "(no relevant issues found)"


def _build_history_block(history) -> str:
    if not history:
        return ""
    lines = [f"{m.role}: {m.content}" for m in history[-6:]]  # last 6 turns
    return "Conversation so far:\n" + "\n".join(lines) + "\n\n"


@router.post("/chat-rag", response_model=ChatRagResponse)
async def chat_rag(payload: ChatRagRequest) -> ChatRagResponse:
    """
    RAG-based QA chat assistant.
    Retrieval already happened in NestJS (semanticSearch). Here we just
    ground Gemini's answer in the retrieved issues and ask it to cite
    which ones it used by their [n] index.
    """
    client = _get_client()
    context_block = _build_context_block(payload.issues)
    history_block = _build_history_block(payload.history)

    prompt = f"""You are a QA assistant answering questions about a team's historical
GitHub issue/defect data. Use ONLY the issues listed below as your source of truth.
If the issues don't contain enough information to answer, say so honestly —
do not invent issues or details.

{history_block}Relevant issues (numbered):
{context_block}

Current question: {payload.query}

Respond with ONLY a JSON object, no markdown fences, in this exact shape:
{{"answer": "<your answer in 2-5 sentences, plain text, may reference issues by [n]>", "cited_indices": [<int indices of issues from the list above that you actually relied on>]}}"""

    response = client.models.generate_content(
        model=settings.GEMINI_MODEL,
        contents=prompt,
        config={"temperature": 0.2, "max_output_tokens": 600},
    )

    raw = response.text.strip()
    raw = re.sub(r"^```json\s*|\s*```$", "", raw.strip())

    try:
        parsed = json.loads(raw)
        answer = parsed.get("answer", "").strip()
        cited_indices = parsed.get("cited_indices", [])
    except Exception:
        # Fallback: treat the whole response as the answer, no citations
        answer = raw
        cited_indices = []

    citations: list[ChatCitation] = []
    for idx in cited_indices:
        pos = idx - 1
        if 0 <= pos < len(payload.issues):
            issue = payload.issues[pos]
            citations.append(
                ChatCitation(
                    id=issue.id,
                    issueId=issue.issueId,
                    title=issue.title,
                    url=issue.url,
                )
            )

    if not answer:
        answer = "I couldn't generate an answer from the available issue data."

    return ChatRagResponse(answer=answer, citations=citations)