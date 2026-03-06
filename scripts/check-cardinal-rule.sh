#!/usr/bin/env bash
set -euo pipefail

# Cardinal Rule Enforcement Script
# Ensures no source file in our packages imports from the n8n/ reference directory.
#
# What it checks:
#   - No import/require statements referencing '../n8n/', '../../n8n/', etc.
#   - No import/require statements referencing paths inside 'n8n/' source tree
#   - Only npm package imports (e.g., from 'n8n-workflow') are allowed
#
# Exit codes:
#   0 = PASSED (no violations)
#   1 = FAILED (violations found)

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VIOLATIONS=0

echo "=== Cardinal Rule Check ==="
echo "Scanning packages/ and workflowbuilder/ for n8n/ source imports..."

# Pattern 1: Relative imports into n8n/ directory
# Matches: from '../n8n/', from '../../n8n/', require('../n8n/')
if grep -rn --include='*.ts' --include='*.tsx' --include='*.js' --include='*.mjs' \
  -E "(from\s+['\"]\.\.?/.*n8n/|require\s*\(\s*['\"]\.\.?/.*n8n/)" \
  "$REPO_ROOT/packages/" "$REPO_ROOT/workflowbuilder/" 2>/dev/null; then
  echo ""
  echo "ERROR: Found relative imports into n8n/ source directory!"
  VIOLATIONS=$((VIOLATIONS + 1))
fi

# Pattern 2: Absolute imports referencing n8n source paths
# Matches: from 'n8n/packages/', require('n8n/packages/')
if grep -rn --include='*.ts' --include='*.tsx' --include='*.js' --include='*.mjs' \
  -E "(from\s+['\"]n8n/packages/|require\s*\(\s*['\"]n8n/packages/)" \
  "$REPO_ROOT/packages/" "$REPO_ROOT/workflowbuilder/" 2>/dev/null; then
  echo ""
  echo "ERROR: Found imports from n8n source paths!"
  VIOLATIONS=$((VIOLATIONS + 1))
fi

# Pattern 3: Path aliases that might resolve to n8n/
if grep -rn --include='*.ts' --include='*.tsx' --include='*.js' --include='*.mjs' \
  -E "(from\s+['\"]@n8n-src/|require\s*\(\s*['\"]@n8n-src/)" \
  "$REPO_ROOT/packages/" "$REPO_ROOT/workflowbuilder/" 2>/dev/null; then
  echo ""
  echo "ERROR: Found imports from n8n source aliases!"
  VIOLATIONS=$((VIOLATIONS + 1))
fi

if [ "$VIOLATIONS" -gt 0 ]; then
  echo ""
  echo "Cardinal Rule: FAILED ($VIOLATIONS violation pattern(s) found)"
  echo ""
  echo "REMINDER: n8n packages are UNMODIFIED npm dependencies."
  echo "Import from 'n8n-workflow', 'n8n-core', 'n8n-nodes-base', '@n8n/*' only."
  echo "The n8n/ directory is a READ-ONLY reference. Never import from it."
  exit 1
fi

echo ""
echo "Cardinal Rule: PASSED"
echo "All imports reference npm packages only. No n8n/ source imports detected."
exit 0
