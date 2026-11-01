const { chromium } = require('playwright');

const BASE = 'http://127.0.0.1:5173';
const results = [];
const check = (name, ok, extra = '') => {
  results.push({ name, ok, extra });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
};

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 }, acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));

  /* ---------------------------------------------------------- 1. dashboard baseline */
  await page.goto(BASE + '/dashboard', { waitUntil: 'networkidle' });
  await page.waitForTimeout(700);
  const kpiValue = async (label) => {
    const card = page.locator('div.card', { hasText: label }).first();
    return (await card.locator('p').nth(1).textContent())?.trim();
  };
  const totalBefore = Number((await kpiValue('Total Tasks'))?.replace(/,/g, ''));
  check('Dashboard renders KPIs', Number.isFinite(totalBefore) && totalBefore > 50, `total=${totalBefore}`);

  const executionCountBefore = await (async () => {
    await page.goto(BASE + '/automation?tab=executions', { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
    const text = await page.locator('main').innerText();
    return Number((text.match(/(\d+)\s+execution record/)?.[1] ?? '0').replace(/,/g, ''));
  })();

  /* ---------------------------------------------------------- 2. demo scenario */
  await page.goto(BASE + '/dashboard', { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  await page.getByRole('button', { name: /Run demo scenario|Run the scenario now/i }).first().click();
  await page.waitForTimeout(2200);
  check('Demo scenario navigates to the new task', page.url().includes('/tasks?task='), page.url());

  const drawer = page.locator('[role="dialog"][aria-modal="true"]').last();
  const drawerText = await drawer.innerText();
  check('Task drawer shows the scenario request', /VPN access failing/.test(drawerText), drawerText.split('\n')[0]);
  check('Smart Assignment BOT assigned a PIC', /Nadia|Rizky|Bayu/.test(drawerText), '');
  check('Task is In Progress after scenario', /In Progress/.test(drawerText), '');
  const scenarioCode = (drawerText.match(/OPS-\d{4}/) || [''])[0];
  check('Scenario task has a code', !!scenarioCode, scenarioCode);

  await page.locator('[role="dialog"] button[aria-label="Close panel"]').click();
  await page.waitForTimeout(300);

  /* ---------------------------------------------------------- 3. automation history grew */
  await page.goto(BASE + '/automation?tab=executions', { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  const executionCountAfter = Number(
    ((await page.locator('main').innerText()).match(/(\d+)\s+execution record/)?.[1] ?? '0').replace(/,/g, ''),
  );
  check(
    'Execution history grew by the scenario runs',
    executionCountAfter >= executionCountBefore + 2,
    `${executionCountBefore} → ${executionCountAfter}`,
  );
  const execTableText = await page.locator('tbody').first().innerText();
  check('Executions recorded as "Simulated trigger"', /Simulated trigger/.test(execTableText), '');

  /* ---------------------------------------------------------- 4. notifications raised */
  await page.goto(BASE + '/notifications', { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  const notifText = await page.locator('main').innerText();
  check('Assignment notification raised for scenario', /New task assigned — OPS-/.test(notifText), '');
  const notifCount = await page.locator('li').filter({ hasText: 'New task assigned' }).count();
  check('Notification list populated', notifCount > 0, `matched=${notifCount}`);

  /* ---------------------------------------------------------- 5. run a BOT for real */
  await page.goto(BASE + '/automation', { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  const valCard = page.locator('div.card', { hasText: 'Data Validation BOT' }).first();
  await valCard.getByRole('button', { name: 'Execute' }).first().click();
  await page.waitForTimeout(1600);
  const toastText = await page.locator('[role="status"]').first().innerText().catch(() => '');
  check('BOT execution shows a result toast', /executed|completed|failed/i.test(toastText), toastText.split('\n')[0]);
  check('Execution recorded in the card footer', /EXE-/.test(await valCard.innerText()), '');

  /* ---------------------------------------------------------- 6. simulate failure */
  await valCard.getByRole('button', { name: /Automation actions/ }).click();
  await page.getByRole('menuitem', { name: /Simulate failure/i }).click();
  await page.waitForTimeout(1600);
  const failToast = await page.locator('[role="status"]').last().innerText().catch(() => '');
  check('Failure is surfaced honestly (no fake success)', /failed/i.test(failToast), failToast.split('\n')[0]);

  /* ---------------------------------------------------------- 7. task CRUD via quick create */
  await page.goto(BASE + '/tasks', { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: /^New request$/ }).first().click();
  await page.waitForTimeout(400);
  await page.locator('#qc-title').fill('Wireless access point offline in meeting room 5A');
  await page.locator('#qc-desc').fill('The access point shows as offline in the controller; the meeting room has no connectivity for scheduled board review.');
  await page.locator('#qc-cat').selectOption('IT Support');
  await page.locator('#qc-pri').selectOption('High');
  await page.getByRole('button', { name: /Create & run BOTs/i }).click();
  await page.waitForTimeout(2600);
  check('Created request opens automatically', page.url().includes('/tasks?task='), page.url());
  const createdDrawer = await page.locator('[role="dialog"][aria-modal="true"]').last().innerText();
  await page.locator('[role="dialog"]').last().getByRole('button', { name: /History/ }).click();
  await page.waitForTimeout(300);
  const createdHistory = await page.locator('[role="dialog"]').last().innerText();
  check(
    'New request shows validation + assignment trail',
    /Data validation passed/.test(createdHistory) && /Auto-assigned to/.test(createdHistory),
    '',
  );
  check('New request has an assignee', /Nadia|Rizky|Bayu/.test(createdDrawer), '');

  /* ---------------------------------------------------------- 8. status change persists */
  await page.locator('[role="dialog"] button[aria-label="Close panel"]').click();
  await page.waitForTimeout(300);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  const afterReload = await page.locator('main').innerText();
  check('Data persists after refresh', /Wireless access point offline/.test(afterReload), '');

  /* ---------------------------------------------------------- 9. kanban + filters + sort */
  await page.getByRole('button', { name: 'Kanban' }).click();
  await page.waitForTimeout(500);
  const kanbanCols = await page.locator('text=In Progress').count();
  check('Kanban view renders columns', kanbanCols > 0, '');
  await page.getByRole('button', { name: 'Table', exact: true }).click();
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: /^Filters/ }).click();
  await page.waitForTimeout(300);
  await page.locator('#f-pri').selectOption('Critical');
  await page.waitForTimeout(500);
  const filteredRows = await page.locator('tbody tr').count();
  check('Advanced filter narrows the table', filteredRows > 0 && filteredRows < 25, `rows=${filteredRows}`);
  await page.locator('#f-pri').selectOption('all');
  await page.waitForTimeout(300);

  /* ---------------------------------------------------------- 10. sorting */
  const firstBefore = await page.locator('tbody tr').first().innerText();
  await page.locator('thead').getByText('Priority', { exact: true }).click();
  await page.waitForTimeout(400);
  const firstAfter = await page.locator('tbody tr').first().innerText();
  check('Sortable table reorders rows', firstBefore !== firstAfter, '');

  /* ---------------------------------------------------------- 11. CSV export */
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 8000 }),
    page.getByRole('button', { name: /Export CSV/ }).click(),
  ]);
  check('CSV export downloads a file', /opsflow-tasks-.*\.csv/.test(download.suggestedFilename()), download.suggestedFilename());

  /* ---------------------------------------------------------- 12. ROI calculator */
  await page.goto(BASE + '/analytics', { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  const roiBefore = await page.locator('#roi').innerText();
  await page.locator('#roi-monthlyTransactions').fill('4000');
  await page.waitForTimeout(500);
  const roiAfter = await page.locator('#roi').innerText();
  check('ROI calculator recomputes on input', roiBefore !== roiAfter, '');
  await page.locator('#roi-monthlyTransactions').fill('0');
  await page.waitForTimeout(400);
  const roiZero = await page.locator('#roi').innerText();
  check('ROI handles divide-by-zero safely', !/NaN|Infinity/.test(roiZero), '');
  await page.locator('#roi-monthlyTransactions').fill('1800');

  /* ---------------------------------------------------------- 13. report generation */
  await page.goto(BASE + '/reports', { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  const historyBefore = await page.locator('table tbody tr').count();
  await page.getByRole('button', { name: /Generate report/ }).click();
  await page.waitForTimeout(400);
  await page.getByRole('dialog').getByRole('button', { name: /Generate report/ }).click();
  await page.waitForTimeout(900);
  const previewText = await page.locator('[role="dialog"]').last().innerText();
  check('Generated report preview shows metadata', /DEMO DATA/.test(previewText) && /Prepared by/.test(previewText), '');
  await page.locator('[role="dialog"] button[aria-label="Close panel"]').click();
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: /Report history/ }).first().click();
  await page.waitForTimeout(400);
  const historyAfter = await page.locator('table tbody tr').count();
  check('Report appended to history', historyAfter >= historyBefore, `${historyBefore} → ${historyAfter}`);

  /* ---------------------------------------------------------- 14. workflow view */
  await page.goto(BASE + '/workflows', { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  const wfText = await page.locator('main').innerText();
  check('Default workflow stages render', /Request Submitted[\s\S]*Data Validation[\s\S]*Department Assignment[\s\S]*Task Execution[\s\S]*Supervisor Review[\s\S]*Completed/.test(wfText), '');

  /* ---------------------------------------------------------- 15. responsive mobile */
  const mobile = await ctx.newPage();
  await mobile.setViewportSize({ width: 390, height: 844 });
  await mobile.goto(BASE + '/dashboard', { waitUntil: 'networkidle' });
  await mobile.waitForTimeout(900);
  const overflow = await mobile.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check('Mobile layout has no horizontal overflow', overflow <= 2, `overflow=${overflow}px`);
  await mobile.screenshot({ path: '/home/user/shots_mobile.png', fullPage: false });
  await mobile.close();

  /* ---------------------------------------------------------- summary */
  console.log('\nConsole errors:', errors.length ? errors.join(' | ') : 'none');
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  await browser.close();
  process.exit(failed.length ? 1 : 0);
})();
