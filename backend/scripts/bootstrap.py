"""Create tables, seed RBAC, create the first Admin (and optional demo accounts).

    python -m scripts.bootstrap            # admin only
    python -m scripts.bootstrap --demo     # + one demo account per role (development only!)

Passwords are generated randomly and printed ONCE. Nothing is hard-coded.
"""
import argparse
import os
import secrets

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.db.base import Base
from app.db.seed import seed_rbac
from app.db.session import SessionLocal, engine
from app.models import Branch, Role, User


def make_user(
    db: Session,
    email: str,
    name: str,
    role_name: str,
    password: str | None = None,
    branch: str = "MAIN",
) -> None:
    if db.scalar(select(User).where(User.email == email)):
        print(f"  exists: {email}")
        return
    password = password or f"{secrets.token_urlsafe(14)}9a"
    user = User(email=email, full_name=name, password_hash=hash_password(password), status="active")
    role = db.scalar(select(Role).where(Role.name == role_name))
    if role is None:
        raise RuntimeError(f"Role is not configured: {role_name}")
    user.roles = [role]
    if role_name != "customer":
        target_branch = db.scalar(select(Branch).where(Branch.code == branch))
        if target_branch is None:
            raise RuntimeError(f"Branch is not configured: {branch}")
        user.branches = [target_branch]
    db.add(user)
    db.commit()
    print(f"  {role_name:<11} {email:<28} password: {password}")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--demo", action="store_true")
    args = ap.parse_args()
    # Dev convenience. Production should use Alembic migrations instead.
    Base.metadata.create_all(engine)
    with SessionLocal() as db:
        seed_rbac(db)
        print("Accounts (passwords are shown only now):")
        make_user(db, os.getenv("ADMIN_EMAIL", "admin@bakery-demo.com"), "System Admin", "admin",
                  os.getenv("ADMIN_PASSWORD") or None)
        if args.demo:
            for role, label in [("management", "Manager"), ("staff", "Staff"), ("delivery", "Driver"),
                                ("supplier", "Supplier"), ("customer", "Customer")]:
                make_user(db, f"{role}@bakery-demo.com", f"Demo {label}", role)


if __name__ == "__main__":
    main()
