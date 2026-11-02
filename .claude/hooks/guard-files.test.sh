#!/usr/bin/env bash
# 実行：bash .claude/hooks/guard-files.test.sh
set -u

guard="$(cd "$(dirname "$0")" && pwd)/guard-files.sh"
export CLAUDE_PROJECT_DIR=/repo
failures=0

# 鍵の形をした文字列は、このファイル自体が鍵の検査に当たらないよう実行時に組み立てる。
filler=$(printf 'a%.0s' {1..40})
anthropic_key="sk-ant-""api03-$filler"
github_token="ghp""_$filler"
private_key="-----BEGIN RSA ""PRIVATE KEY-----"

write() { jq -n --arg p "$1" --arg c "${2:-}" '{tool_name:"Write",tool_input:{file_path:$p,content:$c}}'; }
edit() { jq -n --arg p "$1" --arg c "$2" '{tool_name:"Edit",tool_input:{file_path:$p,old_string:"x",new_string:$c}}'; }
notebook() { jq -n --arg p "$1" '{tool_name:"NotebookEdit",tool_input:{notebook_path:$p,new_source:"x"}}'; }
shell() { jq -n --arg c "$1" '{tool_name:"Bash",tool_input:{command:$c}}'; }

expect() {
  local want=$1 what=$2 json=$3 code got
  printf '%s' "$json" | bash "$guard" >/dev/null 2>&1
  code=$?
  case $code in
    0) got=allowed ;;
    2) got=blocked ;;
    *) got="exit $code" ;;
  esac
  if [[ $got != "$want" ]]; then
    printf 'NG: %s（期待 %s、結果 %s）\n' "$what" "$want" "$got"
    failures=$((failures + 1))
  fi
}

expect blocked 'リポジトリの中へ音声を書く' "$(write tests/a.wav)"
expect blocked '絶対パスでリポジトリの中へ音声を書く' "$(write /repo/public/a.mp3)"
expect blocked '拡張子が大文字でも音声と分かる' "$(write tests/A.WAV)"
expect blocked 'ブラウザの録音の形式も音声として扱う' "$(write tests/take.webm)"
expect blocked 'ノートブックの経路でも音声を止める' "$(notebook tests/a.flac)"
expect blocked '.env を書く' "$(write .env 'A=1')"
expect blocked 'Workers の秘密の変数のファイルを書く' "$(edit .dev.vars 'A=1')"
expect blocked '秘密鍵のファイルを書く' "$(write certs/server.pem)"
expect blocked '秘密の置き場へ書く' "$(write secrets/token.txt)"
expect blocked '本文に Anthropic の鍵がある' "$(write notes.md "key $anthropic_key")"
expect blocked '編集の本文に GitHub のトークンがある' "$(edit src/a.ts "const t = '$github_token'")"
expect blocked '本文に秘密鍵がある' "$(write notes.md "$private_key")"
expect blocked '形の決まっていない鍵を変数へ代入している' "$(write wrangler.toml "R2_SECRET_ACCESS_KEY = \"$filler\"")"
expect blocked '小文字の変数名の鍵も止める' "$(write config.ts "api_key = \"$filler\"")"
expect blocked 'スマートフォンの録音の形式も音声として扱う' "$(write tests/take.3gp)"
expect blocked '音声を含む動画の形式も止める' "$(write tests/take.m4v)"

expect blocked '音声をリポジトリの中へコピーする' "$(shell 'cp /outside/a.wav tests/fixtures/')"
expect blocked 'エラーの出力を捨てるコピーも止める' "$(shell 'cp /outside/a.wav tests/ 2>/dev/null')"
expect blocked '鍵をリポジトリの中へ移す' "$(shell 'mv /outside/server.pem config/')"
expect blocked '音声をリポジトリの中へ変換して出す' "$(shell 'ffmpeg -i /outside/a.wav out.m4a')"
expect blocked 'オプションの値でリポジトリの中へ保存する' "$(shell 'curl --output=voice.mp3 https://example.com/a')"
expect blocked 'リダイレクトで .env へ書く' "$(shell 'echo A=1 > .env')"
expect blocked 'リダイレクトの先を引用符で囲んでも止める' "$(shell 'cat a > "voice.mp3"')"
expect blocked '.gitignore を越えて音声を追加する' "$(shell 'git add -f tests/a.wav')"
expect blocked 'git -C を使っても音声の追加を止める' "$(shell 'git -C /repo add -f tests/a.wav')"
expect blocked '連結した後ろのコマンドも見る' "$(shell 'ls && cp /outside/a.wav tests/')"
expect blocked 'コマンドの中の鍵を止める' "$(shell "echo $anthropic_key >> notes.md")"

expect allowed '普通のファイルを書く' "$(write src/app.ts 'export {}')"
expect allowed '見本の .env は書ける' "$(write .env.example 'A=')"
expect allowed 'Workers の見本のファイルは書ける' "$(write .dev.vars.example 'A=')"
expect allowed 'リポジトリの外なら音声を書ける' "$(write /tmp/outside/a.wav)"
expect allowed 'リポジトリの外なら空白を含むパスでも書ける' "$(write '/tmp/my take.wav')"
expect allowed 'secret の参照は鍵ではない' "$(write ci.yml 'CLAUDE_CODE_OAUTH_TOKEN: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}')"
expect allowed '外の音声を測るだけなら通す' "$(shell 'ffmpeg -i /outside/a.wav -f null -')"
expect allowed '外から外へのコピーは通す' "$(shell 'cp /outside/a.wav /tmp/b.wav')"
expect allowed 'エラーの出力をまとめる外へのコピーは通す' "$(shell 'cp /outside/a.wav /tmp/b.wav 2>&1')"
expect allowed '外へのダウンロードは通す' "$(shell 'curl -o /tmp/a.mp3 https://example.com/a.mp3')"
expect allowed '読むだけのコマンドは通す' "$(shell 'ls tests/a.wav 2>/dev/null')"
expect allowed '除外の確認は通す' "$(shell 'git check-ignore -v tests/a.wav')"
expect allowed 'コミットメッセージに拡張子が出ても通す' "$(shell 'git add .gitignore && git commit -m "*.wav を除外する"')"

# 音声の一覧は hook と CI と .gitignore で食い違うと穴になるので、一覧の全件を確かめる。
hooks=$(dirname "$guard")
# shellcheck source=patterns.sh
source "$hooks/patterns.sh"
for ext in "${audio_extensions[@]}"; do
  expect blocked "一覧の音声 .$ext を止める" "$(write "tests/a.$ext")"
  if ! grep -qxF "*.$ext" "$hooks/../../.gitignore"; then
    printf 'NG: .gitignore に *.%s がない\n' "$ext"
    failures=$((failures + 1))
  fi
done

# jq は PATH から外す。検査できないときに通すと、hook がないのと同じになる。
code=$(printf '{}' | env PATH=/nonexistent /bin/bash "$guard" >/dev/null 2>&1; echo $?)
if [[ $code != 2 ]]; then
  printf 'NG: jq がないときは止める（結果 exit %s）\n' "$code"
  failures=$((failures + 1))
fi

lonely=$(mktemp -d)
cp "$guard" "$lonely/"
code=$(printf '{}' | bash "$lonely/guard-files.sh" >/dev/null 2>&1; echo $?)
rm -r "$lonely"
if [[ $code != 2 ]]; then
  printf 'NG: patterns.sh がないときは止める（結果 exit %s）\n' "$code"
  failures=$((failures + 1))
fi

if ((failures > 0)); then
  printf '%s 件失敗\n' "$failures"
  exit 1
fi
printf '全件成功\n'
