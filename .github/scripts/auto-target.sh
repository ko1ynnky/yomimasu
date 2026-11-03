#!/usr/bin/env bash
# この実行で進めるものを1つ決め、GITHUB_OUTPUT に pr=<番号> か issue=<番号> を書く。なければ何も書かない。
# 環境変数 OWNER、PR、DAILY_LIMIT を受ける。PR は review-gate.sh が修正を起こすときに渡す番号である。
# 保留の実行は、あとから来た起動に押し出されて消える。起動のきっかけに頼らず、毎回いまの状態から選び直す。
set -euo pipefail

here=$(dirname "$0")
today=${TODAY:-$(TZ=Asia/Tokyo date +%F)}

stops=$(gh issue list --state open --label stop --json number)
if [[ $(jq length <<<"$stops") != 0 ]]; then
  echo '開いている Issue に stop があるので始めません。'
  exit 0
fi

claude_pr='(.author.login | test("^(app/)?claude(\\[bot\\])?$")) and ([.labels[].name] | index("needs-human") == null)'

if [[ -n ${PR:-} ]]; then
  [[ $PR =~ ^[0-9]+$ ]] || { echo '::error::PR の番号の形が違います。'; exit 1; }
  ready=$(gh pr view "$PR" --json state,labels,author | jq ".state == \"OPEN\" and $claude_pr")
  [[ $ready == true ]] || { echo "PR #$PR は修正の対象ではありません。"; exit 0; }
  echo "pr=$PR" >>"$GITHUB_OUTPUT"
  exit 0
fi

# review-gate は、修正を起こしたときは赤で終わり、人に渡したときは needs-human も付ける。
# 最新の review-gate が赤で needs-human のない PR は、起こした修正がまだ動いていない PR である。
# ラベルを付けられずに赤で終わった PR や、人が needs-human を外した PR を回し続けないよう、レビューの回数も見る。
max_rounds=$(sed -n 's/^MAX_ROUNDS=//p' "$here/review-gate.sh")
waiting=$(gh pr list --state open --limit 100 --json number,author,labels,statusCheckRollup | jq -r "
  map(select($claude_pr
    and ([.statusCheckRollup[] | select(.workflowName == \"review\" and .name == \"review-gate\")]
      | max_by(.startedAt) | .conclusion == \"FAILURE\")))
  | sort_by(.number) | .[].number")
for pr in $waiting; do
  round=$(gh pr view "$pr" --json comments | bash "$here/review-round.sh")
  if ((round <= max_rounds)); then
    echo "pr=$pr" >>"$GITHUB_OUTPUT"
    exit 0
  fi
done

# Issue を始めるときに work の job が in-progress を付けるので、日本時間の今日に付けた回数を始めた件数とする。
# 失敗した実行も Claude の利用枠を使うので数える。PR の修正はレビューの回数で止まるので、上限に含めない。
started=0
for ((page = 1; ; page++)); do
  events=$(gh api "repos/{owner}/{repo}/issues/events?per_page=100&page=$page")
  # 新しい順でなければ、今日の分を読み落として上限が黙って外れる。数えられないときは始めない。
  if [[ $(jq '[.[].created_at] | . == (sort | reverse)' <<<"$events") != true ]]; then
    echo '::error::Issue のイベントが新しい順に並んでいないので、今日始めた件数を数えられません。始めません。'
    exit 1
  fi
  todays=$(jq --arg today "$today" '
    (("\($today)T00:00:00Z" | fromdateiso8601) - 9 * 3600) as $start
    | map(select((.created_at | fromdateiso8601) >= $start))' <<<"$events")
  count=$(jq 'map(select(.event == "labeled" and .label.name == "in-progress" and .actor.login == "github-actions[bot]")) | length' <<<"$todays")
  started=$((started + count))
  # 新しい順に返るので、ページが今日の分で埋まっているときだけ次のページに今日の分が残る。
  [[ $(jq length <<<"$todays") == 100 ]] || break
done
if ((started >= DAILY_LIMIT)); then
  echo "今日は $started 件を始めたので、上限の $DAILY_LIMIT 件に達しています。"
  exit 0
fi

issue=$(gh issue list --state open --limit 200 --json number,author,labels,body | bash "$here/auto-pick.sh" "$OWNER")
if [[ -n $issue ]]; then
  echo "issue=$issue" >>"$GITHUB_OUTPUT"
fi
