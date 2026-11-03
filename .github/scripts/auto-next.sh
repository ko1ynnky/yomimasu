#!/usr/bin/env bash
# 1件を終えた実行から、次の実行を起こす。何を進めるかは次の実行の pick が選ぶので、番号は渡さない。
# 平日の 9:00〜18:30（日本時間）の外では起こさず、auto.yml の cron に任せる。祝日は見分けない。
# 環境変数 NOW で、日本時間の曜日（1 が月曜）と時刻を続けた値（例：31200）を受ける。
set -euo pipefail

now=${NOW:-$(TZ=Asia/Tokyo date +%u%H%M)}
day=${now:0:1}
time=$((10#${now:1}))

if ((day > 5 || time < 900 || time > 1830)); then
  echo '平日の昼の外なので、次の実行は起こしません。'
  exit 0
fi

gh workflow run auto.yml
