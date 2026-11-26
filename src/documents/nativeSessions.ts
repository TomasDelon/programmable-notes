import { DocumentSessions } from '../application/documentSessions';
import type { SourceSession } from '../editor/sourceWitness';
import type { nativeDocuments } from './native';
import type { NativeDocument } from './workspace';

export interface NativeSessions {
  readonly controller: Omit<DocumentSessions, 'attach'>;
  attach(sessionId: string, document: NativeDocument): SourceSession;
}

/** Trusted host binding only; neither these ports nor native grants enter document code. */
export function createNativeSessions(
  ports: Pick<typeof nativeDocuments, 'save' | 'close'>,
): NativeSessions {
  const save = ports.save;
  const close = ports.close;
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
  return {
    controller,
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
