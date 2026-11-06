import { render } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { definition } from '../../.claude/skills/yomimasu/scripts/definition.ts';
import { maSpread, pairLabel, recordedAtLabel, type MaSpread } from './compare.ts';
import { AskNext, againUrl } from './next-point.tsx';
import { playTake } from './play-take.ts';
import { deleteAllRecords, deleteRecord, listRecords, loadTake, type TakeRecord } from './records.ts';
import { resultRows } from './verdict.ts';
import './result.css';
import './records.css';

type State = { kind: 'loading' } | { kind: 'failed' } | { kind: 'ready'; records: TakeRecord[] };
type Column = { name: '前回' | '今回'; record: TakeRecord };

const assistLabel = (record: TakeRecord) => (record.assisted ? '補助あり' : '補助なし');

const Icon = ({ path }: { path: string }) => (
  <svg class="ico" viewBox="0 0 12 12" aria-hidden="true">
    <path d={path} />
  </svg>
);
const PLAY_ICON = 'M2 1l9 5-9 5z';
const STOP_ICON = 'M2 2h8v8H2z';

// 項目の行は結果の画面と同じ順と文で、判定の語も結果の画面と同じものだけを使う（docs/ui-guide.md の10節と12節）。
function CompareTable({ columns }: { columns: Column[] }) {
  const rowsByColumn = columns.map(({ record }) => resultRows(record.measurement));
  return (
    <div class="card cmp">
      <table aria-label="前回と今回">
        <thead>
          <tr>
            <td />
            {columns.map(({ name, record }) => (
              <th key={record.id} scope="col">
                <b>{name}</b>
                <small>{recordedAtLabel(record.recordedAt)}</small>
                <small>{pairLabel(record.pair)}</small>
                <small>{assistLabel(record)}</small>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rowsByColumn[0].map((row, i) => (
            <tr key={row.item}>
              <th scope="row">
                <span class="k">{row.label}</span>
                <small>{row.reference}</small>
              </th>
              {rowsByColumn.map((rows, c) => (
                <td key={columns[c].record.id}>
                  {rows[i].value && <b>{rows[i].value}</b>}
                  <span>{rows[i].unmeasured ? '測れませんでした' : rows[i].verdict}</span>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Spread({ spread }: { spread: MaSpread }) {
  const { minSec, maxSec } = definition.ranges.ma;
  return (
    <section class="card rows res" aria-label="間の平均とばらつき">
      <div>
        <div>
          <span class="k">間の平均</span>
          <small>
            {spread.count}回の平均。目安 {minSec}〜{maxSec}秒
          </small>
        </div>
        <div class="v">
          <b data-testid="ma-mean">{spread.mean}</b>
        </div>
      </div>
      <div>
        <div>
          <span class="k">間のばらつき</span>
          <small>いちばん短い回と長い回の差</small>
        </div>
        <div class="v">
          <b data-testid="ma-spread">{spread.width}</b>
          {spread.range}
        </div>
      </div>
    </section>
  );
}

function ConfirmDeleteAll({ onDelete, onCancel }: { onDelete: () => void; onCancel: () => void }) {
  const cancel = useRef<HTMLButtonElement>(null);
  useEffect(() => cancel.current?.focus(), []);
  return (
    <div class="card confirm" role="group" aria-label="録音を全部消しますか？">
      <b>録音を全部消しますか？</b>
      <p>消した録音は元に戻せません。</p>
      <div class="pair">
        <button ref={cancel} class="btn" type="button" onClick={onCancel}>
          キャンセル
        </button>
        <button class="btn" type="button" onClick={onDelete}>
          全部消す
        </button>
      </div>
    </div>
  );
}

function Records() {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [playing, setPlaying] = useState<number | null>(null);
  const [confirming, setConfirming] = useState(false);
  const stopPlaying = useRef<() => void>(() => {});

  const refresh = () =>
    listRecords().then(
      (records) => setState({ kind: 'ready', records }),
      () => setState({ kind: 'failed' }),
    );

  useEffect(() => {
    void refresh();
    return () => stopPlaying.current();
  }, []);

  function toggle(record: TakeRecord) {
    const wasPlaying = playing === record.id;
    stopPlaying.current();
    if (wasPlaying) return;
    setPlaying(record.id);
    const stop = playTake(
      () => loadTake(record),
      () => setPlaying((current) => (current === record.id ? null : current)),
    );
    stopPlaying.current = stop;
  }

  async function remove(id: number) {
    stopPlaying.current();
    await deleteRecord(id).catch(() => {});
    await refresh();
  }

  async function removeAll() {
    stopPlaying.current();
    setConfirming(false);
    await deleteAllRecords().catch(() => {});
    await refresh();
  }

  if (state.kind === 'loading') return null;
  if (state.kind === 'failed') {
    return (
      <p role="alert">
        端末に残した録音を開けませんでした。ページを開き直してください。
      </p>
    );
  }
  const { records } = state;
  if (records.length === 0) {
    return (
      <p role="status">
        まだ録音がありません。<a href="/read/">まず1回読む</a>
      </p>
    );
  }

  const [current, previous] = records;
  const columns: Column[] = previous
    ? [
        { name: '前回', record: previous },
        { name: '今回', record: current },
      ]
    : [{ name: '今回', record: current }];
  const spread = maSpread(records.map((record) => record.measurement));

  return (
    <>
      <CompareTable columns={columns} />
      {!previous && <p class="fine">もう1回読むと、前回と今回を並べて比べられます。</p>}
      <div class="pair">
        {columns.map(({ name, record }) => (
          <button key={record.id} class="btn" type="button" onClick={() => toggle(record)}>
            {playing === record.id ? (
              <>
                <Icon path={STOP_ICON} />
                やめる
              </>
            ) : (
              <>
                <Icon path={PLAY_ICON} />
                {name}の読み
              </>
            )}
          </button>
        ))}
      </div>
      {spread && <Spread spread={spread} />}
      <section class="kept">
        <h3>残っている録音（{records.length}件）</h3>
        <ul class="card rows" role="list" aria-label="残っている録音">
          {records.map((record) => {
            const at = recordedAtLabel(record.recordedAt);
            const ma = resultRows(record.measurement).find((row) => row.item === 'ma');
            return (
              <li key={record.id}>
                <div>
                  <span class="k">{at}</span>
                  <small>
                    {pairLabel(record.pair)}・{assistLabel(record)}・間 {ma?.value ?? '測れませんでした'}
                  </small>
                </div>
                <button class="btn" type="button" aria-label={`${at} の録音を消す`} onClick={() => remove(record.id)}>
                  消す
                </button>
              </li>
            );
          })}
        </ul>
        {confirming ? (
          <ConfirmDeleteAll onDelete={removeAll} onCancel={() => setConfirming(false)} />
        ) : (
          <button class="btn" type="button" onClick={() => setConfirming(true)}>
            全部消す
          </button>
        )}
      </section>
      <p class="fine">録音は端末の外へ出ません。</p>
      <AskNext again={{ label: 'もう1回読む', url: againUrl(current.pair) }} />
    </>
  );
}

export function mountRecords(element: HTMLElement) {
  render(<Records />, element);
  return () => render(null, element);
}
