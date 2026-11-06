# 静的なページ

`content/` の Markdown を `site/build.ts` が HTML に書き出す。JS がなくても本文を読める。

## 確かめること

- JS を切っても `main` に本文が出る。
- 書き足したページは固有の URL で開ける。
- どのページの head にも、題、説明、ファビコン、共有したときの題と画像のタグがあり、og:url が本番のオリジンの自分の URL である（`e2e/head.spec.ts`）。
- ないパスは 404 で、ページがないことと、入口へ戻る操作を出す。

## 利用者の経路

`/` を開く。検索や共有の URL から来る人は JS の実行を待たずに本文を読める。

## Playwright での動かし方

`javaScriptEnabled: false` の context で開き、`page.locator('main')` の文を確かめる。

## 注意

- ページの先頭に `title` の行がないと、組み立てが止まる。
- `dist/` は生成物なので直接直さない。
