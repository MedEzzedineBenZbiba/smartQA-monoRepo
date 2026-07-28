from fastapi import APIRouter

from app.api.v1.endpoints import embed, cluster, chat

router = APIRouter()

router.include_router(embed.router, tags=["Embedding"])
router.include_router(cluster.router, tags=["Clustering"])
router.include_router(chat.router, tags=["Chat"])

