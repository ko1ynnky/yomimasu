#!/usr/bin/env bash
# 追跡しているファイルに鍵があれば失敗する。hook と同じ形で見る。
# 環境変数 SCAN_BASE があれば、そこから HEAD までのコミットメッセージも見る。
# ログは公開されるので、一致した行は出さず、場所だけを出す。
set -euo pipefail

# shellcheck source=../../.claude/hooks/patterns.sh
source "$(dirname "$0")/../../.claude/hooks/patterns.sh"

failed=false

# -z を付けないと、日本語や引用符を含むパスが引用符付きで出て、ファイル名の一致を逃す。
files=$(git ls-files -z | tr '\0' '\n' | { grep -iE "$key_file" || true; } | { grep -ivE "$key_sample" || true; })
if [[ -n $files ]]; then
  printf '鍵のファイルがあります：\n%s\n' "$files" >&2
  failed=true
fi

# -a は .gitattributes でバイナリ扱いにしたファイルも読む。exit 1 は一致なしで、それ以外は検査の失敗である。
matches=$(git grep -naE -e "$secret") || [[ $? == 1 ]]
lines=$(cut -d: -f1,2 <<<"$matches")
if [[ -n $lines ]]; then
  printf '鍵らしい文字列があります：\n%s\n' "$lines" >&2
  failed=true
fi

if [[ -n ${SCAN_BASE:-} ]]; then
  range="$SCAN_BASE..HEAD"
  # 新しいブランチの push では base がすべて0になる。
  [[ $SCAN_BASE =~ ^0+$ ]] && range=HEAD
  commits=$(git rev-list "$range") || {
    echo 'no-secrets: SCAN_BASE を読めないので検査できません。' >&2
    exit 1
  }
  for commit in $commits; do
    message=$(git log -1 --format=%B "$commit")
    if grep -qE -e "$secret" <<<"$message"; then
      printf 'コミットメッセージに鍵らしい文字列があります：%s\n' "$commit" >&2
      failed=true
    fi
  done
fi

if [[ $failed == true ]]; then
  exit 1
fi
