# 録音と測定

読んだ声を AudioWorklet の PCM で受け、その場で測って秒数を見せる。録音は端末の外へ出さない。

## 確かめること

- 「読む」で録音が始まり、「止める」で秒数が出る。
- 間を長くした合成音では、画面の間も長くなる。
- マイクを許可しないと、許可を促す。
- 録音の準備に失敗すると、マイクを閉じて理由を出す。
- 測れない録音では、値を作らず理由を出す。
- 「読む」を続けて押しても、マイクは1つだけ開く。
- 止めたあとに、マイクが閉じている。

## 利用者の経路

`/` を開き、「読む」を押して読み、「止める」を押す。

## Playwright での動かし方

`e2e/record.spec.ts` のように、次の引数で Chromium を起動する。

```text
--use-fake-ui-for-media-stream
--use-fake-device-for-media-stream
--use-file-for-fake-audio-capture=<合成音の WAV>%noloop
```

ボタンは `getByRole('button', { name: '読む' })`、結果は `getByRole('status')`、失敗は `getByRole('alert')` で取る。マイクが閉じたかは、`e2e/record.spec.ts` の `openedMicrophones` で見る。

## 注意

- 偽のマイクは起動時に音を決めるので、音ごとにブラウザーを起動する。
- 録音は実時間で進むので、待ち時間を短くするには合成音を短くする。
- `127.0.0.1` か `localhost` で開く。ほかの http のアドレスでは録音を始められなかった。
- 合成音はリポジトリに置かず、OS の一時フォルダーへ書く。
