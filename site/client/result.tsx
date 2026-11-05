import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import type { Measurement } from '../../.claude/skills/yomimasu/scripts/measure.ts';
import { nextPoint } from '../../.claude/skills/yomimasu/scripts/next-point.ts';
import { loadExample } from './example.ts';
import { againUrl, NextPoint } from './next-point.tsx';
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

// 例の録音は利用者が読んだものではないので、「もう1回読む」「読み直す」ではなく、同じ組を読んでみるよう誘う。
const exampleAgain = (take: Take) => ({ label: '読んでみる', url: againUrl(take.pair) });

// Take は声の処理の設定を持つが、measure に autoGainControl を渡していない。iPhone で設定の値を信じられるかを実機で確かめるまで渡さない（docs/measure.md）ので、声の大きさは出さない。
// 聴き比べ（C6）の再生は、この take をそのまま鳴らす。例の録音は端末に残さないので、records.ts の loadTake では読み直せない。例のときは「自分の読み」と書かない。
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
      <NextPoint
        answer={nextPoint(measurement, take.pair)}
        pair={take.pair}
        more={hasKept ? [COMPARE] : []}
        again={example ? exampleAgain(take) : undefined}
      />
      <p class="fine">録音は端末の外へ出ません。</p>
    </>
  );
}

type Shown = { take: Take; measurement: Measurement };

// 録音は端末の中にしかないので、URL だけでは結果を開けない。開いている画面の録音がなければ、端末に残した最後の録音を出す。
function OwnScreen() {
  const [shown, setShown] = useState<Shown | null | undefined>(() => {
    const take = lastTake();
    return take ? { take, measurement: measurementOf(take) } : undefined;
  });
  useEffect(() => {
    if (shown === undefined) latestKept().then(setShown, () => setShown(null));
  }, []);
  if (shown === undefined) return null;
  if (!shown) {
    return (
      <p role="status">
        まだ録音がありません。<a href="/read/">まず1回読む</a>
      </p>
    );
  }
  return <Result take={shown.take} measurement={shown.measurement} example={false} />;
}

// 例の録音は配信から取り、利用者の録音と同じ定義でこの端末で測る。数値は画面に書き込まず、毎回音から測る。
// 利用者の録音は、開いている画面のものも端末に残したものも読まない。例は端末に残さず、前回と比べる画面に混ぜない。
// 例の音声を置くまでは取れないので、行き止まりにしないよう入口へ戻る道を出す。
function ExampleScreen() {
  const [shown, setShown] = useState<Shown | null | undefined>(undefined);
  useEffect(() => {
    loadExample()
      .then((take) => ({ take, measurement: measurementOf(take) }))
      .then(setShown, () => setShown(null));
  }, []);
  if (shown === undefined) return null;
  if (!shown) {
    return (
      <p role="status">
        例の録音を読み込めませんでした。<a href="/">入口へ戻る</a>
      </p>
    );
  }
  return <Result take={shown.take} measurement={shown.measurement} example />;
}

export function mountResult(element: HTMLElement) {
  render(element.hasAttribute('example') ? <ExampleScreen /> : <OwnScreen />, element);
  return () => render(null, element);
}
