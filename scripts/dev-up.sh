#!/usr/bin/env bash
set -euo pipefail

# R360 Flow - Development Environment Startup
# Starts Docker Compose services and waits for health checks

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INFRA_DIR="$SCRIPT_DIR/../infrastructure"

echo "Starting R360 Flow development services..."

# Start containers in detached mode
docker compose -f "$INFRA_DIR/docker-compose.yml" up -d

echo "Waiting for services to become healthy..."

# Wait for PostgreSQL health check
echo -n "  PostgreSQL: "
retries=0
max_retries=30
until docker exec r360-postgres pg_isready -U r360 -d r360flow > /dev/null 2>&1; do
  retries=$((retries + 1))
  if [ "$retries" -ge "$max_retries" ]; then
    echo "FAILED (timed out after ${max_retries} attempts)"
    echo "Check logs: docker compose -f $INFRA_DIR/docker-compose.yml logs postgres"
    exit 1
  fi
  sleep 1
done
echo "OK"

# Wait for Redis health check
echo -n "  Redis:      "
retries=0
until docker exec r360-redis redis-cli ping > /dev/null 2>&1; do
  retries=$((retries + 1))
  if [ "$retries" -ge "$max_retries" ]; then
    echo "FAILED (timed out after ${max_retries} attempts)"
    echo "Check logs: docker compose -f $INFRA_DIR/docker-compose.yml logs redis"
    exit 1
  fi
  sleep 1
done
echo "OK"

echo ""
echo "All services are healthy!"
echo "  PostgreSQL: localhost:5432 (user: r360, db: r360flow)"
echo "  Redis:      localhost:6379"
echo ""
echo "To stop: docker compose -f $INFRA_DIR/docker-compose.yml down"
