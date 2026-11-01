const { chromium } = require('playwright');
const ROUTES = ['dashboard','tasks','automation','workflows','sla','analytics','reports','notifications','settings'];
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 950 }, deviceScaleFactor: 1 });
  await p.goto('http://127.0.0.1:5173/dashboard', { waitUntil: 'networkidle' });
  await p.waitForTimeout(1500);
  const tag = process.argv[2] || 'before';
  for (const r of ROUTES) {
    await p.goto('http://127.0.0.1:5173/' + r, { waitUntil: 'networkidle' });
    await p.waitForTimeout(900);
    await p.screenshot({ path: `docs/shots/${tag}-${r}.png`, fullPage: r === 'dashboard' ? false : true });
  }
  await b.close();
  console.log('shots:', tag);
})();
