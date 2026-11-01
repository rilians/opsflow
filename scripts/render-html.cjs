/**
 * Screenshots the HTML preview of the business case so the ROI section can be
 * eyeballed without opening Word.
 */
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1000, height: 1400 } });
  await p.goto('file://' + process.cwd() + '/docs/business-case-report.html');
  await p.waitForTimeout(1000);
  const heading = p.locator('text=08   Automation ROI assumptions').first();
  await heading.scrollIntoViewIfNeeded();
  await p.waitForTimeout(400);
  await p.screenshot({ path: 'docs/shots/case-roi.png' });
  console.log('wrote docs/shots/case-roi.png');
  await b.close();
})();
