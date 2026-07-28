import numpy as np
from sentence_transformers import SentenceTransformer

from app.core.config import settings


class EmbeddingService:
    """
    Loads all-MiniLM-L6-v2 once at startup and exposes an embed method.
    """

    def __init__(self):
        self._model: SentenceTransformer | None = None

    def load(self):
        """Call once at app startup (lifespan)."""
        print(f"Loading embedding model '{settings.EMBEDDING_MODEL_NAME}' on {settings.EMBEDDING_DEVICE}...")
        self._model = SentenceTransformer(
            settings.EMBEDDING_MODEL_NAME,
            device=settings.EMBEDDING_DEVICE,
        )
        print("Embedding model loaded.")

    def embed(self, text: str) -> list[float]:
        """
        Embed a single cleaned text string.
        Returns a list of 384 floats (unit vector, cosine-ready).
        """
        if self._model is None:
            raise RuntimeError("EmbeddingService not initialized. Call load() first.")

        vector: np.ndarray = self._model.encode(
            text,
            normalize_embeddings=True,
            convert_to_numpy=True,
        )
        return vector.tolist()


embedding_service = EmbeddingService()
