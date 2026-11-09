import secrets
from dataclasses import dataclass
from datetime import timedelta

from fastapi import Depends, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.errors import AppError
from app.core.security import hash_token
from app.db.base import utcnow
from app.db.session import get_db
from app.models import AuthSession, User
from app.services.audit_service import write_audit
from app.services.permission_service import effective_permissions

SESSION_COOKIE = "session"
CSRF_COOKIE = "csrf_token"
UNSAFE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}


@dataclass
class AuthContext:
    user: User
    session: AuthSession


def get_auth(request: Request, db: Session = Depends(get_db)) -> AuthContext:
    token = request.cookies.get(SESSION_COOKIE)
    if not token:
        raise AppError(401, "UNAUTHENTICATED", "Authentication required")
    s = db.scalar(select(AuthSession).where(AuthSession.token_hash == hash_token(token)))
    now = utcnow()
    if (s is None or s.revoked_at is not None or s.expires_at <= now
            or s.last_seen_at + timedelta(minutes=settings.idle_timeout_minutes) <= now):
        raise AppError(401, "SESSION_EXPIRED", "Session expired, please log in again")
    # Double-submit CSRF: cookie-authenticated unsafe requests must echo the CSRF token in a header.
    if request.method in UNSAFE_METHODS:
        sent = request.headers.get("x-csrf-token", "")
        if not sent or not secrets.compare_digest(sent, s.csrf_token):
            raise AppError(403, "CSRF_FAILED", "Missing or invalid CSRF token")
    user = db.get(User, s.user_id)
    if user is None or user.status != "active":
        raise AppError(403, "ACCOUNT_DISABLED", "Account is not active")
    if now - s.last_seen_at > timedelta(seconds=60):
        s.last_seen_at = now
        db.commit()
    return AuthContext(user=user, session=s)


def get_current_user(ctx: AuthContext = Depends(get_auth)) -> User:
    return ctx.user


def require_permission(*codes: str):
    """Backend authorization gate. Hiding UI buttons is never a substitute for this."""
    def dependency(request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> User:
        perms = effective_permissions(db, user)
        missing = [c for c in codes if c not in perms]
        if missing:
            write_audit(db, request=request, actor_id=user.id, action="authz.denied",
                        resource_type="permission", resource_id=",".join(missing), result="denied")
            db.commit()
            raise AppError(403, "PERMISSION_DENIED", "Permission denied")
        return user
    return dependency
