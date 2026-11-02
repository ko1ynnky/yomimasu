# 判断の記録

あとの作業に影響する技術と設計の判断を、新しいものを上にして書く。理由と、採らなかった案も残す。結論を改めるときは、元の項目を消さずに、改めた日付と理由を足す。

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
