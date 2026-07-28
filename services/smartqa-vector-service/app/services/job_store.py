import uuid
from typing import Optional
from app.schemas.cluster import JobStatus, ClusterStatusResponse, IssueEmbedding


class JobStore:
    """
    In-memory store for async clustering jobs.
    Holds accumulated issue chunks until clustering starts.
    For production, replace with Redis + shared storage.
    """

    def __init__(self):
        self._jobs: dict[str, ClusterStatusResponse] = {}
        # Accumulates chunks: job_id -> list of IssueEmbedding
        self._buffers: dict[str, list[IssueEmbedding]] = {}
        # Tracks which chunk indices arrived (for dedup/ordering)
        self._received_chunks: dict[str, set[int]] = {}

    # ── Lifecycle ──────────────────────────────────────────────────────────────

    def create(self, total_issues: int, total_chunks: int) -> str:
        job_id = str(uuid.uuid4())
        self._jobs[job_id] = ClusterStatusResponse(
            job_id=job_id,
            status=JobStatus.PENDING,
            total_issues=total_issues,
            total_chunks=total_chunks,
            chunks_received=0,
        )
        self._buffers[job_id] = []
        self._received_chunks[job_id] = set()
        return job_id

    def add_chunk(
        self, job_id: str, chunk_index: int, issues: list[IssueEmbedding]
    ) -> tuple[int, bool]:
        """
        Append a chunk to the buffer.
        Returns (chunks_received, all_chunks_arrived).
        Ignores duplicate chunk_index (idempotent).
        """
        job = self._jobs.get(job_id)
        if job is None:
            raise KeyError(f"Job '{job_id}' not found.")

        # Ignore duplicate chunks
        if chunk_index in self._received_chunks[job_id]:
            return len(self._received_chunks[job_id]), False

        self._buffers[job_id].extend(issues)
        self._received_chunks[job_id].add(chunk_index)

        job.chunks_received = len(self._received_chunks[job_id])
        job.status = JobStatus.UPLOADING

        all_arrived = job.chunks_received == job.total_chunks
        return job.chunks_received, all_arrived

    def pop_issues(self, job_id: str) -> list[IssueEmbedding]:
        """Return accumulated issues and free the buffer."""
        issues = self._buffers.pop(job_id, [])
        self._received_chunks.pop(job_id, None)
        return issues

    # ── Status transitions ─────────────────────────────────────────────────────

    def set_running(self, job_id: str):
        if job_id in self._jobs:
            self._jobs[job_id].status = JobStatus.RUNNING

    def set_completed(
        self,
        job_id: str,
        clusters: list,
        total_clusters: int,
        noise_percentage: float,
    ):
        if job_id in self._jobs:
            job = self._jobs[job_id]
            job.status = JobStatus.COMPLETED
            job.clusters = clusters
            job.total_clusters = total_clusters
            job.noise_percentage = noise_percentage

    def set_failed(self, job_id: str, error: str):
        if job_id in self._jobs:
            self._jobs[job_id].status = JobStatus.FAILED
            self._jobs[job_id].error = error

    def get(self, job_id: str) -> Optional[ClusterStatusResponse]:
        return self._jobs.get(job_id)

    def delete(self, job_id: str):
        self._jobs.pop(job_id, None)
        self._buffers.pop(job_id, None)
        self._received_chunks.pop(job_id, None)


job_store = JobStore()
