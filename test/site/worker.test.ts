import assert from 'node:assert/strict';
import { test } from 'node:test';
import worker, { type ClipBucket } from '../../site/worker.ts';

const CLIP = Uint8Array.from({ length: 1000 }, (_, i) => i % 256);

function bucketOf(objects: Record<string, Uint8Array>): ClipBucket {
  const metaOf = (key: string) => ({ size: objects[key].length, httpEtag: `"etag-${key}"` });
  return {
    async head(key) {
      return key in objects ? metaOf(key) : null;
    },
    async get(key, options) {
      if (!(key in objects)) return null;
      const { offset, length } = options?.range ?? { offset: 0, length: objects[key].length };
      return { ...metaOf(key), body: new Blob([objects[key].slice(offset, offset + length)]).stream() };
    },
  };
}

const env = {
  AUDIO: bucketOf({ 'v1/001_1.m4a': CLIP, 'v1/notes.txt': CLIP }),
  ASSETS: { fetch: async (request: Request) => new Response(`asset:${new URL(request.url).pathname}`) },
};

const call = (path: string, init?: RequestInit) => worker.fetch(new Request(`https://yomimasu.test${path}`, init), env);
const bytesOf = async (response: Response) => new Uint8Array(await response.arrayBuffer());

test('GET はお手本の全体を audio/mp4 で返す', async () => {
  const response = await call('/audio/v1/001_1.m4a');
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'audio/mp4');
  assert.equal(response.headers.get('content-length'), '1000');
  assert.deepEqual(await bytesOf(response), CLIP);
});

test('お手本には、1年の変えないキャッシュ、ETag、Range を受けることを付ける', async () => {
  const { headers } = await call('/audio/v1/001_1.m4a');
  assert.equal(headers.get('cache-control'), 'public, max-age=31536000, immutable');
  assert.equal(headers.get('etag'), '"etag-v1/001_1.m4a"');
  assert.equal(headers.get('accept-ranges'), 'bytes');
});

test('HEAD は本文なしで、GET と同じヘッダーを返す', async () => {
  const response = await call('/audio/v1/001_1.m4a', { method: 'HEAD' });
  assert.equal(response.status, 200);
  for (const name of ['content-type', 'content-length', 'cache-control', 'etag', 'accept-ranges']) {
    assert.equal(response.headers.get(name), (await call('/audio/v1/001_1.m4a')).headers.get(name), name);
  }
  assert.equal((await bytesOf(response)).length, 0);
});

test('Range の1つの範囲には、206 でその範囲だけを返す', async () => {
  const response = await call('/audio/v1/001_1.m4a', { headers: { Range: 'bytes=0-99' } });
  assert.equal(response.status, 206);
  assert.equal(response.headers.get('content-range'), 'bytes 0-99/1000');
  assert.equal(response.headers.get('content-length'), '100');
  assert.equal(response.headers.get('content-type'), 'audio/mp4');
  assert.deepEqual(await bytesOf(response), CLIP.slice(0, 100));
});

test('終わりのない範囲、末尾からの範囲、大きさを超える範囲は、ある所までを返す', async () => {
  for (const [range, contentRange, start] of [
    ['bytes=900-', 'bytes 900-999/1000', 900],
    ['bytes=-10', 'bytes 990-999/1000', 990],
    ['bytes=-5000', 'bytes 0-999/1000', 0],
    ['bytes=950-5000', 'bytes 950-999/1000', 950],
  ] as const) {
    const response = await call('/audio/v1/001_1.m4a', { headers: { Range: range } });
    assert.equal(response.status, 206, range);
    assert.equal(response.headers.get('content-range'), contentRange, range);
    assert.deepEqual(await bytesOf(response), CLIP.slice(start), range);
  }
});

test('始まりが大きさを超える範囲には、416 と全体の大きさを返し、キャッシュさせない', async () => {
  for (const range of ['bytes=1000-', 'bytes=1000-1099', 'bytes=-0']) {
    const response = await call('/audio/v1/001_1.m4a', { headers: { Range: range } });
    assert.equal(response.status, 416, range);
    assert.equal(response.headers.get('content-range'), 'bytes */1000', range);
    assert.equal(response.headers.get('cache-control'), null, range);
    assert.equal((await bytesOf(response)).length, 0, range);
  }
});

test('読めない Range と複数の範囲は無視して、全体を返す', async () => {
  for (const range of ['bytes=abc', 'bytes=5-1', 'bytes=-', 'bytes=0-1,5-6', 'items=0-1']) {
    const response = await call('/audio/v1/001_1.m4a', { headers: { Range: range } });
    assert.equal(response.status, 200, range);
    assert.deepEqual(await bytesOf(response), CLIP, range);
  }
});

test('形の合うパスでも、バケットにないお手本は 404 を返す', async () => {
  assert.equal((await call('/audio/v1/100_2.m4a')).status, 404);
  assert.equal((await call('/audio/v1/100_2.m4a', { method: 'HEAD' })).status, 404);
  assert.equal((await call('/audio/v1/100_2.m4a', { headers: { Range: 'bytes=0-99' } })).status, 404);
});

test('3桁の番号と 1 か 2 の形でないパスは、バケットにあっても 404 を返す', async () => {
  for (const path of [
    '/audio/v1/notes.txt',
    '/audio/v1/999_3.m4a',
    '/audio/v1/01_1.m4a',
    '/audio/v1/0001_1.m4a',
    '/audio/v1/001_1.mp3',
    '/audio/v1/001_1.m4a/',
    '/audio/v2/001_1.m4a',
    '/audio/001_1.m4a',
    '/audio/v1/%30%30%31_1.m4a',
    '/audio/',
  ]) {
    assert.equal((await call(path)).status, 404, path);
  }
});

test('GET と HEAD のほかのメソッドには、405 と使えるメソッドを返す', async () => {
  for (const method of ['POST', 'PUT', 'DELETE', 'OPTIONS']) {
    const response = await call('/audio/v1/001_1.m4a', { method });
    assert.equal(response.status, 405, method);
    assert.equal(response.headers.get('allow'), 'GET, HEAD', method);
  }
});

test('/audio/ の外のパスは、静的なファイルの配信に渡す', async () => {
  assert.equal(await (await call('/no-such-page')).text(), 'asset:/no-such-page');
});
