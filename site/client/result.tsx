import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import type { Measurement } from '../../.claude/skills/yomimasu/scripts/measure.ts';
import { nextPoint } from '../../.claude/skills/yomimasu/scripts/next-point.ts';
import { NextPoint } from './next-point.tsx';
import { latestKept, listRecords } from './records.ts';
import { lastTake, measurementOf, type Take } from './take.ts';
import { levelSentence, noticeOf, resultRows } from './verdict.ts';
import './result.css';

const COMPARE = { label: '前回と比べる', url: '/result/compare/' };

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

// 録音が1件でも残っていれば「前回と比べる」を出す。録音を消す操作はその画面にしかないので、前回がないうちも出す。
// 残っていないとき（残せなかったとき、例の録音のとき）は出さない。開いても何もない。
function useHasKept(example: boolean) {
  const [hasKept, setHasKept] = useState(false);
  useEffect(() => {
    if (!example) listRecords().then((records) => setHasKept(records.length > 0), () => {});
  }, []);
  return hasKept;
}

// Take は声の処理の設定を持つが、measure に autoGainControl を渡していない。iPhone で設定の値を信じられるかを実機で確かめるまで渡さない（docs/measure.md）ので、声の大きさは出さない。
function Result({ take, measurement, example }: { take: Take; measurement: Measurement; example: boolean }) {
  const notice = noticeOf(measurement);
  const level = levelSentence(measurement);
  const hasKept = useHasKept(example);
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
      <NextPoint answer={nextPoint(measurement, take.pair)} pair={take.pair} more={hasKept ? [COMPARE] : []} />
      <p class="fine">録音は端末の外へ出ません。</p>
    </>
  );
}

type Shown = { take: Take; measurement: Measurement };

// 録音は端末の中にしかないので、URL だけでは結果を開けない。開いている画面の録音がなければ、端末に残した最後の録音を出す。
// 例の録音は、要素に example を付けて示す。例の画面に利用者の録音を出さないよう、端末に残した録音は読まない。
function Screen({ example }: { example: boolean }) {
  const [shown, setShown] = useState<Shown | null | undefined>(() => {
    const take = lastTake();
    return take ? { take, measurement: measurementOf(take) } : undefined;
  });
  useEffect(() => {
    if (shown !== undefined) return;
    if (example) setShown(null);
    else latestKept().then(setShown, () => setShown(null));
  }, []);
  if (shown === undefined) return null;
  if (!shown) {
    return (
      <p role="status">
        まだ録音がありません。<a href="/read/">まず1回読む</a>
      </p>
    );
  }
  return <Result take={shown.take} measurement={shown.measurement} example={example} />;
}

export function mountResult(element: HTMLElement) {
  render(<Screen example={element.hasAttribute('example')} />, element);
  return () => render(null, element);
}
