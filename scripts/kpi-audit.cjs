const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  await p.goto('http://127.0.0.1:5173/dashboard', { waitUntil: 'networkidle' });
  await p.waitForTimeout(1200);
  const s = await p.evaluate(() => JSON.parse(localStorage.getItem('opsflow.state.v5')));
  const T = s.tasks, now = Date.now(), OPEN = ['New','Pending Validation','Assigned','In Progress','Waiting Approval','Overdue'];
  const shown = await p.evaluate(() => [...document.querySelectorAll('.card')].map(c=>c.innerText).filter(t=>/Total Tasks|Completed Tasks|SLA Compliance|Automation Rate|Overdue Tasks|Pending Tasks/.test(t)).join('\n---\n'));
  console.log('DASHBOARD CARDS:\n' + shown);

  const r = {};
  r.total = T.length;
  r.completed = T.filter(t=>t.status==='Completed').length;
  r.pending = T.filter(t=>OPEN.includes(t.status)).length;
  // overdue definition used by the KPI: status Overdue OR open past deadline
  r.overdue_kpi = T.filter(t=> t.status==='Overdue' || (OPEN.includes(t.status) && +new Date(t.deadline) < now)).length;
  r.overdue_status = T.filter(t=>t.status==='Overdue').length;
  r.slaCompliance = +(r.completed ? T.filter(t=>t.status==='Completed' && t.completedAt && +new Date(t.completedAt)<=+new Date(t.deadline)).length / r.completed * 100 : 0).toFixed(1);
  r.automationRate = +(T.filter(t=>['Auto-Assigned','Validated'].includes(t.automationStatus)).length / T.length * 100).toFixed(1);
  r.completionRate = +(r.completed / T.length * 100).toFixed(1);
  console.log('\nRECOMPUTED:', JSON.stringify(r, null, 1));

  // the KPI counts "overdue OR open past deadline"; status counts should agree now
  console.log('\noverdue consistency:', r.overdue_kpi === r.overdue_status ? 'OK (status and clock agree)' : `MISMATCH ${r.overdue_kpi} vs ${r.overdue_status}`);

  // SLA compliance: is every completed task's completedAt inside its own window?
  const bad = T.filter(t=>t.status==='Completed' && (!t.completedAt || +new Date(t.completedAt) < +new Date(t.createdAt)));
  console.log('malformed completions:', bad.length);

  // cross-page consistency: sum of per-status donut = total
  const dist = T.reduce((a,t)=>{a[t.status]=(a[t.status]||0)+1;return a},{});
  console.log('status distribution sums to', Object.values(dist).reduce((a,b)=>a+b,0), 'of', T.length);

  // department workload sums
  const deptSum = s.organization.departments.reduce((a,d)=>a+T.filter(t=>t.departmentId===d.id).length,0);
  console.log('department task sum', deptSum, 'of', T.length);

  // workflow instances vs tasks
  const inst = s.workflows.flatMap(w=>w.executions);
  console.log('workflow instances', inst.length, 'distinct tasks with instance', new Set(inst.map(e=>e.taskId)).size);
  console.log('tasks whose workflow status disagrees with task status:',
    inst.filter(e=>{
      const t = T.find(x=>x.id===e.taskId); if (!t) return false;
      if (t.status==='Completed' && e.status!=='Completed') return true;
      if (t.status!=='Completed' && e.status==='Completed') return true;
      return false;
    }).length);

  // execution counters
  const ruleSum = s.automations.reduce((a,r)=>a+r.totalExecutions,0);
  console.log('sum(rule.totalExecutions)', ruleSum, 'vs executions list', s.executions.length);
  await b.close();
})();
