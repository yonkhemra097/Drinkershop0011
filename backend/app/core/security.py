import hashlib
import secrets

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError

from app.core.errors import AppError

_hasher = PasswordHasher()  # Argon2id by default
DUMMY_HASH = _hasher.hash("dummy-password-for-timing")


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password_hash: str, password: str) -> bool:
    try:
        return _hasher.verify(password_hash, password)
    except (VerificationError, InvalidHashError):
        return False


def validate_password_strength(password: str) -> None:
    ok = len(password) >= 10 and any(c.isalpha() for c in password) and any(c.isdigit() for c in password)
    if not ok:
        raise AppError(422, "WEAK_PASSWORD", "Password must be at least 10 characters and include letters and digits")


def new_token() -> str:
    return secrets.token_urlsafe(32)


def hash_token(token: str) -> str:
    """Only the hash of a session token is stored, so a DB leak cannot be replayed."""
    return hashlib.sha256(token.encode()).hexdigest()


def generate_temp_password() -> str:
    return f"{secrets.token_urlsafe(12)}9a"
