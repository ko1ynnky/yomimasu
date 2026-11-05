import type { Measurement } from '../../.claude/skills/yomimasu/scripts/measure.ts';
import type { Pair } from './pair.ts';
import { clearLastTake, lastTake, measurementOf, putLastTake, type Take } from './take.ts';

// 録音と結果は、この端末のブラウザーの IndexedDB にだけ残す。測るときも、残すときも、端末の外へ送らない（2026-11-02 のユーザーの判断）。
// 記録には結果を一緒に残す。開くたびに全部の録音を測り直すと、1本に数百ミリ秒かかる端末では一覧が開くまで待たせる。
export type TakeRecord = { id: number; recordedAt: number; pair: Pair; assisted: boolean; measurement: Measurement };
type Audio = Pick<Take, 'pcm' | 'sampleRate' | 'readingStartSec' | 'voiceProcessing'>;

const DB_NAME = 'yomimasu';
const DB_VERSION = 1;
// 音は記録と別の置き場に分ける。記録の一覧を開くたびに、1本で数 MB ある音を全部読み込まないためである。
const RECORDS = 'records';
const AUDIO = 'audio';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(RECORDS, { keyPath: 'id', autoIncrement: true });
      request.result.createObjectStore(AUDIO);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// 記録と音を1つの transaction で読み書きし、片方だけが残らないようにする。
async function transact<T>(mode: IDBTransactionMode, work: (records: IDBObjectStore, audio: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = db.transaction([RECORDS, AUDIO], mode);
      const request = work(transaction.objectStore(RECORDS), transaction.objectStore(AUDIO));
      transaction.oncomplete = () => resolve(request.result);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    db.close();
  }
}

const keptIds = new WeakMap<Take, number>();

// 最後に読んだ録音を残せなかったことを、ページを開き直しても分かるように覚える。
// 覚えないと、結果の画面を開き直したときに、前に残した録音の結果を今回の結果として出してしまう。
const UNKEPT_KEY = 'yomimasu.lastTakeUnkept';

function markUnkept(unkept: boolean) {
  try {
    if (unkept) sessionStorage.setItem(UNKEPT_KEY, '1');
    else sessionStorage.removeItem(UNKEPT_KEY);
  } catch {
    // sessionStorage も使えない環境では、開き直したときに前の録音の結果が出ることがある。
  }
}

function lastUnkept() {
  try {
    return sessionStorage.getItem(UNKEPT_KEY) === '1';
  } catch {
    return false;
  }
}

// 録ったらすぐ残す。残せなくても（容量が足りない、IndexedDB を使えないブラウザー）、開いている画面ではこの録音の結果を出す。
export async function keepTake(take: Take, recordedAt = Date.now()): Promise<void> {
  putLastTake(take);
  const { pcm, sampleRate, readingStartSec, voiceProcessing, pair, assisted } = take;
  const measurement = measurementOf(take);
  try {
    const id = await transact('readwrite', (records, audio) => {
      const added = records.add({ recordedAt, pair, assisted, measurement });
      added.onsuccess = () => audio.put({ pcm, sampleRate, readingStartSec, voiceProcessing } satisfies Audio, added.result);
      return added;
    });
    keptIds.set(take, id as number);
    markUnkept(false);
  } catch {
    // 残せなかったことは、記録の画面に録音が出ないことで分かる。読む流れを止めてまで知らせない。
    markUnkept(true);
  }
}

// 新しい順に返す。時刻は端末の時計で前後することがあるので、残した順の番号で並べる。
export async function listRecords(): Promise<TakeRecord[]> {
  const records = await transact('readonly', (records) => records.getAll() as IDBRequest<TakeRecord[]>);
  return records.sort((a, b) => b.id - a.id);
}

export async function loadTake(record: TakeRecord): Promise<Take | null> {
  const audio = await transact('readonly', (_, audio) => audio.get(record.id) as IDBRequest<Audio | undefined>);
  return audio ? { ...audio, pair: record.pair, assisted: record.assisted } : null;
}

// 最後に読んだ録音を残せなかったときは、前に残した録音を返さない。
export async function latestKept(): Promise<{ take: Take; measurement: Measurement } | null> {
  if (lastUnkept()) return null;
  const [newest] = await listRecords();
  const take = newest ? await loadTake(newest) : null;
  return take ? { take, measurement: newest.measurement } : null;
}

// 消した録音を、開いている画面の置き場からも消す。消したのに結果の画面に出ることがないようにする。
export async function deleteRecord(id: number): Promise<void> {
  await transact('readwrite', (records, audio) => {
    records.delete(id);
    return audio.delete(id);
  });
  const shown = lastTake();
  if (shown && keptIds.get(shown) === id) clearLastTake();
}

export async function deleteAllRecords(): Promise<void> {
  await transact('readwrite', (records, audio) => {
    records.clear();
    return audio.clear();
  });
  clearLastTake();
}
