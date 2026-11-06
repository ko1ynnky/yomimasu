# ライセンスの範囲

[LICENSE](LICENSE) の MIT License は、次の表で「MIT License」と書いたものだけに適用します。ほかの行に当たるものは、どのフォルダーに置かれていても適用しません。

| 対象 | 場所 | 扱い |
| --- | --- | --- |
| ソースコード、スクリプト、設定ファイル、開発の文書 | リポジトリ全体 | MIT License |
| スキルの `SKILL.md` | スキルのフォルダー | MIT License |
| 測定の定義 | `docs/measure.md` | MIT License |
| 知識の文章 | `content/`（1首のページの文 `content/karuta/rules.ts` を含みます）、スキル `yomimasu` の `references/`。`test/site/karuta.test.ts`、`test/site/mouth.test.ts`、`e2e/textbook.spec.ts`、`e2e/mouth.spec.ts` の期待値にも、その文の一部があります | 権利を留保します。読むことと、個人の練習で使うことだけを認めます |
| 次に直す1点の文 | `.claude/skills/yomimasu/assets/next-point.json` | 権利を留保します。読むことと、個人の練習で使うことだけを認めます。知識の文章と同じ扱いで、再利用を認めません |
| 札の文字のデータ | `.claude/skills/yomimasu/assets/cards.json` の本文の列 | 再利用を認めません。`.claude/skills/yomimasu/scripts/reading-cards.ts` が出す読み札（本文と仮名だけ）は、自分の練習のために印刷することを認めます。配ることと、ほかの人に渡すことは認めません。元のデータの権利は[外部のデータ](#外部のデータ)のとおりです |
| そのほかのデータ | 置くときにここへ書きます | 再利用を認めません。出典と権利は、置くときにここへ書きます |
| 札ごとの読みの表 | `.claude/skills/yomimasu/assets/cards.json`。同じ値を含む `scripts/cards/corrections.ts`、`.claude/skills/yomimasu/scripts/cards.ts` の札の番号、`test/cards/` の期待値（ふりがな、注、別の読み、余韻の印の値は `test/cards/table.test.ts`、`test/cards/assemble.test.ts`、`test/cards/sound.test.ts`）、`docs/ui-sample.html` の見本の3首と100首の決まり字、`test/site/lyrics.test.ts`、`test/site/karuta.test.ts`、`test/site/mouth.test.ts`、`test/site/kimariji-stream.test.ts`、`e2e/stage.spec.ts`、`e2e/textbook.spec.ts`、`e2e/mouth.spec.ts` の期待値。教科書の1首のページと100首の一覧は、組み立てのときにこの表から作ります | 再利用を認めません。伸ばす箇所は抜粋版の、ふりがな、注、別の読み、余韻の印は完全版の内容として、全日本かるた協会の回答の範囲で使っています |
| ロゴ、図、画像 | 置くときにここへ書きます | 再利用を認めません |
| AI に入れる手順の略図 | `site/install.ts`（/install/claude/、/install/chatgpt/、/install/gemini/ に出ます） | 再利用を認めません。このアプリが描いた略図で、各社の画面を写しておらず、ロゴも使っていません。項目の名前は、各社の画面の文字をそのまま書いています |
| 口の形と「ん」の位置の図 | `content/karuta/mouth.ts`（教科書の「ポイントを知る」と1首のページに出ます） | 再利用を認めません。このアプリが一般の音声学の資料と研究をもとに描いたもので、ほかの図を写していません。出典は `.claude/skills/yomimasu/references/mouth-shapes.md` の「出典」にあり、画面では「このアプリについて」の出典に出ます。読手テキストの調音点・調音法の一覧と口腔断面図は使っていません |
| 入口の絵（決まり字で組んだ読手の絵） | `site/client/kv-live.js`（入口に出ます。置き方と動かし方は `site/client/kv.ts`） | 再利用を認めません。このアプリのために作った人形と動きを、スクリプトで描いたもので、ほかの図や画像を写していません |
| 入口の絵の決まり字の列 | 組み立てのときに、`site/kimariji-stream.ts` が札ごとの読みの表の上の句の仮名と音から作り、入口の絵のスクリプトと同じファイルに入れます。リポジトリには置きません | 再利用を認めません。札ごとの読みの表から作ったもので、表と同じ扱いです |
| ファビコン、ホーム画面のアイコン、共有したときの画像 | `site/public/favicon.ico`（16、32、48px）、`site/public/apple-touch-icon.png`（180px）、`site/public/og.png`（1200×630。SNS で URL を共有したときに出ます）。`scripts/brand/make.ts` が作ります | 再利用を認めません。入口の絵（上の2行）を、このリポジトリのスクリプトで止めた1コマに描いたもので、ほかの図や画像を写していません。絵の字は決まり字の列から描いたもので、180px のアイコンと共有したときの画像には字が読める大きさで入っています。共有したときの画像の文は入口の題と題の下の文です。字は作った端末の OS の書体（macOS のヒラギノ）で描いています |
| 音声 | リポジトリには置きません。お手本と例の録音は公開しない R2 のバケットに置き、アプリがお手本を `/audio/v1/`、例の録音を `/audio/examples/v1/` で配ります | 録音した人の権利のままです。再利用を認めません。出典は[音声](#音声)に書きます |

## 外部のデータ

このリポジトリが使う外部のデータは、使い始めるときに名前と出典をここへ書きます。

| データ | 出典 | 権利 | 使い方 |
| --- | --- | --- | --- |
| 歌の本文 | [nyoronjp/Ogura_Hyakunin_Isshu.csv](https://github.com/nyoronjp/Ogura_Hyakunin_Isshu.csv)、コミット `42cfd44` | リポジトリの LICENSE は Unlicense で、README は Public Domain と書いています。データの作者がどの資料から書き起こしたかは分かりません。歌そのものは古典です | 漢字の列と仮名の列を使い、誤りを直しました。修正は札ごとに `origin.text.fixes` に残します |
| 序歌の本文 | 読手テキストの読み方一覧 p.5 の形。元の歌は古今和歌集の仮名序に引かれます | 古典です | 公開の本文データにないので手で入れました。競技かるたで読む形で、一般の形とは四句の頭が違います |
| 伸ばす箇所 | 全日本かるた協会 競技かるた部（読唱）『小倉百人一首 競技かるた読手テキスト』HP掲載用抜粋版、令和7年4月1日改訂版、読み方一覧 p.5-15 | 協会の回答により、5・3・1・6の方式と各歌の伸ばす箇所を使っています | ページは札ごとに `origin.stretches.page` に残します。許可の範囲の外のものは載せません。範囲は[協会の資料](#協会の資料)にあります。33番、44番、74番の本文はこの一覧の形に合わせました。発音の列は規則で作り、語の切れ目は一覧のふりがなと比べて確かめました。そのうえで一覧のふりがなの「ー」と注の字を当てたので、30句の発音の列は次の行の値を含みます。54番の四句の1か所は、ユーザーの判断（2026-11-04）で、一覧の「ー」を当てていません |
| ふりがな、注、別の読み、余韻の印 | 全日本かるた協会 競技かるた部（読唱）『小倉百人一首 競技かるた読手テキスト』冊子（完全版）、令和2年4月1日初版と、HP掲載用抜粋版、令和7年4月1日改訂版の読み方一覧 p.5-15 | 協会の回答により、完全版の内容として使っています | `cards.json` の `furigana`、`notes`、`alternatives`、`yoin` の列と、ふりがなの「ー」と注の字を当てた30句の `sound` と `diffs` です。値は抜粋版の文字のデータと画像の位置から読み取り、完全版のスキャンと目で照らしました。一致を目で確かめたのは、ふりがな707か所のうち706か所と、注、別の読み、余韻の印のすべてです。33番のふりがな1か所は読み方一覧のスキャンで濁点が判別できず、完全版 p.27 が同じ語を「しづごころ」と印刷していることと、冊子の実物で確かめました。抜粋版だけにある値と、両版で違う値は入れていません。ページは札ごとに `origin.notation.page` に残します |
| お手本の音声 | A級公認読手の読み。序歌と100首の上の句と下の句の202本です。許諾と使う場面は[音声](#音声)にあります | 録音した人の権利のままです。再利用を認めません | リポジトリに置かず、公開しない R2 のバケット `yomimasu-audio` に `v1/NNN_N.m4a` の名前で置きます。NNN は札の番号の3桁（000 は序歌）、最後の数字は 1 が上の句、2 が下の句です。形式は AAC、48 kHz、モノラル、96 kbps です。アプリの Worker（`site/worker.ts`）が同じオリジンの `/audio/v1/` で配ります |

## 外部のコード

`site/kimariji-stream.ts` の乱数（`PythonRandom`）は、MT19937 の参照実装 mt19937ar.c（2002年1月26日に初期化を改めた版。<http://www.math.sci.hiroshima-u.ac.jp/m-mat/MT/MT2002/CODES/mt19937ar.c>）の初期化（`init_by_array`）と生成の手順を、CPython の `random` と同じ引き方で TypeScript に書き直したものです。元のコードの著作権表示と条件を、元のとおり次に載せます。

```
   Copyright (C) 1997 - 2002, Makoto Matsumoto and Takuji Nishimura,
   All rights reserved.

   Redistribution and use in source and binary forms, with or without
   modification, are permitted provided that the following conditions
   are met:

     1. Redistributions of source code must retain the above copyright
        notice, this list of conditions and the following disclaimer.

     2. Redistributions in binary form must reproduce the above copyright
        notice, this list of conditions and the following disclaimer in the
        documentation and/or other materials provided with the distribution.

     3. The names of its contributors may not be used to endorse or promote
        products derived from this software without specific prior written
        permission.

   THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
   "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
   LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR
   A PARTICULAR PURPOSE ARE DISCLAIMED.  IN NO EVENT SHALL THE COPYRIGHT OWNER OR
   CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL,
   EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO,
   PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR
   PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF
   LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING
   NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
   SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
```

## 公認や提携

このプロジェクトは全日本かるた協会の公認を受けていません。Anthropic の公式の製品でもありません。

## 協会の資料

全日本かるた協会 競技かるた部（読唱）の資料は、協会から使う許可を得た次の範囲で、アプリ、公開リポジトリ、スキル `yomimasu` に入れます。範囲を確かめた日は 2026-11-03 です（最初の回答は 2026-11-02）。

| 資料 | 呼び名 | 版 | 使う範囲 |
| --- | --- | --- | --- |
| 『小倉百人一首 競技かるた読手テキスト』冊子 | 完全版 | 令和2年4月1日初版 | 31〜32ページを除く内容。ふりがな、別の読み、注、発音の注意点を含みます |
| 『小倉百人一首 競技かるた読手テキスト』HP掲載用抜粋版 | 抜粋版 | 令和7年4月1日改訂版 | 5・3・1・6の方式と各歌の伸ばす箇所。そのほかは、完全版にも同じ形で載っている内容に限ります |

使わないもの：調音点・調音法の一覧と口腔断面図（完全版の31〜32ページ）。抜粋版に同じものがあっても使わず、これをもとに作り直したものも、図、表、文のどの形でも載せません。

- どの資料も、ページをそのまま載せません。解説の文は自分の言葉で書き、引用は最小限にします。
- 入れるときは、札か項目ごとに、どの版のどのページから来たかを記録します。入れた場所は、冒頭の表に書きます。
- 許可はこのプロジェクトに対するものです。協会の資料から来た内容は、どのファイルにあっても MIT License の対象外で、再利用を認めません。

## そのほかの資料

知識の文章（`content/` とスキル `yomimasu` の `references/`）は、読手テキストのほかに次の資料を使います。使うと決めた日は、講習資料とメモが 2026-11-04、一般の音声学の資料と研究の論文が 2026-11-05 です。

| 資料 | 版 | 使う範囲 |
| --- | --- | --- |
| 全日本かるた協会『読手講習ビデオ（PDF版）』 | 2020年10月。協会のサイトで公開されている PDF | 解説の材料にします。文は自分の言葉で書き、項目ごとにスライドの番号を記録します |
| A級公認読手が書いたメモ2本。初めて読む人向けのものと、大会で読む人向けのもの | 前者は2018年作成、後者は2020年作成で、どちらも2022年更新 | 解説の材料にします。協会の基準ではなく、読手個人のやり方として書きます。著者から使う許可を得ています。著者の名前は書きません |
| 一般の音声学の公開の資料：Wikipedia 英語版の「Japanese phonology」「Vowel」「Nasal consonant」「Uvular nasal」、日本語版の「日本語の音韻」、国際音声記号の表。「ん」を実測した研究の論文と報告書：Maekawa 2019（ICPhS）、前川ほか 2018（日本音響学会）、科研費 17H02339 の研究成果報告書、Hashi ほか 2016（音声研究）、Mizoguchi 2019（博士論文の要旨）、Youngberg 2021（Glossa）、渡辺・山田・中山「撥音／ん／の歌唱時における周波数下降を決める要因について」（大阪芸術大学の紀要論文） | URL と参照した日は `.claude/skills/yomimasu/references/mouth-shapes.md` の「出典」にあります。論文は、調査で保存した原文を 2026-11-05 に読みました（Mizoguchi 2019 は要旨だけ） | 余韻で伸ばす最後の音（口の形、「ん」の位置と伸ばし方）の文と図にだけ使います。文は自分の言葉で書き、資料の文と図を写しません。研究の結論、このアプリの解釈、作者の見解を分けて書き、競技かるたの読みで確かめたようには書きません。論文の著者名は、出典の表示にだけ書きます |

- どの資料も、ページをそのまま載せません。
- この資料から来た内容も MIT License の対象外で、再利用を認めません。
- 画面では、どの資料も「このアプリについて」（`/about/#sources`）の出典に、資料ごとの見出しで並べます。

## 音声

デモ動画とアプリで使う読手の音声は、読手本人と録音した人の許諾を得たものだけです。音声ファイルはリポジトリに置かず、使い始めるときに出典をこの節へ書きます。出典には、許諾を得た日、録音した札、使う場面を書きます。読手の名前は書きません。この形で使えることは、ハッカソンの運営に確かめました（2026-11-03）。2026-11-06 から、アプリのお手本に使います。お手本は、読手本人が録音したものです。例の録音は、このアプリの作者が自分で読んで録音したものです。

| 音声 | 許諾を得た日 | 録音した札 | 使う場面 |
| --- | --- | --- | --- |
| A級公認読手のお手本 | 2026-11-01 までに | 序歌と100首の上の句と下の句（202本） | アプリでお手本として鳴らします |
| 例の録音（間を長めにとった1組） | 2026-11-06（作者が自分で録音） | 81番の下の句と45番の上の句（1本） | 例の録音の結果（`/result/example/`）で測り、鳴らします |
