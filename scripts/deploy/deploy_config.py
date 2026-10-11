"""
deploy_config.py — NoFluxo app configuration for local deploys.

This file defines the applications that can be deployed using deploy_local.py.
Each AppConfig entry describes one deployable unit: its Docker build settings,
the environment variables it needs at build-time and run-time, and the
Kubernetes deploy parameters (port, replicas, domain, etc.).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Mapping, Sequence


@dataclass(frozen=True)
class AppConfig:
    """Configuration for a single deployable application."""

    key: str  # Short identifier used as CLI target (e.g. "backend")
    app_name: str  # Kubernetes deployment name
    namespace: str  # Kubernetes namespace (e.g. "non-business-apps")
    image_name: str  # Image name in the registry (no registry prefix)
    dockerfile: str  # Path to Dockerfile relative to repo root
    build_context: str  # Docker build context relative to repo root
    port: int  # Container port
    replicas: int  # Number of pod replicas
    health_path: str  # Health-check endpoint (e.g. "/health")

    # --- Domain routing (pick one) ---
    domain: str | None = None  # Single domain
    domains: Sequence[str] | None = None  # Multiple domains (including wildcards)

    # --- Environment file loading ---
    env_folder: str | None = (
        None  # Folder to load .env from (defaults to build_context)
    )

    # --- Build-time args ---
    # Keys to read from the environment and pass as --build-arg to Docker
    build_arg_keys: Sequence[str] = ()
    # Keys to read from the environment (optional — skipped silently if missing)
    build_arg_optional_keys: Sequence[str] = ()
    # Static build args (hardcoded values, not from env)
    build_arg_static: Mapping[str, str] | None = None

    # --- Runtime env vars (injected into the K8s deployment) ---
    # Keys to read from the environment (required — deploy fails if missing)
    deploy_env_keys: Sequence[str] = ()
    # Keys to read from the environment (optional — skipped silently if missing)
    deploy_env_optional_keys: Sequence[str] = ()
    # Static env vars (hardcoded values)
    deploy_env_static: Mapping[str, str] | None = None

    # --- Rollout check (verificar_rollout.py) ---
    # Endpoint público que devolve {"commit": GIT_SHA}; None = não verifica.
    version_path: str | None = None

    # --- App class (for node scheduling) ---
    app_class: str = "non-business"  # Route to non-business nodes


# ---------------------------------------------------------------------------
# NoFluxo Apps
# ---------------------------------------------------------------------------

APPS: dict[str, AppConfig] = {
    # ── Backend API ────────────────────────────────────────────────────────
    "backend": AppConfig(
        key="backend",
        app_name="nofluxo-backend",
        namespace="non-business-apps",
        image_name="nofluxo-backend",
        dockerfile="k8s.backend.Dockerfile",
        build_context=".",
        port=3325,
        replicas=1,
        health_path="/health",
        version_path="/health",
        domain="api-nofluxo.crianex.com",
        app_class="non-business",
        deploy_env_keys=(
            "SUPABASE_URL",
            "SUPABASE_SERVICE_ROLE_KEY",
            "SUPABASE_ANON_KEY",
            "MCP_AGENT_API_KEY",
        ),
        deploy_env_optional_keys=(
            "RAGFLOW_API_KEY",
            "RAGFLOW_BASE_URL",
            "RAGFLOW_AGENT_ID",
            "MARITACA_API_KEY",
            "GOOGLE_API_KEY",
            # muda a cada deploy: força a troca dos pods e identifica a versão
            "GIT_SHA",
        ),
        deploy_env_static={
            "NODE_ENV": "production",
            "PORT": "3325",
            "SABIA_API_URL": "http://nofluxo-mcp-agent",
        },
    ),
    # ── Frontend (SvelteKit static via nginx) ────────────────────────────────
    "frontend": AppConfig(
        key="frontend",
        app_name="nofluxo-frontend",
        namespace="non-business-apps",
        image_name="nofluxo-frontend",
        dockerfile="k8s.frontend-svelte.Dockerfile",
        build_context=".",
        port=3000,
        replicas=1,
        health_path="/health.json",
        version_path="/health.json",
        domain="no-fluxo.crianex.com",
        app_class="non-business",
        env_folder="frontend",
        # PUBLIC_* vars are baked at build time via $env/static/public
        build_arg_keys=(
            "PUBLIC_SUPABASE_URL",
            "PUBLIC_SUPABASE_ANON_KEY",
        ),
        build_arg_optional_keys=("GIT_SHA",),
        build_arg_static={
            "PUBLIC_API_URL": "https://api-nofluxo.crianex.com",
            "PUBLIC_REDIRECT_URL": "https://no-fluxo.crianex.com",
            "PUBLIC_ENVIRONMENT": "production",
        },
        # No runtime env vars needed — nginx serves static files
    ),
    # ── MCP Agent (Darcy AI FastAPI) ────────────────────────────────────────
    "mcp-agent": AppConfig(
        key="mcp-agent",
        app_name="nofluxo-mcp-agent",
        namespace="non-business-apps",
        image_name="nofluxo-mcp-agent",
        dockerfile="k8s.mcp-agent.Dockerfile",
        build_context=".",
        port=8000,
        replicas=1,
        health_path="/health",
        version_path="/health",
        domain="darcy-nofluxo.crianex.com",
        app_class="non-business",
        deploy_env_keys=(
            "MARITACA_API_KEY",
            "GOOGLE_API_KEY",
            "SUPABASE_URL",
            "SUPABASE_SERVICE_ROLE_KEY",
            "MCP_AGENT_API_KEY",
        ),
        deploy_env_optional_keys=("GIT_SHA",),
        deploy_env_static={
            "ALLOWED_ORIGINS": "https://no-fluxo.crianex.com,https://api-nofluxo.crianex.com",
        },
    ),
}


def get_app_config(key: str) -> AppConfig:
    """Get app config by key."""
    if key not in APPS:
        raise ValueError(f"Unknown app: {key}. Available: {list(APPS.keys())}")
    return APPS[key]
