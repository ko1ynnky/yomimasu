#!/usr/bin/env bash
# 次のレビューが何回目かを出す。gh pr view --json comments の結果を標準入力で受ける。
set -euo pipefail

bash "$(dirname "$0")/review-comments.sh" | jq 'length + 1'
