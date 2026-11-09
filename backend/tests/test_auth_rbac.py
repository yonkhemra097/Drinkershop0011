from sqlalchemy.orm import Session as SQLSession, sessionmaker
from sqlalchemy import select
from fastapi.testclient import TestClient

from app.core.config import settings
from app.models import Permission, UserPermission
from app.services.permission_service import effective_permissions
from tests.conftest import MakeUser, PASSWORD, login

API = "/api/v1"


def test_wrong_password_rejected(client: TestClient, make_user: MakeUser) -> None:
    make_user("a@example.com", "staff")
    r, _ = login(client, "a@example.com", "wrong-password-1")
    assert r.status_code == 401 and r.json()["error_code"] == "INVALID_CREDENTIALS"


def test_disabled_account_blocked(client: TestClient, make_user: MakeUser) -> None:
    make_user("off@example.com", "staff", status="inactive")
    r, _ = login(client, "off@example.com")
    assert r.status_code == 403 and r.json()["error_code"] == "ACCOUNT_DISABLED"


def test_lockout_after_repeated_failures(client: TestClient, make_user: MakeUser) -> None:
    make_user("lock@example.com", "staff")
    for _ in range(settings.max_failed_logins):
        login(client, "lock@example.com", "bad-password-1")
    r, _ = login(client, "lock@example.com")  # correct password, still locked
    assert r.status_code == 429


def test_staff_cannot_use_admin_api_but_admin_can(client: TestClient, make_user: MakeUser) -> None:
    make_user("staff@example.com", "staff")
    make_user("admin@example.com", "admin")
    _, _ = login(client, "staff@example.com")
    assert client.get(f"{API}/users").status_code == 403
    client.cookies.clear()
    login(client, "admin@example.com")
    assert client.get(f"{API}/users").status_code == 200


def test_unauthenticated_is_401(client: TestClient) -> None:
    assert client.get(f"{API}/users").status_code == 401


def test_csrf_required_and_logout_revokes(client: TestClient, make_user: MakeUser) -> None:
    make_user("c@example.com", "staff")
    _, h = login(client, "c@example.com")
    assert client.post(f"{API}/auth/logout").status_code == 403  # no CSRF header
    assert client.post(f"{API}/auth/logout", headers=h).status_code == 200
    assert client.get(f"{API}/auth/me").status_code == 401


def test_customer_register_and_no_admin_access(client: TestClient) -> None:
    body = dict(
        full_name="Sok Dara",
        email="cust@example.com",
        phone="012345678",
        password=PASSWORD,
        accept_terms=True,
    )
    assert client.post(f"{API}/auth/register", json=body).status_code == 201
    assert client.post(f"{API}/auth/register", json=body).status_code == 409
    login(client, "cust@example.com")
    assert client.get(f"{API}/users").status_code == 403


def test_management_cannot_create_admin_but_can_create_staff(
    client: TestClient,
    make_user: MakeUser,
) -> None:
    make_user("m@example.com", "management")
    _, h = login(client, "m@example.com")
    base = dict(full_name="New Person", email="new@example.com", branch_codes=["MAIN"])
    r = client.post(f"{API}/users", json={**base, "role_names": ["admin"]}, headers=h)
    assert r.status_code == 403 and r.json()["error_code"] == "PROTECTED_ROLE"
    r = client.post(f"{API}/users", json={**base, "role_names": ["staff"]}, headers=h)
    assert r.status_code == 201 and "temporary_password" in r.json()["data"]


def test_privilege_escalation_blocked(
    client: TestClient,
    make_user: MakeUser,
    Session: sessionmaker[SQLSession],
) -> None:
    mid = make_user("m2@example.com", "management")
    with Session() as db:  # give the manager the grant permission (a configurable admin decision)
        p = db.scalar(select(Permission).where(Permission.code == "permissions.grant"))
        assert p is not None
        db.add(UserPermission(user_id=mid, permission_id=p.id, effect="allow"))
        db.commit()
    _, h = login(client, "m2@example.com")
    staff = next(r for r in client.get(f"{API}/roles").json()["data"] if r["name"] == "staff")
    ok_codes = staff["permissions"]
    r = client.put(f"{API}/roles/{staff['id']}/permissions", json={"permission_codes": ok_codes + ["settings.edit"]}, headers=h)
    assert r.status_code == 403 and r.json()["error_code"] == "ESCALATION_DENIED"
    r = client.put(f"{API}/roles/{staff['id']}/permissions", json={"permission_codes": ok_codes + ["products.create"]}, headers=h)
    assert r.status_code == 200


def test_admin_role_is_immutable(client: TestClient, make_user: MakeUser) -> None:
    make_user("root@example.com", "admin")
    _, h = login(client, "root@example.com")
    role = next(r for r in client.get(f"{API}/roles").json()["data"] if r["name"] == "admin")
    r = client.put(f"{API}/roles/{role['id']}/permissions", json={"permission_codes": []}, headers=h)
    assert r.status_code == 403


def test_deactivation_revokes_live_sessions(
    client: TestClient,
    second_client: TestClient,
    make_user: MakeUser,
) -> None:
    make_user("boss@example.com", "admin")
    sid = make_user("worker@example.com", "staff")
    login(second_client, "worker@example.com")
    assert second_client.get(f"{API}/auth/me").status_code == 200
    _, h = login(client, "boss@example.com")
    r = client.patch(f"{API}/users/{sid}/status", json={"status": "suspended"}, headers=h)
    assert r.status_code == 200
    assert second_client.get(f"{API}/auth/me").status_code == 401


def test_user_deny_override_wins_and_expiry_ignored(
    Session: sessionmaker[SQLSession],
    make_user: MakeUser,
) -> None:
    from datetime import timedelta
    from app.db.base import utcnow
    from app.models import User
    uid = make_user("o@example.com", "staff")
    with Session() as db:
        user = db.get(User, uid)
        assert user is not None
        allow = db.scalar(select(Permission).where(Permission.code == "settings.view"))
        deny = db.scalar(select(Permission).where(Permission.code == "products.view"))
        expired = db.scalar(select(Permission).where(Permission.code == "reports.view"))
        assert allow is not None and deny is not None and expired is not None
        db.add_all([
            UserPermission(user_id=uid, permission_id=allow.id, effect="allow"),
            UserPermission(user_id=uid, permission_id=deny.id, effect="deny"),
            UserPermission(user_id=uid, permission_id=expired.id, effect="allow", expires_at=utcnow() - timedelta(hours=1)),
        ])
        db.commit()
        perms = effective_permissions(db, user)
    assert "settings.view" in perms and "products.view" not in perms and "reports.view" not in perms
