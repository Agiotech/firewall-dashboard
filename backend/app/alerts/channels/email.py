import logging
import smtplib
from email.message import EmailMessage

from ...config import settings

log = logging.getLogger(__name__)


SEVERITY_RANK = {"LOW": 1, "MEDIUM": 2, "HIGH": 3, "CRITICAL": 4}


def _enabled() -> bool:
    return getattr(settings, "alert_email_enabled", False) and bool(
        getattr(settings, "alert_email_smtp_host", "")
    )


def _passes_severity(sev: str) -> bool:
    min_sev = getattr(settings, "alert_email_min_severity", "MEDIUM").upper()
    return SEVERITY_RANK.get(sev.upper(), 0) >= SEVERITY_RANK.get(min_sev, 99)


async def send_email(rule_id: str, severity: str, subject: str, message: str) -> None:
    if not _enabled() or not _passes_severity(severity):
        return
    to_list = [x.strip() for x in getattr(settings, "alert_email_to", "").split(",") if x.strip()]
    if not to_list:
        return

    msg = EmailMessage()
    msg["Subject"] = f"[{severity}] {rule_id}: {subject}"
    msg["From"] = getattr(settings, "alert_email_from", "") or getattr(settings, "alert_email_smtp_user", "")
    msg["To"] = ", ".join(to_list)
    msg.set_content(message)

    host = getattr(settings, "alert_email_smtp_host", "")
    port = getattr(settings, "alert_email_smtp_port", 587)
    user = getattr(settings, "alert_email_smtp_user", "")
    password = getattr(settings, "alert_email_smtp_pass", "")

    try:
        with smtplib.SMTP(host, port, timeout=10) as s:
            s.starttls()
            if user:
                s.login(user, password)
            s.send_message(msg)
    except Exception as e:
        log.warning("Email send failed: %s", e)
