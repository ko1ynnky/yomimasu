# 静的なページ

`content/` の Markdown を `site/build.ts` が HTML に書き出す。JS がなくても本文を読める。

## 確かめること

- JS を切っても `main` に本文が出る。
- 書き足したページは固有の URL で開ける。
- どのページの head にも、題、説明、ファビコン、共有したときの題と画像のタグがあり、og:url と canonical が本番のオリジンの自分の URL である。組を受け取る `/read/` と `/read/rec/` は canonical を書かない。説明はページの間で重ならない（`e2e/head.spec.ts`）。殻で画面を入れ替えたあとも、canonical は今の画面を指し、canonical のない画面では外れる（`e2e/shell.spec.ts`）。
- `/sitemap.xml` は、端末に残した録音を出す画面（`/result/`、`/result/compare/`）のほかの組み立てたページを並べ、どの URL も 200 で開けて、canonical を書くページでは自分を指す。
- `/robots.txt` は `Sitemap:` の行だけで、クローラーごとの規則を書かない。本番では配信の Cloudflare が規則を前に足す（`docs/decisions.md` の 2026-11-17）。
- ないパスは 404 で、ページがないことと、入口へ戻る操作を出す。og:url と canonical は書かない。

## 利用者の経路

`/` を開く。検索や共有の URL から来る人は JS の実行を待たずに本文を読める。

## Playwright での動かし方

`javaScriptEnabled: false` の context で開き、`page.locator('main')` の文を確かめる。

## 注意

- ページの先頭に `title` か `description` の行がないと、組み立てが止まる。
- `dist/` は生成物なので直接直さない。
