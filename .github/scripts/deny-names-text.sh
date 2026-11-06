#!/usr/bin/env bash
# 公開できない名前の一覧を環境変数 DENY_NAMES から読み、Issue と PR の題と本文、コメント、レビューの本文とコメントを調べる。
# 題を変える前の題と、文を編集する前の版も見る。公開すると、閉じた Issue とマージした PR の文も、画面の履歴から前の版も読めるからである。
# gh は GH_TOKEN と GH_REPO で読む。名前の比べ方は deny-names.sh と同じで、大文字と小文字を区別しない固定の文字列である。
# ログは公開されるので、文も名前も出さず、場所と件数だけを出す。
set -euo pipefail

names=$(mktemp)
page=$(mktemp)
nodes=$(mktemp)
request=$(mktemp)
lines=$(mktemp)
keys=$(mktemp)
texts=$(mktemp)
hit_lines=$(mktemp)
trap 'rm -f "$names" "$page" "$nodes" "$request" "$lines" "$keys" "$texts" "$hit_lines"' EXIT

# 空の行は全行に一致するので外す。
printf '%s\n' "${DENY_NAMES:-}" | tr -d '\r' | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' | { grep -v '^$' || true; } >"$names"
if [[ ! -s $names ]]; then
  echo 'deny-names-text: DENY_NAMES が空なので検査できません。GitHub の secret に一覧を置きます。' >&2
  exit 1
fi

# 読めなかったページを、一致なしとして通さない。
fetch() {
  gh api --paginate "repos/{owner}/{repo}/$1" >"$page" || {
    printf 'deny-names-text: %s を読めないので検査できません。\n' "$1" >&2
    exit 1
  }
}

# 第1引数の jq の式で、読んだページの文を「場所<TAB>文の1行」にして足す。文を行に分けるので、文の中の改行で場所と文の対応がずれない。
# jq の失敗の文には値の一部が映ることがあるので、出さない。
collect() {
  jq -r 'def emit($where; $text): ($text // "") | split("\n")[] | "\($where)\t\(.)"; '"$1" "$page" >>"$lines" 2>/dev/null || {
    echo 'deny-names-text: 読んだページの形が違うので検査できません。' >&2
    exit 1
  }
}

# 編集できる文の node_id を覚える。編集の前の版は REST では読めないので、最後に GraphQL で読む。
remember() {
  jq -r '.[] | .node_id // error("node_id")' "$page" >>"$nodes" 2>/dev/null || {
    echo 'deny-names-text: 読んだページの形が違うので検査できません。' >&2
    exit 1
  }
}

# --paginate はページごとの配列を続けて出すので、inputs で全部を数える。
count() {
  jq -n '[inputs[]] | length' "$page"
}

fetch 'issues?state=all&per_page=100'
collect '.[] | (if .pull_request then "pr" else "issue" end) as $kind | emit("\($kind) #\(.number) title"; .title), emit("\($kind) #\(.number) body"; .body)'
remember
issue_count=$(jq -n '[inputs[] | select(.pull_request | not)] | length' "$page")
pulls=$(jq -r '.[] | select(.pull_request) | .number' "$page")

# 題を変えると、前の題がタイムラインに残る。
fetch 'issues/events?per_page=100'
collect '.[] | select(.event == "renamed") | emit("\(if .issue.pull_request then "pr" else "issue" end) #\(.issue.number) renamed \(.id)"; .rename.from)'
rename_count=$(jq -n '[inputs[] | select(.event == "renamed")] | length' "$page")

fetch 'issues/comments?per_page=100'
collect '.[] | emit("\(if .html_url | test("/pull/") then "pr" else "issue" end) #\(.issue_url | sub(".*/"; "")) comment \(.id)"; .body)'
remember
comment_count=$(count)

fetch 'pulls/comments?per_page=100'
collect '.[] | emit("pr #\(.pull_request_url | sub(".*/"; "")) review-comment \(.id)"; .body)'
remember
review_comment_count=$(count)

pull_count=0
review_count=0
for pull in $pulls; do
  fetch "pulls/$pull/reviews?per_page=100"
  collect '.[] | emit("pr #'"$pull"' review \(.id)"; .body)'
  remember
  review_count=$((review_count + $(count)))
  pull_count=$((pull_count + 1))
done

# nodes は1回に100個までしか受けないので、分けて読む。版が100を超える文は読み残すので、形が違うものとして落とす。
edits_query='query($ids: [ID!]!) { nodes(ids: $ids) { __typename
  ... on Issue { number }
  ... on PullRequest { number }
  ... on IssueComment { fullDatabaseId issue { number } pullRequest { number } }
  ... on PullRequestReview { fullDatabaseId pullRequest { number } }
  ... on PullRequestReviewComment { fullDatabaseId pullRequest { number } }
  ... on Comment { userContentEdits(first: 100) { totalCount nodes { diff } } } } }'
node_count=$(wc -l <"$nodes")
edit_count=0
for ((offset = 0; offset < node_count; offset += 100)); do
  jq -Rn --arg query "$edits_query" --argjson offset "$offset" '{query: $query, variables: {ids: ([inputs] | .[$offset:$offset + 100])}}' "$nodes" >"$request"
  gh api graphql --input "$request" >"$page" || {
    echo 'deny-names-text: 編集の前の版を読めないので検査できません。' >&2
    exit 1
  }
  collect '
    def where:
      if .__typename == "Issue" then "issue #\(.number) body"
      elif .__typename == "PullRequest" then "pr #\(.number) body"
      elif .__typename == "IssueComment" then "\(if .pullRequest then "pr" else "issue" end) #\(.issue.number) comment \(.fullDatabaseId)"
      elif .__typename == "PullRequestReview" then "pr #\(.pullRequest.number) review \(.fullDatabaseId)"
      elif .__typename == "PullRequestReviewComment" then "pr #\(.pullRequest.number) review-comment \(.fullDatabaseId)"
      else error("type") end;
    .data.nodes[] | where as $where | .userContentEdits
    | if .totalCount > (.nodes | length) then error("edits") else .nodes[] end
    | emit("\($where) edit"; .diff)'
  edit_count=$((edit_count + $(jq '[.data.nodes[].userContentEdits.nodes[]] | length' "$page")))
done

cut -f1 "$lines" >"$keys"
cut -f2- "$lines" >"$texts"
# exit 1 は一致なしで、それ以外は検査の失敗である。
{ grep -naoiF -f "$names" "$texts" || [[ $? == 1 ]]; } | cut -d: -f1 >"$hit_lines"
report=$(awk '
  FILENAME == ARGV[1] { hit[$1] = 1; next }
  FNR in hit {
    if (!($0 in hits)) order[++n] = $0
    hits[$0]++
  }
  END { for (i = 1; i <= n; i++) printf "公開できない名前があります：%s（%s 行）\n", order[i], hits[order[i]] }
' "$hit_lines" "$keys")

printf 'deny-names-text: Issue %s 件、PR %s 件、題の変更 %s 件、コメント %s 件、レビューのコメント %s 件、レビュー %s 件、編集の前の版 %s 件の文を見ました。\n' \
  "$issue_count" "$pull_count" "$rename_count" "$comment_count" "$review_comment_count" "$review_count" "$edit_count"
if [[ -n $report ]]; then
  printf '%s\n' "$report" >&2
  exit 1
fi
