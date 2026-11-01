const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 950 } });
  await p.goto('http://127.0.0.1:5173/dashboard', { waitUntil: 'networkidle' });
  await p.waitForTimeout(1200);
  // Simulate a browser that saved the workspace under the old ROI seed.
  await p.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => k.startsWith('opsflow.state'));
    const s = JSON.parse(localStorage.getItem(key));
    s.roiInputs = { ...s.roiInputs, monthlyTransactions: 1800, manualMinutes: 18, automatedMinutes: 4 };
    localStorage.setItem(key, JSON.stringify(s));
  });
  await p.reload({ waitUntil: 'networkidle' });
  await p.waitForTimeout(1500);
  const after = await p.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => k.startsWith('opsflow.state'));
    const s = JSON.parse(localStorage.getItem(key));
    return s.roiInputs;
  });
  console.log('after reload:', JSON.stringify(after));
  const migrated = after.monthlyTransactions === 1870 && after.manualMinutes === 32 && after.automatedMinutes === 7;
  console.log(`${migrated ? 'PASS' : 'FAIL'}  legacy ROI seed migrated on load`);

  // Custom values must survive untouched
  await p.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => k.startsWith('opsflow.state'));
    const s = JSON.parse(localStorage.getItem(key));
    s.roiInputs = { ...s.roiInputs, monthlyTransactions: 2100, manualMinutes: 40, automatedMinutes: 5 };
    localStorage.setItem(key, JSON.stringify(s));
  });
  await p.reload({ waitUntil: 'networkidle' });
  await p.waitForTimeout(1500);
  const custom = await p.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => k.startsWith('opsflow.state'));
    return JSON.parse(localStorage.getItem(key)).roiInputs;
  });
  const kept = custom.monthlyTransactions === 2100 && custom.manualMinutes === 40;
  console.log(`${kept ? 'PASS' : 'FAIL'}  custom ROI inputs are not overwritten — ${JSON.stringify(custom)}`);
  await b.close();
  process.exit(migrated && kept ? 0 : 1);
})();
