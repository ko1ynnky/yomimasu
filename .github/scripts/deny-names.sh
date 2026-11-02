#!/usr/bin/env bash
# 公開できない名前の一覧を環境変数 DENY_NAMES から読み、追跡しているファイルとコミットメッセージを調べる。
# DENY_NAMES_BASE があれば、そこから HEAD までのコミットメッセージも見る。
# ログは公開されるので、名前が映る行もファイル名も出さず、場所と件数だけを出す。
set -euo pipefail

names=$(mktemp)
trap 'rm -f "$names"' EXIT

# 空の行は全行に一致するので外す。
printf '%s\n' "${DENY_NAMES:-}" | tr -d '\r' | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' | { grep -v '^$' || true; } >"$names"
if [[ ! -s $names ]]; then
  echo 'deny-names: DENY_NAMES が空なので検査できません。GitHub の secret に一覧を置きます。' >&2
  exit 1
fi

failed=false

path_hits=$(git ls-files | { grep -ciF -f "$names" || true; })
if [[ $path_hits != 0 ]]; then
  printf 'ファイル名に公開できない名前があります：%s 件\n' "$path_hits" >&2
  failed=true
else
  lines=$({ git grep -nIiF -f "$names" || true; } | cut -d: -f1,2)
  if [[ -n $lines ]]; then
    printf '公開できない名前があります：\n%s\n' "$lines" >&2
    failed=true
  fi
fi

if [[ -n ${DENY_NAMES_BASE:-} ]]; then
  while IFS= read -r commit; do
    message=$(git log -1 --format=%B "$commit")
    if grep -qiF -f "$names" <<<"$message"; then
      printf 'コミットメッセージに公開できない名前があります：%s\n' "$commit" >&2
      failed=true
    fi
  done < <(git rev-list "$DENY_NAMES_BASE..HEAD")
fi

if [[ $failed == true ]]; then
  exit 1
fi
