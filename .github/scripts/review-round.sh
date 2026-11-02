#!/usr/bin/env bash
# 次のレビューが何回目かを出す。gh pr view --json comments の結果を標準入力で受ける。
set -euo pipefail

jq '[.comments[].body | select(contains("<!-- review-gate -->"))] | length + 1'
