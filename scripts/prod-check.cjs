const { chromium } = require('playwright');
const BASE = 'http://127.0.0.1:4173';
const ROUTES = ['/dashboard','/tasks','/automation','/workflows','/sla','/analytics','/reports','/notifications','/settings'];
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 950 } });
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  p.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
  let fail = 0;
  for (const r of ROUTES) {
    const res = await p.goto(BASE + r, { waitUntil: 'networkidle' });
    await p.waitForTimeout(700);
    const rendered = await p.evaluate(() => {
      const main = document.querySelector('main');
      return !!main && main.innerText.trim().length > 80;
    });
    const ok = res.status() === 200 && rendered;
    if (!ok) fail++;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${res.status()}  ${r}${rendered ? '' : '  (blank)'}`);
  }
  // hard reload on a deep link with a query string — the classic 404 case
  await p.goto(BASE + '/tasks', { waitUntil: 'networkidle' });
  await p.waitForTimeout(600);
  await p.evaluate(() => { const tr = document.querySelector('tbody tr'); tr.click(); });
  await p.waitForTimeout(800);
  const deep = p.url();
  await p.reload({ waitUntil: 'networkidle' });
  await p.waitForTimeout(1200);
  const drawerOpen = await p.evaluate(() => !!document.querySelector('[role="dialog"]'));
  console.log(`${drawerOpen ? 'PASS' : 'FAIL'}  hard refresh on ${deep.replace(BASE, '')} keeps the drawer open`);
  if (!drawerOpen) fail++;
  console.log(`\nconsole errors: ${errs.length ? errs.slice(0, 3).join(' | ') : 'none'}`);
  await b.close();
  process.exit(fail === 0 && errs.length === 0 ? 0 : 1);
})();
