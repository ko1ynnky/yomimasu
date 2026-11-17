import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

// SNS は JS を動かさずに HTML の head を読むので、head は JS を切った context で確かめる。
const ORIGIN = 'https://yomimasu.karutalog.com';
const HOME_TITLE = '/yomimasu - 競技かるたにかかわるすべての人に、読みを身近に。「読みます」と言うために。';

// ページを足しても検査から漏れないよう、組み立てた結果のページを全部たどる（e2e/result.spec.ts と同じ形）。
function builtPages(dir = 'dist', route = '/'): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isFile()) return entry.name === 'index.html' ? [route] : [];
    return entry.isDirectory() && !entry.name.startsWith('.') ? builtPages(join(dir, entry.name), `${route}${entry.name}/`) : [];
  });
}

type Head = { title: string; links: Record<string, string>; metas: Record<string, string> };

const headOf = (page: Page): Promise<Head> =>
  page.locator('head').evaluate((element) => ({
    title: document.title,
    links: Object.fromEntries([...element.querySelectorAll('link[rel]')].map((link) => [link.getAttribute('rel'), link.getAttribute('href')])),
    metas: Object.fromEntries(
      [...element.querySelectorAll('meta[name], meta[property]')].map((meta) => [meta.getAttribute('property') ?? meta.getAttribute('name'), meta.getAttribute('content')]),
    ),
  }));

test('組み立てたどのページも、アイコン、ページごとに違う説明、共有したときの題と画像、自分の URL を指す canonical を head に持つ', async ({ browser, baseURL }) => {
  test.setTimeout(120_000);
  const pages = builtPages();
  expect(pages).toEqual(expect.arrayContaining(['/', '/soron/', '/karuta/', '/karuta/1/', '/karuta/joka/', '/result/']));
  const context = await browser.newContext({ javaScriptEnabled: false, baseURL });
  const page = await context.newPage();
  const pagesByDescription = new Map<string, string[]>();
  for (const path of pages) {
    await page.goto(path);
    const head = await headOf(page);
    expect(head.links.icon, path).toBe('/favicon.ico');
    expect(head.links['apple-touch-icon'], path).toBe('/apple-touch-icon.png');
    expect(head.links.canonical, path).toBe(`${ORIGIN}${path}`);
    expect(head.metas.description, path).toBeTruthy();
    pagesByDescription.set(head.metas.description, [...(pagesByDescription.get(head.metas.description) ?? []), path]);
    expect(head.metas, path).toMatchObject({
      'og:type': 'website',
      'og:site_name': '/yomimasu',
      'og:locale': 'ja_JP',
      'og:title': head.title,
      'og:description': head.metas.description,
      'og:url': `${ORIGIN}${path}`,
      'og:image': `${ORIGIN}/og.png`,
      'og:image:width': '1200',
      'og:image:height': '630',
      'twitter:card': 'summary_large_image',
    });
    expect(head.metas['og:image:alt'], path).toBeTruthy();
    if (path !== '/') expect(head.title, path).toMatch(/^.+ - \/yomimasu$/);
  }
  expect([...pagesByDescription.values()].filter((paths) => paths.length > 1)).toEqual([]);
  await context.close();
});

test('入口の題はアプリの名前と標語、1首のページは歌の初句と二句と決まり字で、ほかのページは「ページの題 - /yomimasu」にする', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, baseURL });
  const page = await context.newPage();
  await page.goto('/');
  await expect(page).toHaveTitle(HOME_TITLE);
  await page.goto('/soron/');
  await expect(page).toHaveTitle('総論を学ぶ - /yomimasu');
  await page.goto('/karuta/1/');
  await expect(page).toHaveTitle('秋の田の かりほの庵の（あきの）の読み方 - /yomimasu');
  await page.goto('/karuta/joka/');
  await expect(page).toHaveTitle('難波津に 咲くやこの花（序歌）の読み方 - /yomimasu');
  await context.close();
});

test('1首のページの説明には、歌の全文と決まり字を書く', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, baseURL });
  const page = await context.newPage();
  await page.goto('/karuta/1/');
  const { metas: card } = await headOf(page);
  expect(card.description).toContain('秋の田の かりほの庵の 苫をあらみ わが衣手は 露にぬれつつ');
  expect(card.description).toContain('あきの');
  await page.goto('/karuta/joka/');
  const { metas: joka } = await headOf(page);
  expect(joka.description).toContain('難波津に 咲くやこの花 冬ごもり 今を春べと 咲くやこの花');
  expect(joka.description).toContain('序歌');
  await context.close();
});

// 端末に残した録音を出す画面は、検索から来た人には「まだ録音がありません。」しか出さないので、sitemap に入れない。
const ON_DEVICE_PAGES = ['/result/', '/result/compare/'];
const SITEMAP_NS = 'http://www.sitemaps.org/schemas/sitemap/0.9';

test('sitemap.xml は、端末の録音を出す画面のほかの組み立てたページを本番の URL で並べ、どの URL も 200 で開けて canonical が自分を指す', async ({ browser, baseURL, request }) => {
  test.setTimeout(120_000);
  const response = await request.get('/sitemap.xml');
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toMatch(/xml/);
  const context = await browser.newContext({ javaScriptEnabled: false, baseURL });
  const page = await context.newPage();
  const { root, locs } = await page.evaluate(
    ([text, ns]) => {
      const doc = new DOMParser().parseFromString(text, 'application/xml');
      return { root: `${doc.documentElement.namespaceURI} ${doc.documentElement.localName}`, locs: [...doc.getElementsByTagNameNS(ns, 'loc')].map((loc) => loc.textContent ?? '') };
    },
    [await response.text(), SITEMAP_NS] as const,
  );
  expect(root).toBe(`${SITEMAP_NS} urlset`);
  for (const loc of locs) expect(loc.startsWith(`${ORIGIN}/`), loc).toBe(true);
  const paths = locs.map((loc) => loc.slice(ORIGIN.length));
  expect(paths.toSorted()).toEqual(builtPages().filter((path) => !ON_DEVICE_PAGES.includes(path)).toSorted());
  for (const path of paths) {
    expect((await page.goto(path))?.status(), path).toBe(200);
    expect((await headOf(page)).links.canonical, path).toBe(`${ORIGIN}${path}`);
  }
  await context.close();
});

// 本番では、配信の Cloudflare が管理の robots.txt（クローラーごとの規則）をこのファイルの前に足して1つにして返す。
// ここにも User-agent の組を書くと、同じ「User-agent: *」の組が2つ並ぶので、sitemap の場所だけを書く。
test('robots.txt は sitemap の場所を本番の URL で示し、クローラーごとの規則は書かない', async ({ request }) => {
  const response = await request.get('/robots.txt');
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toMatch(/^text\/plain/);
  const records = (await response.text())
    .split('\n')
    .map((line) => line.replace(/#.*/, '').trim())
    .filter(Boolean);
  expect(records).toEqual([`Sitemap: ${ORIGIN}/sitemap.xml`]);
});

const pngSize = (bytes: Buffer) => ({ width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) });
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

test('ファビコンは 16、32、48px の PNG を入れた ICO で返す', async ({ request }) => {
  const response = await request.get('/favicon.ico');
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toMatch(/^image\//);
  const ico = await response.body();
  expect(ico.readUInt16LE(0)).toBe(0);
  expect(ico.readUInt16LE(2)).toBe(1);
  const count = ico.readUInt16LE(4);
  const images = Array.from({ length: count }, (_, i) => {
    const entry = 6 + i * 16;
    const png = ico.subarray(ico.readUInt32LE(entry + 12), ico.readUInt32LE(entry + 12) + ico.readUInt32LE(entry + 8));
    return { declared: [ico[entry], ico[entry + 1]], png };
  });
  expect(images.map(({ declared }) => declared)).toEqual([[16, 16], [32, 32], [48, 48]]);
  for (const { declared, png } of images) {
    expect(png.subarray(0, 8).equals(PNG_SIGNATURE)).toBe(true);
    expect(pngSize(png)).toEqual({ width: declared[0], height: declared[1] });
  }
});

for (const [path, size] of [
  ['/apple-touch-icon.png', { width: 180, height: 180 }],
  ['/og.png', { width: 1200, height: 630 }],
] as const) {
  test(`${path} は ${size.width}×${size.height} の PNG で返す`, async ({ request }) => {
    const response = await request.get(path);
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toBe('image/png');
    expect(pngSize(await response.body())).toEqual(size);
  });
}

test('ないページを開くと、404 でページがないことを伝え、入口と100首の一覧へ戻れる', async ({ page }) => {
  const response = await page.goto('/nonexistent/');
  expect(response?.status()).toBe(404);
  await expect(page).toHaveTitle('ページが見つかりません - /yomimasu');
  await expect(page.locator('main')).toContainText('このページはありません。');
  await expect(page.locator('header.bar a')).toHaveAttribute('href', '/');
  await expect(page.locator('main').getByRole('link', { name: '入口へ戻る' })).toHaveAttribute('href', '/');
  await expect(page.locator('main').getByRole('link', { name: '100首の一覧へ' })).toHaveAttribute('href', '/karuta/');
  await page.locator('main').getByRole('link', { name: '入口へ戻る' }).click();
  await expect(page.locator('main h1')).toHaveText('「読みます」と言うために。');
});

test('ないページの head にもアイコン、説明、共有したときの題と画像を書き、どの URL にも出るので og:url と canonical は書かない', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, baseURL });
  const page = await context.newPage();
  await page.goto('/nonexistent/');
  const head = await headOf(page);
  expect(head.links).toMatchObject({ icon: '/favicon.ico', 'apple-touch-icon': '/apple-touch-icon.png' });
  expect(head.metas.description).toBeTruthy();
  expect(head.metas).toMatchObject({ 'og:title': head.title, 'og:image': `${ORIGIN}/og.png`, 'twitter:card': 'summary_large_image' });
  expect(head.metas).not.toHaveProperty(['og:url']);
  expect(head.links).not.toHaveProperty(['canonical']);
  await context.close();
});

test('ページの読み込みでない要求にも、ないパスは 404 のページで答え、/audio/ のないファイルは今までどおり本文なしの 404 にする', async ({ request }) => {
  const missing = await request.get('/nonexistent/deeper');
  expect(missing.status()).toBe(404);
  expect(await missing.text()).toContain('このページはありません。');
  const clip = await request.get('/audio/v1/nonexistent.m4a');
  expect(clip.status()).toBe(404);
  expect(await clip.text()).toBe('');
});
