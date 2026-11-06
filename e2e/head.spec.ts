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

test('組み立てたどのページも、アイコン、説明、共有したときの題と画像を head に持つ', async ({ browser, baseURL }) => {
  test.setTimeout(120_000);
  const pages = builtPages();
  expect(pages).toEqual(expect.arrayContaining(['/', '/soron/', '/karuta/', '/karuta/1/', '/karuta/joka/', '/result/']));
  const context = await browser.newContext({ javaScriptEnabled: false, baseURL });
  const page = await context.newPage();
  const descriptions = new Set<string>();
  for (const path of pages) {
    await page.goto(path);
    const head = await headOf(page);
    expect(head.links.icon, path).toBe('/favicon.ico');
    expect(head.links['apple-touch-icon'], path).toBe('/apple-touch-icon.png');
    expect(head.metas.description, path).toBeTruthy();
    descriptions.add(head.metas.description);
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
  expect([...descriptions]).toHaveLength(1);
  await context.close();
});

test('入口の題はアプリの名前と標語で、ほかのページは「ページの題 - /yomimasu」にする', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, baseURL });
  const page = await context.newPage();
  await page.goto('/');
  await expect(page).toHaveTitle(HOME_TITLE);
  await page.goto('/soron/');
  await expect(page).toHaveTitle('総論を学ぶ - /yomimasu');
  await page.goto('/karuta/joka/');
  await expect(page).toHaveTitle('1首 序歌 - /yomimasu');
  await context.close();
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
