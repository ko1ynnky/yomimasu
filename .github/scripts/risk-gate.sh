#!/usr/bin/env bash
# go:merge の PR が許可の外を触っていれば失敗する。
# 変わったパスを標準入力から受け、許可の一覧のパスを第1引数で受ける。
set -euo pipefail

allowlist=$1
outside=()

is_allowed() {
  local pattern
  while IFS= read -r pattern; do
    [[ -z $pattern || $pattern == \#* ]] && continue
    # shellcheck disable=SC2053
    [[ $1 == $pattern ]] && return 0
  done <"$allowlist"
  return 1
}

while IFS= read -r path; do
  [[ -z $path ]] && continue
  is_allowed "$path" || outside+=("$path")
done

if ((${#outside[@]} > 0)); then
  printf '許可の外を触っています：\n' >&2
  printf '%s\n' "${outside[@]}" >&2
  exit 1
fi
