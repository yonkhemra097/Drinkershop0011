import uuid
from datetime import timedelta
from collections.abc import Sequence

from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.api.deps import CSRF_COOKIE, SESSION_COOKIE, AuthContext, get_auth
from app.core.config import settings
from app.core.errors import AppError, ok
from app.core.security import (DUMMY_HASH, hash_password, hash_token, new_token,
                               validate_password_strength, verify_password)
from app.db.base import utcnow
from app.db.session import get_db
from app.models import AuthSession, LoginAttempt, Role, User
from app.schemas.identity import LoginIn, RegisterIn, user_out
from app.services.audit_service import client_ip, write_audit
from app.services.permission_service import effective_permissions

router = APIRouter(prefix="/auth", tags=["auth"])


def _me(db: Session, user: User) -> dict[str, object]:
    return {**user_out(user), "permissions": sorted(effective_permissions(db, user))}


@router.post("/register", status_code=201)
def register(body: RegisterIn, request: Request, db: Session = Depends(get_db)):
    if not body.accept_terms:
        raise AppError(422, "TERMS_REQUIRED", "You must accept the terms")
    validate_password_strength(body.password)
    email = body.email.lower().strip()
    if db.scalar(select(User).where(User.email == email)):
        raise AppError(409, "EMAIL_EXISTS", "An account with this email already exists")
    role = db.scalar(select(Role).where(Role.name == "customer"))
    if role is None:
        raise AppError(500, "CUSTOMER_ROLE_MISSING", "Customer role is not configured")
    user = User(email=email, full_name=body.full_name.strip(), phone=body.phone,
                password_hash=hash_password(body.password), status="active")  # TODO: email verification
    user.roles.append(role)
    db.add(user)
    db.flush()
    write_audit(db, request=request, actor_id=user.id, action="auth.register", resource_type="user", resource_id=user.id)
    db.commit()
    return ok(user_out(user), "Registered")


@router.post("/login")
def login(body: LoginIn, request: Request, response: Response, db: Session = Depends(get_db)):
    email, ip, now = body.email.lower().strip(), client_ip(request), utcnow()
    since = now - timedelta(minutes=settings.lockout_minutes)
    fails = db.scalar(select(func.count()).select_from(LoginAttempt).where(
        LoginAttempt.email == email, LoginAttempt.success.is_(False), LoginAttempt.attempted_at > since))
    if fails is None:
        raise RuntimeError("Login-attempt count query returned no result")
    if fails >= settings.max_failed_logins:
        raise AppError(429, "ACCOUNT_LOCKED", "Too many failed attempts. Try again later")

    user = db.scalar(select(User).where(User.email == email))
    valid = verify_password(user.password_hash if user else DUMMY_HASH, body.password)  # constant-ish time
    if not user or not valid:
        db.add(LoginAttempt(email=email, ip=ip, success=False))
        db.commit()
        raise AppError(401, "INVALID_CREDENTIALS", "Invalid email or password")
    if user.status != "active":
        raise AppError(403, "ACCOUNT_DISABLED", "Account is not active")

    db.execute(delete(LoginAttempt).where(LoginAttempt.email == email, LoginAttempt.success.is_(False)))
    token, csrf = new_token(), new_token()
    db.add(AuthSession(user_id=user.id, token_hash=hash_token(token), csrf_token=csrf, ip=ip,
                       user_agent=(request.headers.get("user-agent") or "")[:255],
                       expires_at=now + timedelta(minutes=settings.session_lifetime_minutes)))
    user.last_login_at = now
    write_audit(db, request=request, actor_id=user.id, action="auth.login", resource_type="user", resource_id=user.id)
    db.commit()

    max_age = settings.session_lifetime_minutes * 60
    response.set_cookie(SESSION_COOKIE, token, max_age=max_age, httponly=True,
                        secure=settings.cookie_secure, samesite="lax", path="/")
    response.set_cookie(CSRF_COOKIE, csrf, max_age=max_age, httponly=False,  # JS must read this one
                        secure=settings.cookie_secure, samesite="lax", path="/")
    return ok(_me(db, user), "Login successful")


@router.post("/logout")
def logout(request: Request, response: Response, ctx: AuthContext = Depends(get_auth), db: Session = Depends(get_db)):
    ctx.session.revoked_at = utcnow()
    write_audit(db, request=request, actor_id=ctx.user.id, action="auth.logout", resource_type="session", resource_id=ctx.session.id)
    db.commit()
    response.delete_cookie(SESSION_COOKIE, path="/")
    response.delete_cookie(CSRF_COOKIE, path="/")
    return ok(None, "Logged out")


@router.get("/me")
def me(ctx: AuthContext = Depends(get_auth), db: Session = Depends(get_db)):
    return ok(_me(db, ctx.user))


@router.get("/sessions")
def list_sessions(ctx: AuthContext = Depends(get_auth), db: Session = Depends(get_db)):
    rows: Sequence[AuthSession] = db.scalars(select(AuthSession).where(
        AuthSession.user_id == ctx.user.id, AuthSession.revoked_at.is_(None),
        AuthSession.expires_at > utcnow()).order_by(AuthSession.created_at.desc())).all()
    return ok([{"id": str(s.id), "ip": s.ip, "user_agent": s.user_agent, "created_at": s.created_at.isoformat(),
                "last_seen_at": s.last_seen_at.isoformat(), "current": s.id == ctx.session.id} for s in rows])


@router.delete("/sessions/{session_id}")
def revoke_session(session_id: uuid.UUID, request: Request, ctx: AuthContext = Depends(get_auth),
                   db: Session = Depends(get_db)):
    s = db.get(AuthSession, session_id)
    if s is None or s.user_id != ctx.user.id:  # users can only revoke their own sessions
        raise AppError(404, "NOT_FOUND", "Session not found")
    s.revoked_at = utcnow()
    write_audit(db, request=request, actor_id=ctx.user.id, action="auth.session_revoked", resource_type="session", resource_id=s.id)
    db.commit()
    return ok(None, "Session revoked")
