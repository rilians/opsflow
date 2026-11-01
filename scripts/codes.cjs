/**
 * Request and report codes must never be reused. They used to be derived from the
 * collection length, so deleting a record and creating a new one produced a duplicate
 * code that was still live in the workspace.
 */
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
  await page.goto('http://127.0.0.1:5173/tasks', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);

  const dupes = () =>
    page.evaluate(() => {
      const key = Object.keys(localStorage).find((k) => k.startsWith('opsflow.state'));
      const s = JSON.parse(localStorage.getItem(key));
      const count = (arr) => {
        const seen = new Map();
        for (const x of arr) seen.set(x.code, (seen.get(x.code) ?? 0) + 1);
        return [...seen.entries()].filter(([, n]) => n > 1).map(([c, n]) => `${c}×${n}`);
      };
      return { tasks: count(s.tasks), reports: count(s.reports ?? []), total: s.tasks.length };
    });

  const before = await dupes();

  // Delete one request, then create one — the historical collision trigger.
  await page.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => k.startsWith('opsflow.state'));
    const s = JSON.parse(localStorage.getItem(key));
    s.tasks.splice(3, 1);
    localStorage.setItem(key, JSON.stringify(s));
  });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => /new request/i.test(b.innerText));
    btn.click();
  });
  await page.waitForTimeout(800);
  // The form validates title (>=8 chars), description (>=20) and a valid email.
  await page.fill('input[placeholder*="VPN access failing"]', 'Printer on the third floor is offline again');
  await page.fill('textarea', 'Third-floor printer shows offline on every workstation since this morning. Needs a queue reset.');
  await page.waitForTimeout(200);
  await page.getByRole('button', { name: /Create & run BOTs/i }).click();
  await page.waitForTimeout(2000);

  const after = await dupes();
  console.log('before:', JSON.stringify(before));
  console.log('after :', JSON.stringify(after));

  const ok = before.tasks.length === 0 && after.tasks.length === 0 && after.total >= before.total - 1;
  console.log(`\n${ok ? 'PASS' : 'FAIL'}  no duplicate request codes after delete + create`);
  await browser.close();
  process.exit(ok ? 0 : 1);
})();
