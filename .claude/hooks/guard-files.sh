#!/usr/bin/env bash
# PreToolUse の hook。音声ファイルと鍵がリポジトリへ入る前に止める。
# スクリプトの中で書かれるファイルは見えないので、最後の確認は CI に任せる。
set -u

block() {
  printf '%s\n' "$1" >&2
  exit 2
}

# exit 2 以外では Claude Code が処理を続けるので、検査できないときも 2 で止める。
command -v jq >/dev/null 2>&1 || block 'guard-files: jq がないので検査できません。'
# shellcheck source=patterns.sh
source "$(dirname "${BASH_SOURCE[0]}")/patterns.sh" 2>/dev/null || block 'guard-files: patterns.sh がないので検査できません。'

project=${CLAUDE_PROJECT_DIR:-$PWD}

# 読むだけのコマンドと、コミットメッセージに出てくる拡張子は止めたくないので、
# 書き込むコマンドの引数とリダイレクトの先だけを見る。
write_command='^[[:space:]]*(sudo[[:space:]]+)?(curl|wget|tee|ffmpeg|sox|afconvert|yt-dlp|git([[:space:]]+-C[[:space:]]+[^[:space:]]+)?[[:space:]]+add)([[:space:]]|$)'
copy_command='^[[:space:]]*(sudo[[:space:]]+)?(cp|mv|ln|install|rsync)[[:space:]]'

in_project() {
  case $1 in
    *://*) return 1 ;;
    "$project"/*) return 0 ;;
    /* | '~'*) return 1 ;;
    *) return 0 ;;
  esac
}

check_name() {
  local lower
  lower=$(tr '[:upper:]' '[:lower:]' <<<"$1")
  if [[ $lower =~ $audio_ext ]]; then
    block "音声ファイルはリポジトリに置けません：$1。音声は Git の外に置き、テストの音は実行のたびに合成します。"
  fi
  if [[ $lower =~ $key_file && ! $lower =~ $key_sample ]]; then
    block "鍵のファイルはリポジトリに置けません：$1。鍵は GitHub の secret か環境変数に置きます。"
  fi
}

words_of() {
  grep -oE "[^[:space:]\"'<>=()]+" <<<"$1"
}

check_words() {
  local word
  while IFS= read -r word; do
    if in_project "$word"; then
      check_name "$word"
    fi
  done < <(words_of "$1")
}

# コピー先はフォルダーのことが多く、音声の名前はコピー元にしか出ないので、
# 最後の引数がリポジトリの中なら、外にあるコピー元の名前も確かめる。
# リダイレクトの先を外さないと、2>/dev/null をコピー先と取り違える。
check_copy() {
  local word args
  args=$(sed -E 's/[0-9]*>>?[[:space:]]*[^[:space:]]*//g' <<<"$1")
  in_project "$(words_of "$args" | tail -n 1)" || return 0
  while IFS= read -r word; do
    check_name "$word"
  done < <(words_of "$args")
}

input=$(cat)
path=$(jq -r '.tool_input.file_path // .tool_input.notebook_path // empty' <<<"$input")
shell_command=$(jq -r '.tool_input.command // empty' <<<"$input")
text=$(jq -r '[.tool_input | .content, .new_string, .new_source, .command] | map(strings) | join("\n")' <<<"$input")

if [[ $text =~ $secret ]]; then
  block '鍵らしい文字列があります。鍵は GitHub の secret か環境変数に置きます。'
fi

if [[ -n $path ]] && in_project "$path"; then
  check_name "$path"
fi

while IFS= read -r segment; do
  if [[ $segment =~ $copy_command ]]; then
    check_copy "$segment"
  elif [[ $segment =~ $write_command ]]; then
    check_words "$segment"
  else
    check_words "$(grep -oE ">>?[[:space:]]*[\"']?[^[:space:]\"']+" <<<"$segment" | sed -E 's/^>+[[:space:]]*//')"
  fi
done < <(tr ';|&' '\n' <<<"$shell_command")
