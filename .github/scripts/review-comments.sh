#!/usr/bin/env bash
# review.yml が書いたレビューのコメントだけを取り出す。gh api --paginate repos/{owner}/{repo}/issues/<番号>/comments の結果を標準入力で受ける。
# 印は誰でも書けるので、書いた人も見る。ほかの人の文を、レビューの指摘として Claude に渡さない。
# 書いた人は REST の user の login と type で見る。gh pr view --json comments の author.login は、App も [bot] を外した名前で出すので、
# App と同じ名前の利用者と見分けられない。
# --with-answers を付けると、指摘への Claude の答えも足す。
set -euo pipefail

with_answers=false
if [[ ${1:-} == --with-answers ]]; then
  with_answers=true
fi

# gh の --paginate は、ページごとに別の配列を出すことがあるので、まとめてから読む。
jq -s --argjson with_answers "$with_answers" '[add[]
  | select(.user.type == "Bot" and (
      (.user.login == "github-actions[bot]" and (.body | startswith("<!-- review-gate -->")))
      or ($with_answers and .user.login == "claude[bot]")))
  | .body]'
