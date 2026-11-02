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

# 偽の gh は、呼ばれた引数を記録し、場面ごとの JSON を返す。
gh_bin=$(mktemp -d "$work/gh.XXXXXX")
cat >"$gh_bin/gh" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' "$*" >>"$GH_LOG"
case "$*" in
  'pr view 7 --json comments') cat "$GH_FIXTURES/comments.json" ;;
  'pr view 7 --json labels,closingIssuesReferences') cat "$GH_FIXTURES/pr.json" ;;
  'issue view 3 --json author,labels') cat "$GH_FIXTURES/issue.json" ;;
  'issue list --state open --label stop --json number') cat "$GH_FIXTURES/stops.json" ;;
  'pr comment 7 --body-file -') cat >>"$GH_FIXTURES/posted.txt" ;;
  'pr merge 7 --auto --squash') [[ ! -f $GH_FIXTURES/merge-fails ]] ;;
esac
EOF
chmod +x "$gh_bin/gh"

# 引数：場面の名前、結果の JSON、回数、PR のラベル、Issue のラベル、stop の一覧。
gate_run() {
  local fixtures round=$3
  fixtures=$(mktemp -d "$work/fixtures.XXXXXX")
  jq -cn --argjson n "$((round - 1))" '{comments: [range($n) | {author: {login: "github-actions"}, body: "<!-- review-gate -->"}]}' >"$fixtures/comments.json"
  jq -cn --arg labels "$4" '{labels: ($labels | split(",") | map(select(. != "") | {name: .})), closingIssuesReferences: [{number: 3}]}' >"$fixtures/pr.json"
  jq -cn --arg labels "$5" '{author: {login: "owner"}, labels: ($labels | split(",") | map(select(. != "") | {name: .}))}' >"$fixtures/issue.json"
  printf '%s' "${6:-[]}" >"$fixtures/stops.json"
  : >"$fixtures/gh.log"
  gate_exit=0
  PATH="$gh_bin:$PATH" GH_LOG="$fixtures/gh.log" GH_FIXTURES="$fixtures" PR=7 OWNER=owner OUTPUT="$2" bash "$scripts/review-gate.sh" >/dev/null 2>&1 || gate_exit=$?
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
expect_gate 'review-gate: 指摘がなく Issue も go:merge なら自動マージする' 0 'pr merge 7 --auto --squash' ''
gate_run pr-only "$clean" 1 go:pr go:pr
expect_gate 'review-gate: go:pr はマージしない' 0 '' 'pr merge'
gate_run forged "$clean" 1 go:merge go:pr
expect_gate 'review-gate: Issue が go:merge でなければ、PR のラベルだけではマージしない' 0 '' 'pr merge'
gate_run held "$clean" 1 go:merge,needs-human go:merge
expect_gate 'review-gate: needs-human の PR はマージしない' 0 '' 'pr merge'
gate_run stopped "$clean" 1 go:merge go:merge '[{"number":9}]'
expect_gate 'review-gate: stop があればマージしない' 0 '' 'pr merge'

summary_fixture="$work/execution.json"
cat >"$summary_fixture" <<'EOF'
[
  {"type": "system", "subtype": "init", "model": "claude-opus-5-5"},
  {"type": "assistant", "message": {"content": [{"type": "text", "text": "PROMPT-BODY-SHOULD-NOT-APPEAR"}, {"type": "tool_use", "name": "Skill", "input": {"skill": "verify"}}]}},
  {"type": "assistant", "message": {"content": [{"type": "tool_use", "name": "Skill", "input": {"skill": "verify"}}]}},
  {"type": "result", "num_turns": 12, "duration_ms": 90000, "modelUsage": {"claude-opus-5-5": {"inputTokens": 100, "outputTokens": 20, "cacheReadInputTokens": 5, "cacheCreationInputTokens": 7}}}
]
EOF
summary=$(bash "$scripts/run-summary.sh" "$summary_fixture" 2>&1)
for part in 'claude-opus-5-5' 'ターン数：12' '入力 112' '出力 20' 'スキル：verify'; do
  if [[ $summary != *"$part"* ]]; then
    ng "run-summary: 要約に $part がある（出力 $summary）"
  fi
done
if [[ $summary == *PROMPT-BODY* ]]; then
  ng 'run-summary: 実行の全文を要約に出さない'
fi

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

if ((failures > 0)); then
  printf '%s 件失敗\n' "$failures"
  exit 1
fi
printf '全件成功\n'
