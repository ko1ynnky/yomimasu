#!/usr/bin/env bash
# 公開できない名前の一覧を環境変数 DENY_NAMES から読み、追跡しているファイルとコミットメッセージを調べる。
# SCAN_BASE があれば、そこから HEAD までのコミットメッセージも見る。
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

# -z を付けないと、日本語のパスが8進数の表記で出て、名前の一致を逃す。
path_hits=$(git ls-files -z | tr '\0' '\n' | { grep -ciF -f "$names" || true; })
if [[ $path_hits != 0 ]]; then
  printf 'ファイル名に公開できない名前があります：%s 件\n' "$path_hits" >&2
  failed=true
else
  # -a は .gitattributes でバイナリ扱いにしたファイルも読む。exit 1 は一致なしで、それ以外は検査の失敗である。
  matches=$(git grep -naiF -f "$names") || [[ $? == 1 ]]
  lines=$(cut -d: -f1,2 <<<"$matches")
  if [[ -n $lines ]]; then
    printf '公開できない名前があります：\n%s\n' "$lines" >&2
    failed=true
  fi
fi

if [[ -n ${SCAN_BASE:-} ]]; then
  range="$SCAN_BASE..HEAD"
  # 新しいブランチの push では base がすべて0になる。
  [[ $SCAN_BASE =~ ^0+$ ]] && range=HEAD
  commits=$(git rev-list "$range") || {
    echo 'deny-names: SCAN_BASE を読めないので検査できません。' >&2
    exit 1
  }
  for commit in $commits; do
    message=$(git log -1 --format=%B "$commit")
    if grep -qiF -f "$names" <<<"$message"; then
      printf 'コミットメッセージに公開できない名前があります：%s\n' "$commit" >&2
      failed=true
    fi
  done
fi

if [[ $failed == true ]]; then
  exit 1
fi
