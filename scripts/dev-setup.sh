#!/usr/bin/env bash
set -euo pipefail

# R360 Flow — Development Setup
# Starts Docker services, creates tables, seeds dev data

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

info()  { echo -e "${GREEN}[+]${NC} $1"; }
warn()  { echo -e "${YELLOW}[!]${NC} $1"; }
error() { echo -e "${RED}[x]${NC} $1"; }

echo ""
echo "  R360 Flow — Development Setup"
echo "  ==============================="
echo ""

# ── 1. Check prerequisites ──────────────────────────────────────────
info "Checking prerequisites..."

command -v docker >/dev/null 2>&1 || { error "Docker is required but not installed."; exit 1; }
command -v pnpm >/dev/null 2>&1   || { error "pnpm is required but not installed."; exit 1; }
command -v node >/dev/null 2>&1   || { error "Node.js is required but not installed."; exit 1; }

# ── 2. Create .env if it doesn't exist ──────────────────────────────
if [ ! -f "$PROJECT_ROOT/.env" ]; then
  info "Creating .env from .env.example..."
  cp "$PROJECT_ROOT/.env.example" "$PROJECT_ROOT/.env"
else
  info ".env already exists, skipping."
fi

# Source env vars
set -a
source "$PROJECT_ROOT/.env"
set +a

# ── 3. Start Docker services ────────────────────────────────────────
info "Starting Docker services (PostgreSQL + Redis)..."
docker compose -f "$PROJECT_ROOT/infrastructure/docker-compose.yml" up -d

# ── 4. Wait for PostgreSQL ──────────────────────────────────────────
info "Waiting for PostgreSQL to be ready..."
RETRIES=30
until docker exec r360-postgres pg_isready -U r360 -d r360flow >/dev/null 2>&1; do
  RETRIES=$((RETRIES - 1))
  if [ $RETRIES -le 0 ]; then
    error "PostgreSQL did not become ready in time."
    exit 1
  fi
  sleep 1
done
info "PostgreSQL is ready."

# ── 5. Wait for Redis ───────────────────────────────────────────────
info "Waiting for Redis to be ready..."
RETRIES=15
until docker exec r360-redis redis-cli ping >/dev/null 2>&1; do
  RETRIES=$((RETRIES - 1))
  if [ $RETRIES -le 0 ]; then
    error "Redis did not become ready in time."
    exit 1
  fi
  sleep 1
done
info "Redis is ready."

# ── 6. Install dependencies ─────────────────────────────────────────
info "Installing dependencies..."
cd "$PROJECT_ROOT"
pnpm install

# ── 7. Build packages ───────────────────────────────────────────────
info "Building packages..."
pnpm build

# ── 8. Create tables and seed data ──────────────────────────────────
info "Creating tables and seeding dev data..."
pnpm tsx "$PROJECT_ROOT/scripts/seed.ts"

echo ""
info "Setup complete!"
echo ""
echo "  To start the API server:        pnpm dev"
echo "  To start the frontend:          cd workflowbuilder && pnpm dev"
echo "  To open Drizzle Studio:         pnpm db:studio"
echo ""
echo "  Dev login credentials:"
echo "    Email:    admin@r360.dev"
echo "    Password: (any — dev mode accepts all)"
echo ""
echo "  Services:"
echo "    API server:    http://localhost:3100"
echo "    Frontend:      http://localhost:4200"
echo "    PostgreSQL:    localhost:5432"
echo "    Redis:         localhost:6379"
echo ""
