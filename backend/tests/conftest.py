from collections.abc import Generator
from typing import Protocol
from uuid import UUID

import pytest
from httpx import Response
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session as SQLSession, sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.security import hash_password
from app.db.base import Base
from app.db.seed import seed_rbac
from app.db.session import get_db
from app.main import app
from app.models import Branch, Role, User

PASSWORD = "Str0ngPass!word"


class MakeUser(Protocol):
    def __call__(
        self,
        email: str,
        role: str,
        status: str = "active",
        branch: str = "MAIN",
    ) -> UUID: ...


@pytest.fixture()
def Session() -> sessionmaker[SQLSession]:
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    maker = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    with maker() as db:
        seed_rbac(db)
    return maker


@pytest.fixture()
def client(Session: sessionmaker[SQLSession]) -> Generator[TestClient, None, None]:
    def override() -> Generator[SQLSession, None, None]:
        with Session() as db:
            yield db
    app.dependency_overrides[get_db] = override
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture()
def second_client() -> TestClient:
    return TestClient(app)


@pytest.fixture()
def make_user(Session: sessionmaker[SQLSession]) -> MakeUser:
    def _make(email: str, role: str, status: str = "active", branch: str = "MAIN") -> UUID:
        with Session() as db:
            u = User(email=email, full_name=email.split("@")[0].title(), password_hash=hash_password(PASSWORD), status=status)
            selected_role = db.scalar(select(Role).where(Role.name == role))
            if selected_role is None:
                raise RuntimeError(f"Role is not configured: {role}")
            u.roles = [selected_role]
            if role != "customer":
                selected_branch = db.scalar(select(Branch).where(Branch.code == branch))
                if selected_branch is None:
                    raise RuntimeError(f"Branch is not configured: {branch}")
                u.branches = [selected_branch]
            db.add(u)
            db.commit()
            return u.id
    return _make


def login(client: TestClient, email: str, password: str = PASSWORD) -> tuple[Response, dict[str, str]]:
    r = client.post("/api/v1/auth/login", json={"email": email, "password": password})
    csrf_token = client.cookies.get("csrf_token") or ""
    return r, {"X-CSRF-Token": csrf_token}
