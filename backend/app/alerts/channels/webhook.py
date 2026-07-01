import logging

import httpx

from ...config import settings

log = logging.getLogger(__name__)


SEVERITY_RANK = {"LOW": 1, "MEDIUM": 2, "HIGH": 3, "CRITICAL": 4}


def _passes_severity(sev: str) -> bool:
    min_sev = settings.alert_webhook_min_severity.upper()
    return SEVERITY_RANK.get(sev.upper(), 0) >= SEVERITY_RANK.get(min_sev, 99)


async def send_webhook(rule_id: str, severity: str, subject: str, message: str) -> None:
    if not settings.alert_webhook_enabled or not settings.alert_webhook_url:
        return
    if not _passes_severity(severity):
        return
    payload = {
        "text": f"[{severity}] {rule_id}\n{subject}\n{message}",
        "rule_id": rule_id,
        "severity": severity,
        "subject": subject,
        "message": message,
    }
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            await client.post(settings.alert_webhook_url, json=payload)
    except Exception as e:
        log.warning("Webhook send failed: %s", e)
