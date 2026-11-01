const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  await p.goto('http://127.0.0.1:5173/dashboard', { waitUntil: 'networkidle' });
  await p.waitForTimeout(1500);
  const s = await p.evaluate(() => JSON.parse(localStorage.getItem('opsflow.state.v5')));
  const allEx = s.workflows.flatMap(w => w.executions.map(e => ({...e, wfName: w.name})));
  console.log('--- workflowId mismatch samples');
  s.tasks.filter(t => { const ex = allEx.find(e=>e.taskId===t.id); return ex && ex.workflowId !== t.workflowId; })
    .slice(0,5).forEach(t => {
      const ex = allEx.find(e=>e.taskId===t.id);
      console.log(` ${t.code} task.wf=${t.workflowId} instance.wf=${ex.workflowId} (${ex.wfName}) cat=${t.category} stageIdx=${t.workflowStageIndex}/${ex.currentStageIndex}`);
    });
  console.log('--- duplicate notifications');
  const seen = {};
  s.notifications.forEach(n => { const k = `${n.type}|${n.taskId}|${n.title}`; (seen[k] = seen[k] || []).push(n); });
  Object.entries(seen).filter(([,v]) => v.length > 1).slice(0,5).forEach(([k,v]) => console.log(` x${v.length} ${k} · actors=${[...new Set(v.map(n=>n.actor))].join(',')}`));
  console.log('--- Validated-but-untouched samples');
  s.tasks.filter(t => t.automationStatus==='Validated' && !s.executions.some(e=>e.affectedTaskIds.includes(t.id))).slice(0,4)
    .forEach(t => console.log(` ${t.code} status=${t.status} created=${t.createdAt.slice(0,16)}`));
  console.log('--- workflow per category');
  const wfByCat = {};
  s.tasks.forEach(t => { const ex = allEx.find(e=>e.taskId===t.id); if (!ex) return; const k = `${t.category} → ${ex.wfName}`; wfByCat[k]=(wfByCat[k]||0)+1; });
  Object.entries(wfByCat).forEach(([k,v]) => console.log(` ${v.toString().padStart(3)} ${k}`));
  await b.close();
})();
