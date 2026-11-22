import { expect, test, type Page } from '@playwright/test';

test.describe.configure({ timeout: 60_000 });

async function launch(page: Page) {
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Welcome', exact: true }),
  ).toBeVisible();
}

async function navigation(page: Page) {
  await expect(
    page.getByRole('button', { name: /^(Open|Close) navigation$/ }),
  ).toBeVisible();
  const button = page.getByRole('button', {
    name: 'Open navigation',
    exact: true,
  });
  if (await button.isVisible()) await button.click();
  await expect(
    page.getByRole('complementary', { name: 'Workspace navigation' }),
  ).toBeVisible();
}

async function documentTools(page: Page) {
  await navigation(page);
  await page.locator('.pn-documents-rule').hover();
}

async function createFolder(page: Page, name: string) {
  await documentTools(page);
  await page.getByRole('button', { name: 'New folder', exact: true }).click();
  const input = page.getByRole('textbox', {
    name: 'New folder name',
    exact: true,
  });
  await input.fill(name);
  await input.press('Enter');
  await expect(
    page.locator('.left-folder-title[title="' + name + '"]'),
  ).toBeVisible();
}

async function createNote(page: Page, title: string) {
  await documentTools(page);
  await page.getByRole('button', { name: 'New document', exact: true }).click();
  const input = page.getByRole('textbox', {
    name: 'Document title',
    exact: true,
  });
  await expect(input).toBeFocused();
  await input.fill(title);
  await input.press('Enter');
  await expect(
    page.getByRole('textbox', { name: 'Document title', exact: true }),
  ).toHaveValue(title);
  await expect(
    page.getByRole('textbox', { name: 'MDX source', exact: true }),
  ).toBeVisible();
}

async function saved(page: Page) {
  await expect(page.locator('.web-shell')).toHaveAttribute(
    'data-save-status',
    'saved',
  );
}

async function documentActions(page: Page) {
  const openPanel = page.getByRole('button', { name: 'Open right panel' });
  if (await openPanel.isVisible()) await openPanel.click();
  await page
    .getByRole('button', { name: 'Document actions', exact: true })
    .click();
  return page.getByRole('dialog', { name: 'Document actions', exact: true });
}

async function settings(page: Page) {
  await navigation(page);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  return page.getByRole('dialog', { name: 'Settings', exact: true });
}

async function chooseMode(page: Page, mode: 'Source' | 'Preview') {
  const button = page.getByRole('button', { name: mode, exact: true });
  if (
    !(await page.locator('.mode-island').getAttribute('class'))?.includes(
      'is-open',
    )
  ) {
    await page
      .getByRole('button', { name: 'Show document modes', exact: true })
      .click();
  }
  await button.click();
}

test('creates folders and notes, renames, moves, and searches real source content', async ({
  page,
}) => {
  await launch(page);
  await navigation(page);
  await documentTools(page);
  await page.getByRole('button', { name: 'New folder', exact: true }).click();
  const folderName = page.getByRole('textbox', {
    name: 'New folder name',
    exact: true,
  });
  await folderName.fill('constructor');
  await folderName.press('Enter');
  await expect(
    page.locator('.folder-inline-create').getByRole('alert'),
  ).toBeVisible();
  await expect(folderName).toHaveValue('constructor');
  await expect(
    page.locator('.left-folder-title[title="constructor"]'),
  ).toHaveCount(0);
  await folderName.fill('Projects');
  await folderName.press('Enter');
  await expect(
    page.locator('.left-folder-title[title="Projects"]'),
  ).toBeVisible();
  await expect(
    page.locator('.folder-inline-create').getByRole('alert'),
  ).toHaveCount(0);
  await createFolder(page, 'Mathematics');
  await createNote(page, 'Linear maps');
  await page
    .getByRole('textbox', { name: 'MDX source' })
    .fill('## Linear maps\n\nThe searchable token is orbit-8472.\n');
  await saved(page);

  const actions = await documentActions(page);
  await actions.getByRole('button', { name: 'Rename', exact: true }).click();
  const rename = page.getByRole('dialog', {
    name: 'Rename document',
    exact: true,
  });
  await rename
    .getByRole('textbox', { name: 'Document title', exact: true })
    .fill('Linear transformations');
  await rename.getByRole('button', { name: 'Rename', exact: true }).click();
  await expect(
    page.getByRole('textbox', { name: 'Document title' }),
  ).toHaveValue('Linear transformations');

  await (
    await documentActions(page)
  )
    .getByRole('button', { name: 'Move to folder', exact: true })
    .click();
  const move = page.getByRole('dialog', { name: 'Move document', exact: true });
  await move.getByLabel('Destination folder').selectOption('Projects');
  await move.getByRole('button', { name: 'Move', exact: true }).click();
  await navigation(page);
  const projects = page.locator('.folder-tree-group').filter({
    has: page.locator('.left-folder-title[title="Projects"]'),
  });
  await expect(
    projects.getByRole('button', {
      name: 'Open Linear transformations',
      exact: true,
    }),
  ).toBeVisible();

  await page
    .getByRole('searchbox', { name: 'Search notes and content' })
    .fill('orbit-8472');
  await expect(
    page.locator('.left-folder-list').getByRole('button', {
      name: 'Open Linear transformations',
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page
      .locator('.left-folder-list')
      .getByRole('button', { name: 'Open Welcome', exact: true }),
  ).toHaveCount(0);
  await saved(page);
  await page.reload();
  await expect(
    page.getByRole('textbox', { name: 'Document title' }),
  ).toHaveValue('Linear transformations');
  await expect(page.getByRole('textbox', { name: 'MDX source' })).toContainText(
    'orbit-8472',
  );
});

test('Recent preserves insertion order, removes shortcuts only, and survives reload', async ({
  page,
}) => {
  await launch(page);
  await createNote(page, 'Alpha');
  await createNote(page, 'Beta');
  await createNote(page, 'Gamma');
  const recent = page
    .getByRole('region', { name: 'Recent documents' })
    .locator('.recent-open');
  await expect(recent).toHaveText(['Welcome', 'Alpha', 'Beta', 'Gamma']);

  await page
    .locator('.left-folder-list')
    .getByRole('button', { name: 'Open Alpha', exact: true })
    .click();
  await expect(recent).toHaveText(['Welcome', 'Alpha', 'Beta', 'Gamma']);
  await page
    .locator('.recent-row')
    .filter({
      has: page.getByRole('button', { name: 'Open Alpha', exact: true }),
    })
    .hover();
  await page
    .getByRole('button', {
      name: 'Remove Alpha from recent documents',
      exact: true,
    })
    .click();
  await expect(
    page.getByRole('textbox', { name: 'Document title' }),
  ).toHaveValue('Alpha');
  await expect(recent).toHaveText(['Welcome', 'Beta', 'Gamma']);

  await page
    .locator('.left-folder-list')
    .getByRole('button', { name: 'Open Alpha', exact: true })
    .click();
  await expect(recent).toHaveText(['Welcome', 'Beta', 'Gamma', 'Alpha']);
  await saved(page);
  await page.reload();
  await navigation(page);
  await expect(recent).toHaveText(['Welcome', 'Beta', 'Gamma', 'Alpha']);
  await page
    .locator('.left-folder-list')
    .getByRole('button', { name: 'Open Beta', exact: true })
    .click();
  await expect(recent).toHaveText(['Welcome', 'Beta', 'Gamma', 'Alpha']);
});

test('Trash restores the exact source and a title typed with spaces saves before blur', async ({
  page,
}) => {
  await launch(page);
  await createNote(page, 'Recoverable');
  const editor = page.getByRole('textbox', { name: 'MDX source' });
  const body =
    '## Retain this\n\nA removed note is recoverable, including α and β.\n';
  await editor.fill(body);
  const title = page.getByRole('textbox', { name: 'Document title' });
  await title.fill('Recoverable note with spaces');
  await saved(page);
  await page.reload();
  await expect(title).toHaveValue('Recoverable note with spaces');
  await expect(editor).toContainText('A removed note is recoverable');

  await (
    await documentActions(page)
  )
    .getByRole('button', { name: 'Move to Trash', exact: true })
    .click();
  const remove = page.getByRole('dialog', {
    name: 'Move to Trash',
    exact: true,
  });
  await remove
    .getByRole('button', { name: 'Move to Trash', exact: true })
    .click();
  await expect(title).not.toHaveValue('Recoverable note with spaces');
  const dialog = await settings(page);
  await dialog.getByRole('button', { name: 'Trash', exact: true }).click();
  const row = dialog
    .locator('.web-list-row')
    .filter({ hasText: 'Recoverable note with spaces' });
  await row.getByRole('button', { name: 'Restore', exact: true }).click();
  await expect(row).toHaveCount(0);
  await dialog
    .getByRole('button', { name: 'Close Settings', exact: true })
    .click();
  await page
    .locator('.left-folder-list')
    .getByRole('button', {
      name: 'Open Recoverable note with spaces',
      exact: true,
    })
    .click();
  await expect(editor).toHaveText(body, { useInnerText: true });
  await saved(page);
});

test('mobile navigation closes after creation, mode controls work, and the page does not overflow', async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await launch(page);
  await createNote(page, 'Mobile note');
  await expect(
    page.getByRole('button', { name: 'Open navigation', exact: true }),
  ).toBeVisible();
  await expect(page.locator('#notes-navigation')).toHaveAttribute(
    'aria-hidden',
    'true',
  );
  await page
    .getByRole('textbox', { name: 'MDX source' })
    .fill('A note for a narrow screen.\n\n' + 'longword'.repeat(40));
  await chooseMode(page, 'Preview');
  const frame = page.frameLocator('iframe[title="Document preview"]');
  await expect(
    frame.getByText('A note for a narrow screen.', { exact: true }),
  ).toBeVisible({ timeout: 25_000 });
  expect(
    await page.evaluate(
      () =>
        Math.max(
          document.documentElement.scrollWidth,
          document.body.scrollWidth,
        ) - window.innerWidth,
    ),
  ).toBeLessThanOrEqual(1);
  await navigation(page);
  await page
    .locator('.left-folder-list')
    .getByRole('button', { name: 'Open Welcome', exact: true })
    .click();
  await expect(page.locator('#notes-navigation')).toHaveAttribute(
    'aria-hidden',
    'true',
  );
  await expect(
    page.getByRole('heading', { name: 'Welcome', exact: true }),
  ).toBeVisible();
  await chooseMode(page, 'Source');
  await expect(page.getByRole('textbox', { name: 'MDX source' })).toBeVisible();
});

test('command palette focuses search, supports keyboard selection, and traps dialog focus', async ({
  page,
}) => {
  await launch(page);
  await page.keyboard.press('Control+e');
  const editor = page.getByRole('textbox', { name: 'MDX source' });
  await editor.focus();
  await page.keyboard.press('Control+k');
  const palette = page.getByRole('dialog', {
    name: 'Command palette',
    exact: true,
  });
  const search = palette.getByRole('textbox', {
    name: 'Search commands and notes',
  });
  await expect(search).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(
    palette.getByRole('button', { name: 'Close Command palette', exact: true }),
  ).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(palette.locator('.cmd-result').last()).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(
    palette.getByRole('button', { name: 'Close Command palette', exact: true }),
  ).toBeFocused();
  await search.focus();
  await search.fill('React playground');
  // Welcome mentions this note in its body; the exact title must rank first.
  await expect(palette.locator('.cmd-result').first()).toContainText(
    'React playground',
  );
  await search.press('Enter');
  await expect(palette).toHaveCount(0);
  await expect(
    page.getByRole('textbox', { name: 'Document title' }),
  ).toHaveValue('React playground');

  await editor.focus();
  await page.keyboard.press('Control+k');
  await expect(palette).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(palette).toHaveCount(0);
  await expect(editor).toBeFocused();
});

test('panels never shift the canvas and Source/Preview metrics match across viewport thresholds', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await launch(page);
  const canvas = page.locator('.document-wrap');
  const before = await canvas.boundingBox();
  expect(before).not.toBeNull();
  await navigation(page);
  await page
    .getByRole('button', { name: 'Open right panel', exact: true })
    .click();
  const after = await canvas.boundingBox();
  expect(after!.x).toBeCloseTo(before!.x, 1);
  expect(after!.width).toBeCloseTo(before!.width, 1);
  await expect(
    page
      .locator('#notes-details')
      .getByRole('region', { name: 'Outgoing links' }),
  ).toBeVisible();
  await expect(
    page.locator('#notes-details').getByRole('region', { name: 'Backlinks' }),
  ).toContainText('No other notes link here yet.');
  await page
    .getByRole('button', { name: 'Close navigation', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Close right panel', exact: true })
    .click();
  const frame = page.frameLocator('iframe[title="Document preview"]');
  await expect(
    frame.getByText('Your notes, with room to think.', { exact: true }),
  ).toBeVisible({ timeout: 25_000 });
  await page.keyboard.press('Control+e');
  const editor = page.getByRole('textbox', { name: 'MDX source' });
  const metrics = (element: Element) => {
    const style = getComputedStyle(element);
    return {
      font: style.fontFamily,
      size: style.fontSize,
      weight: style.fontWeight,
      lineHeight: style.lineHeight,
      color: style.color,
      tracking: style.letterSpacing,
    };
  };
  for (const width of [1440, 760, 375]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(editor).toHaveCSS(
      'font-size',
      width <= 720 ? '15.5px' : '16px',
    );
    const sourceMetrics = await editor.evaluate(metrics);
    // Compare the rendered modes. Firefox returns empty computed styles for
    // a document inside a display:none iframe.
    await page.keyboard.press('Control+e');
    await expect(
      frame.getByText('Your notes, with room to think.', { exact: true }),
    ).toBeVisible();
    await expect
      .poll(async () => frame.locator('body').evaluate(metrics))
      .toEqual(sourceMetrics);
    await page.keyboard.press('Control+e');
  }
});
