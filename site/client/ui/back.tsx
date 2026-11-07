// 読む流れの部品が置く「戻る」。教科書の画面に組み立てで置くもの（site/render.ts の BACK）と同じ印にする。
// 押したときの動き（打ち込む、行き先を尋ねる、入口へ移る）は殻（shell.ts）が document で受けるので、部品は置くだけである。
// 質問は、いちばん近い data-back-group の要素（なければ入力の欄 .ask）の中身と入れ替わる。
export const Back = () => (
  <a class="btn btn--line back" href="/" data-back>
    戻る
  </a>
);
