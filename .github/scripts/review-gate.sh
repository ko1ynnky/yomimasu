#!/usr/bin/env bash
# review.yml の結果を PR に書き、修正、人への引き渡し、自動マージのどれかへ進める。
# 環境変数 PR、OWNER、OUTPUT を受ける。OUTPUT は review-pr のスキルが返す JSON である。
# 読めないまま進むと検査がないのと同じになるので、gh の失敗はすべて人に渡す。
set -euo pipefail

MAX_ROUNDS=3
here=$(dirname "$0")

hand_over() {
  printf '::error::%s\n' "$1"
  gh pr edit "$PR" --add-label needs-human
  exit 1
}

comments=$(gh pr view "$PR" --json comments) || hand_over 'PR のコメントを読めないので人に渡します。'
round=$(bash "$here/review-round.sh" <<<"$comments")
if ((round > MAX_ROUNDS)); then
  hand_over 'レビューの上限を超えたので人に渡します。'
fi

blocking=$(jq -er '.blocking | numbers' <<<"${OUTPUT:-}" 2>/dev/null) || hand_over 'レビューの結果を読めないので人に渡します。'
minor=$(jq -er '.minor | numbers' <<<"$OUTPUT") || hand_over 'レビューの結果を読めないので人に渡します。'

{
  printf '<!-- review-gate -->\n\n'
  jq -r .report <<<"$OUTPUT"
} | gh pr comment "$PR" --body-file - || hand_over 'レビューの結果を書けないので人に渡します。'

if ((blocking > 0)) && ((round == MAX_ROUNDS)); then
  hand_over '止める指摘が残ったので人に渡します。'
fi

# 軽い指摘もマージは止めないが、答えは求める。上限まで来たら、残りは人が読む。
if ((blocking > 0 || (minor > 0 && round < MAX_ROUNDS))); then
  gh workflow run auto.yml -f pr="$PR" || hand_over '修正を起こせないので人に渡します。'
  exit 1
fi

# 起動の時点のラベルは古くなるので、ここで読み直す。PR のラベルと本文は Claude が書くので、
# ユーザーの Issue の状態と、ブランチの Issue の番号で照らす。
pull=$(gh pr view "$PR" --json labels,closingIssuesReferences,headRefName) || hand_over 'PR を読めないので人に渡します。'
stops=$(gh issue list --state open --label stop --json number) || hand_over 'stop の一覧を読めないので人に渡します。'
issues='[]'
for number in $(jq -r '.closingIssuesReferences[].number' <<<"$pull"); do
  issue=$(gh issue view "$number" --json author,labels,number,state) || hand_over 'Issue を読めないので人に渡します。'
  issues=$(jq -c --argjson issue "$issue" '. + [$issue]' <<<"$issues")
done

decision=$(jq -r --arg owner "$OWNER" --argjson issues "$issues" --argjson stops "$stops" '
  def labeled($name): [.labels[].name] | index($name) != null;
  def branch_issue: (.headRefName | capture("^auto/issue-(?<number>[0-9]+)$").number | tonumber)? // null;
  if ($stops | length) > 0 then "hold"
  elif (labeled("go:merge") or any($issues[]; labeled("go:merge"))) | not then "hold"
  elif labeled("go:merge")
    and (labeled("needs-human") | not)
    and (branch_issue as $number | $number != null and any($issues[]; .number == $number))
    and all($issues[];
      .state == "OPEN"
      and .author.login == $owner
      and labeled("go:merge")
      and ((labeled("go:pr") or labeled("night") or labeled("needs-human")) | not))
  then "merge"
  else "hand-over"
  end
' <<<"$pull")

case $decision in
  merge)
    gh pr merge "$PR" --auto --squash || hand_over '自動マージを有効にできないので人に渡します。'
    printf 'merging=true\n' >>"$GITHUB_OUTPUT"
    ;;
  hold) ;;
  *) hand_over 'go:merge の条件が揃わないので人に渡します。' ;;
esac
