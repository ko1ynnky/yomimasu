#!/usr/bin/env bash
# review.yml が書いたレビューのコメントだけを取り出す。gh pr view --json comments の結果を標準入力で受ける。
# 印は誰でも書けるので、書いた人も見る。ほかの人の文を、レビューの指摘として Claude に渡さない。
# --with-answers を付けると、指摘への Claude の答えも足す。
set -euo pipefail

with_answers=false
if [[ ${1:-} == --with-answers ]]; then
  with_answers=true
fi

jq --argjson with_answers "$with_answers" '[.comments[]
  | select(
      ((.author.login | test("^github-actions(\\[bot\\])?$")) and (.body | startswith("<!-- review-gate -->")))
      or ($with_answers and (.author.login | test("^(app/)?claude(\\[bot\\])?$"))))
  | .body]'
