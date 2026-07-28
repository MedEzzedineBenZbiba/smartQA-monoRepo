from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    APP_NAME: str = "SmartQA Vector Service"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = False

    # Embedding model
    EMBEDDING_MODEL_NAME: str = "all-MiniLM-L6-v2"
    EMBEDDING_DEVICE: str = "cpu"   # "cuda" if GPU available

    # Gemini
    GEMINI_API_KEY: str
    GEMINI_MODEL: str = "gemini-3.1-flash-lite"
    
    # Consul (NEW)
    CONSUL_BASE_URL: str = "http://localhost:8500"
    SERVICE_NAME: str = "vector-microservice"
    SERVICE_HOST: str = "127.0.0.1"
    SERVICE_PORT: str


    class Config:
        env_file = ".env"
        extra = "forbid"


settings = Settings()
