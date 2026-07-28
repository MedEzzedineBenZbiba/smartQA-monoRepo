from fastapi import APIRouter, BackgroundTasks, HTTPException
from google import genai

from app.schemas.cluster import (
    ClusterInitRequest,
    ClusterInitResponse,
    ClusterChunkRequest,
    ClusterChunkResponse,
    ClusterStatusResponse,
    JobStatus,
    SummarizeClusterRequest,
    SummarizeClusterResponse,
)
from app.services.clustering import clustering_service
from app.services.job_store import job_store
from app.core.config import settings
from app.Clients.issue_client import issues_client



router = APIRouter()

# ── Background task ────────────────────────────────────────────────────────────

def _run_clustering_job(job_id: str):
    """Pops accumulated issues from buffer and runs the full pipeline."""
    job_store.set_running(job_id)
    try:
        issues = job_store.pop_issues(job_id)
        results, total_clusters, noise_pct = clustering_service.run(issues)
 
        # Hand results back to NestJS — it writes to MongoDB
        issues_client.post_cluster_results(results)
 
        job_store.set_completed(
            job_id=job_id,
            clusters=results,
            total_clusters=total_clusters,
            noise_percentage=round(noise_pct, 2),
        )
        print(f"Job {job_id} completed: {total_clusters} clusters, {noise_pct:.1f}% noise.")
    except Exception as e:
        job_store.set_failed(job_id, error=str(e))
        print(f"Job {job_id} failed: {e}")
 

# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.post("/cluster/init", response_model=ClusterInitResponse, status_code=201)
def init_cluster_job(payload: ClusterInitRequest) -> ClusterInitResponse:
    """
    Step 1 — Declare a new clustering job.
    NestJS must provide total_issues and total_chunks upfront.
    Returns a job_id to use in subsequent chunk uploads.
    """
    if payload.total_issues < 2:
        raise HTTPException(status_code=422, detail="At least 2 issues required.")
    if payload.total_chunks < 1:
        raise HTTPException(status_code=422, detail="At least 1 chunk required.")

    job_id = job_store.create(
        total_issues=payload.total_issues,
        total_chunks=payload.total_chunks,
    )

    return ClusterInitResponse(
        job_id=job_id,
        status=JobStatus.PENDING,
        total_issues=payload.total_issues,
        total_chunks=payload.total_chunks,
    )


@router.post("/cluster/chunk/{job_id}", response_model=ClusterChunkResponse)
def upload_chunk(
    job_id: str,
    payload: ClusterChunkRequest,
    background_tasks: BackgroundTasks,
) -> ClusterChunkResponse:
    """
    Step 2 — Upload one chunk of issues.
    Send chunks sequentially with chunk_index (0-based).
    When the last chunk arrives, clustering starts automatically in the background.
    Duplicate chunk_index is safely ignored (idempotent).
    """
    job = job_store.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail=f"Job '{job_id}' not found.")

    if job.status not in (JobStatus.PENDING, JobStatus.UPLOADING):
        raise HTTPException(
            status_code=409,
            detail=f"Job is already in '{job.status}' state. Cannot accept more chunks.",
        )

    if payload.chunk_index >= job.total_chunks:
        raise HTTPException(
            status_code=422,
            detail=f"chunk_index {payload.chunk_index} out of range (total_chunks={job.total_chunks}).",
        )

    try:
        chunks_received, all_arrived = job_store.add_chunk(
            job_id=job_id,
            chunk_index=payload.chunk_index,
            issues=payload.issues,
        )
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e))

    # Auto-start clustering when last chunk arrives
    if all_arrived:
        background_tasks.add_task(_run_clustering_job, job_id)
        status = JobStatus.RUNNING
    else:
        status = JobStatus.UPLOADING

    return ClusterChunkResponse(
        job_id=job_id,
        chunk_index=payload.chunk_index,
        chunks_received=chunks_received,
        total_chunks=job.total_chunks,
        status=status,
    )


@router.get("/cluster/status/{job_id}", response_model=ClusterStatusResponse)
def get_cluster_status(job_id: str) -> ClusterStatusResponse:
    """
    Step 3 — Poll job status.

    Status flow: pending → uploading → running → completed | failed
    Results are in the `clusters` field when status = completed.
    """
    job = job_store.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail=f"Job '{job_id}' not found.")
    return job

from google import genai






@router.post("/summarize-cluster", response_model=SummarizeClusterResponse)
async def summarize_cluster(payload: SummarizeClusterRequest):
    """
    Given a list of issue snippets from a single HDBSCAN cluster,
    ask Gemini to produce a concise root-cause summary (2-3 sentences).
    """
    if clustering_service.gemini is None:
        raise HTTPException(
            status_code=503,
            detail="Gemini client not configured — GEMINI_API_KEY is not set.",
        )

    issues_text = "\n".join(payload.issues)

    prompt = f"""You are a senior QA analyst reviewing a group of related software bug reports.
These issues have been automatically clustered together under the label: "{payload.cluster_label}".

Bug reports:
{issues_text}

In 2-3 sentences, identify:
1. The likely root cause or common failure pattern
2. The affected component or system area
3. A recommended investigation priority (High / Medium / Low) with one-line justification

Be direct and technical. Do not repeat the cluster label. Do not use bullet points."""

    try:
        response = clustering_service.gemini.models.generate_content(
            model=settings.GEMINI_MODEL,
            contents=prompt,
            config={"temperature": 0.2, "max_output_tokens": 300},
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Gemini summarization failed: {e}")

    return SummarizeClusterResponse(
        cluster_id=payload.cluster_id,
        summary=response.text.strip(),
    )