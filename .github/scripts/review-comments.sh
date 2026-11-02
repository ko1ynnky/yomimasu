#!/usr/bin/env bash
# review.yml が書いたレビューのコメントだけを取り出す。gh pr view --json comments の結果を標準入力で受ける。
# 印は誰でも書けるので、書いた人も見る。ほかの人の文を、レビューの指摘として Claude に渡さない。
set -euo pipefail

jq '[.comments[]
  | select((.author.login | test("^github-actions(\\[bot\\])?$")) and (.body | startswith("<!-- review-gate -->")))
  | .body]'
