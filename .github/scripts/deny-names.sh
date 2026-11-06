#!/usr/bin/env bash
# 公開できない名前の一覧を環境変数 DENY_NAMES から読み、追跡しているファイルとコミットメッセージを調べる。
# SCAN_BASE があれば、そこから HEAD までのコミットメッセージも見る。
# SCAN_HISTORY=1 なら、その範囲の各コミットで足した行とファイル名も見る。足してからあとで消した名前も、公開すると履歴から読めるからである。
# SCAN_REFS=1 なら、ブランチ、タグ、PR の参照（refs/remotes/pull/<番号>）から辿れて HEAD から辿れない各コミットで、
# コミットメッセージ、足した行、ファイル名を見る。公開すると、スカッシュする前の PR のコミットも refs/pull/<番号>/head から読めるからである。
# ログは公開されるので、名前が映る行もファイル名も出さず、場所と件数だけを出す。
set -euo pipefail

names=$(mktemp)
patch=$(mktemp)
heads=$(mktemp)
hit_lines=$(mktemp)
trap 'rm -f "$names" "$patch" "$heads" "$hit_lines"' EXIT

# 空の行は全行に一致するので外す。
printf '%s\n' "${DENY_NAMES:-}" | tr -d '\r' | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' | { grep -v '^$' || true; } >"$names"
if [[ ! -s $names ]]; then
  echo 'deny-names: DENY_NAMES が空なので検査できません。GitHub の secret に一覧を置きます。' >&2
  exit 1
fi
if [[ ${SCAN_HISTORY:-} == 1 && -z ${SCAN_BASE:-} ]]; then
  echo 'deny-names: SCAN_HISTORY には、見始めるコミットの SCAN_BASE が要ります。' >&2
  exit 1
fi

failed=false

# 第1引数のコミットのメッセージを見る。第2引数は、ログで SHA の前に添える参照である。
scan_message() {
  local hits
  git log -1 --format=%B "$1" >"$patch"
  # exit 1 は一致なしで、それ以外は検査の失敗である。
  hits=$(grep -caiF -f "$names" "$patch") || [[ $? == 1 ]]
  if [[ $hits != 0 ]]; then
    printf 'コミットメッセージに公開できない名前があります：%s%s（%s 行）\n' "$2" "$1" "$hits" >&2
    failed=true
  fi
}

# 第1引数のコミットで足した行とファイル名を見る。第2引数は、ログで SHA の前に添える参照である。
scan_added() {
  local commit=$1 where=$2 path_hits line_hits
  # マージは1つ目の親との差分で見る。--cc の差分は行の頭に親の数だけ印が並び、足した行をほかのコミットと同じ形で見分けられない。
  # -1 は、--diff-filter に合う変更がないコミットを飛ばして祖先へ進む。--no-walk でそのコミットだけを見る。
  path_hits=$(git log --no-walk -z --root --diff-merges=first-parent --diff-filter=ACR --name-only --format= "$commit" | tr '\0' '\n' | { grep -ciF -f "$names" || true; })
  if [[ $path_hits != 0 ]]; then
    printf '足したファイル名に公開できない名前があります：%s%s（%s 件）\n' "$where" "$commit" "$path_hits" >&2
    failed=true
  fi

  # --text は .gitattributes でバイナリ扱いにしたファイルも行で出す。textconv と外部の diff は本文を書き換えるので使わない。
  git log --no-walk -p --root --diff-merges=first-parent --text --no-textconv --no-ext-diff --no-color --format= "$commit" >"$patch"
  # バイナリの行は NUL や UTF-8 でない並びを含み、変数や sed では崩れる。grep に行の番号と行の頭だけを出させて突き合わせる。
  # exit 1 は一致なしで、それ以外は検査の失敗である。
  grep -naoE '^(diff --git|@@|[+])' "$patch" >"$heads" || [[ $? == 1 ]]
  { grep -naoiF -f "$names" "$patch" || [[ $? == 1 ]]; } | cut -d: -f1 >"$hit_lines"
  # ファイルの頭の「+++ b/パス」と、「++」で始まる行を足した「+++」は、行の頭では見分けられない。diff --git から最初の @@ までを頭として外す。
  line_hits=$(awk -F: '
    FILENAME == ARGV[1] {
      if ($2 == "diff --git") hunk = 0
      else if ($2 == "@@") hunk = 1
      else if (hunk) added[$1] = 1
      next
    }
    ($1 in added) && !($1 in seen) { seen[$1] = 1; hits++ }
    END { print hits + 0 }
  ' "$heads" "$hit_lines")
  if [[ $line_hits != 0 ]]; then
    printf '足した行に公開できない名前があります：%s%s（%s 行）\n' "$where" "$commit" "$line_hits" >&2
    failed=true
  fi
}

# -z を付けないと、日本語のパスが8進数の表記で出て、名前の一致を逃す。
path_hits=$(git ls-files -z | tr '\0' '\n' | { grep -ciF -f "$names" || true; })
if [[ $path_hits != 0 ]]; then
  printf 'ファイル名に公開できない名前があります：%s 件\n' "$path_hits" >&2
  failed=true
else
  # -a は .gitattributes でバイナリ扱いにしたファイルも読む。exit 1 は一致なしで、それ以外は検査の失敗である。
  matches=$(git grep -naiF -f "$names") || [[ $? == 1 ]]
  lines=$(cut -d: -f1,2 <<<"$matches")
  if [[ -n $lines ]]; then
    printf '公開できない名前があります：\n%s\n' "$lines" >&2
    failed=true
  fi
fi

if [[ -n ${SCAN_BASE:-} ]]; then
  range="$SCAN_BASE..HEAD"
  # 新しいブランチの push では base がすべて0になる。根のコミットを base にすると、base..HEAD では根そのものが外れる。
  if [[ $SCAN_BASE =~ ^0+$ || $(git rev-list --parents -n 1 "$SCAN_BASE" 2>/dev/null) =~ ^[0-9a-f]+$ ]]; then
    range=HEAD
  fi
  commits=$(git rev-list "$range") || {
    echo 'deny-names: SCAN_BASE を読めないので検査できません。' >&2
    exit 1
  }
  for commit in $commits; do
    scan_message "$commit" ''
  done

  if [[ ${SCAN_HISTORY:-} == 1 ]]; then
    scanned=0
    for commit in $commits; do
      scan_added "$commit" ''
      scanned=$((scanned + 1))
    done
    printf 'deny-names: %s 件のコミットで、足した行とファイル名を見ました。\n' "$scanned"
  fi
fi

if [[ ${SCAN_REFS:-} == 1 ]]; then
  # PR の参照を番号の順に先に並べる。いくつもの参照から辿れるコミットは、最初の参照の分として1回だけ見る。
  refs=$(git for-each-ref --format='%(refname)' refs/remotes/pull | sort -t/ -k4,4n)
  refs+=$'\n'$(git for-each-ref --format='%(refname)' refs/heads refs/remotes refs/tags | awk '!/^refs\/remotes\/pull\//')
  seen_refs=(HEAD)
  ref_name_hits=0
  scanned=0
  for ref in $refs; do
    if [[ $ref =~ ^refs/remotes/pull/([0-9]+)$ ]]; then
      where="PR #${BASH_REMATCH[1]} "
    else
      # ブランチとタグの名前も公開される。名前に一致した参照は、ログに名前を出さない。
      where="${ref#refs/*/} "
      hits=$(grep -ciaF -f "$names" <<<"$where") || [[ $? == 1 ]]
      if [[ $hits != 0 ]]; then
        where='名前を伏せた参照 '
        ref_name_hits=$((ref_name_hits + 1))
      fi
    fi
    commits=$(git rev-list "$ref" --not "${seen_refs[@]}")
    for commit in $commits; do
      scan_message "$commit" "$where"
      scan_added "$commit" "$where"
      scanned=$((scanned + 1))
    done
    seen_refs+=("$ref")
  done
  if [[ $ref_name_hits != 0 ]]; then
    printf '参照の名前に公開できない名前があります：%s 件\n' "$ref_name_hits" >&2
    failed=true
  fi
  printf 'deny-names: %s 個の参照から辿れて HEAD から辿れない %s 件のコミットで、コミットメッセージ、足した行、ファイル名を見ました。\n' "$((${#seen_refs[@]} - 1))" "$scanned"
fi

if [[ $failed == true ]]; then
  exit 1
fi
