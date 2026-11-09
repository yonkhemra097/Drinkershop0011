from typing import Literal

from pydantic import BaseModel, EmailStr, Field

from app.models import User


class RegisterIn(BaseModel):
    full_name: str = Field(min_length=2, max_length=120)
    email: EmailStr
    phone: str = Field(min_length=6, max_length=20, pattern=r"^[0-9+\- ]+$")
    password: str = Field(max_length=128)
    accept_terms: bool


class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(max_length=128)


class UserCreateIn(BaseModel):
    full_name: str = Field(min_length=2, max_length=120)
    email: EmailStr
    phone: str | None = Field(default=None, max_length=20)
    role_names: list[str] = Field(min_length=1)
    branch_codes: list[str] = []
    password: str | None = Field(default=None, max_length=128)


class StatusIn(BaseModel):
    status: Literal["active", "suspended", "inactive"]


class RolePermissionsIn(BaseModel):
    permission_codes: list[str]


def user_out(user: User) -> dict[str, str | list[str] | None]:
    return {
        "id": str(user.id), "email": user.email, "full_name": user.full_name, "phone": user.phone,
        "status": user.status, "roles": [r.name for r in user.roles],
        "branches": [b.code for b in user.branches],
        "created_at": user.created_at.isoformat() if user.created_at else None,
    }
