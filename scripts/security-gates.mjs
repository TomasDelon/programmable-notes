// Deliberately runs availability probes in a disposable browser process.
import { chromium } from '@playwright/test';
import process from 'node:process';
const server = await chromium.launchServer({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
});
const browser = await chromium.connect(server.wsEndpoint());
let failed = false;
try {
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:4180/');
  let navigation = false;
  await page.route('https://probe.invalid/**', (route) => {
    navigation = true;
    return route.abort();
  });
  await page.getByLabel('Open files').setInputFiles({
    name: 'probe.mdx',
    mimeType: 'text/plain',
    buffer: Buffer.from(
      '<button onClick={()=>location.href="https://probe.invalid/navigation"}>Navigate frame</button>',
    ),
  });
  await page
    .frameLocator('iframe')
    .getByRole('button', { name: 'Navigate frame' })
    .click({ timeout: 20000 });
  await new Promise((resolve) => setTimeout(resolve, 500));
  console.log('Iframe self-navigation blocked by app policy:', !navigation);
  failed ||= navigation;
  await page.getByLabel('Open files').setInputFiles({
    name: 'loop.mdx',
    mimeType: 'text/plain',
    buffer: Buffer.from(
      'export function Loop(){while(true){} return null}\n\n<Loop />',
    ),
  });
  // Allow compilation and loop entry. Node timers are independent of the renderer.
  await new Promise((resolve) => setTimeout(resolve, 2500));
  const responsive = await Promise.race([
    page
      .evaluate(() => globalThis.document.title)
      .then(() => true)
      .catch(() => false),
    new Promise((resolve) => setTimeout(() => resolve(false), 2000)),
  ]);
  console.log('Host UI responsive during infinite preview loop:', responsive);
  failed ||= !responsive;
} catch (error) {
  console.error(error.message);
  failed = true;
} finally {
  server.process().kill('SIGKILL');
}
if (failed) process.exitCode = 1;
