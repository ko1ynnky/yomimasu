#!/usr/bin/env bash
# Action の実行の記録から、PR に載せる要約を作る。
# 記録の全文には依頼とコマンドの出力が入るので公開せず、モデル、ターン数、トークン、スキルだけを出す。
# --extract を付けると、要約に使う項目だけを残した記録を出す。自走は Claude の job でこれを作り、要約は次の job で作る。
# 要約はいつもこの項目だけから作るので、取り出した記録を渡しても同じ要約になる。
set -euo pipefail

extract='
  [.[] | select(.type == "result") | {type, num_turns, modelUsage}]
  + [.[] | select(.type == "assistant")
      | [.message.content[]? | select(.type == "tool_use" and .name == "Skill") | {type, name, input: {skill: .input.skill}}]
      | select(length > 0)
      | {type: "assistant", message: {content: .}}]
'

if [[ $1 == --extract ]]; then
  jq "$extract" "$2"
  exit
fi

jq "$extract" "$1" | jq -r '
  (map(select(.type == "result")) | last) as $result
  | ($result.modelUsage // {}) as $usage
  | ([$usage[]] | map((.inputTokens // 0) + (.cacheReadInputTokens // 0) + (.cacheCreationInputTokens // 0)) | add // 0) as $input
  | ([$usage[]] | map(.outputTokens // 0) | add // 0) as $output
  | ([.[] | select(.type == "assistant") | .message.content[]? | select(.type == "tool_use" and .name == "Skill") | .input.skill] | unique) as $skills
  | [
      "<!-- run-summary -->",
      "実行の要約",
      "",
      "- モデル：\($usage | keys | join("、"))",
      "- ターン数：\($result.num_turns // "不明")",
      "- トークン：入力 \($input)、出力 \($output)",
      "- スキル：\(if ($skills | length) > 0 then ($skills | join("、")) else "なし" end)"
    ]
  | join("\n")
'
