import { render } from 'preact';
import { useEffect, useMemo } from 'preact/hooks';
import { measure } from '../../.claude/skills/yomimasu/scripts/measure.ts';
import { nextPoint } from '../../.claude/skills/yomimasu/scripts/next-point.ts';
import { NextPoint } from './next-point.tsx';
import { lastTake, type Take } from './take.ts';
import { levelSentence, noticeOf, resultRows } from './verdict.ts';
import './result.css';

// 補助の有無は上の帯の右に出す。帯は画面の組み立て（render.ts）が置き、この部品の外にある。
function Assist({ assisted }: { assisted: boolean }) {
  useEffect(() => {
    const step = document.querySelector<HTMLElement>('.bar .step');
    if (!step) return;
    step.textContent = assisted ? '補助あり' : '補助なし';
    return () => {
      step.textContent = '';
    };
  }, [assisted]);
  return null;
}

// Take は声の処理の設定を持たないので、自動の音量調整が切れているかは分からない。声の大きさは、設定が Take に入るまで出さない。
function Result({ take, example }: { take: Take; example: boolean }) {
  const measurement = useMemo(() => measure(take), [take]);
  const notice = noticeOf(measurement);
  const level = levelSentence(measurement);
  return (
    <>
      <Assist assisted={take.assisted} />
      {example && <span class="tag">例の録音です</span>}
      <div class="card rows res">
        {resultRows(measurement).map((row) => (
          <div key={row.item}>
            <div>
              <span class="k">{row.label}</span>
              <small>{row.reference}</small>
            </div>
            <div class="v">
              {row.value && <b>{row.value}</b>}
              {row.unmeasured ? '測れませんでした' : row.verdict}
            </div>
          </div>
        ))}
      </div>
      <p class="fine">
        {notice ?? level}
        {(notice ?? level) && <br />}
        明瞭さは測っていません。お手本と聴き比べてください。
      </p>
      <NextPoint answer={nextPoint(measurement, take.pair)} pair={take.pair} />
      <p class="fine">録音は端末の外へ出ません。</p>
    </>
  );
}

// 録音は端末の中にしかないので、URL だけでは結果を開けない。例の録音は、要素に example を付けて示す。
function Screen({ example }: { example: boolean }) {
  const take = lastTake();
  if (!take) {
    return (
      <p role="status">
        まだ録音がありません。<a href="/read/">まず1回読む</a>
      </p>
    );
  }
  return <Result take={take} example={example} />;
}

export function mountResult(element: HTMLElement) {
  render(<Screen example={element.hasAttribute('example')} />, element);
  return () => render(null, element);
}
