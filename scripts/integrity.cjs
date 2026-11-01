/**
 * Data-integrity regression suite.
 *
 * Every assertion here corresponds to a defect found during the principal-engineer
 * audit. They run against the live workspace in a real browser, so they catch the
 * class of bug that type-checking and screenshot review cannot: internally
 * contradictory records that render convincingly.
 */
const { chromium } = require('playwright');

const BASE = 'http://127.0.0.1:5173';
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

const OPEN = ['New', 'Pending Validation', 'Assigned', 'In Progress', 'Waiting Approval', 'Overdue'];

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));

  const loadState = () => page.evaluate(() => JSON.parse(localStorage.getItem('opsflow.state.v5')));

  // Fresh seed.
  await page.goto(BASE + '/dashboard', { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  /* ------------------------------------------------------------ reference integrity */
  {
    const s = await loadState();
    const T = s.tasks;
    check('Every task has a known assignee', T.every((t) => !t.assigneeId || s.users.some((u) => u.id === t.assigneeId)));
    check('Every task has a known department', T.every((t) => s.organization.departments.some((d) => d.id === t.departmentId)));
    check('Every task has a known workflow', T.every((t) => s.workflows.some((w) => w.id === t.workflowId)));
    const dupCodes = Object.entries(T.reduce((a, t) => ({ ...a, [t.code]: (a[t.code] ?? 0) + 1 }), {})).filter(([, n]) => n > 1);
    check('Task codes are unique', dupCodes.length === 0, dupCodes.map(([c]) => c).join(','));

    // The 13 mismatches found in the audit.
    const inst = s.workflows.flatMap((w) => w.executions);
    const mismatched = T.filter((t) => {
      const e = inst.find((x) => x.taskId === t.id);
      return e && e.workflowId !== t.workflowId;
    });
    check('Task and its workflow instance agree on the workflow', mismatched.length === 0, `${mismatched.length} mismatch`);
  }

  /* --------------------------------------------------------------- status invariants */
  {
    const s = await loadState();
    const now = Date.now();
    const T = s.tasks;
    check('Completed tasks all have a completion time', T.every((t) => t.status !== 'Completed' || !!t.completedAt));
    check(
      'Completion never precedes creation',
      T.every((t) => !t.completedAt || +new Date(t.completedAt) >= +new Date(t.createdAt)),
    );
    // The 3 records that were Overdue with a future deadline.
    const badOverdue = T.filter((t) => t.status === 'Overdue' && +new Date(t.deadline) > now);
    check('No record is Overdue while its deadline is still in the future', badOverdue.length === 0, badOverdue.map((t) => t.code).join(','));
    const missedBreach = T.filter(
      (t) => OPEN.includes(t.status) && t.status !== 'Overdue' && +new Date(t.deadline) < now,
    );
    check('No open record has silently outlived its SLA', missedBreach.length === 0, missedBreach.map((t) => t.code).join(','));
    check(
      'Every escalated record is actually Overdue',
      T.every((t) => !t.escalated || t.status === 'Overdue'),
    );
    check(
      'Reminder timestamps fall inside the SLA window',
      T.every(
        (t) =>
          !t.reminderSentAt ||
          (+new Date(t.reminderSentAt) >= +new Date(t.createdAt) && +new Date(t.reminderSentAt) <= +new Date(t.deadline)),
      ),
    );
    check(
      'History is chronological and never in the future',
      T.every(
        (t) =>
          t.history.every((h, i) => i === 0 || +new Date(h.at) >= +new Date(t.history[i - 1].at)) &&
          t.history.every((h) => +new Date(h.at) <= now + 60_000),
      ),
    );
    const afterClose = T.filter(
      (t) => t.status === 'Completed' && t.history.some((h) => +new Date(h.at) > +new Date(t.completedAt) + 60_000),
    );
    check('A closed record has no activity dated after closure', afterClose.length === 0, afterClose.map((t) => t.code).join(','));
  }

  /* ----------------------------------------------------------- automation truthfulness */
  {
    const s = await loadState();
    const touched = new Set(s.executions.flatMap((e) => e.affectedTaskIds));
    const claimed = s.tasks.filter((t) => t.automationStatus === 'Auto-Assigned' || t.automationStatus === 'Validated');
    const unsupported = claimed.filter((t) => !touched.has(t.id));
    check(
      'Every automated status is backed by an execution record',
      unsupported.length === 0,
      `${unsupported.length} unsupported claim(s)`,
    );
    check(
      'Auto-assigned records have an assignee',
      s.tasks.every((t) => t.automationStatus !== 'Auto-Assigned' || !!t.assigneeId),
    );

    // The 5 duplicated notification triples.
    const dupNotice = Object.entries(
      s.notifications.reduce((a, n) => ({ ...a, [`${n.type}|${n.taskId}|${n.title}`]: (a[`${n.type}|${n.taskId}|${n.title}`] ?? 0) + 1 }), {}),
    ).filter(([, n]) => n > 1);
    check('No duplicate notifications exist', dupNotice.length === 0, `${dupNotice.length} duplicate key(s)`);

    const counters = s.automations.reduce((a, r) => a + r.totalExecutions, 0);
    check('Per-rule execution counters match the execution log', counters === s.executions.length, `${counters} vs ${s.executions.length}`);
  }

  /* ------------------------------------------------------------------- KPI consistency */
  {
    const s = await loadState();
    const now = Date.now();
    const T = s.tasks;
    const completed = T.filter((t) => t.status === 'Completed');
    const overdueByStatus = T.filter((t) => t.status === 'Overdue').length;
    const overdueByClock = T.filter((t) => OPEN.includes(t.status) && +new Date(t.deadline) <= now).length;
    check(
      'Overdue KPI (status) and overdue KPI (clock) agree',
      overdueByStatus === overdueByClock,
      `${overdueByStatus} vs ${overdueByClock}`,
    );

    const pageText = await page.locator('main').innerText();
    const kpi = (label) => {
      // KPI cards can render an info glyph between the label and the value.
      const m = pageText.match(new RegExp(`${label}[^\\d]*?([\\d.,]+%?)`));
      return m ? Number(m[1].replace(/[,%]/g, '')) : NaN;
    };
    const shownTotal = kpi('Total Tasks');
    check('Dashboard total matches the dataset', shownTotal === T.length, `${shownTotal} vs ${T.length}`);

    const shownCompliance = kpi('SLA Compliance');
    const realCompliance =
      Math.round(
        (completed.filter((t) => t.completedAt && +new Date(t.completedAt) <= +new Date(t.deadline)).length /
          Math.max(1, completed.length)) *
          1000,
      ) / 10;
    check('SLA compliance is recomputable from the records', Math.abs(shownCompliance - realCompliance) < 0.15, `${shownCompliance}% vs ${realCompliance}%`);

    // Sidebar badge vs dashboard KPI vs task list badge.
    const navBadge = await page.locator('aside a[href="/sla"] span.rounded-full, aside a[href="/sla"] span').last().textContent().catch(() => '');
    check('Sidebar overdue badge equals the KPI', Number(navBadge || 0) === overdueByStatus, `${navBadge} vs ${overdueByStatus}`);
  }

  /* ------------------------------------------------------------ workflow consistency */
  {
    const s = await loadState();
    const inst = s.workflows.flatMap((w) => w.executions);
    const wrongState = inst.filter((e) => {
      const t = s.tasks.find((x) => x.id === e.taskId);
      if (!t) return true;
      if (t.status === 'Completed') return e.status !== 'Completed';
      if (t.status === 'Rejected') return e.status !== 'Failed';
      return e.status === 'Completed' || e.status === 'Failed';
    });
    check('Workflow instance state agrees with task state', wrongState.length === 0, `${wrongState.length} disagreement(s)`);
    check('No task has two workflow instances', new Set(inst.map((e) => e.taskId)).size === inst.length);
  }

  /* ---------------------------------------------------------------- persistence honesty */
  {
    // Reload and confirm repairs are idempotent — a repaired workspace must not keep
    // reporting repairs on every boot.
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);
    const before = await loadState();
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);
    const after = await loadState();
    check('Workspace is stable across reloads', before.tasks.length === after.tasks.length, `${before.tasks.length} → ${after.tasks.length}`);
  }

  /* ---------------------------------------------------------- unknown route is honest */
  {
    await page.goto(BASE + '/does-not-exist', { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
    const text = await page.locator('main').innerText();
    check('Unknown route shows a not-found page', /Page not found/i.test(text), '');
  }

  console.log('\npage errors:', errors.length ? errors.join(' | ') : 'none');
  const passed = results.filter((r) => r.ok).length;
  console.log(`${passed}/${results.length} integrity checks passed`);
  await browser.close();
  process.exit(passed === results.length && errors.length === 0 ? 0 : 1);
})();
