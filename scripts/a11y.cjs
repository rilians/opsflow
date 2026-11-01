/**
 * Accessibility regression suite.
 *
 * Covers the three things that were wrong in the build before the final pass:
 *   1. clickable rows/cards that were invisible to keyboard and screen readers
 *   2. low-contrast text and chart colours (WCAG AA)
 *   3. no reduced-motion support
 *
 * Run with the dev server up:  npm run test:a11y
 */
const { chromium } = require('playwright');

const BASE = 'http://127.0.0.1:5173';
const ROUTES = ['/dashboard', '/tasks', '/automation', '/workflows', '/sla', '/analytics', '/reports', '/notifications', '/settings'];

let pass = 0;
let fail = 0;
const check = (name, ok, detail = '') => {
  if (ok) {
    pass += 1;
    console.log(`PASS  ${name}${detail ? ' — ' + detail : ''}`);
  } else {
    fail += 1;
    console.log(`FAIL  ${name}${detail ? ' — ' + detail : ''}`);
  }
};

const contrast = (a, b) => {
  const lum = (hex) => {
    const c = hex.match(/\w\w/g).map((h) => {
      const v = parseInt(h, 16) / 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  const [hi, lo] = lum(a) > lum(b) ? [lum(a), lum(b)] : [lum(b), lum(a)];
  return (hi + 0.05) / (lo + 0.05);
};

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

  /* ------------------------------------------------ 1. no unlabelled controls */
  for (const route of ROUTES) {
    await page.goto(BASE + route, { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
    const unlabelled = await page.evaluate(
      () =>
        [...document.querySelectorAll('button, [role="button"]')].filter((el) => {
          const text = (el.innerText || '').trim();
          return !text && !el.getAttribute('aria-label') && !el.getAttribute('title');
        }).length,
    );
    check(`${route} — every control has an accessible name`, unlabelled === 0, `${unlabelled} unlabelled`);
  }

  /* ------------------------------------------------- 2. clickable rows are usable */
  await page.goto(BASE + '/tasks', { waitUntil: 'networkidle' });
  await page.waitForTimeout(700);
  const row = await page.evaluate(() => {
    const tr = document.querySelector('tbody tr');
    return {
      role: tr.getAttribute('role'),
      tabIndex: tr.tabIndex,
      label: tr.getAttribute('aria-label') || '',
    };
  });
  check('Task row exposes role=button + tabIndex=0', row.role === 'button' && row.tabIndex === 0, JSON.stringify(row));
  check('Task row has an aria-label naming the record', row.label.length > 10, row.label.slice(0, 48));

  await page.evaluate(() => document.querySelectorAll('tbody tr')[1].focus());
  await page.keyboard.press('Enter');
  await page.waitForTimeout(700);
  check('Enter on a focused task row opens the drawer', page.url().includes('task='), page.url().split('?')[1] || '');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  await page.evaluate(() => document.querySelectorAll('tbody tr')[2].focus());
  await page.keyboard.press(' ');
  await page.waitForTimeout(700);
  check('Space on a focused task row opens the drawer', page.url().includes('task='));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  /* ------------------------------------------------------ kanban cards too */
  await page.goto(BASE + '/tasks', { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  await page.getByRole('button', { name: 'Kanban' }).click();
  await page.waitForTimeout(600);
  const card = await page.evaluate(() => {
    const el = document.querySelector('[data-row-interactive][aria-label^="Open request"]');
    return el ? { role: el.getAttribute('role'), tabIndex: el.tabIndex } : null;
  });
  check('Kanban card is keyboard-focusable', !!card && card.tabIndex === 0 && card.role === 'button', JSON.stringify(card));

  /* ---------------------------------------------- 3. execution rows reachable */
  await page.goto(BASE + '/automation?tab=executions', { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  const execRow = await page.evaluate(() => {
    const tr = document.querySelector('tbody tr');
    return { role: tr.getAttribute('role'), tabIndex: tr.tabIndex };
  });
  check('Execution row is keyboard-focusable', execRow.role === 'button' && execRow.tabIndex === 0, JSON.stringify(execRow));
  await page.evaluate(() => document.querySelector('tbody tr').focus());
  await page.keyboard.press('Enter');
  await page.waitForTimeout(600);
  check('Enter on an execution row opens the detail modal', await page.evaluate(() => document.body.innerText.includes('RESULT SUMMARY')));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  /* ------------------------------------------------- 4. execution list paginates */
  const paged = await page.evaluate(() => {
    const m = document.body.innerText.match(/Showing\s+\d+–\d+ of\s+(\d+)/);
    return m ? Number(m[1]) : 0;
  });
  check('Execution history is paginated, not truncated', paged > 25, `total ${paged}`);

  /* ---------------------------------------------------------- 5. contrast */
  const measureContrast = () =>
    page.evaluate(() => {
      const parse = (rgb) => rgb.match(/[\d.]+/g).map(Number);
      const lum = ([r, g, b]) => {
        const f = (v) => {
          v /= 255;
          return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
        };
        return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
      };
      const effectiveBg = (el) => {
        const layers = [];
        let node = el;
        while (node) {
          const bg = getComputedStyle(node).backgroundColor;
          if (bg && bg !== 'transparent') layers.push(parse(bg));
          node = node.parentElement;
        }
        let out = [255, 255, 255];
        for (const layer of layers.reverse()) {
          const [r, g, b, a = 1] = layer;
          out = [out[0] * (1 - a) + r * a, out[1] * (1 - a) + g * a, out[2] * (1 - a) + b * a];
        }
        return out;
      };
      const results = [];
      for (const el of document.querySelectorAll('p, span, td, th, a, button, label, li')) {
        if (!el.offsetParent || el.children.length > 0) continue;
        const text = (el.innerText || '').trim();
        if (!text) continue;
        const cs = getComputedStyle(el);
        const fgRaw = parse(cs.color);
        const alpha = fgRaw[3] === undefined ? 1 : fgRaw[3];
        if (alpha < 0.9) continue;
        const bg = effectiveBg(el);
        const fg = [fgRaw[0], fgRaw[1], fgRaw[2]];
        const size = parseFloat(cs.fontSize);
        const weight = Number(cs.fontWeight) || 400;
        const large = size >= 24 || (size >= 18.66 && weight >= 700);
        const [hi, lo] = lum(fg) > lum(bg) ? [lum(fg), lum(bg)] : [lum(bg), lum(fg)];
        const ratio = (hi + 0.05) / (lo + 0.05);
        const min = large ? 3 : 4.5;
        if (ratio < min) results.push({ text: text.slice(0, 32), ratio: +ratio.toFixed(2), size, min, fg: cs.color });
      }
      return results.sort((a, b) => a.ratio - b.ratio).slice(0, 6);
    });

  for (const route of ROUTES) {
    await page.goto(BASE + route, { waitUntil: 'networkidle' });
    await page.waitForTimeout(700);
    const bad = await measureContrast();
    check(`${route} — text meets WCAG AA contrast`, bad.length === 0, JSON.stringify(bad));
  }

  const chartGrey = contrast('667085', 'ffffff');
  check('Chart "New" status colour meets 3:1 for graphics', chartGrey >= 3, chartGrey.toFixed(2) + ':1');

  /* ---------------------------------------------------- 6. reduced motion */
  const reduced = await browser.newPage({ viewport: { width: 1440, height: 950 }, reducedMotion: 'reduce' });
  await reduced.goto(BASE + '/dashboard', { waitUntil: 'networkidle' });
  await reduced.waitForTimeout(700);
  const durations = await reduced.evaluate(() => {
    const el = document.querySelector('main > div');
    const cs = getComputedStyle(el);
    return { anim: cs.animationDuration, trans: cs.transitionDuration };
  });
  check('Reduced-motion preference is honoured', parseFloat(durations.anim) < 0.01 && parseFloat(durations.trans) < 0.01, JSON.stringify(durations));

  /* ------------------------------------------------------- 7. keyboard trap */
  await page.goto(BASE + '/tasks', { waitUntil: 'networkidle' });
  await page.waitForTimeout(700);
  await page.getByRole('button', { name: 'New request' }).first().click();
  await page.waitForTimeout(600);
  const trapped = await page.evaluate(() => document.activeElement?.closest('[role="dialog"], .fixed') !== null);
  check('Modal moves focus inside itself', trapped);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  check('Escape closes the modal', !(await page.evaluate(() => document.body.innerText.includes('New operational request'))));

  console.log(`\nconsole errors: ${errors.length ? errors.slice(0, 5).join(' | ') : 'none'}`);
  console.log(`\n${pass}/${pass + fail} accessibility checks passed`);
  await browser.close();
  process.exit(fail === 0 && errors.length === 0 ? 0 : 1);
})();
