import { act, renderHook } from '@testing-library/react';
import { StrictMode } from 'react';
import { expect, it, vi } from 'vitest';
import { DocumentSessions } from '../../src/application/documentSessions';
import type { SourceSession } from '../../src/editor/sourceWitness';
import { useDocumentSession } from '../../src/workspace/useDocumentSession';

function host() {
  const controller = new DocumentSessions(
    async () => ({ diskRevision: 'saved', durable: true }),
    async () => {},
  );
  const attach = (id: string, source = '\uFEFFOriginal.\r\n') =>
    controller.attach({
      witness: { sessionId: id, editorRevision: 0, source },
      logicalPath: 'same.mdx',
      diskRevision: 'disk-0',
    });
  const a = attach('a');
  const b = attach('b', 'B.');
  return { controller, attach, a, b };
}
const publish = (session: SourceSession, source: string) =>
  session.publish({ expected: session.witness, source });
const tick = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
};

it('caches allocating controller snapshots across unrelated rerenders and observes null without reading a session', () => {
  const h = host();
  const observed = {
    state: vi.fn(h.controller.state.bind(h.controller)),
    subscribe: vi.fn(h.controller.subscribe.bind(h.controller)),
  };
  const { result, rerender } = renderHook(
    ({ id }) => useDocumentSession(observed, id),
    { initialProps: { id: null as string | null } },
  );
  expect(result.current).toBeNull();
  expect(observed.state).not.toHaveBeenCalled();
  expect(observed.subscribe).not.toHaveBeenCalled();
  rerender({ id: 'a' });
  const snapshot = result.current;
  rerender({ id: 'a' });
  expect(result.current).toBe(snapshot);
  expect(result.current?.witness.source).toBe('\uFEFFOriginal.\r\n');
});

it('rereads a canonical update between render and subscription even without a notification', () => {
  const h = host();
  const observed = {
    state: h.controller.state.bind(h.controller),
    subscribe: () => {
      publish(h.a, 'Changed before subscribe.\r\n');
      return () => {};
    },
  };
  const { result } = renderHook(() => useDocumentSession(observed, 'a'));
  expect(result.current?.witness).toEqual(h.a.witness);
  expect(result.current?.witness.editorRevision).toBe(1);
});

it('retires A callbacks after selecting B and callbacks from a replaced controller', () => {
  const first = host();
  const second = host();
  type Listener = Parameters<DocumentSessions['subscribe']>[1];
  const captured: Listener[] = [];
  const unsubscribed = vi.fn();
  const observed = {
    state: first.controller.state.bind(first.controller),
    subscribe: (_id: string, listener: Listener) => {
      captured.push(listener);
      return unsubscribed;
    },
  };
  const { result, rerender } = renderHook(
    ({ controller, id }) => useDocumentSession(controller, id),
    { initialProps: { controller: observed, id: 'a' } },
  );
  rerender({ controller: observed, id: 'b' });
  const b = result.current;
  act(() => captured[0]!(first.controller.state('a')));
  expect(result.current).toBe(b);
  const replacement = {
    state: second.controller.state.bind(second.controller),
    subscribe: (_id: string, listener: Listener) => {
      captured.push(listener);
      return unsubscribed;
    },
  };
  rerender({ controller: replacement, id: 'b' });
  const current = result.current;
  publish(first.b, 'Old controller.');
  act(() => captured[1]!(first.controller.state('b')));
  expect(result.current).toBe(current);
  expect(result.current?.witness.source).toBe('B.');
  expect(unsubscribed).toHaveBeenCalledTimes(2);
});

it('leaves one current subscription under StrictMode and none after unmount', async () => {
  const h = host();
  let active = 0;
  const observed = {
    state: h.controller.state.bind(h.controller),
    subscribe: (
      id: string,
      listener: Parameters<DocumentSessions['subscribe']>[1],
    ) => {
      active++;
      const stop = h.controller.subscribe(id, listener);
      return () => {
        active--;
        stop();
      };
    },
  };
  const { result, unmount } = renderHook(
    () => useDocumentSession(observed, 'a'),
    {
      wrapper: StrictMode,
    },
  );
  await act(tick);
  expect(active).toBe(1);
  expect(result.current?.witness.sessionId).toBe('a');
  unmount();
  expect(active).toBe(0);
  publish(h.a, 'After unmount.');
  await tick();
  await h.controller.flush();
});

it('projects rapid canonical receipts including A-B-A bytes without publishing from React', async () => {
  const h = host();
  const publishSpy = vi.spyOn(h.a, 'publish');
  const { result } = renderHook(() => useDocumentSession(h.controller, 'a'));
  const original = h.a.witness.source;
  act(() => {
    publish(h.a, 'B.\r\n');
    publish(h.a, original);
    expect(h.a.witness.editorRevision).toBe(2);
  });
  await act(tick);
  expect(result.current?.witness).toEqual(h.a.witness);
  expect(result.current?.witness.source).toBe(original);
  expect(publishSpy).toHaveBeenCalledTimes(2);
  await act(() => h.controller.flush());
});

it('drops a closed identity when the host selects null, and observes a fresh session for the same path', async () => {
  const h = host();
  const { result, rerender } = renderHook(
    ({ id }) => useDocumentSession(h.controller, id),
    { initialProps: { id: 'a' as string | null } },
  );
  rerender({ id: null });
  await act(() => h.controller.close('a'));
  h.attach('reopened', 'Reopened.\r\n');
  rerender({ id: 'reopened' });
  expect(result.current?.witness).toEqual({
    sessionId: 'reopened',
    editorRevision: 0,
    source: 'Reopened.\r\n',
  });
});

it('surfaces unknown initial controller errors rather than treating them as an empty session', () => {
  const h = host();
  expect(() =>
    renderHook(() => useDocumentSession(h.controller, 'missing')),
  ).toThrow('Document session is not attached.');
});

it('surfaces a controller read failure during the subscription reread instead of returning stale source', () => {
  const h = host();
  const failure = Error('Observation failed.');
  let failed = false;
  const observed = {
    state: (id: string) => {
      if (failed) throw failure;
      return h.controller.state(id);
    },
    subscribe: () => {
      failed = true;
      return () => {};
    },
  };
  expect(() => renderHook(() => useDocumentSession(observed, 'a'))).toThrow(
    failure,
  );
});
