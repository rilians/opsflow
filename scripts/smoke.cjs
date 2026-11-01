const { chromium } = require('playwright');

const BASE = 'http://127.0.0.1:5173';
const routes = ['/dashboard', '/tasks', '/automation', '/workflows', '/sla', '/analytics', '/reports', '/notifications', '/settings'];

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
  const errors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`[console] ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));

  for (const r of routes) {
    await page.goto(BASE + r, { waitUntil: 'networkidle' });
    await page.waitForTimeout(900);
    const h1 = await page.locator('h1').first().textContent();
    const bodyLen = (await page.locator('body').innerText()).length;
    console.log(`OK  ${r.padEnd(16)} h1="${h1?.trim()}" text=${bodyLen}`);
    await page.screenshot({ path: `/home/user/shots${r.replace(/\//g, '_')}.png`, fullPage: false });
  }

  console.log('\n--- console errors ---');
  console.log(errors.length ? errors.join('\n') : 'none');
  await browser.close();
})();
