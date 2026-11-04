#!/usr/bin/env bash
# 自走の実行で、スキル yomimasu の下への Write と Edit だけを許す PermissionRequest の hook。
# Claude Code は .claude/ の下を守られた場所として扱い、--allowedTools や permissions.allow の規則では書かせない。
# 書かせるには、確認を求める場面で呼ばれるこの hook が答える。
# 答えのない確認は -p の実行で拒まれるので、判断できないときは何も出さずに終え、
# .claude/settings* と .claude/hooks/ と、ほかのスキルは今のまま守る。
set -u

input=$(cat)
tool=$(jq -r '.tool_name // empty' <<<"$input") || exit 0
path=$(jq -r '.tool_input.file_path // empty' <<<"$input") || exit 0

[[ $tool == Write || $tool == Edit ]] || exit 0
[[ -n ${CLAUDE_PROJECT_DIR:-} && $path == /* ]] || exit 0
# まだないフォルダーを挟むと実際の場所に直せないので、親へ上る部分は名前の段階で断る。
# 「.」の部分と最後の「/」も断る。書く前にパスを整えると、下で名前を見る断りと違うファイルに書くからである。
[[ /$path/ != */../* && /$path/ != */./* && $path != */ ]] || exit 0
# リンクのファイルへの書き込みは、リンクの先へ届く。
[[ ! -L $path ]] || exit 0

# 途中のフォルダーがリンクで外を指していても見分けられるよう、あるところまでを実際の場所に直して比べる。
# 比べる先は実際の場所のプロジェクトから名前で組み立てるので、スキルのフォルダーそのものがリンクでも外へは許さない。
project=$(cd "$CLAUDE_PROJECT_DIR" 2>/dev/null && pwd -P) || exit 0
root=$project/.claude/skills/yomimasu
dir=$(dirname "$path")
while [[ ! -d $dir ]]; do
  dir=$(dirname "$dir")
done
dir=$(cd "$dir" && pwd -P) || exit 0
[[ $dir == "$root" || $dir == "$root"/* ]] || exit 0

# SKILL.md の frontmatter の allowed-tools と hooks は、スキルを使う間の権限を足す。
# 書き換えてから Skill で使えば許可を広げられるので、設定と同じく守る。入れ子の SKILL.md と .claude/ の下も、
# Claude がそのフォルダーを触るとスキルとして読まれるので、深さによらず守る。
# 大文字と小文字を区別しないファイルシステムでは、名前の綴りが違っても同じファイルに書く。
inside=$(tr '[:upper:]' '[:lower:]' <<<"${path##*/.claude/skills/yomimasu/}")
[[ /$inside/ != */.claude/* && ${inside##*/} != skill.md ]] || exit 0

printf '%s\n' '{"hookSpecificOutput":{"hookEventName":"PermissionRequest","decision":{"behavior":"allow"}}}'
