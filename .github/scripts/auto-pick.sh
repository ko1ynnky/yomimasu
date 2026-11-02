#!/usr/bin/env bash
# 自動で進める Issue を1件選び、番号を出す。なければ何も出さない。
# gh issue list --state open --json number,author,labels,body の結果を標準入力で受け、
# ユーザーの GitHub の名前を第1引数で受ける。
set -euo pipefail

jq -r --arg owner "$1" '
  def names: [.labels[].name];
  def depends: [.body | scan("Depends: #([0-9]+)") | .[0] | tonumber];
  (map(.number)) as $open
  | if any(.[]; names | index("stop")) then empty else
      map(select(
        .author.login == $owner
        and (names | (index("go:merge") or index("go:pr")))
        and (names | (index("night") or index("needs-human") or index("in-progress")) | not)
        and (depends | all(. as $number | $open | index($number) | not))
      ))
      | sort_by(.number)
      | .[0].number // empty
    end
'
