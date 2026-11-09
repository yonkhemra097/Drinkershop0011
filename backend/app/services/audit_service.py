import uuid

from fastapi import Request
from sqlalchemy.orm import Session

from app.models import AuditLog


def client_ip(request: Request | None) -> str | None:
    return request.client.host if request is not None and request.client else None


def write_audit(db: Session, *, request: Request | None, actor_id: uuid.UUID | None, action: str,
                resource_type: str, resource_id: uuid.UUID | str | None = None,
                old: dict[str, object] | None = None, new: dict[str, object] | None = None,
                result: str = "success") -> None:
    """Adds an audit row to the caller's transaction (caller commits)."""
    db.add(AuditLog(
        actor_id=actor_id, action=action, resource_type=resource_type,
        resource_id=str(resource_id) if resource_id is not None else None,
        old_values=old, new_values=new, ip=client_ip(request), result=result,
    ))
