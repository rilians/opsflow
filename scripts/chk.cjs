const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 950 } });
  await p.goto('http://127.0.0.1:5173/dashboard', { waitUntil: 'networkidle' });
  await p.waitForTimeout(1200);
  const info = await p.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find(b => /New request/.test(b.textContent));
    const cs = btn ? getComputedStyle(btn) : null;
    return { h: cs?.height, pad: cs?.padding, fs: cs?.fontSize, tag: btn?.className.slice(0,120) };
  });
  console.log(info);
  // check CSS for h-8\.5 rule presence
  const has = await p.evaluate(() => {
    const out = [];
    for (const s of document.styleSheets) {
      try { for (const r of s.cssRules) { if (r.selectorText && /\.h-8\\.5/.test(r.selectorText)) out.push(r.cssText); } } catch {}
    }
    return out;
  });
  console.log('h-8.5 rule:', has);
  await b.close();
})();
