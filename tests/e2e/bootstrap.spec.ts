import { expect, test } from '@playwright/test';

test('serves the built React and MDX scaffold without browser errors', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  const response = await page.goto('/');
  expect(response?.status()).toBe(200);
  await expect(page).toHaveTitle('Programmable Notes');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Programmable Notes' }),
  ).toBeVisible();
  await expect(page.getByRole('main')).toContainText('technical handoff');
  expect(errors).toEqual([]);
});
