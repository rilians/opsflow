#!/bin/bash
# fresh seed + full integrity audit
cd /home/user/opsflow
node -e "
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  await p.goto('http://127.0.0.1:5173/dashboard');
  await p.evaluate(() => localStorage.clear());
  await p.close(); await b.close();
})();
" && node scripts/audit.cjs
