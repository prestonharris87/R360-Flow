---
description: Set up the R360 Flow development environment (Docker, deps, build, seed)
---

# Setup

Run the full development environment setup for R360 Flow.

This will:
1. Validate prerequisites (Docker, pnpm, Node.js)
2. Start PostgreSQL and Redis via Docker
3. Install all dependencies
4. Build all packages
5. Create database tables and seed dev data (including sample workflows)

## Run

Execute the setup script:

```bash
./scripts/dev-setup.sh
```

Report what happened — whether setup succeeded or if there were errors to fix.
