import re
import time
import numpy as np
import umap
import hdbscan
from google import genai
from fastapi import APIRouter




router = APIRouter()

from app.core.config import settings

from app.schemas.cluster import ClusterResult, IssueEmbedding


UMAP_PARAMS = dict(
    n_components=10,
    n_neighbors=15,
    min_dist=0.0,
    random_state=42,
    low_memory=True,   # important for 18k vectors
)

HDBSCAN_PARAMS = dict(
    min_cluster_size=20,
    min_samples=5,
    metric="euclidean",
    cluster_selection_method="eom",
    core_dist_n_jobs=-1,   # use all CPU cores
)

GEMINI_BATCH_SIZE = 10      # clusters per Gemini call
GEMINI_SLEEP_SEC  = 15      # avoid rate-limit spikes
GEMINI_SAMPLES    = 10      # most-central titles per cluster


class ClusteringService:

    def __init__(self):
        self._gemini: genai.Client | None = None

    def load(self):
        if settings.GEMINI_API_KEY:
            self._gemini = genai.Client(api_key=settings.GEMINI_API_KEY)
            print("Gemini client initialized.")
        else:
            print("Warning: GEMINI_API_KEY not set. Cluster labels will be generic.")
    
    @property
    def gemini(self) -> genai.Client | None:
        return self._gemini

    # ── Public entry point ─────────────────────────────────────────────────────

    def run(self, issues: list[IssueEmbedding]) -> tuple[list[ClusterResult], int, float]:
        """
        Full clustering pipeline.
        Returns: (results, total_clusters, noise_percentage)
        """
        ids    = [issue.id for issue in issues]
        titles = [issue.issue_title or "" for issue in issues]
        embeddings = np.vstack(
            [np.array(issue.embedding, dtype=np.float32) for issue in issues]
        )

        # 1. UMAP dimensionality reduction
        print(f"Running UMAP on {len(ids):,} vectors...")
        reduced = self._reduce(embeddings)

        # 2. HDBSCAN clustering
        print("Running HDBSCAN...")
        labels = self._cluster(reduced)

        n_clusters = len(set(labels)) - (1 if -1 in labels else 0)
        noise_pct  = float((labels == -1).sum() / len(labels) * 100)
        print(f"Clusters: {n_clusters}  |  Noise: {noise_pct:.1f}%")

        # 3. Gemini labeling
        cluster_labels = self._label_clusters(labels, reduced, titles)

        # 4. Build results
        results = [
            ClusterResult(
                id=issue_id,
                cluster_id=int(label),
                cluster_label=cluster_labels.get(int(label)) if label != -1 else None,
            )
            for issue_id, label in zip(ids, labels)
        ]

        return results, n_clusters, noise_pct

    # ── Private steps ──────────────────────────────────────────────────────────

    def _reduce(self, embeddings: np.ndarray) -> np.ndarray:
        reducer = umap.UMAP(**UMAP_PARAMS)
        return reducer.fit_transform(embeddings)

    def _cluster(self, reduced: np.ndarray) -> np.ndarray:
        clusterer = hdbscan.HDBSCAN(**HDBSCAN_PARAMS)
        return clusterer.fit_predict(reduced)

    def _label_clusters(
        self,
        labels: np.ndarray,
        reduced: np.ndarray,
        titles: list[str],
    ) -> dict[int, str]:
        """Returns {cluster_id: label_string}."""
        unique_clusters = [c for c in np.unique(labels) if c != -1]

        # Pick most-central issue indices per cluster
        cluster_samples: dict[int, list[str]] = {}
        for cid in unique_clusters:
            mask = labels == cid
            vecs = reduced[mask]
            centroid = vecs.mean(axis=0)
            dists = np.linalg.norm(vecs - centroid, axis=1)
            local_top = np.argsort(dists)[:GEMINI_SAMPLES]
            global_indices = np.where(mask)[0][local_top]
            cluster_samples[cid] = [titles[i] for i in global_indices if titles[i]]

        if self._gemini is None:
            return {cid: f"Cluster {cid}" for cid in unique_clusters}

        cluster_labels: dict[int, str] = {}
        all_cids = sorted(cluster_samples.keys())

        for i in range(0, len(all_cids), GEMINI_BATCH_SIZE):
            batch_cids = all_cids[i : i + GEMINI_BATCH_SIZE]
            batch = {cid: cluster_samples[cid] for cid in batch_cids}

            try:
                print(f"Labeling batch {i // GEMINI_BATCH_SIZE + 1} ({len(batch_cids)} clusters)...")
                parsed = self._call_gemini(batch)
                cluster_labels.update(parsed)
            except Exception as e:
                print(f"Gemini batch failed: {e}")
                for cid in batch_cids:
                    cluster_labels[cid] = f"Cluster {cid}"

            time.sleep(GEMINI_SLEEP_SEC)

        return cluster_labels

    def _call_gemini(self, batch: dict[int, list[str]]) -> dict[int, str]:
        """Sends a batch of clusters (with titles) to Gemini, parses labels."""
        sections = []
        for cid, sample_titles in batch.items():
            examples = "\n".join(f"- {t}" for t in sample_titles) or "- (no titles available)"
            sections.append(f"Cluster {cid}\n{examples}")

        prompt = (
            "You label clusters of GitHub bug issues.\n"
            "For each cluster, return a 5–8 word descriptive label.\n\n"
            "Format EXACTLY:\n"
            "Cluster <id>: <label>\n\n"
            "Do NOT add explanations.\n\n"
            + "\n\n".join(sections)
        )

        response = self._gemini.models.generate_content(
            model=settings.GEMINI_MODEL,
            contents=prompt,
            config={"temperature": 0.0, "max_output_tokens": 800},
        )

        result: dict[int, str] = {}
        for line in response.text.splitlines():
            match = re.match(r"Cluster\s+(\d+)\s*:\s*(.+)", line)
            if match:
                result[int(match.group(1))] = match.group(2).strip()

        return result


clustering_service = ClusteringService()
