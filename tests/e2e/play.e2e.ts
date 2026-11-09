/**
 * End-to-end smoke test: plays full rounds in a real browser (Firefox via
 * WebDriver BiDi) against the Vite dev server.
 *
 *   npm run test:e2e                      # uses /usr/bin/firefox
 *   FIREFOX_PATH=/path/to/firefox npm run test:e2e
 *   E2E_SCREENSHOTS=1 npm run test:e2e    # saves screenshots to tests/e2e/screenshots/
 *
 * Not part of CI: it needs a desktop Firefox and network access to the basemap.
 */
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import puppeteer, { type Page } from 'puppeteer-core';
import { createServer } from 'vite';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const SHOTS = fileURLToPath(new URL('./screenshots', import.meta.url));
const saveShots = process.env.E2E_SCREENSHOTS === '1';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(`Assertion failed: ${message}`);
  console.log(`  ✓ ${message}`);
}

// Dev-only globals exposed by src/app.ts.
interface DevWindow {
  __view: {
    map: {
      isMoving(): boolean;
      areTilesLoaded(): boolean;
      project(p: [number, number]): { x: number; y: number };
      queryRenderedFeatures(
        p: [number, number],
        o: { layers: string[] },
      ): { properties: { id: string } }[];
      getCanvas(): HTMLCanvasElement;
    };
    highlighted: string | null;
    getPlace(id: string): { name: string } | undefined;
    ensureVisible(id: string): void;
    places: Map<string, { bbox: [number, number, number, number] }>;
  };
  __ctx: { places: { id: string; name: string; kind: string }[] };
}

const server = await createServer({ root: ROOT, server: { port: 0 }, logLevel: 'error' });
await server.listen();
const url = server.resolvedUrls!.local[0];
const browser = await puppeteer.launch({
  browser: 'firefox',
  executablePath: process.env.FIREFOX_PATH ?? '/usr/bin/firefox',
  headless: true,
});

let failed = false;
try {
  const page = await browser.newPage();
  // tsx/esbuild wraps named functions with __name(); define it for code sent to the page.
  await page.evaluateOnNewDocument('globalThis.__name = (fn) => fn;');
  page.on('pageerror', (e) => console.log('[pageerror]', (e as Error).message));
  page.on('dialog', (d) => void d.dismiss());
  if (saveShots) await mkdir(SHOTS, { recursive: true });

  const shot = async (name: string) => {
    if (!saveShots) return;
    await settle(page);
    await page.screenshot({ path: `${SHOTS}/${name}.png` });
  };
  const text = (sel: string) => page.$eval(sel, (e) => e.textContent ?? '');
  const openMenu = async () => {
    await page.goto(url);
    await page.waitForSelector('.panel.menu', { timeout: 30000 });
  };

  // ---------------------------------------------------------------- type mode
  console.log('Type mode · Só Rio · phone');
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await openMenu();
  await page.evaluate(() => localStorage.clear());
  await openMenu();
  await shot('1-menu');
  await page.click('.panel.menu button.primary');
  await page.waitForSelector('.panel.game');

  const target = () =>
    page.evaluate(() => {
      const w = window as unknown as DevWindow;
      return w.__view.getPlace(w.__view.highlighted ?? '')?.name ?? '';
    });
  const type = async (s: string) => {
    await page.$eval('.answer input', (e) => ((e as HTMLInputElement).value = ''));
    await page.type('.answer input', s);
    await page.keyboard.press('Enter');
    await sleep(150);
  };
  const advance = async () => {
    await page.keyboard.press('Enter');
    await sleep(300);
  };

  let name = await target();
  await type('Atlântida');
  assert((await text('.feedback')).includes('Não conheço'), 'unknown name costs no attempt');
  assert((await page.$$('.dot.used')).length === 0, 'no attempt used');
  const wrong = name === 'Leblon' ? 'Ipanema' : 'Leblon';
  await type(wrong);
  assert((await text('.feedback')).includes(`esse é ${wrong}`), 'other place is named');
  await shot('2-type-wrong');
  await type(name.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase());
  assert((await text('.feedback')).includes('+2'), 'accent-free answer accepted for 2 points');
  await advance();

  for (let i = 2; i <= 10; i++) {
    name = await target();
    if (i === 3) {
      await page.click('.actions button:not([hidden])'); // Pular
      assert((await text('.feedback')).includes(`Era ${name}`), 'skip reveals the answer');
    } else if (i === 4) {
      for (const w of ['Leblon', 'Ipanema', 'Gávea', 'Urca']
        .filter((w) => w !== name)
        .slice(0, 3)) {
        await type(w);
      }
      assert((await text('.feedback')).includes(`Era ${name}`), 'three misses reveal the answer');
    } else {
      await type(name);
    }
    await advance();
  }
  await page.waitForSelector('.panel.results', { timeout: 5000 });
  assert((await text('.big-score')).includes('23'), 'score is 2 + 7×3 = 23');
  assert((await text('#results-title')).includes('recorde'), 'first round sets a record');
  await shot('3-results');

  await page.click('.panel.results .actions button'); // Menu
  await page.waitForSelector('.panel.menu');
  assert((await text('.record')).includes('23 pts'), 'record shown in menu');
  await page.click('.panel.menu button.link');
  await page.waitForSelector('.panel.stats');
  assert((await page.$$('.stats .result-row')).length === 3, 'stats list the 3 imperfect answers');

  // --------------------------------------------------------------- click mode
  console.log('Click mode · Grande Rio · desktop');
  await page.setViewport({ width: 1280, height: 800 });
  await openMenu();
  await page.click('input[name=mode][value=click]');
  await page.click('input[name=area][value=grande-rio]');
  await page.click('.panel.menu button.primary');
  await page.waitForSelector('.panel.game');

  let municipalities = 0;
  for (let i = 1; i <= 10; i++) {
    const asked = await text('.prompt strong');
    const place = await page.evaluate(
      (n) => (window as unknown as DevWindow).__ctx.places.find((p) => p.name === n)!,
      asked,
    );
    if (place.kind === 'municipality') municipalities++;
    if (i === 1) {
      const other = await page.evaluate(
        (id) =>
          (window as unknown as DevWindow).__ctx.places.find(
            (p) => p.id !== id && p.kind === 'neighborhood',
          )!.id,
        place.id,
      );
      await clickPlace(page, other);
      assert((await text('.feedback')).startsWith('Não, esse é'), 'wrong click is named');
      await shot('4-click-wrong');
    }
    await clickPlace(page, place.id);
    assert((await text('.feedback')).startsWith('Acertou'), `clicked ${asked}`);
    const next = await page.$('.actions button.primary:not([hidden])');
    await next?.click().catch(() => {});
    await page.waitForFunction(
      (prev) =>
        document.querySelector('.panel.results') ||
        document.querySelector('.prompt strong')?.textContent !== prev,
      { timeout: 5000 },
      asked,
    );
  }
  await page.waitForSelector('.panel.results', { timeout: 5000 });
  assert(municipalities === 2, 'Grande Rio round has 2 municipalities');
  assert((await text('.big-score')).includes('29'), 'score is 2 + 9×3 = 29');
  await shot('5-click-results');
  console.log('All e2e checks passed.');
} catch (err) {
  failed = true;
  console.error(err);
} finally {
  await browser.close();
  await server.close();
}
process.exit(failed ? 1 : 0);

/** Waits until the map stops moving and tiles are loaded (bounded). */
async function settle(page: Page) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        const m = (window as unknown as DevWindow).__view.map;
        const t0 = performance.now();
        const check = () =>
          (!m.isMoving() && m.areTilesLoaded()) || performance.now() - t0 > 4000
            ? setTimeout(resolve, 250)
            : setTimeout(check, 100);
        check();
      }),
  );
}

/** Zooms to a place and clicks a point well inside it that no panel covers. */
async function clickPlace(page: Page, id: string) {
  await page.evaluate((id) => (window as unknown as DevWindow).__view.ensureVisible(id), id);
  await sleep(900);
  await settle(page);
  const pt = await page.evaluate((id) => {
    const v = (window as unknown as DevWindow).__view;
    const m = v.map;
    const [w, s, e, n] = v.places.get(id)!.bbox;
    const rect = m.getCanvas().getBoundingClientRect();
    const layers = ['neighborhoods-fill', 'municipalities-fill'];
    const hit = (x: number, y: number) =>
      m.queryRenderedFeatures([x, y], { layers })[0]?.properties.id === id;
    for (let gy = 1; gy < 12; gy++) {
      for (let gx = 1; gx < 12; gx++) {
        const p = m.project([w + ((e - w) * gx) / 12, s + ((n - s) * gy) / 12]);
        const x = p.x + rect.left;
        const y = p.y + rect.top;
        const inside = [
          [0, 0],
          [4, 0],
          [-4, 0],
          [0, 4],
          [0, -4],
        ].every(([dx, dy]) => hit(p.x + dx, p.y + dy));
        if (inside && document.elementFromPoint(x, y) === m.getCanvas()) return { x, y };
      }
    }
    return null;
  }, id);
  if (!pt) throw new Error(`No clickable point found for ${id}`);
  await page.mouse.click(pt.x, pt.y);
  await sleep(200);
}
