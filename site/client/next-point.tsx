import { useEffect, useState } from 'preact/hooks';
import { createPortal } from 'preact/compat';
import type { NextPoint as Answer, Point } from '../../.claude/skills/yomimasu/scripts/next-point.ts';
import './next-point.css';

// 「次は？」は画面の組み立て（render.ts）が置く入力の欄の中にあり、この部品の外にある。結果の部品の中に別の欄を作ると、入力の行が2つに見える。
function AskNext({ link }: { link: Point['link'] }) {
  const [ask, setAsk] = useState<Element | null>(null);
  useEffect(() => setAsk(document.querySelector('.screen > .ask')), []);
  if (!ask) return null;
  return createPortal(
    <>
      <p class="ask-q">次は？</p>
      <div class="next">
        <a class="btn btn--line" href={link.url}>
          {link.label}
        </a>
      </div>
    </>,
    ask,
  );
}

// ライブラリの答えをそのまま描き、ここで選び直さない。文の出どころを画面に書かない（docs/ui-guide.md の10節と12節）。
export function NextPoint({ answer }: { answer: Answer }) {
  if (answer.kind === 'hidden') return null;
  if (answer.kind === 'clear') {
    return (
      <section class="card one">
        <div class="l">次に直す1点</div>
        <div class="t">{answer.fix}</div>
        <p>{answer.reason}</p>
      </section>
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
      <AskNext link={point.link} />
    </>
  );
}
