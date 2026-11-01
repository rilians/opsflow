/**
 * Step 1 of the business-case build: export the live application state.
 *
 * The report is generated from whatever the app is actually holding, so the
 * numbers in docs/OpsFlow-Business-Case.docx can never drift from the demo
 * dataset. Requires the dev server on :5173.
 *
 *   node scripts/business-case/export-state.cjs [/tmp/state.json]
 */
const fs = require('fs');
const { chromium } = require('playwright');

const OUT = process.argv[2] || '/tmp/state.json';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
  await page.goto('http://127.0.0.1:5173/dashboard', { waitUntil: 'networkidle' });
  // Let the store hydrate and persist its first snapshot.
  await page.waitForTimeout(1500);

  const state = await page.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => k.startsWith('opsflow.state'));
    if (!key) return null;
    return JSON.parse(localStorage.getItem(key));
  });

  await browser.close();

  if (!state) {
    console.error('no opsflow.state key found — is the app seeded?');
    process.exit(1);
  }

  fs.writeFileSync(OUT, JSON.stringify(state));
  const counts = {
    tasks: state.tasks.length,
    executions: state.executions.length,
    automations: state.automations.length,
    baselines: state.baselines.length,
    users: state.users.length,
    reports: state.reports.length,
  };
  console.log('state exported to', OUT, JSON.stringify(counts));
})();
