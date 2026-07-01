"""Async HTTP client for pushing metric batches to Agio-Hub.

Mirror of snmp/client.py: pure I/O, no knowledge of tables nor sync policy.
Wire contract: docs/specs/agio-hub-ingest-contract.md. The retry/backoff
policy lives in hub/sync.py — this module only classifies outcomes.
"""
from __future__ import annotations

import enum
from dataclasses import dataclass
from typing import Any

import httpx

INGEST_PATH = "/integrations/firewall-monitor/metrics"


class PushStatus(enum.Enum):
    OK = "ok"
    AUTH_ERROR = "auth_error"            # 401/403: token inválido o revocado
    BATCH_TOO_LARGE = "batch_too_large"  # 413: reducir lote
    REJECTED = "rejected"                # otros 4xx: contrato roto, no reintentable
    TRANSIENT = "transient"              # 5xx / timeout / error de red: backoff


@dataclass(frozen=True)
class PushResult:
    status: PushStatus
    accepted: int = 0
    http_status: int | None = None
    error: str | None = None

    @property
    def ok(self) -> bool:
        return self.status is PushStatus.OK


class HubClient:
    """Thin async wrapper over the Hub ingest endpoint, auth via app token."""

    def __init__(
        self,
        base_url: str,
        app_token: str,
        timeout_s: float = 10.0,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self._client = httpx.AsyncClient(
            base_url=base_url.rstrip("/"),
            headers={"Authorization": f"Bearer {app_token}"},
            timeout=timeout_s,
            transport=transport,
        )

    async def push(self, entity: str, rows: list[dict[str, Any]]) -> PushResult:
        if not rows:
            return PushResult(status=PushStatus.OK, accepted=0)
        try:
            resp = await self._client.post(
                INGEST_PATH, json={"entity": entity, "rows": rows}
            )
        except httpx.HTTPError as e:
            # str(e) may embed the request URL but never the Authorization header
            return PushResult(status=PushStatus.TRANSIENT, error=f"{type(e).__name__}: {e}")
        return self._classify(resp)

    async def aclose(self) -> None:
        await self._client.aclose()

    @staticmethod
    def _classify(resp: httpx.Response) -> PushResult:
        code = resp.status_code
        if 200 <= code < 300:
            try:
                accepted = int(resp.json().get("accepted", 0))
            except (ValueError, AttributeError):
                accepted = 0
            return PushResult(status=PushStatus.OK, accepted=accepted, http_status=code)
        detail = resp.text[:200]
        if code in (401, 403):
            return PushResult(status=PushStatus.AUTH_ERROR, http_status=code, error=detail)
        if code == 413:
            return PushResult(status=PushStatus.BATCH_TOO_LARGE, http_status=code, error=detail)
        if 400 <= code < 500:
            return PushResult(status=PushStatus.REJECTED, http_status=code, error=detail)
        return PushResult(status=PushStatus.TRANSIENT, http_status=code, error=detail)

    async def __aenter__(self) -> "HubClient":
        return self

    async def __aexit__(self, *exc: object) -> None:
        await self.aclose()
