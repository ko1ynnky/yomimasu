// ページが読み込む入口。画面の部品（main.ts）と、本文を入れ替える殻（shell.ts）を読み込む。
// main.ts は各 Issue が画面の部品を足すファイルなので、殻はそこへ足さずにここで読み込む。
import '../main.ts';
import './shell.ts';
