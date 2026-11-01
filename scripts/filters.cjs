/**
 * Execution filters must survive a reload and be shareable, like ?tab= and ?rule=.
 */
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
  await page.goto('http://127.0.0.1:5173/automation?tab=executions', { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);

  await page.getByRole('button', { name: 'Failed', exact: true }).click();
  await page.waitForTimeout(700);
  const urlAfter = page.url();
  const rowsAfter = await page.evaluate(() => document.querySelectorAll('tbody tr').length);

  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  const rowsReload = await page.evaluate(() => document.querySelectorAll('tbody tr').length);
  const failedOnly = await page.evaluate(() => {
    const cells = [...document.querySelectorAll('tbody tr')].map((tr) => tr.innerText);
    return cells.length > 0 && cells.every((t) => /Failed/i.test(t));
  });

  // Deep link straight to a filtered view
  const deep = await browser.newPage({ viewport: { width: 1440, height: 950 } });
  await deep.goto('http://127.0.0.1:5173/automation?tab=executions&exec=Failed', { waitUntil: 'networkidle' });
  await deep.waitForTimeout(900);
  const deepRows = await deep.evaluate(() => document.querySelectorAll('tbody tr').length);
  const deepAllFailed = await deep.evaluate(() => {
    const rows = [...document.querySelectorAll('tbody tr')].map((tr) => tr.innerText);
    return rows.length > 0 && rows.every((t) => /Failed/i.test(t));
  });

  const checks = [
    ['filter is written to the URL', /exec=Failed/.test(urlAfter), urlAfter.split('?')[1]],
    ['filtered table shows only Failed rows', failedOnly && rowsAfter > 0, `${rowsAfter} rows`],
    ['filter survives a reload', rowsReload === rowsAfter && failedOnly, `${rowsReload} rows`],
    ['a filtered view is deep-linkable', deepAllFailed && deepRows === rowsAfter, `${deepRows} rows`],
  ];

  let ok = true;
  for (const [name, pass, detail] of checks) {
    console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
    if (!pass) ok = false;
  }
  console.log(`\n${checks.filter((c) => c[1]).length}/${checks.length} filter checks passed`);
  await browser.close();
  process.exit(ok ? 0 : 1);
})();
