const { chromium } = require('playwright');
const BASE = 'http://127.0.0.1:5173';
const results = [];
const check = (n, ok, x = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? ' — ' + x : ''}`); };

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 950 } });
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));

  // --- role based access control
  await p.goto(BASE + '/settings', { waitUntil: 'networkidle' });
  await p.waitForTimeout(600);
  await p.locator('header button[aria-label="User menu"]').click();
  await p.getByRole('menuitem', { name: /Rizky Hidayat/ }).click();
  await p.waitForTimeout(700);
  const rbac = await p.locator('main').innerText();
  check('Staff persona is read-only in settings', /Read-only for your role/.test(rbac), '');
  await p.locator('header button[aria-label="User menu"]').click();
  await p.getByRole('menuitem', { name: /Aulia Rahman/ }).click();
  await p.waitForTimeout(600);

  // --- workflow editor save
  await p.goto(BASE + '/workflows', { waitUntil: 'networkidle' });
  await p.waitForTimeout(600);
  await p.getByRole('button', { name: /Edit workflow/ }).click();
  await p.waitForTimeout(500);
  const stageInput = p.getByRole('dialog').locator('input[aria-label="Stage 1 name"]');
  await stageInput.fill('Request Logged');
  await p.getByRole('button', { name: /Save workflow/ }).click();
  await p.waitForTimeout(700);
  check('Workflow stage rename persists', /Request Logged/.test(await p.locator('main').innerText()), '');

  // --- SLA config edit
  await p.goto(BASE + '/settings?tab=sla', { waitUntil: 'networkidle' });
  await p.waitForTimeout(600);
  const cell = p.locator('tbody tr').first().locator('input').first();
  await cell.fill('6');
  await p.locator('tbody tr').first().getByRole('button', { name: /^Save$/ }).click();
  await p.waitForTimeout(700);
  check('SLA configuration saves', /saved/i.test(await p.locator('[role="status"]').last().innerText()), '');

  // --- notification read state
  await p.goto(BASE + '/notifications', { waitUntil: 'networkidle' });
  await p.waitForTimeout(500);
  await p.getByRole('button', { name: /Mark all read/ }).click();
  await p.waitForTimeout(600);
  check('Mark-all-read clears the unread badge', /0 unread/.test(await p.locator('main').innerText()), '');

  // --- duplicate detection bot (disabled by default)
  await p.goto(BASE + '/automation', { waitUntil: 'networkidle' });
  await p.waitForTimeout(600);
  const dupCard = p.locator('div.card', { hasText: 'Duplicate Detection BOT' }).first();
  await dupCard.locator('[role="switch"]').click();
  await p.waitForTimeout(500);
  await dupCard.getByRole('button', { name: 'Execute' }).click();
  await p.waitForTimeout(1800);
  const dupText = await dupCard.innerText();
  check('Duplicate BOT can be enabled and executed', /EXE-/.test(dupText), (dupText.match(/(\d+ potential duplicate|no duplicates)[^\n]*/i) || [''])[0]);

  // --- scheduled reporting bot writes a report
  const beforeReports = await (async () => {
    await p.goto(BASE + '/reports', { waitUntil: 'networkidle' });
    await p.waitForTimeout(500);
    return p.locator('table tbody tr').count();
  })();
  await p.goto(BASE + '/automation', { waitUntil: 'networkidle' });
  await p.waitForTimeout(600);
  const repCard = p.locator('div.card', { hasText: 'Automated Reporting BOT' }).first();
  await repCard.getByRole('button', { name: 'Execute' }).click();
  await p.waitForTimeout(1800);
  await p.goto(BASE + '/reports', { waitUntil: 'networkidle' });
  await p.waitForTimeout(500);
  await p.getByRole('button', { name: /Report history/ }).first().click();
  await p.waitForTimeout(400);
  const afterReports = await p.locator('table tbody tr').count();
  check('Reporting BOT writes a real report record', afterReports > beforeReports, `${beforeReports} → ${afterReports}`);

  // --- bulk assign
  await p.goto(BASE + '/tasks', { waitUntil: 'networkidle' });
  await p.waitForTimeout(600);
  await p.locator('#sel-all').check();
  await p.waitForTimeout(400);
  await p.getByRole('button', { name: /^Assign$/ }).click();
  await p.waitForTimeout(400);
  await p.locator('#bulk-assignee').selectOption({ index: 2 });
  await p.getByRole('button', { name: /^Assign \d+/ }).click();
  await p.waitForTimeout(800);
  check('Bulk assignment applies', /reassigned/i.test(await p.locator('[role="status"]').last().innerText()), '');

  // --- JSON export + import round trip
  await p.goto(BASE + '/settings?tab=data', { waitUntil: 'networkidle' });
  await p.waitForTimeout(500);
  const [dl] = await Promise.all([
    p.waitForEvent('download'),
    p.getByRole('button', { name: /Export JSON/ }).click(),
  ]);
  check('Workspace JSON export works', /\.json$/.test(dl.suggestedFilename()), dl.suggestedFilename());

  // --- reset demo
  await p.getByRole('button', { name: /Reset demo data/ }).first().click();
  await p.waitForTimeout(400);
  await p.getByRole('button', { name: /Reset workspace/ }).click();
  await p.waitForTimeout(900);
  await p.goto(BASE + '/tasks', { waitUntil: 'networkidle' });
  await p.waitForTimeout(700);
  check('Reset restores the seeded dataset', !/Request Logged/.test(await p.locator('main').innerText()), '');

  console.log('\npage errors:', errors.length ? errors.join(' | ') : 'none');
  console.log(`${results.filter(Boolean).length}/${results.length} extra checks passed`);
  await b.close();
})();
