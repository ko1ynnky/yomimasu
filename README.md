# /yomimasu

競技かるたの読みに手を挙げられずにいる選手が、家で読んで測り、次に直す1点を知るための Web アプリと Agent Skill です。

Built with Claude: Japan 2026 の応募作で、期間中にこのリポジトリで新しく作りました。最初のコミットは 2026-11-02 21:35 JST で、期間の始まりの 12:30 JST よりあとです。

2026-11-10 の審査が終わるまで、Issue と PR は受け付けません。

## 審査の方へ

- デモ動画：https://youtu.be/zh4ETlFuMLs （2分57秒）。アプリを実際に使う場面は 1:35〜2:27 で、https://youtu.be/zh4ETlFuMLs?t=95 からそこを再生できます。
- アプリ：https://yomimasu.karutalog.com 。ログインは要りません。マイクを使わずに結果の画面まで見るときは、https://yomimasu.karutalog.com/result/example/ を開きます（[マイクを使わずに結果まで見る](#マイクを使わずに結果まで見る)）。
- Claude の活用：[Claude の活用と開発の記録](#claude-の活用と開発の記録)にまとめました。ラベルを付けた Issue から GitHub Actions の Claude が自走で開き、マージした PR は8件です（[#6](https://github.com/ko1ynnky/yomimasu/pull/6)、[#17](https://github.com/ko1ynnky/yomimasu/pull/17)、[#22](https://github.com/ko1ynnky/yomimasu/pull/22)、[#36](https://github.com/ko1ynnky/yomimasu/pull/36)、[#38](https://github.com/ko1ynnky/yomimasu/pull/38)、[#39](https://github.com/ko1ynnky/yomimasu/pull/39)、[#47](https://github.com/ko1ynnky/yomimasu/pull/47)、[#56](https://github.com/ko1ynnky/yomimasu/pull/56)）。ほかの PR も、手元のセッションで Claude Code と作りました。
- 公開アプリは、録音を端末の外へ出さないために、実行時に Claude を呼びません。この決まりは [REVIEW.md](REVIEW.md) の「マージを止める項目」にあります。

## 提出の時点でできること

- 教科書：入口の「/総論を学ぶ」「/最低限これだけ」「/ポイントを知る」「/1首ずつ学ぶ」から、読みの決まりと要点、序歌と100首の1首ずつのページを読めます。1首のページでは、その札のお手本を聞けます。
- 読む：お手本を聞き、5-3-1-6 の時間で朱に変わっていく歌の字を見ながら、1組を読んで録音します。時間の補助（字の朱と区切りの囲み）を外して読むことも、練習モードで組を選ぶこともできます。
- 結果：下の句＋余韻、間、上の句の秒数を目安の幅と並べ、次に直す1点を1つだけ示します。自分の読みとお手本を聴き比べ、端末に残した前回の記録と比べられます。
- 例の録音：マイクを使わずに、録音済みの例の読みで結果の画面まで見られます。
- スキル `/yomimasu`：読みの知識を AI に入れられます。コーディングエージェントでは、録音した WAV を Web アプリと同じ定義で測り、自分の練習用の読み札も作れます。

## 触り方

スマートフォンかパソコンのブラウザーで https://yomimasu.karutalog.com を開きます。ログインは要りません。`main` に入った変更が、そのままここに出ます。

1. 入口の「/まず1回読む」を押し、「お手本を聞く」で1組のお手本を聞きます。1組は、前の札の下の句から、余韻と間を挟んで次の札の上の句までです。はじめて開いたときは、その前に 5-3-1-6 の配分の説明が出ます。
2. 「読んでみる」を押し、次の画面で「読み始める」を押してマイクを許可します。3・2・1 と数えたあと、歌の字が朱に変わっていくのに合わせて1組を読み、上の句まで読んだら「読み終えた」を押します。
3. 結果の画面に、下の句＋余韻、間、上の句の秒数が目安の幅と並び、次に直す1点が1つだけ出ます。自分の読みとお手本を聴き比べられます。

組を選んで読むときは、入口の「/練習モード」から、ランダムに出題するか、下の句と上の句の札を自分で選びます。

録音は端末の外へ送りません。録音と結果はこのブラウザーに残り、「前回と比べる」の画面で前回と比べたり、消したりできます。

### マイクを使わずに結果まで見る

https://yomimasu.karutalog.com/result/example/ を開くと、録音済みの例の読みを、自分の読みと同じ定義でブラウザーの中で測り、次に直す1点まで出します。録音の画面と、マイクを許可しないときの案内の「例の録音で見る」からも開けます。例の録音は、このアプリの作者が間を長めにとって読んだ1組（81番の下の句と45番の上の句）です。

### 手元で動かす

Node.js 22.18 以上で `npm ci` と `npm run dev` を実行すると、http://127.0.0.1:8787 で開きます。`npm run check` で型検査、テスト、シェルの検査、ビルドを通します。
お手本と例の録音の音声はリポジトリに置いていないので、手元ではお手本が鳴らず、例の録音の結果も読み込めません。

## AI に入れる

読みの知識は、スキル `yomimasu` として AI に入れられます。全日本かるた協会の公認ではありません。

Claude Code、Codex、Cursor、Gemini CLI などのコーディングエージェントには、ターミナルで次を実行します。入れる先のエージェントを選ぶ画面が出ます。Node.js が要ります。

```sh
npx skills add ko1ynnky/yomimasu --skill yomimasu
```

入れたら、`/yomimasu 余韻の3秒はどこから数える？` のように聞きます。更新するときは `npx skills update` を実行します。

`--skill yomimasu` を付けると、`yomimasu` だけが入ります。付けないと、このリポジトリの開発用のスキル（`review-pr` と `verify`）も入れる候補に出ます。読みの知識はスキルに順に足している途中です。

skills 1.7.6 を使い、空のフォルダーに入れて次を確かめました。

- 2026年11月7日、Claude Code：`-a claude-code -y --copy` も付けて入れると、`.claude/skills/yomimasu` に `yomimasu` だけが入りました。
- 2026年11月8日、Codex と Cursor：`-a codex -y` か `-a cursor -y` も付けて入れると、どちらも `.agents/skills/yomimasu` に入りました。Codex CLI 0.164.0 と Cursor の CLI（cursor-agent 2026.11.05）に「競技かるたの読みで、余韻の3秒はどこから数えますか？」と聞くと、どちらも `SKILL.md`、`references/README.md`、`references/timing.md` の順に読み、下の句の最後の字から数えると答えました。
- 2026年11月8日、Codex で測る：間を2.2秒にした合成音の WAV を置いて `/yomimasu 結果を見る ./reading.wav ほ あはれ` と頼むと、Codex はスキルのスクリプトを自分で実行し、作った音のとおりの秒数（下の句＋余韻 8.0秒、間 2.2秒、上の句 6.0秒）と、次に直す1点「間を1.0秒にそろえる」を返しました。
- 2026年11月8日、更新：入れたスキルを古い版に見せかけてから `npx skills update -p -y` を実行すると、新しい版を取り直して上書きしました。入れたままの版では、何もしませんでした。

選ぶ画面から入れる手順、`-g`（ユーザー全体）に入れる形、Claude Code に `--copy` を付けずに入れる形、Gemini CLI などほかのエージェントは確かめていません。

### スキルで読みを測る

コーディングエージェントでは、自分の読みを録音した WAV ファイルのパスを渡すと、Web アプリと同じ定義で測り、結果の画面と同じ行と「次に直す1点」を返します。

```text
/yomimasu 結果を見る ~/reading.wav ほ あはれ
```

- ファイルのあとに、前の札（下の句）と次の札（上の句）を決まり字で書きます。書かなければ、ほ → あはれ の組として測ります。組は秒数を変えず、次に直す1点で案内する教科書のページだけを変えます。
- 録音は1組（前の札の下の句、余韻、間、次の札の上の句）だけにし、頭と終わりに声のない時間を少し入れます。ファイルの頭から測ります。
- 読める形は WAV（16、24、32 bit の整数と 32 bit の小数）だけです。m4a などは WAV に書き出してから渡します。
- 序歌を含む組は、まだ測れません。
- 音声はエージェントを動かしている端末の上でスクリプトが読み、AI には測った秒数と文だけを返します。

Web アプリのボタンが打ち込むコマンド（`総論を学ぶ`、`1首 なげき`、`読む ほ あはれ` など）も、スキルで同じ表から答えます。表は `.claude/skills/yomimasu/scripts/commands.ts` にあります。測るのとコマンドに答えるのには、スキルの中のスクリプトを動かせるエージェントが要ります。

Claude、ChatGPT、Gemini には、Web アプリの https://yomimasu.karutalog.com/install/ から入れます。Claude と Gemini には `yomimasu.zip`、ChatGPT にはプラグインの形の `yomimasu-chatgpt.zip` を保存して上げます。どちらも `SKILL.md` と `references/` の知識だけで、スクリプトは入れていないので、測ることはできません。2026-11-06 に3社に入れて試し、Claude と Gemini は問いに対してスキルを読み込んで答えました。ChatGPT は、プラグインとして入れると、ふだんのチャットで使いました。

## 使っているデータと資料

- 歌の本文：[nyoronjp/Ogura_Hyakunin_Isshu.csv](https://github.com/nyoronjp/Ogura_Hyakunin_Isshu.csv)（コミット `42cfd44`、Unlicense）。誤りを直したところは札ごとに記録しています。
- 序歌の本文：公開の本文データにないので、読手テキストの読み方一覧の形を手で入れました。
- 5・3・1・6の方式、伸ばす箇所、ふりがな、注、別の読み、余韻の印：全日本かるた協会 競技かるた部（読唱）『小倉百人一首 競技かるた読手テキスト』の完全版（令和2年4月1日初版）と HP掲載用抜粋版（令和7年4月1日改訂版）。協会から使う許可を得た範囲で使っています。
- 知識の文章の材料：上の読手テキストのほか、協会の『読手講習ビデオ（PDF版）』（2020年10月）と、髙橋A級公認読手が書いたメモ2本（著者の許可を得ています）。口の形と「ん」の位置の図と文は、一般の音声学の公開の資料と研究の論文をもとに、このアプリが描きました。
- お手本の音声：髙橋A級公認読手が録音した序歌と100首の上の句と下の句（202本）。読手本人の許諾を得て使っています。音声はリポジトリに置かず、アプリから配っています。
- 例の録音：作者が自分で読んで録音した1組です。
- 入口の絵の乱数：MT19937 の参照実装の手順を TypeScript に書き直しました。元の著作権表示を NOTICE.md に載せています。

詳しい範囲と権利は [NOTICE.md](NOTICE.md) にあります。

## 公認や提携

このプロジェクトは全日本かるた協会の公認を受けていません。Anthropic の製品やデモでもありません。画面は Claude Code に似せていますが、公開アプリの中で Claude は動いていません。

## ライセンス

ソースコード、スクリプト、設定、開発の文書（スキルの `SKILL.md` と、測定の定義の `docs/measure.md` を含みます）は [MIT License](LICENSE) です。知識の文章、次に直す1点の文、札の文字と読みのデータ、図と画像、音声は対象外で、コードや文書のファイルの中にあっても対象外です。協会の資料とそのほかの資料から来た内容も、どのファイルにあっても対象外です。正確な範囲は [NOTICE.md](NOTICE.md) の表にあります。

## Claude の活用と開発の記録

Claude Code を開発の中心に置き、1人で次の体制を組みました。まとめ役のセッションが、仕事を別のセッションに切り出します。私が Issue にラベルを付けると、GitHub Actions の Claude が実装から PR の作成、レビュー、修正まで進めます。競技かるたの読みの知識は、協会の許可の範囲で Agent Skill `/yomimasu` にまとめ、実装する Claude にも利用者にも同じ知識を渡します。スキルが実際に役立つかを確かめるため、Web アプリもこのスキルを通して作りました。コードを書く前の最初のコミット（[c3ca69f](https://github.com/ko1ynnky/yomimasu/commit/c3ca69f95ff35e3d391b5a0ea8f9947f087da444)）の AGENTS.md で、「読みや測定に触る Issue は、`/yomimasu` の読み込みから始める」と決めています。Web アプリは、スキルの札の表と、測定と次に直す1点のスクリプトをそのまま読み込んでいます（例：[site/build.ts](site/build.ts) が札の表を、[site/client/take.ts](site/client/take.ts) が `scripts/measure.ts` を読み込みます）。公開アプリは実行時に Claude を呼びません。次に直す1点を選ぶ規則は、開発のときに14通りの数値を Claude に評価させ、評価が規則の答えと一致することを確かめてから決めました。私の判断が要る所は、Claude が Artifact に並べて見せました。

仕組みと記録は次の場所にあります。

- [AGENTS.md](AGENTS.md)：Claude が作業の前に読む決まり。Issue からの始め方、テストの書き方、コミットと PR の形を書いています。
- [REVIEW.md](REVIEW.md)：マージを止める項目。手元のレビューと Actions の自動レビューが、同じ表を当てはめます。
- [.claude/](.claude/)：読み取りだけのレビュー担当のサブエージェント（[agents/reviewer.md](.claude/agents/reviewer.md)）、音声ファイルと鍵の書き込みを止める hook（[hooks/](.claude/hooks/)）、スキル（[skills/](.claude/skills/)。知識と測定の `yomimasu`、動かして確かめる `verify`、PR をレビューする `review-pr`）。
- [.github/workflows/auto.yml](.github/workflows/auto.yml)：`go:merge` か `go:pr` のラベルを付けた Issue から、Claude が実装して PR を開きます。レビューの指摘に答える修正も、この Workflow で起こします。
- [.github/workflows/review.yml](.github/workflows/review.yml)：Claude が開いた PR を、別の実行の Claude が `REVIEW.md` で読みます。`go:merge` の PR は、検査とレビューが通り、[risk-gate.yml](.github/workflows/risk-gate.yml) が許したときだけ自動でマージします。
- [docs/decisions.md](docs/decisions.md)：あとの作業に影響する判断と理由、採らなかった案、失敗した試行。
- [docs/claude-log/](docs/claude-log/)：Claude とユーザーの分担の記録で、2026-11-02 の分を例として残しています。11月3日からは、各 PR の本文の「Claude の記録」の節に、読み込んだスキルとレビューの要約を書いています。Claude が自走で開いた PR には、実行ごとのモデル、ターン数、トークンを「実行の要約」のコメントで残しています。
- [PR #38](https://github.com/ko1ynnky/yomimasu/pull/38) の「Claude の記録」：次に直す1点の選び方を Claude に評価させた条件と、14通りの結果。この順は、どの外れが競技者に効くかを測って決めたものではありません（[docs/decisions.md](docs/decisions.md) の「2026-11-05 次に直す1点を…」の限界）。
- [docs/measure.md](docs/measure.md)：測定の定義。Web アプリとスキルが同じ定義を使います。
