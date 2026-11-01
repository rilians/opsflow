const { chromium } = require('playwright');
const routes = ['/dashboard','/tasks','/automation','/workflows','/sla','/analytics','/reports','/notifications','/settings'];
(async () => {
  const b = await chromium.launch();
  const errors = [];
  let issues = 0;
  for (const w of [390, 768, 1024, 1440, 1920]) {
    const p = await b.newPage({ viewport: { width: w, height: 900 } });
    p.on('console', (m) => m.type() === 'error' && errors.push(`${w}px ${m.text()}`));
    p.on('pageerror', (e) => errors.push(`${w}px PAGEERROR ${e.message}`));
    for (const r of routes) {
      await p.goto('http://127.0.0.1:5173' + r, { waitUntil: 'networkidle' });
      await p.waitForTimeout(500);
      const res = await p.evaluate(() => ({
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        // buttons with no handler, no href and no type=submit
        dead: [...document.querySelectorAll('button')].filter((btn) => {
          if (btn.type === 'submit' || btn.getAttribute('aria-label') || btn.closest('a')) return false;
          const hasReact = Object.keys(btn).some((k) => k.startsWith('__reactProps') && btn[k]?.onClick);
          const hasAttrHandler = btn.getAttributeNames().some((n) => n.startsWith('on'));
          return !hasReact && !hasAttrHandler;
        }).length,
        empty: document.body.innerText.trim().length < 200,
      }));
      if (res.overflow > 2 || res.dead > 0 || res.empty) {
        issues++;
        console.log(`ISSUE ${w}px ${r}`, JSON.stringify(res));
      }
    }
    await p.close();
  }
  console.log(`\nviewport/route issues: ${issues}`);
  console.log('console errors:', errors.length ? errors.slice(0, 8).join(' | ') : 'none');
  await b.close();
  console.log(issues === 0 && errors.length === 0 ? 'QA CLEAN' : 'QA ATTENTION');
})();
