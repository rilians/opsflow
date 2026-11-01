/**
 * Regenerates the screenshots embedded in README.md.
 *
 * Every file in docs/screens and docs/shot-*.png is a live capture of the running
 * app, so the README never drifts away from the product. Run with the dev server
 * up:  node scripts/readme-shots.cjs
 */
const { chromium } = require('playwright');

const BASE = 'http://127.0.0.1:5173';

const settle = async (page, ms = 1200) => {
  await page.waitForTimeout(ms);
};

const shot = async (page, path, opts = {}) => {
  await page.screenshot({ path, ...opts });
  console.log('shot', path);
};

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });

  // Full-page marketing screenshots
  await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle' });
  await settle(page);
  await shot(page, 'docs/shot-dashboard.png');

  await page.goto(`${BASE}/tasks`, { waitUntil: 'networkidle' });
  await settle(page);
  await shot(page, 'docs/shot-tasks.png');

  await page.goto(`${BASE}/automation`, { waitUntil: 'networkidle' });
  await settle(page);
  await shot(page, 'docs/shot-automation.png');

  // Kanban board
  await page.goto(`${BASE}/tasks`, { waitUntil: 'networkidle' });
  await settle(page, 900);
  await page.getByRole('button', { name: 'Kanban' }).click();
  await settle(page, 700);
  await shot(page, 'docs/screens/kanban.png');

  // Task detail drawer — open a real record so the screenshot shows live data
  await page.goto(`${BASE}/tasks`, { waitUntil: 'networkidle' });
  await settle(page, 900);
  await page.locator('tbody tr').nth(1).click();
  await settle(page, 900);
  await shot(page, 'docs/screens/task-detail.png');

  // Quick create modal
  await page.goto(`${BASE}/tasks`, { waitUntil: 'networkidle' });
  await settle(page, 900);
  await page.getByRole('button', { name: 'New request' }).first().click();
  await settle(page, 700);
  await shot(page, 'docs/screens/new-request.png');
  await page.keyboard.press('Escape');

  // Automation execution detail + builder
  await page.goto(`${BASE}/automation?tab=executions`, { waitUntil: 'networkidle' });
  await settle(page);
  await page.locator('tbody tr').nth(2).click();
  await settle(page, 800);
  await shot(page, 'docs/screens/execution-detail.png');
  await page.keyboard.press('Escape');

  await page.goto(`${BASE}/automation?tab=builder`, { waitUntil: 'networkidle' });
  await settle(page);
  await shot(page, 'docs/screens/automation-builder.png');

  await page.goto(`${BASE}/workflows`, { waitUntil: 'networkidle' });
  await settle(page);
  await shot(page, 'docs/screens/workflows.png');

  await page.goto(`${BASE}/sla`, { waitUntil: 'networkidle' });
  await settle(page);
  await shot(page, 'docs/screens/sla-monitoring.png');

  await page.goto(`${BASE}/analytics`, { waitUntil: 'networkidle' });
  await settle(page, 1400);
  await shot(page, 'docs/screens/roi-calculator.png');
  await page.evaluate(() => window.scrollTo(0, 1400));
  await settle(page, 500);
  await shot(page, 'docs/screens/analytics-workload.png');

  await page.goto(`${BASE}/reports`, { waitUntil: 'networkidle' });
  await settle(page);
  await shot(page, 'docs/screens/reports.png');

  await page.goto(`${BASE}/notifications`, { waitUntil: 'networkidle' });
  await settle(page);
  await shot(page, 'docs/screens/notifications.png');

  await page.goto(`${BASE}/settings`, { waitUntil: 'networkidle' });
  await settle(page);
  await shot(page, 'docs/screens/settings.png');

  // Mobile
  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await mobile.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle' });
  await settle(mobile);
  await shot(mobile, 'docs/screens/mobile-dashboard.png');

  await mobile.goto(`${BASE}/tasks`, { waitUntil: 'networkidle' });
  await settle(mobile);
  await shot(mobile, 'docs/screens/mobile-tasks.png');

  await browser.close();
  console.log('readme screenshots refreshed');
})();
