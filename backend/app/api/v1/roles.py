import uuid
from collections.abc import Sequence

from fastapi import APIRouter, Depends, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import require_permission
from app.core.errors import AppError, ok
from app.db.session import get_db
from app.models import Permission, Role, User
from app.schemas.identity import RolePermissionsIn
from app.services.audit_service import write_audit
from app.services.permission_service import effective_permissions, is_admin

router = APIRouter(tags=["roles & permissions"])


def _role_out(r: Role) -> dict[str, object]:
    return {"id": str(r.id), "name": r.name, "description": r.description, "is_system": r.is_system,
            "is_protected": r.is_protected, "is_active": r.is_active,
            "permissions": sorted(p.code for p in r.permissions)}


@router.get("/roles")
def list_roles(_: User = Depends(require_permission("roles.view")), db: Session = Depends(get_db)):
    return ok([_role_out(r) for r in db.scalars(select(Role).order_by(Role.name))])


@router.get("/permissions")
def list_permissions(_: User = Depends(require_permission("permissions.view")), db: Session = Depends(get_db)):
    return ok([{"code": p.code, "description": p.description} for p in db.scalars(select(Permission).order_by(Permission.code))])


@router.put("/roles/{role_id}/permissions")
def set_role_permissions(role_id: uuid.UUID, body: RolePermissionsIn, request: Request,
                         actor: User = Depends(require_permission("permissions.grant")),
                         db: Session = Depends(get_db)):
    role = db.get(Role, role_id)
    if role is None:
        raise AppError(404, "NOT_FOUND", "Role not found")
    if role.name == "admin":
        raise AppError(403, "PROTECTED_ROLE", "The admin role cannot be modified")
    if role.is_protected and not is_admin(actor):
        raise AppError(403, "PROTECTED_ROLE", "Only an Admin can modify this role")

    wanted = set(body.permission_codes)
    perms: Sequence[Permission] = db.scalars(select(Permission).where(Permission.code.in_(wanted))).all()
    if len(perms) != len(wanted):
        raise AppError(422, "UNKNOWN_PERMISSION", "One or more permissions do not exist")

    old = {p.code for p in role.permissions}
    added = wanted - old
    # Privilege-escalation guard: you can only hand out permissions you hold yourself.
    if not is_admin(actor) and not added <= effective_permissions(db, actor):
        raise AppError(403, "ESCALATION_DENIED", "You cannot grant permissions you do not hold")

    role.permissions = list(perms)
    write_audit(db, request=request, actor_id=actor.id, action="roles.permissions_update", resource_type="role",
                resource_id=role.id, old={"permissions": sorted(old)}, new={"permissions": sorted(wanted)})
    db.commit()
    return ok(_role_out(role), "Role permissions updated")
