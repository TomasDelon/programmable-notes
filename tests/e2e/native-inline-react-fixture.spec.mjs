import { expect, test } from '@playwright/test';
import { compileFixture } from '../../scripts/native-inline-react-v1/compile.mjs';

test('fixed compiled MDX/React acknowledges pointer and normal field focus/typing in a sandboxed browser control', async ({
  page,
}, info) => {
  const { html, manifest } = await compileFixture();
  await info.attach('fixed-fixture-manifest', {
    body: manifest,
    contentType: 'application/json',
  });
  const srcdoc = html
    .toString('utf8')
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
  await page.setContent(
    `<iframe title="Fixed React fixture" sandbox="allow-scripts" referrerpolicy="no-referrer" srcdoc="${srcdoc}"></iframe>`,
  );
  const element = await page.locator('iframe').elementHandle();
  const child = await element.contentFrame();
  const receipt = async () => {
    const title = await child.title();
    expect(Buffer.byteLength(title)).toBeLessThanOrEqual(256);
    try {
      return JSON.parse(title);
    } catch {
      return null;
    }
  };
  await expect.poll(receipt).toMatchObject({
    fixture: 'inline-react-guarded-v2',
    ready: true,
    count: 0,
    field: '',
    error: '',
  });
  const counter = child.getByRole('button', { name: 'Count: 0', exact: true });
  await counter.click();
  await child.getByRole('button', { name: 'Count: 1', exact: true }).click();
  await expect.poll(receipt).toMatchObject({ count: 2, error: '' });
  const field = child.getByRole('textbox', { name: 'Field', exact: true });
  await field.click();
  await expect.poll(receipt).toMatchObject({ focus: 'field', error: '' });
  await page.keyboard.type('hello');
  await expect(field).toHaveValue('hello');
  await expect.poll(receipt).toMatchObject({
    ready: true,
    count: 2,
    field: 'hello',
    focus: 'field',
    error: '',
  });
  await info.attach('browser-fixture-receipt', {
    body: Buffer.from(
      JSON.stringify({
        scope: 'browser-fixture-control-only',
        nativeTested: false,
        receipt: await receipt(),
      }),
    ),
    contentType: 'application/json',
  });
});
