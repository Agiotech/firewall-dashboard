"""HTTP Basic Auth dependency for the dashboard API and SPA.

Enabled when DASHBOARD_PASSWORD is non-empty. Disabled silently otherwise.
"""
import secrets
from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBasic, HTTPBasicCredentials

from .config import settings


_security = HTTPBasic(realm="Firewall Dashboard", auto_error=False)


async def require_basic_auth(
    creds: Annotated[HTTPBasicCredentials | None, Depends(_security)] = None,
) -> None:
    if not settings.dashboard_password:
        return  # auth disabled

    if creds is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
            headers={"WWW-Authenticate": 'Basic realm="Firewall Dashboard"'},
        )

    expected_user = settings.dashboard_username.encode("utf-8")
    expected_pass = settings.dashboard_password.encode("utf-8")
    user_ok = secrets.compare_digest(creds.username.encode("utf-8"), expected_user)
    pass_ok = secrets.compare_digest(creds.password.encode("utf-8"), expected_pass)
    if not (user_ok and pass_ok):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
            headers={"WWW-Authenticate": 'Basic realm="Firewall Dashboard"'},
        )
