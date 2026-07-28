from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.Clients.consul_client import ConsulClient
from app.api.v1.router import router as v1_router
from app.core.config import settings
from app.services.embedding import embedding_service
from app.services.clustering import clustering_service


@asynccontextmanager
async def lifespan(app: FastAPI):
    # ── Startup ────────────────────────────────────────────────────────────────
    embedding_service.load()
    clustering_service.load()
    consul = ConsulClient()
    consul.register()
    print("Service registered to Consul")
    yield
    consul.deregister()
    # ── Shutdown ───────────────────────────────────────────────────────────────
    # nothing to clean up for sentence-transformers


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    lifespan=lifespan,
)

app.include_router(v1_router, prefix="/api")







@app.get("/health")
def health():
    return {"status": "ok", "service": settings.APP_NAME}
