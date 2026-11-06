# /yomimasu

競技かるたの読みに手を挙げられずにいる選手が、家で読んで測り、次に直す1点を知るための Web アプリと Agent Skill です。

開発中です。Built with Claude: Japan 2026 の期間中に、このリポジトリで新しく作っています。

## 触り方

https://yomimasu.karutalog.com で開きます。`main` に入った変更が、そのままここに出ます。

マイクを使わずに結果の画面まで見るときは、`/result/example/` を開きます。録音済みの例の読みを、自分の読みと同じ定義でブラウザーの中で測り、次に直す1点まで出します。録音の画面と、マイクを許可しないときの案内の「例の録音で見る」からも開けます。例の録音はまだ置いていないので、今は「例の録音を読み込めませんでした。」と出ます。

## AI に入れる

読みの知識は、スキル `yomimasu` として AI に入れられます。全日本かるた協会の公認ではありません。

Claude Code、Codex、Cursor、Gemini CLI などのコーディングエージェントには、ターミナルで次を実行します。入れる先のエージェントを選ぶ画面が出ます。Node.js が要ります。

```sh
npx skills add ko1ynnky/yomimasu
```

入れたら、`/yomimasu 余韻の3秒はどこから数える？` のように聞きます。更新するときは `npx skills update` を実行します。

この手順は、リポジトリを公開してから実行して確かめます。読みの知識はスキルに順に足している途中です。

Claude、ChatGPT、Gemini に入れる手順は、入れて答えることを確かめてから、こことアプリに足します。

## 開発の記録

- 判断と理由は [docs/decisions.md](docs/decisions.md) にあります。
- 日ごとの Claude とユーザーの分担は [docs/claude-log/](docs/claude-log/) にあります。
- 測定の定義は [docs/measure.md](docs/measure.md) にあります。

## ライセンス

コードは MIT License です。知識の文章、データ、音声、ロゴは対象外です。正確な範囲は [NOTICE.md](NOTICE.md) を読んでください。
