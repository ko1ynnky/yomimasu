#!/usr/bin/env bash
# 自動マージのあと、GitHub が動かさない処理を Workflow の中で行う。失敗で終わると、次の step が PR を人に渡す。
# 環境変数 PR と SCAN_BASE を受ける。SCAN_BASE は ci.yml がコミットメッセージを見始めるコミットである。
# gh issue close は閉じた Issue でも成功するので、GitHub が閉じた場合も同じ結果になる。
set -euo pipefail

# マージは必須の検査の終わりを待つ。ci.yml で最も長いのは上限10分の e2e-shard と、そのあとに動く e2e なので、15分待つ。
MAX_POLLS=60
POLL_SECONDS=${POLL_SECONDS:-15}

for ((poll = 0; poll < MAX_POLLS; poll++)); do
  # 一時的な失敗で人に渡すと、マージされた PR の後始末が人の手に残る。読めない回は待ち続ける。
  pull=$(gh pr view "$PR" --json state,closingIssuesReferences) || pull='{}'
  state=$(jq -r .state <<<"$pull")
  [[ $state == OPEN || $state == null ]] || break
  sleep "$POLL_SECONDS"
done

case $state in
  MERGED) ;;
  CLOSED) exit 0 ;;
  *)
    echo '::error::マージを確かめられません。'
    exit 1
    ;;
esac

# マージのあとは戻せないので、1つの失敗で残りを止めず、すべて試してから失敗で終わる。
unfinished=false
gh workflow run ci.yml --ref main -f scan_base="$SCAN_BASE" || unfinished=true
for number in $(jq -r '.closingIssuesReferences[].number' <<<"$pull"); do
  if ! gh issue close "$number" || ! gh issue edit "$number" --remove-label in-progress; then
    unfinished=true
    gh issue edit "$number" --add-label needs-human || true
  fi
done

if [[ $unfinished == true ]]; then
  echo '::error::後始末を終えられません。'
  exit 1
fi
