from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.permissions import ALL_PERMISSIONS, DEFAULT_ROLES
from app.models import Branch, Permission, Role


def seed_rbac(db: Session) -> None:
    """Idempotent. Syncs the permission catalog; sets role permissions only when a role is first created
    (so runtime customisation is preserved). The admin role is always kept in sync with the full catalog."""
    existing = {p.code: p for p in db.scalars(select(Permission))}
    for code in ALL_PERMISSIONS:
        if code not in existing:
            existing[code] = Permission(code=code, description=code.replace(".", " ").replace("_", " "))
            db.add(existing[code])
    db.flush()

    for name, (desc, protected, codes) in DEFAULT_ROLES.items():
        role = db.scalar(select(Role).where(Role.name == name))
        if role is None:
            role = Role(name=name, description=desc, is_system=True, is_protected=protected)
            role.permissions = [existing[c] for c in codes]
            db.add(role)
        elif name == "admin":
            role.permissions = [existing[c] for c in ALL_PERMISSIONS]

    if db.scalar(select(Branch).where(Branch.code == "MAIN")) is None:
        db.add(Branch(code="MAIN", name="Main Branch"))
    db.commit()
