#!/usr/bin/env bash
# 追跡しているファイルに音声があれば失敗する。hook と同じ一覧で見る。
set -euo pipefail

# shellcheck source=../../.claude/hooks/patterns.sh
source "$(dirname "$0")/../../.claude/hooks/patterns.sh"

found=$(git ls-files | { grep -iE "$audio_ext" || true; })
if [[ -n $found ]]; then
  printf '音声ファイルはリポジトリに置けません：\n%s\n' "$found" >&2
  exit 1
fi
