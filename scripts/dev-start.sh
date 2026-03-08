#!/usr/bin/env bash
set -euo pipefail

# R360 Flow — Start All Development Servers
# Starts API server, Frontend v1 (React), and Frontend v2 (Vue) simultaneously

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_ROOT"

echo ""
echo "Starting R360 Flow development servers..."
echo ""

# Check if Docker services are running
if ! docker compose -f infrastructure/docker-compose.yml ps --status running 2>/dev/null | grep -q "r360-postgres"; then
  echo "Starting Docker services (PostgreSQL + Redis)..."
  docker compose -f infrastructure/docker-compose.yml up -d
  sleep 3
fi

echo "┌──────────────────────────────────────────────────────┐"
echo "│              R360 Flow Dev Servers                   │"
echo "├──────────────┬───────────────────────────────────────┤"
echo "│ API Server   │ http://localhost:3100                 │"
echo "│ Frontend v1  │ http://localhost:4200  (React)        │"
echo "│ Frontend v2  │ http://localhost:4201  (Vue)          │"
echo "│ PostgreSQL   │ localhost:5432                        │"
echo "│ Redis        │ localhost:6379                        │"
echo "├──────────────┴───────────────────────────────────────┤"
echo "│ Login: admin@r360.dev / any password                 │"
echo "└──────────────────────────────────────────────────────┘"
echo ""
echo "Press Ctrl+C to stop all servers"
echo ""

# Start all three servers using concurrently
npx concurrently \
  --names "api,fe-v1,fe-v2" \
  --prefix-colors "blue,green,magenta" \
  --kill-others \
  "pnpm dev" \
  "cd workflowbuilder && pnpm --filter @workflow-builder/frontend dev" \
  "cd workflowbuilder && pnpm --filter @r360/frontend-v2 dev"
