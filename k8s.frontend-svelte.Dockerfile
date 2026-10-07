# NoFluxo Frontend (SvelteKit) Kubernetes Dockerfile
# adapter-static build → nginx serves pre-built HTML/CSS/JS

# ── Builder ────────────────────────────────────────────────────────────────
FROM node:20-bullseye AS builder

# Enable pnpm via corepack
RUN corepack enable && corepack prepare pnpm@10.12.1 --activate

WORKDIR /app

# Copy package files and postinstall script, then install dependencies
COPY frontend/package.json frontend/pnpm-lock.yaml ./
COPY frontend/scripts/ ./scripts/
RUN pnpm install --frozen-lockfile

# Copy source code (adapter-static is already in svelte.config.js)
COPY frontend/ ./

# Build-time environment variables (baked into the bundle via $env/static/public)
ARG PUBLIC_SUPABASE_URL
ARG PUBLIC_SUPABASE_ANON_KEY
ARG PUBLIC_API_URL=https://api-nofluxo.crianex.com
ARG PUBLIC_REDIRECT_URL=https://no-fluxo.crianex.com
ARG PUBLIC_ENVIRONMENT=production
# Commit publicado: vai para /health.json para o workflow confirmar o rollout
ARG GIT_SHA=

# Build the SvelteKit app (outputs to ./build as static files)
RUN pnpm build \
    && printf '{"status":"ok","commit":"%s"}\n' "$GIT_SHA" > build/health.json

# ── Production (nginx) ────────────────────────────────────────────────────
FROM nginx:1.27-alpine

# Copy static build output to nginx html root
COPY --from=builder /app/build /usr/share/nginx/html

# Add .mjs MIME type (not included in nginx-alpine by default)
RUN sed -i 's|application/javascript\s*js;|application/javascript js mjs;|' /etc/nginx/mime.types

# Custom nginx config for SPA routing + pre-compressed files
RUN cat > /etc/nginx/conf.d/default.conf <<'NGINX_CFG'
server {
    listen 3000;
    server_name _;
    root /usr/share/nginx/html;
    index index.html;

    # Increase buffer size for large auth headers/cookies (Supabase tokens)
    large_client_header_buffers 4 32k;

    # Serve pre-compressed gzip files (from adapter-static precompress)
    gzip_static on;

    # Cache static assets aggressively (hashed filenames from Vite)
    location /_app/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
        try_files $uri =404;
    }

    # Health check endpoint (static/health.json → build/health.json)
    location = /health.json {
        add_header Content-Type application/json;
        add_header Cache-Control "no-store";
        try_files /health.json =404;
    }

    # SPA fallback: all routes → index.html (client-side routing)
    location / {
        try_files $uri $uri/ /index.html;
    }
}
NGINX_CFG

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD wget -qO- http://localhost:3000/health.json || exit 1

CMD ["nginx", "-g", "daemon off;"]
