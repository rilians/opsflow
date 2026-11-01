const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  await p.goto('http://127.0.0.1:5173/dashboard', { waitUntil: 'networkidle' });
  await p.waitForTimeout(1500);
  const s = await p.evaluate(() => JSON.parse(localStorage.getItem('opsflow.state.v5')));
  const out = [];
  const add = (k, v) => out.push([k, v]);
  const T = s.tasks, now = Date.now();

  // referential integrity
  add('tasks → missing assignee', T.filter(t => t.assigneeId && !s.users.find(u => u.id === t.assigneeId)).map(t => t.code));
  add('tasks → missing department', T.filter(t => !s.organization.departments.find(d => d.id === t.departmentId)).length);
  add('tasks → missing workflow', T.filter(t => !s.workflows.find(w => w.id === t.workflowId)).length);
  add('dup task codes', Object.entries(T.reduce((a,t)=>{a[t.code]=(a[t.code]||0)+1;return a},{})).filter(([,n])=>n>1).map(([c])=>c));
  add('dup task ids', Object.entries(T.reduce((a,t)=>{a[t.id]=(a[t.id]||0)+1;return a},{})).filter(([,n])=>n>1).length);

  // status invariants
  add('Completed without completedAt', T.filter(t => t.status==='Completed' && !t.completedAt).map(t=>t.code));
  add('completedAt but not Completed', T.filter(t => t.completedAt && t.status!=='Completed').map(t=>t.code));
  add('completedAt before createdAt', T.filter(t => t.completedAt && +new Date(t.completedAt) < +new Date(t.createdAt)).length);
  add('Overdue but deadline in future', T.filter(t => t.status==='Overdue' && +new Date(t.deadline) > now).map(t=>`${t.code}(${((+new Date(t.deadline)-now)/3.6e6).toFixed(1)}h left)`));
  add('Open but deadline past & not Overdue', T.filter(t => ['New','Pending Validation','Assigned','In Progress','Waiting Approval'].includes(t.status) && +new Date(t.deadline) < now).length);
  add('New/Assigned but no assignee', T.filter(t => ['Assigned','In Progress','Waiting Approval'].includes(t.status) && !t.assigneeId).length);
  add('createdAt in the future', T.filter(t => +new Date(t.createdAt) > now + 60000).length);
  add('deadline == createdAt', T.filter(t => t.deadline === t.createdAt).length);
  add('slaHours mismatch deadline-created', T.filter(t => Math.abs((+new Date(t.deadline)-+new Date(t.createdAt))/3.6e6 - t.slaHours) > 0.5).map(t=>`${t.code}:${t.slaHours}h vs ${((+new Date(t.deadline)-+new Date(t.createdAt))/3.6e6).toFixed(1)}h`).slice(0,8));
  add('history empty', T.filter(t => !t.history.length).length);
  add('history out of order', T.filter(t => t.history.some((h,i)=> i>0 && +new Date(h.at) < +new Date(t.history[i-1].at))).length);
  add('history in future', T.filter(t => t.history.some(h => +new Date(h.at) > now + 60000)).length);
  add('escalated but not Overdue', T.filter(t => t.escalated && t.status!=='Overdue').map(t=>t.code));
  add('Overdue but not escalated', T.filter(t => t.status==='Overdue' && !t.escalated).length);
  add('reminderSentAt on completed', T.filter(t => t.reminderSentAt && t.status==='Completed').length);
  add('reminderSentAt > deadline', T.filter(t => t.reminderSentAt && +new Date(t.reminderSentAt) > +new Date(t.deadline)).map(t=>t.code));

  // workflow instances
  const allEx = s.workflows.flatMap(w => w.executions.map(e => ({...e, wf: w.name, wfStages: w.stages.length})));
  add('instances → missing task', allEx.filter(e => !T.find(t=>t.id===e.taskId)).map(e=>e.taskCode));
  add('task.workflowId ≠ instance workflow', T.filter(t => { const ex = allEx.find(e=>e.taskId===t.id); return ex && ex.workflowId !== t.workflowId; }).length);
  add('Running instance for Completed task', allEx.filter(e => { const t = T.find(t=>t.id===e.taskId); return t && t.status==='Completed' && e.status!=='Completed'; }).map(e=>e.taskCode));
  add('dupe instance per task', Object.entries(allEx.reduce((a,e)=>{a[e.taskId]=(a[e.taskId]||0)+1;return a},{})).filter(([,n])=>n>1).length);
  add('stageIndex out of range', allEx.filter(e => e.currentStageIndex >= e.wfStages).length);
  add('completed instance w/o completedAt', allEx.filter(e => e.status==='Completed' && !e.completedAt).length);
  add('instance history empty', allEx.filter(e => !e.history.length).length);

  // executions
  add('executions → missing rule', s.executions.filter(e => !s.automations.find(a=>a.id===e.ruleId)).length);
  add('executions → missing task refs', s.executions.filter(e => e.affectedTaskIds.some(id => !T.find(t=>t.id===id))).length);
  add('exec duration ≤ 0 or negative', s.executions.filter(e => e.durationMs < 0).length);
  add('exec ended before started', s.executions.filter(e => +new Date(e.endedAt) < +new Date(e.startedAt)).length);
  add('exec in future', s.executions.filter(e => +new Date(e.startedAt) > now + 60000).length);
  const byRule = s.automations.map(a => ({ name: a.name, total: a.totalExecutions, ok: a.successfulExecutions, bad: a.failedExecutions, records: a.recordsProcessed, real: s.executions.filter(e=>e.ruleId===a.id).length }));
  add('rule.executionCounters vs real', byRule.filter(r => r.total !== r.real || (r.ok + r.bad) > r.total).map(r=>`${r.name}: total=${r.total} real=${r.real} ok=${r.ok} bad=${r.bad}`));
  add('rule.recordsProcessed vs real', byRule.filter(r => r.records !== s.executions.filter(e=>s.automations.find(a=>a.name===r.name)&&e.ruleName===r.name).reduce((x,e)=>x+e.recordsProcessed,0)).map(r=>`${r.name} stated=${r.records}`));

  // notifications & activity
  add('notifications → missing task', s.notifications.filter(n => n.taskId && !T.find(t=>t.id===n.taskId)).length);
  add('notifications in future', s.notifications.filter(n => +new Date(n.createdAt) > now + 60000).length);
  add('notifications dup (type+task+title)', Object.entries(s.notifications.reduce((a,n)=>{const k=`${n.type}|${n.taskId}|${n.title}`;a[k]=(a[k]||0)+1;return a},{})).filter(([,n])=>n>1).length);
  add('activity → missing task', s.activity.filter(a => a.taskId && !T.find(t=>t.id===a.taskId)).length);

  // reports
  add('reports per periodFrom>periodTo', s.reports.filter(r => +new Date(r.periodFrom) > +new Date(r.periodTo)).length);
  add('reports dup codes', Object.entries(s.reports.reduce((a,r)=>{a[r.code]=(a[r.code]||0)+1;return a},{})).filter(([,n])=>n>1).map(([c])=>c));

  // derived KPI cross-checks
  const completed = T.filter(t=>t.status==='Completed');
  add('completed on-time % (recomputed)', (completed.filter(t=>t.completedAt && +new Date(t.completedAt)<=+new Date(t.deadline)).length/completed.length*100).toFixed(1));
  add('automationStatus spread', T.reduce((a,t)=>{a[t.automationStatus]=(a[t.automationStatus]||0)+1;return a},{}));
  add('auto-assigned w/o assignee', T.filter(t=>t.automationStatus==='Auto-Assigned' && !t.assigneeId).length);
  add('Validated but no BOT execution touched it', T.filter(t => t.automationStatus==='Validated' && !s.executions.some(e=>e.affectedTaskIds.includes(t.id))).length);
  add('slaConfigs categories', s.slaConfigs.length + ' / categories ' + new Set(T.map(t=>t.category)).size);
  add('tasks w/ category missing slaConfig', [...new Set(T.map(t=>t.category))].filter(c => !s.slaConfigs.find(x=>x.category===c)));
  add('baselines botId → missing rule', s.baselines.filter(b=>b.botId && !s.automations.find(a=>a.id===b.botId)).map(b=>b.process));
  add('departments w/o head user', s.organization.departments.filter(d => !s.users.find(u=>u.departmentId===d.id && u.role==='Operations Manager')).map(d=>d.name));
  add('users dup emails', Object.entries(s.users.reduce((a,u)=>{a[u.email]=(a[u.email]||0)+1;return a},{})).filter(([,n])=>n>1).map(([e])=>e));

  for (const [k, v] of out) {
    const bad = Array.isArray(v) ? v.length : typeof v === 'number' ? v : 0;
    if (bad) console.log(`⚠ ${k}:`, JSON.stringify(v).slice(0, 300));
    else if (!Array.isArray(v)) console.log(`· ${k}:`, JSON.stringify(v).slice(0, 200));
  }
  await b.close();
})();
