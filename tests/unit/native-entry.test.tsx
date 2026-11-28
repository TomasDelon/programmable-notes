import { act, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const platform = vi.hoisted(() => ({
  native: false,
  invoke: vi.fn(),
  offline: vi.fn(),
  roots: [] as { unmount(): void }[],
  recoverable: [] as unknown[],
}));
vi.mock('@tauri-apps/api/core', () => ({
  isTauri: () => platform.native,
  invoke: platform.invoke,
}));
vi.mock('../../src/web/offline', () => ({ startOffline: platform.offline }));
vi.mock('../../src/web/WebApp', () => ({
  WebApp: () => <main>Browser workspace marker</main>,
}));
vi.mock('../../src/App', () => ({
  App: () => <main>Engine reference marker</main>,
}));
vi.mock('react-dom/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-dom/client')>();
  return {
    ...actual,
    createRoot(container: Parameters<typeof actual.createRoot>[0]) {
      const root = actual.createRoot(container, {
        onRecoverableError: (error) => platform.recoverable.push(error),
      });
      platform.roots.push(root);
      return root;
    },
  };
});
let entryOwner: { fail(): void } | undefined;
const epoch = 'a'.repeat(32);
const idle = () => ({ version: 1, epoch, phase: 'idle', request: null });
beforeEach(() => {
  vi.resetModules();
  vi.doUnmock('../../src/desktop/NativeProductEntry');
  platform.native = false;
  platform.invoke.mockReset();
  platform.offline.mockReset();
  platform.invoke.mockImplementation(async (command: string) => {
    if (
      command === 'enable_editor_close_guard' ||
      command === 'editor_close_state'
    )
      return idle();
    if (command === 'set_documents_dirty') return;
    throw Error(`Unexpected native command: ${command}`);
  });
  document.body.innerHTML = '<div id="root"></div>';
  history.replaceState(null, '', '/');
  vi.stubEnv('PROD', true);
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
  }));
});
async function disposeEntry() {
  // Unmount does not cancel React.lazy's promise. Retire its window owner
  // before a pending chunk can negotiate against another test's transport.
  entryOwner?.fail();
  entryOwner = undefined;
  await act(async () => {
    for (const root of platform.roots.splice(0)) root.unmount();
  });
}
afterEach(async () => {
  await disposeEntry();
  await vi.dynamicImportSettled();
  for (const error of platform.recoverable.splice(0)) {
    expect(error).toMatchObject({
      cause: {
        message: expect.stringMatching(
          /Native workspace could not start safely|synthetic native chunk unavailable/,
        ),
      },
    });
  }
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});
async function boot(settleChunks = true) {
  entryOwner = (await import('../../src/desktop/nativeProductBootstrap'))
    .nativeProductBootstrap;
  await act(async () => {
    await import('../../src/main');
  });
  // React starts lazy loading when act flushes the initial render. Drain after
  // that flush, outside the negotiation assertion's waitFor budget.
  if (settleChunks) {
    await act(async () => {
      await vi.dynamicImportSettled();
    });
  }
}
function commands() {
  return platform.invoke.mock.calls.map(([command]) => command as string);
}

it('selects native before /engine, suspends before acknowledgement and boots the real shared ProductRoot once', async () => {
  platform.native = true;
  history.replaceState(null, '', '/engine');
  let acknowledge!: (value: unknown) => void;
  const held = new Promise((resolve) => {
    acknowledge = resolve;
  });
  platform.invoke.mockImplementation(async (command: string) => {
    if (command === 'enable_editor_close_guard') return held;
    if (command === 'editor_close_state') return idle();
    if (command === 'set_documents_dirty') return;
    throw Error(`Unexpected native command: ${command}`);
  });
  await boot();
  await waitFor(() =>
    expect(commands()).toEqual(['enable_editor_close_guard']),
  );
  expect(screen.getByText('Opening your workspace…')).toBeInTheDocument();
  expect(
    screen.queryByText(/Browser workspace marker|Engine reference marker/),
  ).toBeNull();
  expect(screen.queryByRole('main', { name: 'Document workspace' })).toBeNull();
  await act(async () => acknowledge(idle()));
  expect(
    await screen.findByRole('main', { name: 'Document workspace' }),
  ).toBeInTheDocument();
  expect(document.documentElement.dataset.runtime).toBe('native');
  expect(
    document.querySelectorAll('[aria-label="Notifications"]'),
  ).toHaveLength(1);
  expect(
    commands().filter((command) => command === 'enable_editor_close_guard'),
  ).toHaveLength(1);
  expect(
    commands().every((command) =>
      [
        'enable_editor_close_guard',
        'editor_close_state',
        'set_documents_dirty',
      ].includes(command),
    ),
  ).toBe(true);
  expect(platform.offline).not.toHaveBeenCalled();
});

it('retires an unmounted entry before a delayed presentation can negotiate in the next test', async () => {
  platform.native = true;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let loading = false;
  vi.doMock('../../src/desktop/NativeProductEntry', async () => {
    loading = true;
    await gate;
    return { NativeProductEntry: () => <main>Delayed presentation</main> };
  });
  try {
    await boot(false);
    await waitFor(() => expect(loading).toBe(true));
    await disposeEntry();
    platform.invoke.mockClear();
  } finally {
    release();
  }
  await vi.dynamicImportSettled();
  expect(platform.invoke).not.toHaveBeenCalled();
});

it('keeps failed native negotiation terminal without browser Reload or a legacy fallback', async () => {
  platform.native = true;
  vi.spyOn(console, 'error').mockImplementation(() => {});
  platform.invoke.mockResolvedValue({ ...idle(), extra: 'malformed' });
  await boot();
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'The native workspace cannot continue safely',
  );
  expect(screen.queryByRole('button', { name: /reload/i })).toBeNull();
  expect(
    screen.queryByText(/Browser workspace marker|Engine reference marker/),
  ).toBeNull();
  expect(screen.queryByText(/last saved|site data/)).toBeNull();
  expect(commands()).toEqual(['enable_editor_close_guard']);
  expect(platform.offline).not.toHaveBeenCalled();
});

it('catches a native startup chunk failure before any authority without invoking another application', async () => {
  platform.native = true;
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.doMock('../../src/desktop/NativeProductEntry', () => {
    throw Error('synthetic native chunk unavailable');
  });
  await boot();
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'The native workspace cannot continue safely',
  );
  expect(screen.queryByRole('button', { name: /reload/i })).toBeNull();
  expect(
    screen.queryByText(/Browser workspace marker|Engine reference marker/),
  ).toBeNull();
  expect(platform.invoke).not.toHaveBeenCalled();
  expect(platform.offline).not.toHaveBeenCalled();
});

it('preserves the browser product and browser-only offline startup', async () => {
  await boot();
  expect(
    await screen.findByText('Browser workspace marker'),
  ).toBeInTheDocument();
  expect(document.documentElement.dataset.runtime).toBe('web');
  expect(platform.offline).toHaveBeenCalledOnce();
  expect(platform.invoke).not.toHaveBeenCalled();
});

it('preserves the explicit browser /engine reference without native or offline startup', async () => {
  history.replaceState(null, '', '/engine');
  await boot();
  expect(
    await screen.findByText('Engine reference marker'),
  ).toBeInTheDocument();
  expect(document.documentElement.dataset.runtime).toBe('engine');
  expect(platform.offline).not.toHaveBeenCalled();
  expect(platform.invoke).not.toHaveBeenCalled();
});
