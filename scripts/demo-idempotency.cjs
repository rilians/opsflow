/**
 * The demo scenario must be a walkthrough, not a data generator: running it twice
 * must not create a second request or a second pair of BOT runs.
 */
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
  await page.goto('http://127.0.0.1:5173/dashboard', { waitUntil: 'networkidle' });
  await page.waitForFunction(
    () => [...document.querySelectorAll('button')].some((b) => /run demo scenario/i.test(b.innerText)),
    { timeout: 15000 },
  );
  await page.waitForTimeout(600);

  const snapshot = () =>
    page.evaluate(() => {
      const key = Object.keys(localStorage).find((k) => k.startsWith('opsflow.state'));
      const s = JSON.parse(localStorage.getItem(key));
      return {
        tasks: s.tasks.length,
        scenarioTasks: s.tasks.filter((t) => (t.tags ?? []).includes('demo-scenario')).length,
        executions: s.executions.length,
      };
    });

  const before = await snapshot();

  // React's synthetic events respond to a real click; the button's inner text is
  // animated so query it by text and drive it through the DOM.
  const clickScenario = async () => {
    await page.waitForFunction(
      () => [...document.querySelectorAll('button')].some((b) => /run demo scenario/i.test(b.innerText)),
      { timeout: 15000 },
    );
    await page.evaluate(() => {
      const btn = [...document.querySelectorAll('button')].find((b) => /run demo scenario/i.test(b.innerText));
      btn.click();
    });
  };

  await clickScenario();
  await page.waitForTimeout(2000);
  const afterFirst = await snapshot();

  await page.goto('http://127.0.0.1:5173/dashboard', { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await clickScenario();
  await page.waitForTimeout(2000);
  const afterSecond = await snapshot();

  const toasts = await page.evaluate(() => document.body.innerText.match(/Demo scenario[^\n]*/g) || []);

  console.log('before     ', JSON.stringify(before));
  console.log('after 1st  ', JSON.stringify(afterFirst));
  console.log('after 2nd  ', JSON.stringify(afterSecond));
  console.log('toast text :', toasts.slice(-2));

  const firstAdded = afterFirst.tasks - before.tasks;
  const secondAdded = afterSecond.tasks - afterFirst.tasks;
  const execAddedSecond = afterSecond.executions - afterFirst.executions;

  const ok =
    firstAdded === 1 &&
    afterFirst.scenarioTasks === 1 &&
    secondAdded === 0 &&
    execAddedSecond === 0 &&
    /already in progress/i.test(toasts.join(' '));

  console.log(`\n${ok ? 'PASS' : 'FAIL'}  demo scenario is idempotent (1st: +${firstAdded} task, 2nd: +${secondAdded} task, +${execAddedSecond} executions)`);
  await browser.close();
  process.exit(ok ? 0 : 1);
})();
