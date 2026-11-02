# 判断の記録

あとの作業に影響する技術と設計の判断を、新しいものを上にして書く。理由と、採らなかった案も残す。結論を改めるときは、元の項目を消さずに、改めた日付と理由を足す。

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
