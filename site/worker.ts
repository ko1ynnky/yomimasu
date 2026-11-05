// お手本の音声を、公開しない R2 のバケットから同じオリジンの /audio/v1/ で配る。
// wrangler.jsonc の run_worker_first で先に通すのは /audio/* だけで、ほかのパスは静的なファイルの配信が先に答える。

// R2 の型は @cloudflare/workers-types を足さずに、使う所だけを書く。依存を増やさないためで、実物の R2Bucket はこの形を満たす。
type ByteRange = { offset: number; length: number };
type ClipObject = { size: number; httpEtag: string };
export type ClipBucket = {
  head(key: string): Promise<ClipObject | null>;
  get(key: string, options?: { range?: ByteRange }): Promise<(ClipObject & { body: ReadableStream }) | null>;
};
type Env = { AUDIO: ClipBucket; ASSETS: { fetch(request: Request): Promise<Response> } };

// NNN は札の番号の3桁（000 は序歌）、最後の数字は 1 が上の句、2 が下の句である。バケットのキーは /audio/ のあとの部分になる。
const CLIP_PATH = /^\/audio\/(v1\/[0-9]{3}_[12]\.m4a)$/;

// 型とキャッシュはバケットのメタデータから写さずに、ここで決める。パスの形で m4a に限っていて、上げ方の違いで変わらないようにするためである。
// v1 のキーの中身は置き換えない（直すときは v2 にする）ので、1年の immutable にする。同じ理由で If-None-Match と If-Range は見ない。
const CLIP_HEADERS = {
  'Content-Type': 'audio/mp4',
  'Cache-Control': 'public, max-age=31536000, immutable',
  'Accept-Ranges': 'bytes',
};

type RangeSpec = { first: number; last?: number } | { suffix: number };

// 答えるのは1つの範囲だけである。複数の範囲と読めない書き方は、RFC 9110 が認めるとおり無視して全体を返す。
function rangeSpecOf(header: string | null): RangeSpec | null {
  const match = header?.trim().match(/^bytes=([0-9]*)-([0-9]*)$/i);
  if (!match) return null;
  const [, first, last] = match;
  if (first === '') return last === '' ? null : { suffix: Number(last) };
  if (last !== '' && Number(last) < Number(first)) return null;
  return { first: Number(first), last: last === '' ? undefined : Number(last) };
}

function byteRangeOf(spec: RangeSpec, size: number): ByteRange | null {
  if ('suffix' in spec) {
    const length = Math.min(spec.suffix, size);
    return length > 0 ? { offset: size - length, length } : null;
  }
  if (spec.first >= size) return null;
  const last = Math.min(spec.last ?? size - 1, size - 1);
  return { offset: spec.first, length: last - spec.first + 1 };
}

const clipHeaders = (object: ClipObject, length: number) => ({ ...CLIP_HEADERS, ETag: object.httpEtag, 'Content-Length': String(length) });

const notFound = () => new Response(null, { status: 404 });

async function wholeClip(bucket: ClipBucket, key: string) {
  const object = await bucket.get(key);
  return object ? new Response(object.body, { headers: clipHeaders(object, object.size) }) : notFound();
}

async function serveClip(request: Request, bucket: ClipBucket, key: string): Promise<Response> {
  if (request.method === 'HEAD') {
    const object = await bucket.head(key);
    return object ? new Response(null, { headers: clipHeaders(object, object.size) }) : notFound();
  }
  const spec = rangeSpecOf(request.headers.get('Range'));
  if (!spec) return wholeClip(bucket, key);

  // R2 の文書は、満たせない範囲を get に渡したときの答えを決めていない。先に大きさを見て、範囲をこちらで決めてから読む。
  const object = await bucket.head(key);
  if (!object) return notFound();
  const range = byteRangeOf(spec, object.size);
  if (!range) {
    return new Response(null, { status: 416, headers: { ...CLIP_HEADERS, 'Content-Range': `bytes */${object.size}` } });
  }
  const part = await bucket.get(key, { range });
  if (!part) return notFound();
  return new Response(part.body, {
    status: 206,
    headers: { ...clipHeaders(part, range.length), 'Content-Range': `bytes ${range.offset}-${range.offset + range.length - 1}/${object.size}` },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);
    // 静的なファイルに当たらないパスも Worker に来る。今までどおり静的なファイルの配信に答えさせる。
    if (!pathname.startsWith('/audio/')) return env.ASSETS.fetch(request);
    const key = CLIP_PATH.exec(pathname)?.[1];
    if (!key) return notFound();
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response(null, { status: 405, headers: { Allow: 'GET, HEAD' } });
    }
    return serveClip(request, env.AUDIO, key);
  },
};
