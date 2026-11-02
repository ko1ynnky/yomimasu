# 判断の記録

あとの作業に影響する技術と設計の判断を、新しいものを上にして書く。理由と、採らなかった案も残す。結論を改めるときは、元の項目を消さずに、改めた日付と理由を足す。

## 2026-11-03 自走の試運転の形を決める

- 決めたこと：
  - `auto.yml` は Issue にラベルが付いたとき、手動の起動、`review-gate.sh` の修正の起動だけで動く。平日の cron と、終わったら次の Issue を起こす処理は入れない。
  - 選ぶのは、作者がユーザーで `go:merge` か `go:pr` が付き、`night`、`needs-human`、`in-progress` のない Issue である。開いている Issue に `stop` があれば、実行も自動マージも始めない。
  - 実行は1本ずつにする。`work` の job が始まったあとの失敗、取り消し、成果がない終わり方は、`needs-human` を付けて人に渡す。成果は、Issue なら開いた PR、PR の修正なら head の変化で確かめる。
  - `review.yml` は `claude[bot]` の PR だけをレビューする。Claude は書き込みの権限のない job で、読み取りの `github.token` を渡して動かす。結果を使う処理は `review-gate` の job に分ける。
  - レビューは base の内容で動く。`.claude/skills/review-pr/`、`REVIEW.md`、検査のスクリプトは base の版が効く。`review.yml` そのものは PR 側の版が動く。
  - 3回目のレビューで止める指摘が残ったら、その場で人に渡す。軽い指摘にも答えを求め、3回目に残った軽い指摘は止めない。
  - 自動マージを有効にする直前に、PR のラベル、閉じる Issue、`stop` の一覧を読み直す。PR のラベルと `Closes` は Claude が書くので、ブランチの番号の Issue を閉じる PR で、閉じる Issue がすべてユーザーの開いた `go:merge` のときだけマージする。`go:merge` の条件が揃わなければ人に渡す。有効にしたあとの `stop` と `needs-human` は効かない。
  - `auto.yml` の実行では `reviewer` を呼べないので、`review.yml` がその役を持つ。
- 理由：ユーザーの許可は「試運転まで可」である。`main` に Workflow が入っても、ラベルを付けない限り動かない形にする。判断を Workflow の式に書くと試せないので、主な判断は `.github/scripts/` に分けてテストする。`auto.yml` の修正の対象の確認だけは式に残っていて、テストがない。
- 判断：`CLAUDE_AUTH` による API キーへの切り替えは入れない。キーをまだ登録しておらず、試運転では要らない。
- 判断：`needs-human` のあとに人が引き取った PR は、回数の上限を超えると `review-gate` が赤のままになるので、管理者としてマージする。`main` の保護は管理者に適用しない。
- 試行錯誤：レビューで、起動の時点のラベルの写しで自動マージを判定すること、`go:pr` の Issue の PR を Claude が `go:merge` にできること、`stop` の検査が `gh` の失敗で通ること、Issue が `needs-human` へ渡らないまま止まる経路が複数あることが分かった。判定を `review-gate.sh` へ分け、偽の `gh` でテストした。
- 試行錯誤：`/review-pr` をロックファイル込みで4863行の差分に当てると、12回の上限で結果が出なかった。結果が空でも修正を起こす形だったので、読めないときは人に渡す形にした。
- 採らなかった案：レビューの2回目以降を、前回の SHA からの差分だけにする案。今回は全体を読み直す。1回の差分が小さい間は読む量が増えず、形も簡単である。
- 限界：
  - `--allowedTools` は境界にならない。`Edit` と `npm run` を組み合わせれば任意のコマンドを実行できる。Claude に読ませるものを手順で絞り、interaction limits でほかの人のコメントを閉じ、`stop` で止める。手順は仕組みの境界ではない。
  - `work` の job は書き込みの権限のまま、Claude のあとの step を動かす。要約のスクリプトは Claude の前に写すが、job を分けるまでは任意のコマンドから守れない。
  - `Bash(git push origin auto/*)` は `auto/x:production` も通す見込みである。`production` を作るときに保護する。
  - 修正の起動は保留が1本なので、別の実行に押し出されることがある。`stop` の間に起こした修正は動き直さない。`pick` の失敗は人に渡らない。どれも Issue を1本ずつ試す間は起きにくいので、試運転のあとに直す。
  - GitHub の FAQ は、Claude の GitHub App に Workflow の書き込みの権限がないと書く。実物では試運転で確かめる。
  - `gh pr merge --auto` は必須の検査がないとすぐマージするので、自動マージは `main` の保護を設定してから使う。
  - `go:merge` の自動マージは `GITHUB_TOKEN` で有効にするので、マージの push では `ci.yml` が動かない見込みである。スカッシュのメッセージの検査はこの経路では動かない。
  - Workflow はまだ GitHub Actions で動かしていない。動いたかどうかは試運転で確かめる。

## 2026-11-02 作業の検証の手順を決める

- 決めたこと：`.claude/skills/verify/` に、完了と書く前に実行する手順と機能ごとの確かめ方を置く。Stop hook は足さない。
- 理由：コマンドの実行だけでなく、画面の画像と結果を読むところまでを1つの手順にする。機能を足すたびに `features/` を増やせば、確かめる範囲が残る。
- 採らなかった案：Stop hook で型検査とテストを必ず通す案。
  - 主に効くのは無人の実行だが、`auto.yml` がまだないので確かめられない。
  - 手元では、TDD の _red_ の途中や質問に答えて終わる場面でも発火し、頼んでいない修正を始めるきっかけになる。
  - 同じコマンドを `verify` と CI が通す。
- 見直す条件：`auto.yml` の試運転で、CI が落ちる PR を開くことが続いたら足す。

## 2026-11-02 CI の検査を決める

- 決めたこと：
  - `.github/workflows/ci.yml` に `check`、`e2e`、`no-audio`、`no-secrets`、`deny-names`、`risk-gate` を置く。型検査、テスト、シェルの検査、ビルドは `check` の中で順に動かす。
  - 音声の拡張子と鍵の形は `.claude/hooks/patterns.sh` の1か所に置き、hook と CI が読み込む。`.gitignore` は読み込めないので、食い違いをテストで止める。
  - `deny-names` の一覧は GitHub の secret `DENY_NAMES` に1行1件で置く。空なら失敗する。
  - `deny-names` と `risk-gate` は、変更の中のものではなく base のスクリプトを実行する。`pull_request` の対象は `main` と `production` に絞り、スクリプトのない古いブランチを base にできないようにする。
  - `deny-names` は、base を読めないときは `main` の版を使う。読める base にスクリプトがないのは導入のときだけなので、そのときだけ取り出した版を実行し、ログに警告を残す。
  - `main` と `production` への push の実行は取り消さない。取り消すと、そのコミットのメッセージを誰も見なくなる。
  - Action は版のタグではなくコミットの SHA で固定する。
- 理由：
  - 一覧が2か所にあると、片方だけ直したときに穴になる。
  - 検査できないときに通すと、検査がないのと同じになる。hook と同じ考え方である。
  - `deny-names` は secret を読み、`risk-gate` は PR を書き換える。自動の実行が作る PR でスクリプトを変えて通せないようにする。
- 判断：検査のログは公開されるので、鍵と名前の検査は場所だけを出し、一致した行を出さない。`deny-names` はファイル名に一致したときもパスを出さず、件数だけを出す。パスを出すと、一覧の中身が分かるからである。`no-audio`、`no-secrets`、`risk-gate` はパスを出す。ファイル名は PR の差分で公開済みで、直す人に要る。
- 判断：`risk-gate` の許可には、測定、録音、知識の文章、依存、設定を入れない。`go:merge` は自動でマージするので、許可は狭く始める。
- 試行錯誤：検査のテストを書いた直後の確認で、スクリプトがなくても「落ちる」期待のテストが exit 127 で通っていた。落ちる期待は exit 1 だけを認める形に直した。
- 採らなかった案：gitleaks などの Action を使う案。依存を増やさず、hook と同じ形で見られる。
- 試行錯誤：Linux のコンテナーで通して、`git ls-files` が日本語のパスを引用符付きで出し、音声、鍵、名前のファイル名の検査が空振りすると分かった。手元の Mac は `core.quotepath` が false で隠れていた。`-z` で受ける形にして、テストのリポジトリを CI の既定に揃えた。
- 試行錯誤：レビューで、`git grep -I` が `.gitattributes` でバイナリ扱いにしたファイルを飛ばすこと、`git grep` と `git rev-list` の失敗が隠れること、`e2e/*` の許可で録音の許容の幅を自動でマージできることが分かった。それぞれ `-a`、失敗の区別、許可からの削除で直した。
- 試行錯誤：2回目のレビューで、どの理由の失敗でも取り出した版へ切り替わること、切り替わりがログに残らないこと、`git grep` の失敗のテストが別の行で先に止まり守れていないことが分かった。切り替えの条件を絞り、`git grep` だけを失敗させる偽の `git` でテストした。
- 採らなかった案：`pull_request_target` で base の Workflow を動かす案。secret を持つ Workflow が PR の内容を扱う形は、外部の入力を閉じる考え方と合わない。`deny-names` は PR の本文を読むので、PR のコードを実行しない形なら作れるが、下の限界の前提が崩れるまでは使わない。
- 限界：
  - `pull_request` の実行は PR 側の `ci.yml` を使う。同じリポジトリへ push でき、Workflow も書き換えられる人は、secret に届き、`risk-gate` も外せる。fork の PR には secret は渡らない。自動の実行のトークンに `workflows` の権限を渡さないことを前提にし、`auto.yml` を書くときに確かめる。
  - 導入の PR がマージされるまでは、取り出した版の `deny-names.sh` が secret を読む。導入の PR は人が読むので、そこで止める。
  - `no-audio`、`no-secrets`、`deny-names` の本文の検査は、今の版のファイルだけを見る。PR の途中のコミットで足して消したものは見つけない。
  - PR のタイトルと本文は検査しない。タイトルから作るスカッシュのメッセージは、`main` への push で見つける。
  - `no-audio` は拡張子で見るので、拡張子を変えた音声は見つけない。
  - `risk-gate` のラベルの付け替えは、ラベルを作ってから確かめる。
  - Workflow はまだ GitHub Actions で動かしていない。

## 2026-11-02 アプリの技術を決める

- 決めたこと：
  - 枠組みは、Vite、Markdown から HTML を書き出す小さな生成スクリプト、録音と結果の画面の Preact にする。出力は Cloudflare Workers の静的アセットとして配る。
  - 測定は TypeScript で書く。共有コードは `.claude/skills/yomimasu/scripts/` に置き、Web はそのファイルを読み込み、スキルは Node か Bun で型を除いて動かす。
  - 録音は AudioWorklet で PCM を受ける。MediaRecorder は実機で AudioWorklet が使えないと分かったときの代わりとして残す。
  - お手本の音声は AAC の m4a にする。測定に通す音は WAV にして、自分のコードで読む。
  - 測定の結果は 0.01 秒の単位に丸めてから返す。
  - 依存は `preact`、`vite`、`marked`、`typescript`、`@types/node`、`wrangler`、`@playwright/test` の7つにする。この Mac に pnpm がないので、パッケージの管理は npm で行う。
  - 公開は `production` ブランチだけにし、それ以外のブランチは Worker Previews に出す。
- 理由：検索で読めるページと録音の画面を、依存を増やさずに1つのアプリで両立できる。測定のコードは1か所に置けるので、Web とスキルの定義がずれない。

枠組みの実測（ダミーの104ページ、Mac で各1回）：

| 項目 | Vite と生成スクリプト | Astro 7 | React Router 8 |
| --- | --- | --- | --- |
| npm のパッケージ数 | 18 | 250 | 81 |
| `node_modules` | 32MB | 151MB | 69MB |
| 組み立て | 0.8秒 | 2.7秒 | 2.0秒 |
| 文章ページの JS（gzip） | 1.2KB | 0.7KB | 約113KB |

3案とも、`wrangler dev` の配信で、JS なしの本文、404、戻る操作、偽のマイクの測定を通った。

測定の実測（16.5秒の合成音、各1回）：

| 実行環境 | 測定の時間 | 間（正解1.0秒） |
| --- | --- | --- |
| Node 26 | 8.5ms | 0.99秒 |
| Bun 1.4 | 15.4ms | 0.99秒 |
| Chrome 156 | 12.8ms | 0.99秒 |
| Safari iOS 18.2、シミュレーター | 18ms | 0.99秒 |
| Safari iOS 26.5、シミュレーター | 23ms | 0.99秒 |
| Chrome 134 Android、仮想デバイス | 69.6ms | 0.99秒 |

音の区切りを取るときの重さの上限として、対数メルと全域の DTW も測った。合計は Chrome で約0.8秒、シミュレーターで約1.2秒、仮想デバイスで約2.0秒である。ただし実機の値ではない。

録音の経路の実測（偽のマイク、正解は1.0秒と1.6秒）：

| 環境 | AudioWorklet | MediaRecorder |
| --- | --- | --- |
| Mac の Chrome 156 | 0.99、1.60 | 1.00、1.60 |
| Ubuntu 24.04 arm64 のコンテナー | 0.99、1.59 | 1.00、1.60 |
| Android の仮想デバイス（1.0秒のみ） | 0.99 | 1.00 |

`decodeAudioData` の頭のずれの実測：

| 形式 | Chrome 156 | Android 134 | iOS 18.2 | iOS 26.5 |
| --- | --- | --- | --- | --- |
| WAV、FLAC、AAC | 0ms | 0ms | 0ms | 0ms |
| MP3 | 0ms | 0ms | +12ms | +12ms |
| Opus（WebM） | -0.5ms | 0ms | 0ms | 0ms |
| Opus（Ogg） | 0ms | 0ms | 失敗 | 0ms |
| Opus（mp4） | -6.5ms | 0ms | 失敗 | 失敗 |

- 試行錯誤：Astro の島は、直接開くと出るが、取ってきた HTML を差し込むと描画されなかった。コマンドのように本文を足す画面と合わないので、カスタム要素と動的 import で録音の画面を読み込む形にした。この形なら枠組みの島の仕組みは要らない。
- 試行錯誤：丸めの要否を調べるために内部の値を比べた。Node と Bun の差は1648フレーム中55フレームで、最大 1.4×10⁻¹⁴ dB だった。表示の桁には出ないが、ハッシュでは環境ごとに一致しないので、出力の前に丸める。
- 試行錯誤：コンテナーの外の `http://host.docker.internal` を開くと録音の開始で失敗し、コンテナーの中の `127.0.0.1` では通った。原因は secure context と見ている。E2E は localhost で動かす。
- 試行錯誤：MediaRecorder の形式は、iOS 18.2 では mp4 だけで、iOS 26.5、Chrome、Android の Chrome では webm も使えた。録音を形式に依存させると読み込みの経路が端末ごとに分かれるので、PCM に決めた。
- 採らなかった案：Astro。出力の大きさと動きは同じ水準だが、パッケージが約14倍あり、決め手の島も使わない。自動で動かす開発では、依存の少なさを優先する。
- 採らなかった案：React Router の事前レンダリング。読むだけのページにも約113KB の JS を配る。
- 採らなかった案：Rust の WASM。TypeScript で時間が足りているので、CI とスキルの組み立てを増やす理由がない。
- 採らなかった案：Python の測定。ブラウザーで動かす負担が大きいので、試していない。
- 採らなかった案：MP3 のお手本。iOS で頭が 12ms ずれ、札の間の 1.0 秒に響く。
- 限界：
  - iOS の実マイクの録音は、シミュレーターでも動かしていない。確かめたのは API の存在、測定、音声の読み込みである。
  - Android の実機と、GitHub Actions の x86-64 では動かしていない。
  - 合成音の結果は、測定の定義が実際の読みに合うことを示さない。
  - `production` ブランチの設定は文書で確かめただけで、実物では動かしていない。だめなら、GitHub Actions から `production` の push のときだけ `wrangler deploy` を実行する。
  - 2つの音声を 1.0 秒あけて鳴らす処理は、まだ試していない。
- 根拠（確認日 2026-11-02）：
  - [Build branches](https://developers.cloudflare.com/workers/ci-cd/builds/build-branches/)、[Workers Builds API](https://developers.cloudflare.com/workers/ci-cd/builds/api-reference/)、[Worker Previews の設定](https://developers.cloudflare.com/workers/previews/configuration/)
  - [Workers の料金](https://developers.cloudflare.com/workers/platform/pricing/)、[R2 の料金](https://developers.cloudflare.com/r2/pricing/)
  - [Skills](https://code.claude.com/docs/en/skills)、[Node.js の TypeScript](https://nodejs.org/api/typescript.md)

## 2026-11-02 Anthropic の開発の記事からハーネスに入れるものを選ぶ

- 決めたこと：コマンドや Workflow がなくても意味を持つものだけを、今の段階で入れる。
  - `.env`、`.dev.vars`、`secrets/` の Read を `permissions.deny` で止める。`!` で見本のファイルを読めるように残す。ほかの鍵の形式は、一覧を増やしすぎないよう `.gitignore` と hook に任せる。
  - 読み取り専用の `reviewer` を作り、PR を開く前に新しい文脈で差分を見る。
  - `REVIEW.md` に失敗の定義、指摘の区分、見ない場所を書く。指摘は1か所ではなく問題の種類として示す。
  - 繰り返す指摘は hook、CI、`AGENTS.md` のどれかに移し、指摘には修正か理由で答える。
  - `AGENTS.md` は、コードから読み取れない題材の事実を中心に短くする。PR の本文の形はテンプレートへ移す。
  - PR のテンプレートに、確かめたこと、リスク、戻し方を置く。
  - 他人が書いた文に含まれる指示で、エージェントの動きが変わらないようにする。
- 独自の決まり：記事が勧める内容を、このリポジトリの形にしたものが2つある。記事はチェックを先に用意することを勧めるが、報告の形までは決めていないので、完了の報告に実行したコマンドと出力を付ける。記事は読み込む内容を信用しないことを勧めるが、依頼の範囲までは決めていないので、ユーザーがラベルを付けた Issue の目的と完了の条件、ユーザー本人のコメント、手元でのユーザーの指示を依頼とし、それ以外を入力のデータとする。
- 判断：`reviewer` に Bash を渡さない。`tools` では Bash をコマンド単位で絞れず、Bash があれば書き換えられる。差分は本文かファイルで受け取る。
- 限界：`permissions.deny` は、ファイルの名前を出さない `grep -r` や、スクリプトの中の読み取りを止めない。
- 根拠（確認日 2026-11-02）：
  - [How the Claude Code team does code review](https://claude.dev/blog/solving-code-review-at-anthropic/)
  - [The new rules of context engineering for Claude 5 generation models](https://claude.dev/blog/the-new-rules-of-context-engineering-for-claude-5-generation-models/)
  - [Best practices for Claude Code](https://code.claude.com/docs/en/best-practices)
  - [Building effective agent automations](https://claude.dev/blog/building-effective-agent-automations/)
  - [How Anthropic secures its AI-native software development lifecycle](https://claude.com/blog/how-anthropic-secures-its-ai-native-software-development-lifecycle)
  - [Building verification loops in Claude Code with skills](https://claude.com/resources/articles/building-verification-loops-in-claude-code-with-skills)
  - [Configure permissions](https://code.claude.com/docs/en/permissions)、[Subagents](https://code.claude.com/docs/en/sub-agents)
- 採らなかった案：複数のエージェントの投票で指摘を絞る案と、人の承認を2名にする段階分け。開発は1人なので重い。夜ごとに既存のコードを走査する案も、既存のコードがないので見送る。
- 採らなかった案：`AGENTS.md` の競技かるたの落とし穴の行を知識の文章の置き場へ移す案。実装で取り違えないための用語の短い注意で、解説ではない。
- 採らなかった案：競技かるたの落とし穴を `/yomimasu` とは別のスキルにする案。今は5行で、毎回読ませても重くない。スキルにすると、読み込まれない実行で見落とす。行が増えて読みと測定の作業でしか要らなくなったら分ける。
- あとで入れるもの：テストのコマンド、Stop hook、`verify` のスキル、PR の E2E の成果物、`auto.yml` の上限と失敗時の扱い、音声と鍵の CI の検査、ブランチ保護、Workflow の変更を人が見る設定、secret scanning、レビューをコメントだけで試す期間、わざと崩した PR での `reviewer` の確認。どれも、コマンド、Workflow、公開のリポジトリのどれかができてから決める。

## 2026-11-02 音声と鍵の書き込みを hook で止める

- 決めたこと：`.claude/settings.json` の PreToolUse の hook で、Write、Edit、NotebookEdit、Bash を検査する。リポジトリの中へ音声や鍵のファイルを書く操作と、鍵らしい文字列を含む操作を止める。
- 理由：`.gitignore` は `git add -f` を止めない。CI が動くのは PR を開いたあとである。hook なら書く前に理由を Claude に返せるので、置き場を変えて続けられる。
- 試行錯誤：最初の実装はリポジトリの中のパスだけを見ていて、`cp /外/a.wav tests/` を通した。音声の名前がコピー元にしか出ないからである。先に書いたテストで見つかり、コピー系のコマンドは最後の引数をコピー先として扱う形に直した。
- 試行錯誤：直したあとも、`cp /外/a.wav tests/ 2>/dev/null` を通した。最後の引数が `/dev/null` になるからである。セルフレビューで見つかり、リダイレクトを除いてからコピー先を決める形に直した。
- 採らなかった案：Bash の引数をすべて検査する案。`git commit -m "*.wav を除外する"` や `ls a.wav` のような、書かない操作まで止まる。
- 残る穴：スクリプトの中で書かれるファイルと、フォルダーごとのコピーは見えない。この2つは `.gitignore` と CI の検査で止める。

## 2026-11-02 コミットの著者で作業の主体を分ける

- 決めたこと：ユーザーとの共同作業は、ユーザーを著者にして、本文の末尾の `Co-Authored-By` に Claude を書く。Issue から自走するコミットは `claude[bot]` を著者にする。
- 理由：誰が何を書いたかを、Git の履歴だけで追えるようにする。
- メール：公開リポジトリなので、ユーザーの著者のメールには GitHub の noreply のアドレスを使う。

## 2026-11-02 指示を AGENTS.md に集める

- 決めたこと：エージェントへの指示は `AGENTS.md` に集める。`CLAUDE.md` の中身は `@AGENTS.md` だけにする。`AGENTS.md` の長さは200行を上限にする。
- 理由：Claude Code 以外のエージェントでも同じ指示を読めるようにする。
- 採らなかった案：`CLAUDE.md` に指示を書く案。Claude Code でしか読み込まれない。
- 改めた点（2026-11-02）：PR の本文の見出しは `.github/pull_request_template.md` へ移した。毎回読まれる文書を短くするためで、`AGENTS.md` にはテンプレートへの案内を残す。

## 2026-11-02 音声を Git に入れない

- 決めたこと：読手の録音も本人の声も、ファイルは Git の外に置く。
- 理由：録音の取り下げを頼まれたときに、履歴に残さず応じられる。
- 確認中：キックオフのスライドは、デモで見せるものを公開リポジトリへ入れるよう求めている。音声を外に置く形でよいかは運営へ質問していて、答えはまだない。答えが出たらこの項目を改める。

## 2026-11-02 MIT License の範囲を表で決める

- 決めたこと：MIT License の範囲は `NOTICE.md` の表で決める。知識の文章、データ、札ごとの読みの表、ロゴ、図、音声は範囲の外に置く。
- 理由：知識の文章はほかの人の資料と録音をもとにするので、再利用の許可をユーザーだけでは出せない。運営は Discord で、コードを公開したままデータやロゴの再利用を認めない形も可能で、その場合は条件をはっきり書くよう答えた（2026-11-02）。
- 試行錯誤：最初の `NOTICE.md` は表の行に場所を書くまで MIT License と読めたので、データを足す途中で範囲に入るおそれがあった。場所ではなく対象の種類で決まる書き方に直した。
- 採らなかった案：すべてを MIT License にする案と、知識の文章に CC を付ける案。どちらも第三者の再利用を認めることになる。
