import httpx
from app.core.config import settings
from app.schemas.cluster import ClusterResult
from app.Clients.consul_client import ConsulClient


def chunk_list(data, size=500):
    for i in range(0, len(data), size):
        yield data[i:i + size]

class IssuesClient:
    """
    Sync HTTP client for calling the Issues microservice.
    Sync because _run_clustering_job is a plain def (not async),
    matching the pattern used in embed.py and cluster.py.
    """
    def __init__(self):
        self.consul = ConsulClient()
        self.service_name = "issues-service"  # must match Consul registration name

    def _base_url(self) -> str:
        return self.consul.discover(self.service_name)


    def post_cluster_results(self, results: list[ClusterResult]) -> None:
        """
        POST all cluster results to NestJS in one call.
        NestJS does the bulk MongoDB write.
        Raises httpx.HTTPStatusError on 4xx / 5xx.
        """
        base_url = self._base_url()
        payload = [
            {
                "id": r.id,
                "cluster_id": r.cluster_id,
                "cluster_label": r.cluster_label,
            }
            for r in results
        ]

        with httpx.Client(
            base_url=base_url,
            timeout=httpx.Timeout(30.0),
        ) as client:
            for chunk in chunk_list(payload, 500):
                response = client.post("/issues/cluster-results", json=chunk)
                response.raise_for_status()


issues_client = IssuesClient()