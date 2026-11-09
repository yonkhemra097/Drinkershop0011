import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.base import utcnow
from app.models import Permission, Role, User, UserPermission, role_permissions, user_roles


def effective_permissions(db: Session, user: User) -> set[str]:
    """Role permissions + unexpired user 'allow' overrides, minus unexpired user 'deny' overrides."""
    role_codes = db.scalars(
        select(Permission.code)
        .join(role_permissions, role_permissions.c.permission_id == Permission.id)
        .join(user_roles, user_roles.c.role_id == role_permissions.c.role_id)
        .join(Role, Role.id == user_roles.c.role_id)
        .where(user_roles.c.user_id == user.id, Role.is_active.is_(True))
    ).all()
    perms = set(role_codes)
    now = utcnow()
    rows = db.execute(
        select(Permission.code, UserPermission.effect, UserPermission.expires_at)
        .join(UserPermission, UserPermission.permission_id == Permission.id)
        .where(UserPermission.user_id == user.id)
    ).all()
    live = [(c, e) for c, e, exp in rows if exp is None or exp > now]
    perms |= {c for c, e in live if e == "allow"}
    perms -= {c for c, e in live if e == "deny"}  # deny always wins
    return perms


def allowed_branch_ids(db: Session, user: User, perms: set[str] | None = None) -> set[uuid.UUID] | None:
    """None = all branches. Otherwise the set of branch ids the user may access."""
    perms = perms if perms is not None else effective_permissions(db, user)
    if "branches.access_all" in perms:
        return None
    return {b.id for b in user.branches}


def is_admin(user: User) -> bool:
    return any(r.name == "admin" for r in user.roles)


def has_protected_role(user: User) -> bool:
    return any(r.is_protected for r in user.roles)
