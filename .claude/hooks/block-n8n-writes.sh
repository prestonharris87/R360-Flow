#!/bin/bash
# block-n8n-writes.sh
# PreToolUse hook: blocks Write and Edit tool calls targeting the n8n/ directory.
# Enforces the Cardinal Rule — n8n/ is a read-only reference copy.

INPUT=$(cat /dev/stdin)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

if [ -z "$FILE_PATH" ]; then
  exit 0
fi

# Resolve to absolute path for reliable matching
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
N8N_DIR="$PROJECT_DIR/n8n/"

# Check if the file path is within the n8n directory
case "$FILE_PATH" in
  */R360-Flow/n8n/*|*/R360-Flow/n8n)
    echo "CARDINAL RULE VIOLATION: Cannot write to n8n/ directory. It is a read-only reference copy, not a build dependency. See plan-overview.md." >&2
    exit 2
    ;;
esac

# Also catch relative paths
case "$FILE_PATH" in
  n8n/*|./n8n/*)
    echo "CARDINAL RULE VIOLATION: Cannot write to n8n/ directory. It is a read-only reference copy, not a build dependency. See plan-overview.md." >&2
    exit 2
    ;;
esac

exit 0
