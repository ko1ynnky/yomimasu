import { useEffect, useState } from 'preact/hooks';
import { createPortal } from 'preact/compat';
import type { NextPoint as Answer, Pair, Point } from '../../.claude/skills/yomimasu/scripts/next-point.ts';
import { Back } from './ui/back.tsx';
import './next-point.css';

type Link = Point['link'];

// 塗りのボタンは同じ組をもう一度読む（docs/ui-guide.md の10節）。見本の「補助を外して読む」は、読む画面に補助を URL で渡す作りがないので、まだ置かない。
export const againUrl = ({ shimo, kami }: Pair) => `/read/rec/?shimo=${shimo}&kami=${kami}`;

// 「次は？」は画面の組み立て（render.ts）が置く入力の欄の中にあり、この部品の外にある。結果の部品の中に別の欄を作ると、入力の行が2つに見える。
// 「戻る」も同じ欄に置き、並べ方は教科書の画面（render.ts の withBack）に合わせる。塗りのボタンがあればその右に、なければ「戻る」だけを右に寄せる。
// 尋ねるあいだは殻（ui/shell.ts）が欄の中身を隠すので、ここで描き直した子も隠れたままになる。
export function AskNext({ links = [], again }: { links?: readonly Link[]; again?: Link }) {
  const [ask, setAsk] = useState<Element | null>(null);
  useEffect(() => setAsk(document.querySelector('.screen > .ask')), []);
  if (!ask) return null;
  if (!again) {
    return createPortal(
      <div class="back-row">
        <Back />
      </div>,
      ask,
    );
  }
  return createPortal(
    <>
      <p class="ask-q">次は？</p>
      <div class="next">
        {links.map((link) => (
          <a key={link.url} class="btn btn--line" href={link.url}>
            {link.label}
          </a>
        ))}
        <div class="main-row">
          <a class="btn btn--fill" href={again.url}>
            {again.label}
          </a>
          <Back />
        </div>
      </div>
    </>,
    ask,
  );
}

// ライブラリの答えをそのまま描き、ここで選び直さない。文の出どころを画面に書かない（docs/ui-guide.md の10節と12節）。
// more は、次に直す1点とは別に「次は？」へ足す移動である（前回と比べる など）。again を渡すと、塗りのボタンをそれに替える（例の録音 など）。
export function NextPoint({ answer, pair, more = [], again: given }: { answer: Answer; pair: Pair; more?: readonly Link[]; again?: Link }) {
  if (answer.kind === 'hidden') return <AskNext links={more} again={given ?? { label: '読み直す', url: againUrl(pair) }} />;
  const again = given ?? { label: 'もう1回読む', url: againUrl(pair) };
  if (answer.kind === 'clear') {
    return (
      <>
        <section class="card one">
          <div class="l">次に直す1点</div>
          <div class="t">{answer.fix}</div>
          <p>{answer.reason}</p>
        </section>
        <AskNext links={more} again={again} />
      </>
    );
  }
  const { point } = answer;
  return (
    <>
      <section class="card one">
        <div class="l">次に直す1点</div>
        <div class="t">{point.fix}</div>
        <p>{point.reason}</p>
        <p>{point.how}</p>
      </section>
      <AskNext links={[point.link, ...more]} again={again} />
    </>
  );
}
