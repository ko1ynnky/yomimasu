import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import type { Measurement } from '../../.claude/skills/yomimasu/scripts/measure.ts';
import { nextPoint } from '../../.claude/skills/yomimasu/scripts/next-point.ts';
import { loadExample } from './example.ts';
import { ListenBack } from './listen-back.tsx';
import { AskNext, againUrl, NextPoint } from './next-point.tsx';
import { latestKept, listRecords } from './records.ts';
import { lastTake, measurementOf, type Take } from './take.ts';
import { levelSentence, NOT_MEASURED, noticeOf, resultRows, UNMEASURED_ROW } from './verdict.ts';
import './result.css';

const COMPARE = { label: '前回と比べる', url: '/result/compare/' };
const RESULT_PROGRESS = '3 / 3 結果';

// 補助の有無は上の帯の右に出す。帯は画面の組み立て（render.ts）が置き、この部品の外にある。
// 読む流れから来たときは、進み具合（3 / 3 結果）に続けて出す。
function Assist({ assisted, progress }: { assisted: boolean; progress?: string }) {
  useEffect(() => {
    const step = document.querySelector<HTMLElement>('.bar .step');
    if (!step) return;
    const assist = assisted ? '補助あり' : '補助なし';
    step.textContent = progress ? `${progress}・${assist}` : assist;
    return () => {
      step.textContent = '';
    };
  }, [assisted, progress]);
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
// 聴き比べ（C6）は、この take をそのまま鳴らす。例の録音は端末に残さないので、records.ts の loadTake では読み直せない。
// 例の録音は利用者が読んだものではないので、「自分の読み」と書かない。
// justRead は、このページで読んだばかりの録音である。読む流れの進み具合（3 / 3 結果）は、そのときだけ出す。
// 「● 録音しました」は、読む画面から移るときに殻が実行の行に置く（ui/shell.ts の go）。部品が足すと、殻が読んだ行を 110ms 隠す順に間に合わない。
function Result({ take, measurement, example, justRead = false }: { take: Take; measurement: Measurement; example: boolean; justRead?: boolean }) {
  const notice = noticeOf(measurement);
  const level = levelSentence(measurement);
  const hasKept = useHasKept(example);
  return (
    <>
      <Assist assisted={take.assisted} progress={justRead ? RESULT_PROGRESS : undefined} />
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
              {row.unmeasured ? UNMEASURED_ROW : row.verdict}
            </div>
          </div>
        ))}
      </div>
      <p class="fine">
        {notice ?? level}
        {(notice ?? level) && <br />}
        {NOT_MEASURED}
      </p>
      <NextPoint
        answer={nextPoint(measurement, take.pair)}
        pair={take.pair}
        more={hasKept ? [COMPARE] : []}
        again={example ? exampleAgain(take) : undefined}
      />
      <ListenBack take={take} ownLabel={example ? '例の読み' : '自分の読み'} />
      <p class="fine">録音は端末の外へ出ません。</p>
    </>
  );
}

type Shown = { take: Take; measurement: Measurement };

// 録音は端末の中にしかないので、URL だけでは結果を開けない。開いている画面の録音がなければ、端末に残した最後の録音を出す。
// 開いている画面の録音は、ページを開き直さずに読む画面から移ってきたときにだけある（take.ts）。
function OwnScreen() {
  const [shown, setShown] = useState<(Shown & { justRead: boolean }) | null | undefined>(() => {
    const take = lastTake();
    return take ? { take, measurement: measurementOf(take), justRead: true } : undefined;
  });
  useEffect(() => {
    if (shown === undefined) latestKept().then((kept) => setShown(kept && { ...kept, justRead: false }), () => setShown(null));
  }, []);
  if (shown === undefined) return null;
  if (!shown) {
    return (
      <>
        <p role="status">
          まだ録音がありません。<a href="/read/">まず1回読む</a>
        </p>
        <AskNext />
      </>
    );
  }
  const { take } = shown;
  return (
    <>
      <Result take={take} measurement={shown.measurement} example={false} justRead={shown.justRead} />
      <div
        hidden
        data-testid="take"
        data-length-sec={(take.pcm.length / take.sampleRate).toFixed(3)}
        data-reading-start-sec={take.readingStartSec.toFixed(3)}
        data-assisted={String(take.assisted)}
        data-pair={`${take.pair.shimo}-${take.pair.kami}`}
        data-voice-processing={JSON.stringify(take.voiceProcessing)}
      />
    </>
  );
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
      <>
        <p role="status">
          例の録音を読み込めませんでした。<a href="/">入口へ戻る</a>
        </p>
        <AskNext />
      </>
    );
  }
  return <Result take={shown.take} measurement={shown.measurement} example />;
}

export function mountResult(element: HTMLElement) {
  render(element.hasAttribute('example') ? <ExampleScreen /> : <OwnScreen />, element);
  return () => render(null, element);
}
