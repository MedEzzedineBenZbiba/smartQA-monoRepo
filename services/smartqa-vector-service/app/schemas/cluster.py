from pydantic import BaseModel
from typing import List, Optional
from enum import Enum


class JobStatus(str, Enum):
    PENDING    = "pending"     # init done, waiting for chunks
    UPLOADING  = "uploading"   # chunks arriving
    RUNNING    = "running"     # clustering in progress
    COMPLETED  = "completed"
    FAILED     = "failed"


class IssueEmbedding(BaseModel):
    id: str                             # MongoDB ObjectId as string
    embedding: list[float]              # 384 floats
    issue_title: Optional[str] = None  # used by Gemini for labeling


# ── Init ───────────────────────────────────────────────────────────────────────

class ClusterInitRequest(BaseModel):
    total_issues: int
    total_chunks: int


class ClusterInitResponse(BaseModel):
    job_id: str
    status: JobStatus
    total_issues: int
    total_chunks: int


# ── Chunk ──────────────────────────────────────────────────────────────────────

class ClusterChunkRequest(BaseModel):
    chunk_index: int          # 0-based
    issues: list[IssueEmbedding]


class ClusterChunkResponse(BaseModel):
    job_id: str
    chunk_index: int
    chunks_received: int
    total_chunks: int
    status: JobStatus         # uploading | running (if last chunk)


# ── Status / Results ───────────────────────────────────────────────────────────

class ClusterResult(BaseModel):
    id: str                        # MongoDB ObjectId
    cluster_id: int                # -1 = noise
    cluster_label: Optional[str]  # None for noise


class ClusterStatusResponse(BaseModel):
    job_id: str
    status: JobStatus
    total_issues: Optional[int] = None
    total_chunks: Optional[int] = None
    chunks_received: Optional[int] = None
    total_clusters: Optional[int] = None
    noise_percentage: Optional[float] = None
    clusters: Optional[list[ClusterResult]] = None
    error: Optional[str] = None

class SummarizeClusterRequest(BaseModel):
    cluster_id: int
    cluster_label: str
    issues: List[str]   # ["1. [Title]: body snippet", "2. [Title]: body snippet", ...]
 
class SummarizeClusterResponse(BaseModel):
    cluster_id: int
    summary: str