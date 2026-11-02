#!/usr/bin/env bash
# 追跡しているファイルに鍵があれば失敗する。hook と同じ形で見る。
# ログは公開されるので、一致した行は出さず、場所だけを出す。
set -euo pipefail

# shellcheck source=../../.claude/hooks/patterns.sh
source "$(dirname "$0")/../../.claude/hooks/patterns.sh"

# 既定の設定では日本語のパスが引用符付きで出て、ファイル名の一致を逃す。
files=$(git -c core.quotePath=false ls-files | { grep -iE "$key_file" || true; } | { grep -ivE "$key_sample" || true; })
lines=$({ git grep -nIE -e "$secret" || true; } | cut -d: -f1,2)
if [[ -n $files || -n $lines ]]; then
  printf '鍵らしいものがあります：\n%s\n%s\n' "$files" "$lines" >&2
  exit 1
fi
