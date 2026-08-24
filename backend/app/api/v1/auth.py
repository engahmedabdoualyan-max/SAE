"""Authentication endpoints (JWT + in-memory user store for the scaffold).

The user store is intentionally a plain dict so the API can run without a
populated users table. A matching demo row is seeded into the DB on startup
so foreign keys (projects.user_id) stay valid.
"""

from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from jose import JWTError, jwt
from passlib.context import CryptContext
from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.core.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

oauth2_scheme = OAuth2PasswordBearer(tokenUrl=f"{settings.API_V1_PREFIX}/auth/login")

EMAIL_PATTERN = re.compile(r"^[\w.+-]+@[\w-]+(\.[\w-]+)+$")

# Fake user store: email -> {id, email, name, hashed_password, is_active, created_at}
FAKE_USERS_DB: dict[str, dict[str, Any]] = {}


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        return pwd_context.verify(plain_password, hashed_password)
    except ValueError:
        return False


def create_access_token(
    subject: str,
    *,
    extra_claims: dict[str, Any] | None = None,
    expires_minutes: int | None = None,
) -> str:
    expire = datetime.now(timezone.utc) + timedelta(
        minutes=expires_minutes if expires_minutes is not None else settings.ACCESS_TOKEN_EXPIRE_MINUTES
    )
    payload: dict[str, Any] = {"sub": subject, "exp": expire}
    if extra_claims:
        payload.update(extra_claims)
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


class UserCreate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    email: str
    name: str = ""
    password: str = Field(min_length=8, description="Minimum 8 characters")

    @field_validator("email")
    @classmethod
    def _validate_email(cls, value: str) -> str:
        if not EMAIL_PATTERN.match(value.lower()):
            raise ValueError("Invalid email address")
        return value.lower()


class UserOut(BaseModel):
    id: int
    email: str
    name: str
    is_active: bool
    created_at: datetime


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


def _bootstrap_demo_user() -> None:
    if not FAKE_USERS_DB:
        FAKE_USERS_DB["demo@sae.local"] = {
            "id": 1,
            "email": "demo@sae.local",
            "name": "Demo User",
            "hashed_password": hash_password("demo1234"),
            "is_active": True,
            "created_at": datetime.now(timezone.utc),
        }


_bootstrap_demo_user()

router = APIRouter()


def _public_user(user: dict[str, Any]) -> UserOut:
    return UserOut(
        id=int(user["id"]),
        email=str(user["email"]),
        name=str(user["name"]),
        is_active=bool(user["is_active"]),
        created_at=user["created_at"],
    )


def get_current_user(token: Annotated[str, Depends(oauth2_scheme)]) -> dict[str, Any]:
    credentials_error = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        email = payload.get("sub")
    except JWTError as exc:
        raise credentials_error from exc
    user = FAKE_USERS_DB.get(str(email or ""))
    if user is None:
        raise credentials_error
    return user


CurrentUser = Annotated[dict[str, Any], Depends(get_current_user)]


@router.post("/register", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def register_user(payload: UserCreate) -> UserOut:
    """Create a new user account in the fake (in-memory) store."""
    if payload.email in FAKE_USERS_DB:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already registered")

    user: dict[str, Any] = {
        "id": max((int(u["id"]) for u in FAKE_USERS_DB.values()), default=0) + 1,
        "email": payload.email,
        "name": payload.name or payload.email.split("@")[0],
        "hashed_password": hash_password(payload.password),
        "is_active": True,
        "created_at": datetime.now(timezone.utc),
    }
    FAKE_USERS_DB[payload.email] = user
    return _public_user(user)


@router.post("/login", response_model=Token)
def login(form_data: Annotated[OAuth2PasswordRequestForm, Depends()]) -> Token:
    """Authenticate with email (username) + password and return a JWT."""
    user = FAKE_USERS_DB.get(form_data.username)
    if user is None or not verify_password(form_data.password, user["hashed_password"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if not user["is_active"]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Inactive user")

    token = create_access_token(
        str(user["email"]),
        extra_claims={"uid": int(user["id"]), "name": str(user["name"])},
    )
    return Token(access_token=token)


@router.get("/me", response_model=UserOut)
def read_current_user(current_user: CurrentUser) -> UserOut:
    """Return the authenticated user's profile."""
    return _public_user(current_user)
