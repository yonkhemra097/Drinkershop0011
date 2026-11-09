import uuid

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.api.deps import require_permission
from app.core.errors import AppError, ok
from app.core.security import generate_temp_password, hash_password, validate_password_strength
from app.db.base import utcnow
from app.db.session import get_db
from app.models import AuthSession, Branch, Role, User
from app.schemas.identity import StatusIn, UserCreateIn, user_out
from app.services.audit_service import write_audit
from app.services.permission_service import (allowed_branch_ids, effective_permissions,
                                             has_protected_role, is_admin)

router = APIRouter(prefix="/users", tags=["users"])


def _in_scope(target: User, scope: set[uuid.UUID] | None) -> bool:
    return scope is None or bool({b.id for b in target.branches} & scope)


@router.get("")
def list_users(q: str | None = None, status: str | None = None, role: str | None = None,
               page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100),
               actor: User = Depends(require_permission("users.view")), db: Session = Depends(get_db)):
    stmt = select(User)
    scope = allowed_branch_ids(db, actor)
    if scope is not None:
        stmt = stmt.where(User.branches.any(Branch.id.in_(scope)))
    if q:
        like = f"%{q.lower()}%"
        stmt = stmt.where(func.lower(User.email).like(like) | func.lower(User.full_name).like(like))
    if status:
        stmt = stmt.where(User.status == status)
    if role:
        stmt = stmt.where(User.roles.any(Role.name == role))
    total = db.scalar(select(func.count()).select_from(stmt.subquery()))
    rows = db.scalars(stmt.order_by(User.created_at.desc()).offset((page - 1) * page_size).limit(page_size)).all()
    return ok({"items": [user_out(u) for u in rows], "total": total, "page": page, "page_size": page_size})


@router.post("", status_code=201)
def create_user(body: UserCreateIn, request: Request,
                actor: User = Depends(require_permission("users.create", "roles.assign")),
                db: Session = Depends(get_db)):
    email = body.email.lower().strip()
    if db.scalar(select(User).where(User.email == email)):
        raise AppError(409, "EMAIL_EXISTS", "An account with this email already exists")
    names = set(body.role_names)
    roles = db.scalars(select(Role).where(Role.name.in_(names), Role.is_active.is_(True))).all()
    if len(roles) != len(names):
        raise AppError(422, "UNKNOWN_ROLE", "One or more roles do not exist")
    if any(r.is_protected for r in roles) and not is_admin(actor):
        raise AppError(403, "PROTECTED_ROLE", "Only an Admin can assign this role")

    scope = allowed_branch_ids(db, actor)
    branches: list[Branch] = list(
        db.scalars(select(Branch).where(Branch.code.in_(body.branch_codes))).all()
    ) if body.branch_codes else []
    if len(branches) != len(set(body.branch_codes)):
        raise AppError(422, "UNKNOWN_BRANCH", "One or more branches do not exist")
    if scope is not None and any(b.id not in scope for b in branches):
        raise AppError(403, "BRANCH_FORBIDDEN", "You cannot grant access to a branch you do not have")

    generated = body.password is None
    password = body.password or generate_temp_password()
    validate_password_strength(password)
    user = User(email=email, full_name=body.full_name.strip(), phone=body.phone,
                password_hash=hash_password(password), status="active")
    user.roles, user.branches = list(roles), list(branches)
    db.add(user)
    db.flush()
    write_audit(db, request=request, actor_id=actor.id, action="users.create", resource_type="user",
                resource_id=user.id, new={"email": email, "roles": sorted(names), "branches": body.branch_codes})
    db.commit()
    data = user_out(user)
    if generated:
        data["temporary_password"] = password  # shown once; deliver securely
    return ok(data, "User created")


@router.patch("/{user_id}/status")
def change_status(user_id: uuid.UUID, body: StatusIn, request: Request,
                  actor: User = Depends(require_permission("users.deactivate")), db: Session = Depends(get_db)):
    target = db.get(User, user_id)
    if target is None or not _in_scope(target, allowed_branch_ids(db, actor)):
        raise AppError(404, "NOT_FOUND", "User not found")
    if target.id == actor.id:
        raise AppError(400, "SELF_CHANGE", "You cannot change your own status")
    if has_protected_role(target) and not is_admin(actor):
        raise AppError(403, "PROTECTED_ROLE", "Only an Admin can change this account")
    old, target.status = target.status, body.status
    if body.status != "active":  # emergency revocation: kill all live sessions immediately
        db.execute(update(AuthSession).where(AuthSession.user_id == target.id, AuthSession.revoked_at.is_(None))
                   .values(revoked_at=utcnow()))
    write_audit(db, request=request, actor_id=actor.id, action="users.status_change", resource_type="user",
                resource_id=target.id, old={"status": old}, new={"status": body.status})
    db.commit()
    return ok(user_out(target), "Status updated")


@router.get("/{user_id}/permissions")
def user_permissions(user_id: uuid.UUID, actor: User = Depends(require_permission("permissions.view")),
                     db: Session = Depends(get_db)):
    target = db.get(User, user_id)
    if target is None or not _in_scope(target, allowed_branch_ids(db, actor)):
        raise AppError(404, "NOT_FOUND", "User not found")
    return ok({"user_id": str(target.id), "roles": [r.name for r in target.roles],
               "permissions": sorted(effective_permissions(db, target))})
