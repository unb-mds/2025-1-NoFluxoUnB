#!/usr/bin/env python3
"""
deploy_local.py — Build Docker images locally, push to registry, deploy via Deploy API.

This script is the recommended way to deploy from a developer machine when your
code is not yet pushed to Git (so in-cluster Kaniko builds can't reach it).

Workflow:
  1. docker build (optionally multi-arch via buildx)
  2. docker push to private registry
  3. Resolve the image digest (buildId) via Deploy API
  4. Deploy by buildId via Deploy API
  5. Stream logs until done

Copy this file together with deploy_config.py into your project and edit
deploy_config.py to match your applications.

Requirements:
  pip install requests python-dotenv   # python-dotenv is optional but recommended
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable

import requests

# Allow running from the script's directory without PYTHONPATH hacks.
SCRIPTS_DIR = Path(__file__).resolve().parent
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

from deploy_config import APPS, AppConfig, get_app_config  # noqa: E402


# ── Deploy API Client ──────────────────────────────────────────────────────


@dataclass(frozen=True)
class ApiError(RuntimeError):
    status_code: int
    url: str
    body: str


class DeployApiClient:
    """Thin wrapper around the Deploy API HTTP endpoints."""

    def __init__(self, api_url: str, api_key: str, timeout_s: float = 30.0) -> None:
        self._api_url = api_url.rstrip("/")
        self._timeout_s = timeout_s
        self._session = requests.Session()
        self._session.headers.update({"X-API-Key": api_key})

    def _url(self, path: str) -> str:
        if not path.startswith("/"):
            path = "/" + path
        return self._api_url + path

    def _request_json(
        self,
        method: str,
        path: str,
        *,
        params: dict[str, Any] | None = None,
        json_body: Any | None = None,
    ) -> Any:
        url = self._url(path)
        res = self._session.request(
            method, url, params=params, json=json_body, timeout=self._timeout_s
        )
        if not res.ok:
            raise ApiError(status_code=res.status_code, url=url, body=res.text)
        if res.status_code == 204:
            return None
        return res.json()

    def start_build(self, payload: dict[str, Any]) -> dict[str, Any]:
        return self._request_json("POST", "/build", json_body=payload)

    def wait_build(self, job_name: str, timeout_s: int = 1800) -> dict[str, Any]:
        return self._request_json(
            "POST", f"/build/{job_name}/wait", params={"timeout": timeout_s}
        )

    def get_build(self, job_name: str) -> dict[str, Any]:
        return self._request_json("GET", f"/build/{job_name}")

    def get_build_logs(self, job_name: str) -> str:
        res = self._request_json("GET", f"/build/{job_name}/logs")
        logs = res.get("logs") if isinstance(res, dict) else None
        return logs if isinstance(logs, str) else ""

    def resolve_digest(self, image_name: str, tag: str) -> str:
        result = self._request_json(
            "GET", f"/registry/{image_name}/digest", params={"tag": tag}
        )
        build_id = result.get("buildId") if isinstance(result, dict) else None
        if not build_id or not isinstance(build_id, str):
            raise RuntimeError("Unexpected response when resolving digest")
        return build_id


# ── Build ID State (local cache) ──────────────────────────────────────────


@dataclass
class BuildIdState:
    app: str | None = None
    namespace: str | None = None
    imageName: str | None = None
    imageTag: str | None = None
    buildId: str | None = None


def _default_state_path(app_key: str) -> Path:
    return Path(".deploy") / f"build-id.{app_key}.json"


def save_state(state: BuildIdState, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(state.__dict__, indent=2, sort_keys=True) + "\n", "utf-8"
    )


def load_state(path: Path) -> BuildIdState:
    raw = json.loads(path.read_text("utf-8"))
    if not isinstance(raw, dict):
        raise ValueError("State file is not a JSON object")
    return BuildIdState(
        app=raw.get("app"),
        namespace=raw.get("namespace"),
        imageName=raw.get("imageName"),
        imageTag=raw.get("imageTag"),
        buildId=raw.get("buildId"),
    )


# ── Shell / Docker helpers ─────────────────────────────────────────────────


@dataclass(frozen=True)
class CommandError(RuntimeError):
    cmd: list[str]
    exit_code: int
    stdout: str
    stderr: str


def run_cmd(cmd: list[str], *, cwd: Path | None = None) -> None:
    """Run a command while streaming combined stdout/stderr to the terminal."""
    proc = subprocess.Popen(
        cmd,
        cwd=str(cwd) if cwd else None,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        bufsize=1,
        universal_newlines=True,
    )

    output_lines: list[str] = []
    assert proc.stdout is not None
    try:
        for line in proc.stdout:
            output_lines.append(line)
            sys.stdout.write(line)
            sys.stdout.flush()
    except KeyboardInterrupt:
        proc.terminate()
        raise
    finally:
        try:
            proc.stdout.close()
        except Exception:
            pass

    exit_code = proc.wait()
    if exit_code != 0:
        out = "".join(output_lines)
        raise CommandError(cmd=cmd, exit_code=exit_code, stdout=out, stderr="")


BUILDX_BUILDER_NAME = "deploy-local-multiarch"


def _ensure_buildx_builder(docker_bin: str) -> str:
    """Ensure a buildx builder with the docker-container driver exists.

    The default 'docker' driver does not support multi-platform builds.
    This creates (or reuses) a builder named 'deploy-local-multiarch' that
    uses the 'docker-container' driver, which supports multi-arch.
    Returns the builder name to use with --builder.
    """
    # Check if our builder already exists
    try:
        result = subprocess.run(
            [docker_bin, "buildx", "inspect", BUILDX_BUILDER_NAME],
            capture_output=True,
            text=True,
        )
        if result.returncode == 0:
            # Builder exists; make sure it's running
            subprocess.run(
                [docker_bin, "buildx", "inspect", BUILDX_BUILDER_NAME, "--bootstrap"],
                capture_output=True,
                text=True,
            )
            return BUILDX_BUILDER_NAME
    except Exception:
        pass

    # Create a new builder with docker-container driver
    print(
        f"Creating buildx builder '{BUILDX_BUILDER_NAME}' (docker-container driver) for multi-platform builds..."
    )
    subprocess.run(
        [
            docker_bin,
            "buildx",
            "create",
            "--name",
            BUILDX_BUILDER_NAME,
            "--driver",
            "docker-container",
            "--bootstrap",
        ],
        check=True,
    )
    return BUILDX_BUILDER_NAME


def docker_build(
    docker_bin: str,
    *,
    image_ref: str,
    context_dir: Path,
    dockerfile: Path,
    build_args: Iterable[str] | None = None,
    push: bool = False,
    platforms: str | None = None,
) -> None:
    """Build a Docker image, optionally multi-arch via buildx.

    When platforms is specified (e.g. "linux/amd64,linux/arm64"), uses buildx.
    Multi-arch builds require --push (local daemon can only store one arch).
    A dedicated buildx builder with the docker-container driver is automatically
    created if needed (the default docker driver cannot do multi-platform builds).
    """
    if platforms:
        builder = _ensure_buildx_builder(docker_bin)
        cmd: list[str] = [
            docker_bin,
            "buildx",
            "build",
            "--builder",
            builder,
            "--platform",
            platforms,
            "-t",
            image_ref,
            "-f",
            str(dockerfile),
        ]
        if push:
            cmd.append("--push")
        else:
            print(
                "WARNING: Multi-platform build without --push; image won't be available locally"
            )
    else:
        cmd = [docker_bin, "build", "-t", image_ref, "-f", str(dockerfile)]

    if build_args:
        for arg in build_args:
            cmd.extend(["--build-arg", arg])
    cmd.append(str(context_dir))
    run_cmd(cmd)


def docker_push(docker_bin: str, *, image_ref: str) -> None:
    run_cmd([docker_bin, "push", image_ref])


# ── Environment variable helpers ───────────────────────────────────────────


def load_dotenv_if_present(path: Path, override: bool = False) -> None:
    """Load a .env file if it exists (requires python-dotenv)."""
    if not path.exists():
        return
    try:
        from dotenv import load_dotenv  # type: ignore

        load_dotenv(path, override=override)
    except Exception:
        return


def load_env_files(
    repo_root: Path, cfg: AppConfig | None, env_file: str | None
) -> None:
    """Load environment variables from multiple sources in priority order.

    1. Repo root .env.local  (lowest priority)
    2. Project-specific .env (e.g. frontend/.env)
    3. Custom --env-file     (highest priority)
    """
    load_dotenv_if_present(repo_root / ".env.local", override=False)

    if cfg:
        env_folder = cfg.env_folder if cfg.env_folder else cfg.build_context
        project_env = repo_root / env_folder / ".env"
        load_dotenv_if_present(project_env, override=True)

    if env_file:
        load_dotenv_if_present(Path(env_file), override=True)


def require_env(name: str) -> str:
    value = os.environ.get(name)
    if value is None or not value.strip():
        raise SystemExit(f"Missing required environment variable: {name}")
    return value.strip()


def _collect_build_args(cfg: AppConfig) -> list[str]:
    out: list[str] = []
    if cfg.build_arg_static:
        for key, value in cfg.build_arg_static.items():
            out.append(f"{key}={value}")
    for key in cfg.build_arg_keys:
        value = require_env(key)
        out.append(f"{key}={value}")
    for key in cfg.build_arg_optional_keys:
        value = os.environ.get(key, "").strip()
        if value:
            out.append(f"{key}={value}")
    return out


def _collect_deploy_env(cfg: AppConfig) -> dict[str, str] | None:
    env: dict[str, str] = {}
    if cfg.deploy_env_static:
        env.update(cfg.deploy_env_static)
    for key in cfg.deploy_env_keys:
        env[key] = require_env(key)
    for key in cfg.deploy_env_optional_keys:
        value = os.environ.get(key, "").strip()
        if value:
            env[key] = value

    if env:
        print("\n--- Deploy env vars ---")
        for key in sorted(env):
            print(f"  {key}: present")
        print("---\n")

    return env or None


# ── Payload builder ────────────────────────────────────────────────────────


def _deploy_payload(
    cfg: AppConfig, *, build_id: str, deploy_env: dict[str, str] | None
) -> dict[str, Any]:
    deploy_config: dict[str, Any] = {
        "port": int(cfg.port),
        "replicas": int(cfg.replicas),
        "healthPath": cfg.health_path,
        "tls": True,
    }
    if cfg.domains:
        deploy_config["domains"] = list(cfg.domains)
    elif cfg.domain:
        deploy_config["domain"] = cfg.domain
    if deploy_env:
        deploy_config["env"] = deploy_env

    # Include appClass for node scheduling (business vs non-business)
    app_class = getattr(cfg, "app_class", "business")
    if app_class:
        deploy_config["appClass"] = app_class

    return {
        "app": cfg.app_name,
        "namespace": cfg.namespace,
        "imageName": cfg.image_name,
        "buildId": build_id,
        "deploy": True,
        "deployConfig": deploy_config,
    }


# ── Log streaming ─────────────────────────────────────────────────────────


def stream_logs_until_done(
    client: DeployApiClient,
    *,
    job_name: str,
    poll_s: float = 3.0,
    timeout_s: int = 1800,
) -> dict[str, Any]:
    start = time.time()
    last_line_count = 0

    while True:
        if int(time.time() - start) >= timeout_s:
            raise SystemExit(f"Timed out after {timeout_s}s waiting for job {job_name}")

        logs = client.get_build_logs(job_name)
        if logs:
            current_line_count = len(logs.splitlines())
            if current_line_count > last_line_count:
                new_lines = logs.splitlines()[last_line_count:]
                for line in new_lines:
                    print(line)
                last_line_count = current_line_count

        status = client.get_build(job_name)
        st = status.get("status") if isinstance(status, dict) else None

        if st == "succeeded":
            return status
        if st == "failed":
            return status

        time.sleep(poll_s)


# ── Core workflows ─────────────────────────────────────────────────────────


def run_local_deploy(
    *,
    cfg: AppConfig,
    repo_root: Path,
    docker_bin: str,
    registry: str,
    tag: str | None,
    api_url: str,
    api_key: str,
    timeout_s: float,
    no_push: bool,
    dry_run: bool,
    wait: bool,
    wait_timeout: int,
    stream_logs: bool,
    state_file: Path | None,
    platforms: str | None = None,
) -> int:
    client = DeployApiClient(api_url, api_key, timeout_s=timeout_s)

    chosen_tag = tag or f"local-{int(time.time())}"
    image_ref = f"{registry.rstrip('/')}/{cfg.image_name}:{chosen_tag}"

    context_dir = (repo_root / cfg.build_context).resolve()
    dockerfile = (repo_root / cfg.dockerfile).resolve()

    build_args = _collect_build_args(cfg)
    deploy_env = _collect_deploy_env(cfg)

    effective_platforms = None if platforms == "native" else platforms
    use_buildx_push = effective_platforms is not None and not no_push

    if dry_run:
        print("DRY RUN")
        if effective_platforms:
            print(f"- Would docker buildx build (multi-arch): {image_ref}")
            print(f"  platforms: {effective_platforms}")
        else:
            print(f"- Would docker build: {image_ref}")
        print(f"  context: {context_dir}")
        print(f"  dockerfile: {dockerfile}")
        if build_args:
            print("  build args:")
            for arg in build_args:
                print(f"    - {arg.split('=', 1)[0]}=<set>")
        if use_buildx_push:
            print("- Push included in buildx build")
        elif not no_push:
            print(f"- Would docker push: {image_ref}")
        else:
            print("- Would skip docker push")
        print(f"- Would resolve digest via Deploy API: {cfg.image_name}:{chosen_tag}")
        payload_preview = _deploy_payload(
            cfg,
            build_id="sha256:<resolved>",
            deploy_env=(deploy_env and {k: "<set>" for k in deploy_env}),
        )
        print("- Would deploy with payload:")
        print(json.dumps(payload_preview, indent=2, sort_keys=True))
        return 0

    try:
        docker_build(
            docker_bin,
            image_ref=image_ref,
            context_dir=context_dir,
            dockerfile=dockerfile,
            build_args=build_args,
            push=use_buildx_push,
            platforms=effective_platforms,
        )
        if not no_push and not use_buildx_push:
            docker_push(docker_bin, image_ref=image_ref)
    except CommandError as e:
        print(
            "ERROR running local container build/push. "
            "Ensure Docker is installed and you are logged in to the registry (e.g. `docker login`).",
            file=sys.stderr,
        )
        print(f"Command: {' '.join(e.cmd)}\nExit code: {e.exit_code}", file=sys.stderr)
        if e.stdout:
            print(f"--- stdout ---\n{e.stdout}", file=sys.stderr)
        if e.stderr:
            print(f"--- stderr ---\n{e.stderr}", file=sys.stderr)
        return 2

    try:
        build_id = client.resolve_digest(cfg.image_name, chosen_tag)
    except ApiError as e:
        print(
            f"ERROR {e.status_code} resolving digest for {cfg.image_name}:{chosen_tag}:\n{e.body}",
            file=sys.stderr,
        )
        return 2

    state_path = state_file or _default_state_path(cfg.key)
    save_state(
        BuildIdState(
            app=cfg.app_name,
            namespace=cfg.namespace,
            imageName=cfg.image_name,
            imageTag=chosen_tag,
            buildId=build_id,
        ),
        state_path,
    )

    payload = _deploy_payload(cfg, build_id=build_id, deploy_env=deploy_env)

    try:
        res = client.start_build(payload)
    except ApiError as e:
        print(f"ERROR {e.status_code} calling {e.url}:\n{e.body}", file=sys.stderr)
        return 2

    print(json.dumps(res, indent=2, sort_keys=True))

    if not wait:
        return 0

    job_name = res.get("jobName") if isinstance(res, dict) else None
    if not isinstance(job_name, str) or not job_name:
        status = res.get("status") if isinstance(res, dict) else None
        success = res.get("success") if isinstance(res, dict) else None
        skipped = res.get("skipped") if isinstance(res, dict) else None
        if status == "succeeded" or success is True:
            if skipped is True:
                print(
                    "Info: build skipped; deploy completed immediately (no jobName to wait on)."
                )
            else:
                print("Info: deploy completed immediately (no jobName to wait on).")
            return 0
        print("WARNING: No jobName returned; cannot wait.")
        return 0

    if stream_logs:
        final_status = stream_logs_until_done(
            client, job_name=job_name, timeout_s=wait_timeout
        )
        st = final_status.get("status")
        if st == "failed":
            return 1
        return 0

    try:
        wait_res = client.wait_build(job_name, timeout_s=wait_timeout)
    except ApiError as e:
        print(
            f"ERROR {e.status_code} waiting for job {job_name}:\n{e.body}",
            file=sys.stderr,
        )
        return 2

    print(json.dumps(wait_res, indent=2, sort_keys=True))
    status = wait_res.get("status") if isinstance(wait_res, dict) else None
    return 1 if status == "failed" else 0


def run_redeploy(
    *,
    cfg: AppConfig,
    api_url: str,
    api_key: str,
    timeout_s: float,
    state_file: Path | None,
    wait: bool,
    wait_timeout: int,
    stream_logs: bool,
    dry_run: bool,
) -> int:
    client = DeployApiClient(api_url, api_key, timeout_s=timeout_s)

    state_path = state_file or _default_state_path(cfg.key)
    if not state_path.exists():
        raise SystemExit(f"State file not found: {state_path}")

    state = load_state(state_path)
    if not state.buildId:
        raise SystemExit(f"State file missing buildId: {state_path}")

    deploy_env = _collect_deploy_env(cfg)
    payload = _deploy_payload(cfg, build_id=state.buildId, deploy_env=deploy_env)

    if dry_run:
        print("DRY RUN")
        print("- Would redeploy using buildId from state file")
        print(json.dumps(payload, indent=2, sort_keys=True))
        return 0

    try:
        res = client.start_build(payload)
    except ApiError as e:
        print(f"ERROR {e.status_code} calling {e.url}:\n{e.body}", file=sys.stderr)
        return 2

    print(json.dumps(res, indent=2, sort_keys=True))

    if not wait:
        return 0

    job_name = res.get("jobName") if isinstance(res, dict) else None
    if not isinstance(job_name, str) or not job_name:
        status = res.get("status") if isinstance(res, dict) else None
        success = res.get("success") if isinstance(res, dict) else None
        skipped = res.get("skipped") if isinstance(res, dict) else None
        if status == "succeeded" or success is True:
            if skipped is True:
                print(
                    "Info: build skipped; deploy completed immediately (no jobName to wait on)."
                )
            else:
                print("Info: deploy completed immediately (no jobName to wait on).")
            return 0
        print("WARNING: No jobName returned; cannot wait.")
        return 0

    if stream_logs:
        final_status = stream_logs_until_done(
            client, job_name=job_name, timeout_s=wait_timeout
        )
        st = final_status.get("status")
        if st == "failed":
            return 1
        return 0

    try:
        wait_res = client.wait_build(job_name, timeout_s=wait_timeout)
    except ApiError as e:
        print(
            f"ERROR {e.status_code} waiting for job {job_name}:\n{e.body}",
            file=sys.stderr,
        )
        return 2

    print(json.dumps(wait_res, indent=2, sort_keys=True))
    status = wait_res.get("status") if isinstance(wait_res, dict) else None
    return 1 if status == "failed" else 0


# ── CLI ────────────────────────────────────────────────────────────────────


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="deploy_local",
        description="Local-deploy wrapper: docker build/push → resolve digest → deploy via Deploy API",
    )

    # ── NOTE: Update choices below to match the keys in deploy_config.APPS ──
    parser.add_argument(
        "target",
        choices=["backend", "frontend", "mcp-agent", "all"],
        help="Which app to deploy (must match a key in deploy_config.APPS, or 'all')",
    )

    parser.add_argument(
        "--env-file",
        default=None,
        help="Path to .env file (default: repo/.env.local if present)",
    )

    parser.add_argument(
        "--api-url",
        default=None,
        help="Deploy API base URL (or DEPLOY_API_URL env var)",
    )
    parser.add_argument(
        "--api-key", default=None, help="Deploy API key (or DEPLOY_API_KEY env var)"
    )
    parser.add_argument(
        "--timeout",
        type=float,
        default=None,
        help="HTTP timeout seconds (or DEPLOY_API_TIMEOUT)",
    )

    parser.add_argument(
        "--registry",
        default=None,
        help="Registry host (or DEPLOY_REGISTRY env var; default: registry.kubernetes.crianex.com)",
    )
    parser.add_argument(
        "--docker", default="docker", help="Docker CLI binary (default: docker)"
    )

    parser.add_argument(
        "--tag", default=None, help="Image tag to push (default: local-<timestamp>)"
    )
    parser.add_argument("--no-push", action="store_true", help="Build but do not push")

    parser.add_argument(
        "--platform",
        default="linux/amd64,linux/arm64",
        help=(
            "Target platform(s) for docker buildx "
            "(default: 'linux/amd64,linux/arm64' for multi-arch). "
            "Use 'native' for single-platform builds on current architecture. "
            "When multiple platforms are specified, --push is implied."
        ),
    )

    parser.add_argument(
        "--redeploy",
        action="store_true",
        help="Skip build/push; deploy using last stored buildId for this target",
    )
    parser.add_argument(
        "--state-file", default=None, help="Override build-id state file path"
    )

    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print what would happen without executing",
    )

    parser.add_argument("--wait", action=argparse.BooleanOptionalAction, default=True)
    parser.add_argument("--wait-timeout", type=int, default=1800)
    parser.add_argument(
        "--stream-logs", action=argparse.BooleanOptionalAction, default=True
    )

    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    repo_root = Path(__file__).resolve().parents[2]

    # Load repo root .env.local for deploy API credentials
    load_env_files(repo_root, cfg=None, env_file=args.env_file)

    api_url = (
        (args.api_url or os.environ.get("DEPLOY_API_URL") or "").strip().rstrip("/")
    )
    api_key = (args.api_key or os.environ.get("DEPLOY_API_KEY") or "").strip()

    if not api_url:
        raise SystemExit("Missing DEPLOY_API_URL (or --api-url)")
    if not api_key:
        raise SystemExit("Missing DEPLOY_API_KEY (or --api-key)")

    if args.timeout is not None:
        timeout_s = float(args.timeout)
    else:
        timeout_s = float(os.environ.get("DEPLOY_API_TIMEOUT") or 30.0)

    registry = (
        args.registry
        or os.environ.get("DEPLOY_REGISTRY")
        or "registry.kubernetes.crianex.com"
    )

    state_file = Path(args.state_file) if args.state_file else None

    # ── NOTE: Update the list below to match your deploy_config.APPS keys ──
    targets: list[str]
    if args.target == "all":
        targets = list(APPS.keys())  # deploy everything defined in deploy_config
    else:
        targets = [args.target]

    exit_code = 0
    for key in targets:
        cfg = get_app_config(key)
        print(f"=== Deploying {key} ({cfg.app_name}) ===")

        # Load project-specific .env file for this target
        load_env_files(repo_root, cfg=cfg, env_file=args.env_file)

        if args.redeploy:
            rc = run_redeploy(
                cfg=cfg,
                api_url=api_url,
                api_key=api_key,
                timeout_s=timeout_s,
                state_file=state_file,
                wait=bool(args.wait),
                wait_timeout=int(args.wait_timeout),
                stream_logs=bool(args.stream_logs),
                dry_run=bool(args.dry_run),
            )
        else:
            rc = run_local_deploy(
                cfg=cfg,
                repo_root=repo_root,
                docker_bin=str(args.docker),
                registry=str(registry),
                tag=args.tag,
                api_url=api_url,
                api_key=api_key,
                timeout_s=timeout_s,
                no_push=bool(args.no_push),
                dry_run=bool(args.dry_run),
                wait=bool(args.wait),
                wait_timeout=int(args.wait_timeout),
                stream_logs=bool(args.stream_logs),
                state_file=state_file,
                platforms=args.platform,
            )

        if rc != 0:
            exit_code = rc
            break

    return int(exit_code)


if __name__ == "__main__":
    raise SystemExit(main())
