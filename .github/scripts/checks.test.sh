#!/usr/bin/env bash
# 実行：bash .github/scripts/checks.test.sh
set -u

scripts=$(cd "$(dirname "$0")" && pwd)
allowlist="$scripts/../risk-allowlist.txt"
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
failures=0

# 鍵の形をした文字列は、このファイル自体が鍵の検査に当たらないよう実行時に組み立てる。
filler=$(printf 'a%.0s' {1..40})
anthropic_key="sk-ant-""api03-$filler"
name='ナマエノレイ'

new_repo() {
  local repo
  repo=$(mktemp -d "$work/repo.XXXXXX")
  git -C "$repo" init -q
  git -C "$repo" config user.name test
  git -C "$repo" config user.email test@example.invalid
  # CI の既定の設定に揃える。手元の設定が false だと、日本語のパスの問題が隠れる。
  git -C "$repo" config core.quotepath true
  printf 'ok\n' >"$repo/README.md"
  git -C "$repo" add README.md
  git -C "$repo" commit -qm first
  printf '%s\n' "$repo"
}

plant() {
  mkdir -p "$(dirname "$1/$2")"
  printf '%s\n' "$3" >"$1/$2"
  git -C "$1" add -f "$2"
  git -C "$1" commit -qm "add ${4:-file}"
}

ng() {
  printf 'NG: %s\n' "$1"
  failures=$((failures + 1))
}

# 第1引数の結果（pass は成功、fail は検査の失敗、error は成功以外）になるか、ログに第3引数が出ないかを見る。
# 第4引数以降は検査のコマンドである。
expect() {
  local want=$1 what=$2 secret_text=$3 output code
  shift 3
  output=$("$@" 2>&1)
  code=$?
  if [[ $want == pass && $code != 0 ]] || [[ $want == fail && $code != 1 ]] || [[ $want == error && $code == 0 ]]; then
    ng "$what（期待 $want、exit $code、出力 $output）"
  fi
  if [[ -n $secret_text && $output == *"$secret_text"* ]]; then
    ng "$what（ログに公開しない文字列が出た）"
  fi
}

in_repo() {
  local repo=$1
  shift
  (cd "$repo" && "$@")
}

repo=$(new_repo)
expect pass 'no-audio: 音声がなければ通る' '' in_repo "$repo" bash "$scripts/no-audio.sh"
expect pass 'no-secrets: 鍵がなければ通る' '' in_repo "$repo" bash "$scripts/no-secrets.sh"

repo=$(new_repo)
plant "$repo" tests/a.wav x
expect fail 'no-audio: 音声を追跡していると落ちる' '' in_repo "$repo" bash "$scripts/no-audio.sh"

repo=$(new_repo)
plant "$repo" tests/A.WEBM x
expect fail 'no-audio: 大文字の拡張子でも落ちる' '' in_repo "$repo" bash "$scripts/no-audio.sh"

repo=$(new_repo)
plant "$repo" tests/録音.wav x
expect fail 'no-audio: 日本語のファイル名でも落ちる' '' in_repo "$repo" bash "$scripts/no-audio.sh"

repo=$(new_repo)
plant "$repo" 'tests/a"b.wav' x
expect fail 'no-audio: 引用符を含むファイル名でも落ちる' '' in_repo "$repo" bash "$scripts/no-audio.sh"

outside=$(mktemp -d "$work/outside.XXXXXX")
expect error 'no-audio: リポジトリの外では検査できないので通さない' '' in_repo "$outside" bash "$scripts/no-audio.sh"
expect error 'no-secrets: リポジトリの外では検査できないので通さない' '' in_repo "$outside" bash "$scripts/no-secrets.sh"
expect error 'deny-names: リポジトリの外では検査できないので通さない' '' in_repo "$outside" env DENY_NAMES="$name" bash "$scripts/deny-names.sh"

repo=$(new_repo)
plant "$repo" 設定/.env 'A=1'
expect fail 'no-secrets: 日本語のフォルダーの .env でも落ちる' '' in_repo "$repo" bash "$scripts/no-secrets.sh"

repo=$(new_repo)
plant "$repo" notes.md "key $anthropic_key"
expect fail 'no-secrets: 本文に鍵があると落ち、鍵をログに出さない' "$filler" in_repo "$repo" bash "$scripts/no-secrets.sh"

repo=$(new_repo)
plant "$repo" .env 'A=1'
expect fail 'no-secrets: .env を追跡していると落ちる' '' in_repo "$repo" bash "$scripts/no-secrets.sh"

repo=$(new_repo)
plant "$repo" .gitattributes '* -diff'
plant "$repo" notes.md "key $anthropic_key"
expect fail 'no-secrets: .gitattributes でバイナリ扱いにしても本文を見る' "$filler" in_repo "$repo" bash "$scripts/no-secrets.sh"

repo=$(new_repo)
base=$(git -C "$repo" rev-parse HEAD)
plant "$repo" docs/a.md 'ok' "$anthropic_key"
expect fail 'no-secrets: コミットメッセージの鍵も落とし、鍵をログに出さない' "$filler" in_repo "$repo" env SCAN_BASE="$base" bash "$scripts/no-secrets.sh"
expect fail 'no-secrets: 読めない SCAN_BASE は検査できないので落ちる' '' in_repo "$repo" env SCAN_BASE=missing bash "$scripts/no-secrets.sh"

repo=$(new_repo)
plant "$repo" .env.example 'A='
expect pass 'no-secrets: 見本のファイルは通る' '' in_repo "$repo" bash "$scripts/no-secrets.sh"

repo=$(new_repo)
expect fail 'deny-names: 一覧が空なら検査できないので落ちる' '' in_repo "$repo" env DENY_NAMES= bash "$scripts/deny-names.sh"
expect fail 'deny-names: 空行だけの一覧でも落ちる' '' in_repo "$repo" env DENY_NAMES=$'\n \n' bash "$scripts/deny-names.sh"
expect pass 'deny-names: 一致がなければ通る' '' in_repo "$repo" env DENY_NAMES="$name" bash "$scripts/deny-names.sh"
expect pass 'deny-names: 一覧の空行を全行の一致として扱わない' '' in_repo "$repo" env DENY_NAMES=$'\n'"$name"$'\r\n\n' bash "$scripts/deny-names.sh"

repo=$(new_repo)
plant "$repo" docs/a.md "文の中に$nameがある"
expect fail 'deny-names: 本文に名前があると落ち、名前をログに出さない' "$name" in_repo "$repo" env DENY_NAMES="$name" bash "$scripts/deny-names.sh"

repo=$(new_repo)
plant "$repo" docs/a.md 'Sample Name appears'
expect fail 'deny-names: 大文字と小文字の違いを無視する' 'Sample Name' in_repo "$repo" env DENY_NAMES='sample name' bash "$scripts/deny-names.sh"

repo=$(new_repo)
plant "$repo" .gitattributes '* -diff'
plant "$repo" docs/a.md "文の中に$nameがある"
expect fail 'deny-names: .gitattributes でバイナリ扱いにしても本文を見る' "$name" in_repo "$repo" env DENY_NAMES="$name" bash "$scripts/deny-names.sh"

repo=$(new_repo)
plant "$repo" "docs/$name.md" 'ok'
expect fail 'deny-names: ファイル名の一致も落とし、名前をログに出さない' "$name" in_repo "$repo" env DENY_NAMES="$name" bash "$scripts/deny-names.sh"

repo=$(new_repo)
base=$(git -C "$repo" rev-parse HEAD)
plant "$repo" docs/a.md 'ok' "$name"
expect fail 'deny-names: コミットメッセージの一致も落とす' "$name" in_repo "$repo" env DENY_NAMES="$name" SCAN_BASE="$base" bash "$scripts/deny-names.sh"
expect fail 'deny-names: 読めない SCAN_BASE は検査できないので落ちる' '' in_repo "$repo" env DENY_NAMES="$name" SCAN_BASE=missing bash "$scripts/deny-names.sh"
expect fail 'deny-names: 新しいブランチの push でもコミットを見落とさない' "$name" in_repo "$repo" env DENY_NAMES="$name" SCAN_BASE=0000000000000000000000000000000000000000 bash "$scripts/deny-names.sh"

# git grep だけを失敗させる。リポジトリの外の検査は git ls-files で先に止まり、この経路を通らない。
fake_bin=$(mktemp -d "$work/bin.XXXXXX")
cat >"$fake_bin/git" <<EOF
#!/usr/bin/env bash
if [[ \$1 == grep ]]; then exit 128; fi
exec "$(command -v git)" "\$@"
EOF
chmod +x "$fake_bin/git"
repo=$(new_repo)
expect fail 'no-secrets: git grep の失敗を一致なしとして通さない' '' in_repo "$repo" env PATH="$fake_bin:$PATH" bash "$scripts/no-secrets.sh"
expect fail 'deny-names: git grep の失敗を一致なしとして通さない' '' in_repo "$repo" env PATH="$fake_bin:$PATH" DENY_NAMES="$name" bash "$scripts/deny-names.sh"

# 第1引数の番号が選ばれるか（空なら何も選ばれないか）を見る。第3引数は Issue の一覧の JSON である。
picked() {
  local want=$1 what=$2 got
  got=$(printf '%s' "$3" | bash "$scripts/auto-pick.sh" owner 2>&1)
  if [[ $got != "$want" ]]; then
    ng "$what（期待 '$want'、結果 '$got'）"
  fi
}

issue() {
  local number=$1 labels=$2 author=${3:-owner} body=${4:-}
  jq -cn --argjson number "$number" --arg labels "$labels" --arg author "$author" --arg body "$body" \
    '{number: $number, author: {login: $author}, body: $body, labels: ($labels | split(",") | map(select(. != "") | {name: .}))}'
}

issues() {
  jq -cs '.' <<<"$*"
}

picked 1 'auto-pick: ラベルの付いた最も古い Issue を選ぶ' "$(issues "$(issue 2 go:pr)" "$(issue 1 go:merge)")"
picked '' 'auto-pick: Issue がなければ何も選ばない' '[]'
picked '' 'auto-pick: ラベルのない Issue は選ばない' "$(issues "$(issue 1 '')")"
picked '' 'auto-pick: night の Issue は選ばない' "$(issues "$(issue 1 night)")"
picked '' 'auto-pick: night と go:merge の両方があれば選ばない' "$(issues "$(issue 1 go:merge,night)")"
picked '' 'auto-pick: ユーザー以外の Issue は選ばない' "$(issues "$(issue 1 go:merge other)")"
picked 2 'auto-pick: needs-human の Issue は飛ばす' "$(issues "$(issue 1 go:merge,needs-human)" "$(issue 2 go:merge)")"
picked 2 'auto-pick: 進行中の Issue は飛ばす' "$(issues "$(issue 1 go:merge,in-progress)" "$(issue 2 go:merge)")"
picked '' 'auto-pick: 開いている Issue に stop があれば何も始めない' "$(issues "$(issue 1 go:merge)" "$(issue 2 stop)")"
picked 2 'auto-pick: Depends の相手が開いていれば飛ばす' "$(issues "$(issue 1 go:merge owner 'Depends: #3')" "$(issue 2 go:merge)" "$(issue 3 night)")"
picked 1 'auto-pick: Depends の相手が閉じていれば進める' "$(issues "$(issue 1 go:merge owner 'Depends: #9')")"

expect_round() {
  local got
  got=$(printf '%s' "$3" | bash "$scripts/review-round.sh" 2>&1)
  if [[ $got != "$1" ]]; then
    ng "$2（期待 $1、結果 $got）"
  fi
}

expect_round 1 'review-round: レビューのコメントがなければ1回目である' '{"comments":[]}'
expect_round 3 'review-round: Workflow が書いた印のコメントだけを数える' '{"comments":[{"author":{"login":"github-actions"},"body":"<!-- review-gate -->\nA"},{"author":{"login":"owner"},"body":"人のコメント"},{"author":{"login":"github-actions[bot]"},"body":"<!-- review-gate -->\nB"}]}'
expect_round 1 'review-round: 他の人が書いた印は数えない' '{"comments":[{"author":{"login":"someone"},"body":"<!-- review-gate -->\nA"}]}'
expect_round 1 'review-round: 印を引用しただけのコメントは数えない' '{"comments":[{"author":{"login":"github-actions"},"body":"前回の <!-- review-gate --> を引用"}]}'

comments=$(printf '%s' '{"comments":[{"author":{"login":"github-actions"},"body":"<!-- review-gate -->\n公式の指摘"},{"author":{"login":"someone"},"body":"<!-- review-gate -->\n偽の指摘"}]}' | bash "$scripts/review-comments.sh" 2>&1)
if [[ $comments != *公式の指摘* || $comments == *偽の指摘* ]]; then
  ng "review-comments: Workflow のコメントだけを渡す（出力 $comments）"
fi

history=$(printf '%s' '{"comments":[{"author":{"login":"github-actions"},"body":"<!-- review-gate -->\n公式の指摘"},{"author":{"login":"app/claude"},"body":"修正の答え"},{"author":{"login":"someone"},"body":"他人の文"}]}' | bash "$scripts/review-comments.sh" --with-answers 2>&1)
if [[ $history != *公式の指摘* || $history != *修正の答え* || $history == *他人の文* ]]; then
  ng "review-comments: 答えも渡すときは Claude の答えだけを足す（出力 $history）"
fi

# 実行の記録の見本。本文、コマンドの出力、最後の答えは、要約にも、取り出した記録にも出さない。
execution=$(mktemp "$work/execution.XXXXXX")
cat >"$execution" <<'EOF'
[
  {"type": "system", "subtype": "init", "cwd": "/home/runner/work/yomimasu"},
  {"type": "assistant", "message": {"content": [{"type": "text", "text": "非公開の本文"}, {"type": "tool_use", "name": "Skill", "input": {"skill": "verify"}}]}},
  {"type": "user", "message": {"content": [{"type": "tool_result", "content": "非公開の出力"}]}},
  {"type": "assistant", "message": {"content": [{"type": "tool_use", "name": "Bash", "input": {"command": "npm run check"}}, {"type": "tool_use", "name": "Skill", "input": {"skill": "yomimasu"}}]}},
  {"type": "assistant", "message": {"content": [{"type": "tool_use", "name": "Skill", "input": {"skill": "verify"}}]}},
  {"type": "result", "num_turns": 3, "result": "非公開の答え", "modelUsage": {"claude-x": {"inputTokens": 1, "outputTokens": 1}}},
  {"type": "result", "num_turns": 12, "result": "非公開の答え", "modelUsage": {"claude-opus-5-5": {"inputTokens": 10, "cacheReadInputTokens": 200, "cacheCreationInputTokens": 30, "outputTokens": 40}, "claude-haiku": {"inputTokens": 5, "outputTokens": 6}}}
]
EOF
summary_want='<!-- run-summary -->
実行の要約

- モデル：claude-haiku、claude-opus-5-5
- ターン数：12
- トークン：入力 245、出力 46
- スキル：verify、yomimasu'
summary=$(bash "$scripts/run-summary.sh" "$execution" 2>&1)
if [[ $summary != "$summary_want" ]]; then
  ng "run-summary: 最後の結果のモデル、ターン数、トークンと、使ったスキルを書く（出力 $summary）"
fi
extracted=$(mktemp "$work/extracted.XXXXXX")
bash "$scripts/run-summary.sh" --extract "$execution" >"$extracted" 2>&1
summary=$(bash "$scripts/run-summary.sh" "$extracted" 2>&1)
if [[ $summary != "$summary_want" ]]; then
  ng "run-summary: 取り出した記録から同じ要約を作る（出力 $summary）"
fi
if grep -q '非公開' "$extracted"; then
  ng 'run-summary: 取り出した記録に本文、コマンドの出力、答えを残さない'
fi

# 偽の gh は、呼ばれた引数を記録し、場面ごとの JSON を返す。
gh_bin=$(mktemp -d "$work/gh.XXXXXX")
cat >"$gh_bin/gh" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' "$*" >>"$GH_LOG"
case "$*" in
  'pr view 7 --json comments') cat "$GH_FIXTURES/comments.json" ;;
  'pr view 7 --json labels,closingIssuesReferences,headRefName') [[ ! -f $GH_FIXTURES/fail-pull ]] && cat "$GH_FIXTURES/pr.json" ;;
  'issue view 3 --json author,labels,number,state') [[ ! -f $GH_FIXTURES/fail-issue ]] && cat "$GH_FIXTURES/issue.json" ;;
  'issue list --state open --label stop --json number') cat "$GH_FIXTURES/stops.json" ;;
  'pr comment 7 --body-file -') cat >>"$GH_FIXTURES/posted.txt" ;;
  'pr merge 7 --auto --squash') [[ ! -f $GH_FIXTURES/fail-merge ]] ;;
  'workflow run auto.yml -f pr=7') [[ ! -f $GH_FIXTURES/fail-workflow ]] ;;
  'pr view 7 --json state,closingIssuesReferences')
    state=$(head -n 1 "$GH_FIXTURES/states")
    if (($(wc -l <"$GH_FIXTURES/states") > 1)); then
      sed -i.bak 1d "$GH_FIXTURES/states"
    fi
    [[ $state != UNREADABLE ]] && jq -cn --arg state "$state" '{state: $state, closingIssuesReferences: [{number: 3}, {number: 4}]}'
    ;;
  'issue close 3' | 'issue close 4') [[ ! -f $GH_FIXTURES/fail-close-$3 ]] ;;
  'issue edit 3 --remove-label in-progress' | 'issue edit 4 --remove-label in-progress') [[ ! -f $GH_FIXTURES/fail-unlabel-$3 ]] ;;
  'workflow run ci.yml --ref main -f scan_base=base-sha') [[ ! -f $GH_FIXTURES/fail-ci ]] ;;
esac
EOF
chmod +x "$gh_bin/gh"

# 引数：場面の名前、結果の JSON、回数、PR のラベル、Issue のラベル、stop の一覧。
# GATE_ISSUE の JSON は Issue の上書き、GATE_PR の JSON は PR の上書き、GATE_FAIL は失敗させる呼び出しである。
gate_run() {
  local fixtures round=$3
  fixtures=$(mktemp -d "$work/fixtures.XXXXXX")
  jq -cn --argjson n "$((round - 1))" '{comments: [range($n) | {author: {login: "github-actions"}, body: "<!-- review-gate -->"}]}' >"$fixtures/comments.json"
  jq -cn --arg labels "$4" --argjson over "${GATE_PR:-null}" '{headRefName: "auto/issue-3", labels: ($labels | split(",") | map(select(. != "") | {name: .})), closingIssuesReferences: [{number: 3}]} + ($over // {})' >"$fixtures/pr.json"
  jq -cn --arg labels "$5" --argjson over "${GATE_ISSUE:-null}" '{number: 3, state: "OPEN", author: {login: "owner"}, labels: ($labels | split(",") | map(select(. != "") | {name: .}))} + ($over // {})' >"$fixtures/issue.json"
  printf '%s' "${6:-[]}" >"$fixtures/stops.json"
  [[ -n ${GATE_FAIL:-} ]] && : >"$fixtures/fail-$GATE_FAIL"
  : >"$fixtures/gh.log"
  : >"$fixtures/output"
  gate_exit=0
  PATH="$gh_bin:$PATH" GH_LOG="$fixtures/gh.log" GH_FIXTURES="$fixtures" GITHUB_OUTPUT="$fixtures/output" PR=7 OWNER=owner OUTPUT="$2" bash "$scripts/review-gate.sh" >/dev/null 2>&1 || gate_exit=$?
  gate_log=$(cat "$fixtures/gh.log")
  gate_fixtures=$fixtures
}

clean='{"blocking":0,"minor":0,"existing":0,"report":"指摘なし"}'
minor='{"blocking":0,"minor":1,"existing":0,"report":"軽い 1件"}'
blocking='{"blocking":1,"minor":0,"existing":0,"report":"重要 1件"}'

expect_gate() {
  local what=$1 want_exit=$2 want=$3 unwanted=$4
  if [[ $gate_exit != "$want_exit" ]]; then
    ng "$what（期待 exit $want_exit、結果 exit $gate_exit、呼び出し $gate_log）"
  fi
  if [[ -n $want && $gate_log != *"$want"* ]]; then
    ng "$what（$want がない：$gate_log）"
  fi
  if [[ -n $unwanted && $gate_log == *"$unwanted"* ]]; then
    ng "$what（$unwanted がある：$gate_log）"
  fi
}

gate_run empty '' 1 go:merge go:merge
expect_gate 'review-gate: 結果が空なら人に渡し、マージしない' 1 'pr edit 7 --add-label needs-human' 'pr merge'
gate_run broken 'not json' 1 go:merge go:merge
expect_gate 'review-gate: 結果が壊れていれば人に渡す' 1 'pr edit 7 --add-label needs-human' 'pr merge'
gate_run past "$clean" 4 go:merge go:merge
expect_gate 'review-gate: 4回目は人に渡す' 1 'pr edit 7 --add-label needs-human' 'pr merge'

gate_run fix "$blocking" 1 go:merge go:merge
expect_gate 'review-gate: 止める指摘は修正を起こして赤にする' 1 'workflow run auto.yml -f pr=7' 'pr merge'
if ! grep -q '<!-- review-gate -->' "$gate_fixtures/posted.txt"; then
  ng 'review-gate: 印を付けて報告を書く'
fi
gate_run third "$blocking" 3 go:merge go:merge
expect_gate 'review-gate: 3回目に止める指摘が残れば人に渡す' 1 'pr edit 7 --add-label needs-human' 'workflow run'
gate_run minor "$minor" 1 go:merge go:merge
expect_gate 'review-gate: 軽い指摘にも答えを求める' 1 'workflow run auto.yml -f pr=7' 'pr merge'
gate_run minor-last "$minor" 3 go:merge go:merge
expect_gate 'review-gate: 3回目の軽い指摘は止めない' 0 'pr merge 7 --auto --squash' 'workflow run'

gate_run merge "$clean" 1 go:merge go:merge
expect_gate 'review-gate: 指摘がなく Issue も go:merge なら自動マージする' 0 'pr merge 7 --auto --squash' 'needs-human'
if [[ $(cat "$gate_fixtures/output") != merging=true ]]; then
  ng 'review-gate: 自動マージを有効にしたら後始末の job へ進める'
fi
gate_run pr-only "$clean" 1 go:pr go:pr
expect_gate 'review-gate: go:pr は緑で終え、マージしない' 0 '' 'pr merge'
if [[ -s $gate_fixtures/output ]]; then
  ng 'review-gate: マージしないなら後始末の job へ進めない'
fi
gate_run stopped "$clean" 1 go:merge go:merge '[{"number":9}]'
expect_gate 'review-gate: stop があれば緑で終え、マージしない' 0 '' 'pr merge'

hand_over='pr edit 7 --add-label needs-human'
gate_run forged "$clean" 1 go:merge go:pr
expect_gate 'review-gate: PR だけ go:merge なら人に渡す' 1 "$hand_over" 'pr merge'
gate_run unlabeled "$clean" 1 '' go:merge
expect_gate 'review-gate: Issue だけ go:merge なら人に渡す' 1 "$hand_over" 'pr merge'
gate_run held "$clean" 1 go:merge,needs-human go:merge
expect_gate 'review-gate: needs-human の PR はマージしない' 1 '' 'pr merge'
gate_run both "$clean" 1 go:merge go:merge,go:pr
expect_gate 'review-gate: Issue に go:pr もあれば人に渡す' 1 "$hand_over" 'pr merge'
gate_run night "$clean" 1 go:merge go:merge,night
expect_gate 'review-gate: Issue に night があれば人に渡す' 1 "$hand_over" 'pr merge'
gate_run issue-held "$clean" 1 go:merge go:merge,needs-human
expect_gate 'review-gate: 失敗した実行の Issue の PR はマージしない' 1 "$hand_over" 'pr merge'
GATE_ISSUE='{"author":{"login":"other"}}' gate_run author "$clean" 1 go:merge go:merge
expect_gate 'review-gate: Issue の作者が違えば人に渡す' 1 "$hand_over" 'pr merge'
GATE_ISSUE='{"state":"CLOSED"}' gate_run closed "$clean" 1 go:merge go:merge
expect_gate 'review-gate: 閉じた Issue では人に渡す' 1 "$hand_over" 'pr merge'
GATE_PR='{"closingIssuesReferences":[]}' gate_run none "$clean" 1 go:merge go:merge
expect_gate 'review-gate: 閉じる Issue がなければ人に渡す' 1 "$hand_over" 'pr merge'
GATE_PR='{"headRefName":"auto/issue-5"}' gate_run other "$clean" 1 go:merge go:merge
expect_gate 'review-gate: ブランチの Issue を閉じない PR は人に渡す' 1 "$hand_over" 'pr merge'

GATE_FAIL=merge gate_run merge-fails "$clean" 1 go:merge go:merge
expect_gate 'review-gate: 自動マージを有効にできなければ人に渡す' 1 "$hand_over" ''
if [[ -s $gate_fixtures/output ]]; then
  ng 'review-gate: 自動マージを有効にできなければ後始末の job へ進めない'
fi
GATE_FAIL=workflow gate_run workflow-fails "$blocking" 1 go:merge go:merge
expect_gate 'review-gate: 修正を起こせなければ人に渡す' 1 "$hand_over" ''
GATE_FAIL=issue gate_run issue-fails "$clean" 1 go:merge go:merge
expect_gate 'review-gate: Issue を読めなければ人に渡し、マージしない' 1 "$hand_over" 'pr merge'
GATE_FAIL=pull gate_run pull-fails "$clean" 1 go:merge go:merge
expect_gate 'review-gate: PR を読めなければ人に渡し、マージしない' 1 "$hand_over" 'pr merge'

# 引数：PR を読むたびに返す state を順に並べる。最後の値を返し続ける。UNREADABLE は読み取りの失敗である。
after_merge_run() {
  local fixtures
  fixtures=$(mktemp -d "$work/fixtures.XXXXXX")
  printf '%s\n' "$@" >"$fixtures/states"
  [[ -n ${GATE_FAIL:-} ]] && : >"$fixtures/fail-$GATE_FAIL"
  : >"$fixtures/gh.log"
  gate_exit=0
  PATH="$gh_bin:$PATH" GH_LOG="$fixtures/gh.log" GH_FIXTURES="$fixtures" PR=7 SCAN_BASE=base-sha POLL_SECONDS=0 bash "$scripts/after-merge.sh" >/dev/null 2>&1 || gate_exit=$?
  gate_log=$(cat "$fixtures/gh.log")
}

after_merge_run MERGED
expect_gate 'after-merge: マージされたら ci.yml を main で起こし、検査の起点を渡す' 0 'workflow run ci.yml --ref main -f scan_base=base-sha' 'needs-human'
for number in 3 4; do
  expect_gate 'after-merge: マージされたら閉じる Issue をすべて閉じる' 0 "issue close $number" ''
  expect_gate 'after-merge: マージされたら Issue の in-progress を外す' 0 "issue edit $number --remove-label in-progress" ''
done

after_merge_run OPEN OPEN MERGED
expect_gate 'after-merge: マージされるまで待つ' 0 'issue close 3' 'needs-human'
after_merge_run UNREADABLE MERGED
expect_gate 'after-merge: 読めない回があっても待ち続ける' 0 'issue close 3' 'needs-human'

after_merge_run CLOSED
expect_gate 'after-merge: マージせずに閉じた PR の Issue は閉じない' 0 '' 'issue close'
expect_gate 'after-merge: マージせずに閉じた PR では ci.yml を起こさない' 0 '' 'workflow run'
expect_gate 'after-merge: マージせずに閉じた PR は人に渡さない' 0 '' 'needs-human'

after_merge_run OPEN
expect_gate 'after-merge: マージされないままなら失敗で終わり、Issue を閉じない' 1 '' 'issue close'
after_merge_run UNREADABLE
expect_gate 'after-merge: 読めないままなら失敗で終わり、Issue を閉じない' 1 '' 'issue close'

GATE_FAIL=ci after_merge_run MERGED
expect_gate 'after-merge: ci.yml を起こせなくても Issue を閉じて、失敗で終わる' 1 'issue close 3' 'issue edit 3 --add-label needs-human'

GATE_FAIL=close-3 after_merge_run MERGED
expect_gate 'after-merge: 閉じられない Issue を人に渡す' 1 'issue edit 3 --add-label needs-human' ''
expect_gate 'after-merge: 閉じられない Issue があっても残りを閉じる' 1 'issue close 4' 'issue edit 4 --add-label needs-human'
expect_gate 'after-merge: 閉じられない Issue があっても ci.yml を起こす' 1 'workflow run ci.yml' ''

GATE_FAIL=unlabel-3 after_merge_run MERGED
expect_gate 'after-merge: in-progress を外せない Issue を人に渡す' 1 'issue edit 3 --add-label needs-human' 'issue edit 4 --add-label needs-human'

gate() { printf '%s\n' "$@" | bash "$scripts/risk-gate.sh" "$allowlist"; }

expect pass 'risk-gate: 変更がなければ通る' '' bash -c "bash '$scripts/risk-gate.sh' '$allowlist' </dev/null"
expect pass 'risk-gate: 許可の中だけなら通る' '' gate README.md test/site/render.test.ts docs/claude-log/2026-11-03.md
expect pass 'risk-gate: 画面の部品は通る' '' gate site/client/ui/band.tsx site/client/style.css
expect fail 'risk-gate: 測定のコードは止める' '' gate .claude/skills/yomimasu/scripts/measure.ts
expect fail 'risk-gate: 測定の定義は止める' '' gate docs/measure.md
expect fail 'risk-gate: 録音のコードは止める' '' gate site/client/capture.ts
expect fail 'risk-gate: 録音の画面は止める' '' gate site/client/recorder.tsx
expect fail 'risk-gate: 測定のテストは止める' '' gate test/measure/measure.test.ts
expect fail 'risk-gate: 録音の E2E は止める' '' gate e2e/record.spec.ts
expect fail 'risk-gate: 知識の文章は止める' '' gate content/index.md
expect fail 'risk-gate: Workflow は止める' '' gate .github/workflows/ci.yml
expect fail 'risk-gate: 依存の宣言は止める' '' gate package.json
expect fail 'risk-gate: ロックファイルは止める' '' gate package-lock.json
expect fail 'risk-gate: 1件でも外があれば止める' '' gate README.md wrangler.jsonc

# 平日の昼に順に進める自走の検査。上の auto-pick の補助を使う。
picked 1 'auto-pick: Depends の行がすべて閉じていれば進める' "$(issues "$(issue 1 go:merge owner $'Depends: #8\nDepends: #9')")"
picked 2 'auto-pick: Depends の行を全部読み、どれか1つでも開いていれば飛ばす' "$(issues "$(issue 1 go:merge owner $'Depends: #8\n本文\nDepends: #3')" "$(issue 2 go:merge)" "$(issue 3 night)")"
picked 2 'auto-pick: 改行が CRLF でも Depends を読む' "$(issues "$(issue 1 go:merge owner $'Depends: #8\r\nDepends: #3\r\n')" "$(issue 2 go:merge)" "$(issue 3 night)")"
picked 2 'auto-pick: Depends の1行に並べた番号もすべて読む' "$(issues "$(issue 1 go:merge owner 'Depends: #8, #3')" "$(issue 2 go:merge)" "$(issue 3 night)")"

# 自走の偽の gh は、上の review-gate の偽の gh と分けておく。呼ばれた引数を記録し、場面のファイルを返す。
auto_gh=$(mktemp -d "$work/auto-gh.XXXXXX")
cat >"$auto_gh/gh" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' "$*" >>"$GH_LOG"
case "$*" in
  'issue list --state open --label stop --json number') cat "$GH_FIXTURES/stops.json" ;;
  'issue list --state open --limit 200 --json number,author,labels,body') cat "$GH_FIXTURES/issues.json" ;;
  'pr list --state open --limit 100 --json number,author,labels,statusCheckRollup') jq 'map(del(.state))' "$GH_FIXTURES/pulls.json" ;;
  'pr view '*' --json state,labels,author') jq --argjson number "$3" '.[] | select(.number == $number)' "$GH_FIXTURES/pulls.json" ;;
  'pr view '*' --json comments') cat "$GH_FIXTURES/comments-$3.json" 2>/dev/null || printf '{"comments":[]}' ;;
  'api repos/{owner}/{repo}/issues/events?per_page=100&page='*)
    [[ ! -f $GH_FIXTURES/fail-events ]] || exit 1
    cat "$GH_FIXTURES/events-${2##*page=}.json" 2>/dev/null || printf '[]'
    ;;
  'workflow run auto.yml') [[ ! -f $GH_FIXTURES/fail-dispatch ]] ;;
  *) exit 64 ;;
esac
EOF
chmod +x "$auto_gh/gh"

# 引数：番号、review-gate の結果を古い順に並べたもの（IN_PROGRESS は実行中）、ラベル、作者。
pull() {
  local number=$1 gates=${2:-} labels=${3:-} author=${4:-app/claude}
  jq -cn --argjson number "$number" --arg gates "$gates" --arg labels "$labels" --arg author "$author" '
    {number: $number, state: "OPEN", author: {login: $author},
     labels: ($labels | split(",") | map(select(. != "") | {name: .})),
     statusCheckRollup: ([{__typename: "CheckRun", workflowName: "ci", name: "check", startedAt: "2026-11-03T00:30:00Z", status: "COMPLETED", conclusion: "FAILURE"}]
       + ($gates | split(",") | map(select(. != "")) | to_entries
         | map({__typename: "CheckRun", workflowName: "review", name: "review-gate",
                startedAt: "2026-11-03T0\(.key + 1):00:00Z",
                status: (if .value == "IN_PROGRESS" then "IN_PROGRESS" else "COMPLETED" end),
                conclusion: (if .value == "IN_PROGRESS" then "" else .value end)})
         | reverse))}'
}

# 引数：時刻（UTC）、ラベル、付けた人。GitHub は新しい順に返す。
event() {
  jq -cn --arg at "$1" --arg label "${2:-in-progress}" --arg actor "${3:-github-actions[bot]}" \
    '{event: "labeled", created_at: $at, label: {name: $label}, actor: {login: $actor}}'
}

# 引数：Issue の一覧、PR の一覧、events の1ページ目。今日は日本時間の 2026-11-03 とする。
auto_scene() {
  auto_dir=$(mktemp -d "$work/auto.XXXXXX")
  printf '%s' "${1:-[]}" >"$auto_dir/issues.json"
  printf '%s' "${2:-[]}" >"$auto_dir/pulls.json"
  printf '%s' "${3:-[]}" >"$auto_dir/events-1.json"
  printf '[]' >"$auto_dir/stops.json"
}

# 引数：PR の入力。GITHUB_OUTPUT に書いた中身を auto_out に入れる。上限は AUTO_LIMIT で変える。
auto_target() {
  : >"$auto_dir/gh.log"
  : >"$auto_dir/output"
  auto_exit=0
  PATH="$auto_gh:$PATH" GH_LOG="$auto_dir/gh.log" GH_FIXTURES="$auto_dir" GITHUB_OUTPUT="$auto_dir/output" \
    OWNER=owner PR="${1:-}" DAILY_LIMIT="${AUTO_LIMIT:-2}" TODAY=2026-11-03 \
    bash "$scripts/auto-target.sh" >/dev/null 2>&1 || auto_exit=$?
  auto_out=$(cat "$auto_dir/output")
}

expect_target() {
  local what=$1 want=$2 want_exit=${3:-0}
  if [[ $auto_out != "$want" || $auto_exit != "$want_exit" ]]; then
    ng "$what（期待 '$want' exit $want_exit、結果 '$auto_out' exit $auto_exit）"
  fi
}

# 自走が Issue を始めたときの変化を場面に足す。
auto_started() {
  jq --argjson number "$1" 'map(if .number == $number then .labels += [{name: "in-progress"}] else . end)' "$auto_dir/issues.json" >"$auto_dir/next.json"
  mv "$auto_dir/next.json" "$auto_dir/issues.json"
  jq --argjson event "$(event "$2")" '[$event] + .' "$auto_dir/events-1.json" >"$auto_dir/next.json"
  mv "$auto_dir/next.json" "$auto_dir/events-1.json"
}

open_issues=$(issues "$(issue 1 go:merge)" "$(issue 2 go:pr)" "$(issue 3 go:merge)")

auto_scene "$open_issues"
auto_target
expect_target 'auto-target: 上限の内なら最も古い Issue を選ぶ' 'issue=1'

auto_scene "$open_issues"
printf '[{"number":9}]' >"$auto_dir/stops.json"
auto_target
expect_target 'auto-target: stop があれば何も選ばない' ''

auto_scene "$open_issues" "$(issues "$(pull 5)")"
auto_target 5
expect_target 'auto-target: 渡された PR が Claude の開いた PR なら修正の対象にする' 'pr=5'
auto_scene "$open_issues" "$(issues "$(pull 5 '' needs-human)")"
auto_target 5
expect_target 'auto-target: 渡された PR に needs-human があれば何もしない' ''
auto_target '5;x'
expect_target 'auto-target: 渡された PR の番号の形が違えば失敗する' '' 1

auto_scene "$open_issues" "$(issues "$(pull 6 FAILURE)" "$(pull 5 FAILURE)")"
auto_target
expect_target 'auto-target: 修正を待つ PR を Issue より先に、古い順に選ぶ' 'pr=5'
auto_scene "$open_issues" "$(issues "$(pull 5 SUCCESS)")"
auto_target
expect_target 'auto-target: レビューが通った PR は修正の対象にしない' 'issue=1'
auto_scene "$open_issues" "$(issues "$(pull 5 FAILURE,IN_PROGRESS)")"
auto_target
expect_target 'auto-target: レビューの途中の PR は修正の対象にしない' 'issue=1'
auto_scene "$open_issues" "$(issues "$(pull 5 FAILURE,SUCCESS)")"
auto_target
expect_target 'auto-target: 前の回の赤ではなく、最新の review-gate を見る' 'issue=1'
auto_scene "$open_issues" "$(issues "$(pull 5 SUCCESS,FAILURE)")"
auto_target
expect_target 'auto-target: 最新の review-gate が赤なら修正の対象にする' 'pr=5'
auto_scene "$open_issues" "$(issues "$(pull 5 FAILURE needs-human)")"
auto_target
expect_target 'auto-target: needs-human の PR は修正の対象にしない' 'issue=1'
auto_scene "$open_issues" "$(issues "$(pull 5 FAILURE '' owner)")"
auto_target
expect_target 'auto-target: 人の PR は修正の対象にしない' 'issue=1'

# 引数：PR の番号、review.yml が書いたレビューの数。
reviews_done() {
  jq -n --argjson count "$2" '{comments: [range($count) | {author: {login: "github-actions[bot]"}, body: "<!-- review-gate -->"}]}' >"$auto_dir/comments-$1.json"
}
auto_scene "$open_issues" "$(issues "$(pull 5 FAILURE)")"
reviews_done 5 3
auto_target
expect_target 'auto-target: レビューの回数を使い切った PR は、needs-human がなくても修正の対象にしない' 'issue=1'
auto_scene "$open_issues" "$(issues "$(pull 5 FAILURE)")"
reviews_done 5 2
auto_target
expect_target 'auto-target: レビューの回数が残っている PR は修正の対象にする' 'pr=5'
auto_scene "$open_issues" "$(issues "$(pull 6 FAILURE)" "$(pull 5 FAILURE)")"
reviews_done 5 3
auto_target
expect_target 'auto-target: 回数を使い切った PR を飛ばし、次に古い PR を選ぶ' 'pr=6'

newest_in_middle=$(pull 5 SUCCESS,SUCCESS,FAILURE | jq -c '.statusCheckRollup |= (.[0:1] + [.[2], .[1], .[3]])')
auto_scene "$open_issues" "$(issues "$newest_in_middle")"
auto_target
expect_target 'auto-target: review-gate の結果の並びに頼らず、始めた時刻が最も新しいものを見る' 'pr=5'

auto_scene "$open_issues" "$(issues "$(pull 5 FAILURE)")"
printf '[{"number":9}]' >"$auto_dir/stops.json"
auto_target
expect_target 'auto-target: stop があれば、修正を待つ PR も選ばない' ''
auto_target 5
expect_target 'auto-target: stop があれば、渡された PR も修正しない' ''

today_twice=$(issues "$(event 2026-11-03T03:00:00Z)" "$(event 2026-11-03T01:00:00Z)")
auto_scene "$open_issues" '[]' "$today_twice"
auto_target
expect_target 'auto-target: 今日始めた件数が上限に達していれば Issue を始めない' ''
auto_scene "$open_issues" "$(issues "$(pull 5 FAILURE)")" "$today_twice"
auto_target
expect_target 'auto-target: 上限に達していても修正は進める' 'pr=5'
auto_scene "$open_issues" '[]' "$(issues "$(event 2026-11-02T23:00:00Z)" "$(event 2026-11-02T15:00:00Z)")"
auto_target
expect_target 'auto-target: 日本時間の今日の0時から数える' ''
auto_scene "$open_issues" '[]' "$(issues "$(event 2026-11-03T01:00:00Z)" "$(event 2026-11-02T14:59:59Z)" "$(event 2026-11-02T14:00:00Z)")"
auto_target
expect_target 'auto-target: 日本時間の前の日に始めた件数は数えない' 'issue=1'
auto_scene "$open_issues" '[]' "$(issues "$(event 2026-11-03T03:00:00Z in-progress owner)" "$(event 2026-11-03T02:00:00Z go:merge)" "$(event 2026-11-03T01:00:00Z)")"
auto_target
expect_target 'auto-target: 自走が付けた in-progress だけを数える' 'issue=1'
auto_scene "$open_issues" '[]' "$(issues "$(event 2026-11-03T01:00:00Z)" "$(event 2026-11-03T03:00:00Z)")"
auto_target
expect_target 'auto-target: events が新しい順でなければ、今日の件数を数えられないので始めない' '' 1
auto_scene "$open_issues" '[]' "$(jq -cn '[range(100) | {event: "labeled", created_at: "2026-11-03T05:00:00Z", label: {name: "go:pr"}, actor: {login: "owner"}}]')"
printf '%s' "$today_twice" >"$auto_dir/events-2.json"
auto_target
expect_target 'auto-target: 今日の分が1ページに収まらなければ次のページも読む' ''
auto_scene "$open_issues"
: >"$auto_dir/fail-events"
auto_target
expect_target 'auto-target: 今日の件数を読めなければ始めない' '' 1

# ラベルをまとめて付けると、保留の実行は新しい起動に押し出される。どの起動から始まっても、残りを古い順に1件ずつ拾う。
AUTO_LIMIT=5
auto_scene "$open_issues"
for number in 1 2 3; do
  auto_target
  expect_target "auto-target: まとめて付けた Issue を1件ずつ順に拾う（$number 件目）" "issue=$number"
  auto_started "$number" "2026-11-03T0${number}:00:00Z"
done
auto_target
expect_target 'auto-target: 拾い終えたら何も選ばない' ''
unset AUTO_LIMIT

# 引数：日本時間の曜日（1 が月曜）と時刻を続けた NOW。NEXT_FAIL を付けると起動に失敗させる。
next_run() {
  local dir
  dir=$(mktemp -d "$work/next.XXXXXX")
  : >"$dir/gh.log"
  [[ -n ${NEXT_FAIL:-} ]] && : >"$dir/fail-dispatch"
  next_exit=0
  PATH="$auto_gh:$PATH" GH_LOG="$dir/gh.log" GH_FIXTURES="$dir" NOW="$1" bash "$scripts/auto-next.sh" >/dev/null 2>&1 || next_exit=$?
  next_log=$(cat "$dir/gh.log")
}

expect_next() {
  local what=$1 want=$2 want_exit=${3:-0}
  if [[ $next_log != "$want" || $next_exit != "$want_exit" ]]; then
    ng "$what（期待 '$want' exit $want_exit、結果 '$next_log' exit $next_exit）"
  fi
}

next_run 31200
expect_next 'auto-next: 平日の昼なら次の実行を起こす' 'workflow run auto.yml'
next_run 10900
expect_next 'auto-next: 9:00 から起こす' 'workflow run auto.yml'
next_run 51830
expect_next 'auto-next: 18:30 まで起こす' 'workflow run auto.yml'
next_run 10859
expect_next 'auto-next: 9:00 より前は起こさない' ''
next_run 51831
expect_next 'auto-next: 18:30 を過ぎたら起こさない' ''
next_run 61200
expect_next 'auto-next: 土曜は起こさない' ''
next_run 71200
expect_next 'auto-next: 日曜は起こさない' ''
NEXT_FAIL=1 next_run 31200
expect_next 'auto-next: 起こせなければ失敗で終わる' 'workflow run auto.yml' 1

# Claude の step に渡すトークンが workflows の権限を求めていないことを、Workflow の書き方で確かめる。
# GITHUB_TOKEN は workflows を持てない。Claude の App は workflows: write を求めているので、App のトークンは
# additional_permissions で権限を書いて求めたときだけ、範囲が Workflow から決まる。交換のサーバーが求めたとおりに
# 絞るか、Claude が自分で別のトークンを取れないかは、この検査では分からない（docs/decisions.md の限界）。
# Claude の step ごとに、GITHUB_TOKEN を渡していれば github_token の値を、App のトークンなら求めた権限を1行で出す。
claude_tokens() {
  awk '
    function indent_of(line) { match(line, /^ */); return RLENGTH }
    function flush() {
      if (!inside) return
      print (token != "") ? token : "app:" perms
      inside = 0
    }
    /^[[:space:]]*$/ { next }
    {
      current = indent_of($0)
      if (block && current > block_indent) {
        line = $0
        gsub(/^[[:space:]]+|[[:space:]]+$/, "", line)
        perms = (perms == "") ? line : perms "," line
        next
      }
      block = 0
      if (inside && current <= step_indent) flush()
    }
    /uses:[[:space:]]*["\047]?anthropics\/claude-code-action(\/base-action)?@/ { inside = 1; step_indent = current; token = ""; perms = ""; next }
    inside && /^[[:space:]]*additional_permissions:[[:space:]]*\|/ { block = 1; block_indent = current; next }
    inside && /^[[:space:]]*github_token:/ { token = $0; sub(/^[[:space:]]*github_token:[[:space:]]*/, "", token); next }
    END { flush() }
  ' "$1"
}

app_token='app:contents: write,pull_requests: write,issues: write'
# 問題を1行ずつ出す。問題がなければ何も出さない。
token_problems() {
  local workflow=$1 tokens
  tokens=$(claude_tokens "$workflow")
  if [[ $(grep -cE "uses:[[:space:]]*[\"']?anthropics/claude-code-action(/base-action)?@" "$workflow") != $(grep -c . <<<"$tokens") ]]; then
    echo "Claude の step をすべて読めない（結果 $tokens）"
  fi
  while IFS= read -r token; do
    [[ -z $token || $token == '${{ github.token }}' || $token == "$app_token" ]] && continue
    echo "Claude には、GITHUB_TOKEN か、contents、pull_requests、issues だけを求めたトークンを渡す（結果 $token）"
  done <<<"$tokens"
}

for workflow in "$scripts"/../workflows/*.yml; do
  while IFS= read -r problem; do
    [[ -z $problem ]] || ng "token: $(basename "$workflow") の $problem"
  done <<<"$(token_problems "$workflow")"
done

# 検査そのものが壊れて何でも通すことのないよう、通してはいけない Workflow の見本で問題が出ることを確かめる。
claude_step() {
  printf 'jobs:\n  work:\n    steps:\n      - uses: %s\n        with:\n%s\n      - run: echo done\n' "$1" "$2"
}
bad_workflow=$(mktemp "$work/bad.XXXXXX")
for sample in \
  "anthropics/claude-code-action@abc|          additional_permissions: |\n            contents: write\n            workflows: write" \
  "anthropics/claude-code-action@abc|          prompt: hi" \
  "'anthropics/claude-code-action@abc'|          prompt: hi" \
  "anthropics/claude-code-action/base-action@abc|          prompt: hi" \
  "anthropics/claude-code-action@abc|          github_token: \${{ secrets.PAT }}"; do
  claude_step "${sample%%|*}" "$(printf '%b' "${sample#*|}")" >"$bad_workflow"
  [[ -n $(token_problems "$bad_workflow") ]] || ng "token: 通してはいけない Workflow を通した（${sample%%|*}、${sample#*|}）"
done

# 自走の実行で .claude/ の下の書き込みを確かめる PermissionRequest の hook。許すときだけ allow を出し、
# ほかは何も答えない。答えのない確認は -p の実行で拒まれる。
skill_project=$(mktemp -d "$work/project.XXXXXX")
mkdir -p "$skill_project/.claude/skills/yomimasu/scripts" "$skill_project/.claude/skills/yomimasu-other" \
  "$skill_project/.claude/skills/verify" "$skill_project/.claude/hooks"
touch "$skill_project/.claude/hooks/guard-files.sh"
ln -s ../../hooks "$skill_project/.claude/skills/yomimasu/linked"
ln -s ../../../hooks/guard-files.sh "$skill_project/.claude/skills/yomimasu/scripts/linked.sh"
ln -s ../yomimasu-other "$skill_project/.claude/skills/yomimasu/other-link"
# パスに .claude を含めずにスキルの中を指す入口。
ln -s .claude/skills/yomimasu "$skill_project/skill-link"
ln -s "$skill_project" "$work/project-alias"
# スキルのフォルダーそのものが .claude/hooks/ を指すプロジェクト。
linked_skill_project=$(mktemp -d "$work/project.XXXXXX")
mkdir -p "$linked_skill_project/.claude/skills" "$linked_skill_project/.claude/hooks"
ln -s ../hooks "$linked_skill_project/.claude/skills/yomimasu"

# 相対パスがこのリポジトリの本物のスキルに直らないよう、プロジェクトの中で動かす。
skill_write() {
  local project=$1 tool=$2 path=$3
  jq -n --arg tool "$tool" --arg path "$path" \
    '{hook_event_name: "PermissionRequest", tool_name: $tool, tool_input: {file_path: $path, content: "x"}}' |
    (
      cd "$skill_project" || exit 1
      if [[ -n $project ]]; then
        CLAUDE_PROJECT_DIR=$project bash "$scripts/allow-skill-write.sh"
      else
        env -u CLAUDE_PROJECT_DIR bash "$scripts/allow-skill-write.sh"
      fi
    )
}

# 第1引数は allow（許す）か none（答えない）。
expect_skill_write() {
  local want=$1 what=$2 output code got
  shift 2
  output=$(skill_write "$@" 2>&1)
  code=$?
  got=none
  if [[ -n $output ]]; then
    got=$(jq -r 'select(.hookSpecificOutput.hookEventName == "PermissionRequest") | .hookSpecificOutput.decision.behavior' <<<"$output" 2>/dev/null)
  fi
  if [[ $code != 0 || $got != "$want" ]]; then
    ng "allow-skill-write: $what（期待 $want、exit $code、出力 $output）"
  fi
}

skills=$skill_project/.claude/skills
expect_skill_write allow 'スキル yomimasu の下に新しいファイルを書ける' "$skill_project" Write "$skills/yomimasu/scripts/commands.ts"
expect_skill_write allow 'スキル yomimasu の下の、まだないフォルダーにも書ける' "$skill_project" Write "$skills/yomimasu/references/new/a.md"
expect_skill_write allow 'スキル yomimasu の下を Edit で直せる' "$skill_project" Edit "$skills/yomimasu/references/timing.md"
expect_skill_write allow '大文字を含む名前のファイルも直せる' "$skill_project" Edit "$skills/yomimasu/references/README.md"
expect_skill_write allow 'プロジェクトのパスがリンクを通っていても、実際の場所で比べて許す' "$work/project-alias" Write "$skills/yomimasu/scripts/commands.ts"
expect_skill_write none 'スキルの定義の SKILL.md には答えない' "$skill_project" Edit "$skills/yomimasu/SKILL.md"
expect_skill_write none '大文字と小文字だけが違う SKILL.md にも答えない' "$skill_project" Write "$skills/yomimasu/skill.md"
expect_skill_write none '入れ子の SKILL.md にも答えない' "$skill_project" Write "$skills/yomimasu/scripts/SKILL.md"
expect_skill_write none '入れ子の .claude/ の下には答えない' "$skill_project" Write "$skills/yomimasu/x/.claude/agents/a.md"
expect_skill_write none '入れ子にスキルと同じ並びがあっても、.claude/ の下には答えない' "$skill_project" Write "$skills/yomimasu/x/.claude/skills/yomimasu/a.md"
expect_skill_write none '最後に空白を付けた SKILL.md には答えない' "$skill_project" Write "$skills/yomimasu/SKILL.md "
expect_skill_write none '最後に空白を付けたリンクのファイルには答えない' "$skill_project" Edit "$skills/yomimasu/scripts/linked.sh "
expect_skill_write none '最後に /. を付けた SKILL.md には答えない' "$skill_project" Write "$skills/yomimasu/SKILL.md/."
expect_skill_write none '最後に / を付けた SKILL.md には答えない' "$skill_project" Write "$skills/yomimasu/SKILL.md/"
expect_skill_write none '最後に /. を付けたリンクのファイルには答えない' "$skill_project" Edit "$skills/yomimasu/scripts/linked.sh/."
expect_skill_write none '.claude/settings.json には答えない' "$skill_project" Write "$skill_project/.claude/settings.json"
expect_skill_write none '.claude/settings.local.json には答えない' "$skill_project" Edit "$skill_project/.claude/settings.local.json"
expect_skill_write none '.claude/hooks/ には答えない' "$skill_project" Edit "$skill_project/.claude/hooks/guard-files.sh"
expect_skill_write none 'ほかのスキルには答えない' "$skill_project" Write "$skills/verify/features/a.md"
expect_skill_write none '名前の頭だけが同じフォルダーには答えない' "$skill_project" Write "$skills/yomimasu-other/scripts/a.ts"
expect_skill_write none 'リンクを通って、名前の頭だけが同じフォルダーに出るパスには答えない' "$skill_project" Write "$skills/yomimasu/other-link/a.ts"
expect_skill_write none 'まだないフォルダーを挟んで親へ上るパスには答えない' "$skill_project" Write "$skills/yomimasu/new/../../../settings.json"
expect_skill_write none '外を指すリンクのフォルダーを通るパスには答えない' "$skill_project" Write "$skills/yomimasu/linked/guard-files.sh"
expect_skill_write none '外を指すリンクのファイルには答えない' "$skill_project" Edit "$skills/yomimasu/scripts/linked.sh"
expect_skill_write none 'スキルのフォルダーが外を指すリンクなら、その先に答えない' "$linked_skill_project" Write "$linked_skill_project/.claude/hooks/guard-files.sh"
expect_skill_write none 'スキルのフォルダーが外を指すリンクなら、リンクを通るパスにも答えない' "$linked_skill_project" Write "$linked_skill_project/.claude/skills/yomimasu/x.sh"
expect_skill_write none '相対パスには答えない' "$skill_project" Write skill-link/scripts/commands.ts
expect_skill_write none 'Write と Edit のほかの道具には答えない' "$skill_project" NotebookEdit "$skills/yomimasu/a.ipynb"
expect_skill_write none 'プロジェクトの場所が分からなければ答えない' '' Write "$skills/yomimasu/scripts/commands.ts"

if ((failures > 0)); then
  printf '%s 件失敗\n' "$failures"
  exit 1
fi
printf '全件成功\n'
