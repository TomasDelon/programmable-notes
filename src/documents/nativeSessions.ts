import { DocumentSessions } from '../application/documentSessions';
import type { SourceSession } from '../editor/sourceWitness';
import type { nativeDocuments } from './native';
import type { NativeDocument } from './workspace';
import {
  decodeNativeObservation,
  validNativeRevision,
  validNativeWatch,
  type NativeObservationPorts,
  type NativeSessionObservation,
} from './nativeObservation';

export interface NativeSessions {
  readonly controller: Omit<DocumentSessions, 'attach'>;
  readonly observation: NativeSessionObservation | null;
  attach(sessionId: string, document: NativeDocument): SourceSession;
}

/** Trusted host binding only; neither these ports nor native grants enter document code. */
export function createNativeSessions(
  ports: Pick<typeof nativeDocuments, 'save' | 'close'> &
    Partial<NativeObservationPorts>,
): NativeSessions {
  const save = ports.save;
  const close = ports.close;
  const { observe, watch, pollWatch, unwatch } = ports;
  const capabilities = [observe, watch, pollWatch, unwatch];
  const complete = capabilities.every((port) => typeof port === 'function');
  if (!complete && capabilities.some((port) => port !== undefined))
    throw Error('Native observation ports must be complete.');
  const bindings = new Map<string, string>();
  const usedSessions = new Set<string>();
  const usedGrants = new Set<string>();
  function grantFor(sessionId: string): string {
    const grant = bindings.get(sessionId);
    if (!grant) throw Error('Native document binding is unavailable.');
    return grant;
  }
  const controller = new DocumentSessions(
    async (input) => {
      const result = await save(
        grantFor(input.documentId),
        input.expectedDiskRevision,
        input.source,
      );
      return { diskRevision: result.revision, durable: result.durable };
    },
    async (sessionId) => {
      await close(grantFor(sessionId));
      // Failure/uncertainty belongs to DocumentSessions. Never infer close success.
      bindings.delete(sessionId);
    },
  );
  function currentBinding(sessionId: string, grant: string) {
    if (
      bindings.get(sessionId) !== grant ||
      controller.state(sessionId).phase !== 'open'
    )
      throw Error(
        'Native observation belongs to a retired or closing session.',
      );
  }
  function observationGrant(sessionId: string): string {
    const grant = grantFor(sessionId);
    currentBinding(sessionId, grant);
    return grant;
  }
  function requireRevision(value: string) {
    if (!validNativeRevision(value))
      throw Error('Invalid observation revision.');
  }
  function requireWatch(value: unknown): asserts value is string {
    if (!validNativeWatch(value))
      throw Error('Invalid observation watch identity.');
  }
  const observation: NativeSessionObservation | null = complete
    ? Object.freeze({
        async read(sessionId: string, revision: string) {
          requireRevision(revision);
          const grant = observationGrant(sessionId);
          const value = await observe!(grant, revision);
          currentBinding(sessionId, grant);
          return decodeNativeObservation(value, revision);
        },
        async watch(sessionId: string, revision: string) {
          requireRevision(revision);
          const grant = observationGrant(sessionId);
          const token = await watch!(grant, revision);
          currentBinding(sessionId, grant);
          requireWatch(token);
          return token;
        },
        async poll(sessionId: string, token: string) {
          requireWatch(token);
          const grant = observationGrant(sessionId);
          const changed = await pollWatch!(grant, token);
          currentBinding(sessionId, grant);
          if (typeof changed !== 'boolean')
            throw Error('Invalid native observation hint.');
          return changed;
        },
        async unwatch(sessionId: string, token: string) {
          requireWatch(token);
          const result = await unwatch!(grantFor(sessionId), token);
          if (result !== undefined && result !== null)
            throw Error('Invalid native observation cleanup acknowledgement.');
        },
      })
    : null;
  return {
    controller,
    observation,
    attach(sessionId, document) {
      // Capture the authorized baseline once; later caller mutation is not authority.
      const { id, revision, source, logicalPath, durabilityWarning } = document;
      if (
        typeof sessionId !== 'string' ||
        !sessionId ||
        typeof id !== 'string' ||
        !id ||
        typeof revision !== 'string' ||
        !revision ||
        typeof durabilityWarning !== 'boolean' ||
        sessionId === id ||
        usedSessions.has(sessionId) ||
        usedGrants.has(id) ||
        usedGrants.has(sessionId) ||
        usedSessions.has(id)
      )
        throw Error('Invalid or previously bound native document identity.');
      const session = controller.attach({
        witness: { sessionId, editorRevision: 0, source },
        logicalPath,
        diskRevision: revision,
        durable: !durabilityWarning,
      });
      // attach does not invoke writer ports synchronously. Reserve only on success;
      // rejection must not release an existing grant or acquire partial ownership.
      bindings.set(sessionId, id);
      usedSessions.add(sessionId);
      usedGrants.add(id);
      return session;
    },
  };
}
