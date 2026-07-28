import os
import time
import uuid
import requests
from fastapi import FastAPI
from typing import Optional

from app.core.config import settings


class ConsulClient:
    def __init__(self):
        self.consul_url = settings.CONSUL_BASE_URL
        self.service_name = settings.SERVICE_NAME
        self.service_host = settings.SERVICE_HOST
        self.service_port = settings.SERVICE_PORT

        self.service_id = f"{self.service_name}-{int(time.time())}"

    # ---------- REGISTER ----------
    def register(self):
        url = f"{self.consul_url}/v1/agent/service/register?replace-existing-checks=true"

        payload = {
            "ID": self.service_id,
            "Name": self.service_name,
            "Tags": ["v1"],
            "Address": self.service_host,
            "Port": int(self.service_port),
            "Check": {
                "Name": f"{self.service_name} service check",
                "HTTP": f"http://{self.service_host}:{self.service_port}/health",
                "Interval": "10s",
                "Timeout": "5s",
                "DeregisterCriticalServiceAfter": "90m",
            },
        }

        r = requests.put(url, json=payload)
        print("CONSUL RESPONSE:", r.text)  # ADD THIS
        r.raise_for_status()

    # ---------- DEREGISTER ----------
    def deregister(self):
        url = f"{self.consul_url}/v1/agent/service/deregister/{self.service_id}"
        requests.put(url)

    # ---------- DISCOVER ----------
    def discover(self, target_service: str) -> str:
        url = f"{self.consul_url}/v1/agent/health/service/name/{target_service}"
        r = requests.get(url)
        r.raise_for_status()

        instances = r.json()

        healthy = next(
            (i for i in instances if i["AggregatedStatus"] == "passing"),
            None,
        )

        if not healthy:
            raise Exception("No healthy instance found")

        svc = healthy["Service"]
        return f"http://{svc['Address']}:{svc['Port']}"