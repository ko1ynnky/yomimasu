#!/usr/bin/env bash
# review.yml の結果を PR に書き、修正、人への引き渡し、自動マージのどれかへ進める。
# 環境変数 PR、OWNER、OUTPUT を受ける。OUTPUT は review-pr のスキルが返す JSON である。
set -euo pipefail

MAX_ROUNDS=3

hand_over() {
  printf '::error::%s\n' "$1"
  gh pr edit "$PR" --add-label needs-human
  exit 1
}

# 起動の時点のラベルは古くなるので、マージの直前に読み直す。
# PR のラベルは Claude が付けるので、ユーザーの Issue のラベルと照らす。
may_merge() {
  local pull stops issues issue
  pull=$(gh pr view "$PR" --json labels,closingIssuesReferences)
  stops=$(gh issue list --state open --label stop --json number)
  issues=$(
    for issue in $(jq -r '.closingIssuesReferences[].number' <<<"$pull"); do
      gh issue view "$issue" --json author,labels
    done | jq -s .
  )
  jq -e --arg owner "$OWNER" --argjson issues "$issues" --argjson stops "$stops" '
    def names: [.labels[].name];
    ($stops | length) == 0
    and (names | index("go:merge") != null)
    and (names | index("needs-human") == null)
    and ($issues | length) > 0
    and ($issues | all(.author.login == $owner and (names | index("go:merge") != null)))
  ' <<<"$pull" >/dev/null
}

round=$(gh pr view "$PR" --json comments | bash "$(dirname "$0")/review-round.sh")
if ((round > MAX_ROUNDS)); then
  hand_over 'レビューの上限を超えたので人に渡します。'
fi

blocking=$(jq -er '.blocking | numbers' <<<"${OUTPUT:-}" 2>/dev/null) || hand_over 'レビューの結果を読めないので人に渡します。'
minor=$(jq -er '.minor | numbers' <<<"$OUTPUT")

{
  printf '<!-- review-gate -->\n\n'
  jq -r .report <<<"$OUTPUT"
} | gh pr comment "$PR" --body-file -

if ((blocking > 0)) && ((round == MAX_ROUNDS)); then
  hand_over '止める指摘が残ったので人に渡します。'
fi

# 軽い指摘もマージは止めないが、答えは求める。上限まで来たら、残りは人が読む。
if ((blocking > 0 || (minor > 0 && round < MAX_ROUNDS))); then
  gh workflow run auto.yml -f pr="$PR"
  exit 1
fi

if may_merge; then
  gh pr merge "$PR" --auto --squash || hand_over '自動マージを有効にできなかったので人に渡します。'
fi
