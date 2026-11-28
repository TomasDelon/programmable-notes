import { readFile } from 'node:fs/promises';
import { chromium } from '/workspace/programmable-notes/node_modules/playwright/index.mjs';
const browser = await chromium.launch({ headless: true, chromiumSandbox: true });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  await page.setContent(await readFile('/tmp/pn-wry-input-20261126/fixture.html', 'utf8'));
  console.log(JSON.stringify({ stage: 'initial', title: await page.title() }));
  await page.locator('#counter').click();
  await page.locator('#counter').click();
  await page.locator('#field').pressSequentially('hello');
  const state = JSON.parse(await page.title());
  console.log(JSON.stringify({ stage: 'after_input', state, errors }));
  if (!state.ready || state.count !== 2 || state.field !== 'hello' || state.error || errors.length) throw Error('Fixture control failed');
} finally {
  await browser.close();
}
