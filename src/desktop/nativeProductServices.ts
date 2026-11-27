import {
  createNativeWorkspace,
  type NativeWorkspacePorts,
} from '../application/nativeWorkspace';
import { nativeDocuments } from '../documents/native';
import { recoveryDigest } from '../documents/recovery';
import { validSourceWitness } from '../editor/sourceWitness';
import {
  negotiateNativeCloseGuard,
  type NativeClosePorts,
} from './nativeClose';
import type { NativeProductServices } from '../product/productApplication';

type RecoveryPorts = Pick<
  typeof nativeDocuments,
  'dirty' | 'snapshot' | 'restoreSnapshot'
>;
/** Capture privileged bindings once, keeping grants and private identities out of product chrome. */
export function createNativeProductServices(
  ports: RecoveryPorts = nativeDocuments,
  newIdentity: () => string = () => crypto.randomUUID(),
): NativeProductServices {
  const { dirty, snapshot, restoreSnapshot } = ports;
  const runId = newIdentity();
  const heads = new Map<string, string>();
  let recovery = Promise.resolve();
  return {
    setCloseState: ({ dirty: unsaved, busy }) => dirty(unsaved, busy),
    preserveAttempt(input) {
      const { sessionId, logicalPath } = input;
      const batch = {
        expected: { ...input.batch.expected },
        source: input.batch.source,
      };
      if (
        !validSourceWitness(batch.expected) ||
        batch.expected.sessionId !== sessionId ||
        typeof batch.source !== 'string' ||
        !logicalPath ||
        logicalPath.startsWith('/') ||
        logicalPath
          .split('/')
          .some((part) => !part || part === '.' || part === '..')
      )
        return Promise.reject(Error('Recovery attempt identity is invalid.'));
      const task = recovery.then(async () => {
        const documentId = (
          await recoveryDigest(`product:${runId}:${sessionId}:${logicalPath}`)
        ).slice(0, 32);
        const name = logicalPath.split('/').at(-1)!;
        const baseline = await recoveryDigest(batch.expected.source);
        const parent = heads.get(documentId) ?? null;
        const receipt = await snapshot({
          documentId,
          name,
          baseline,
          parent,
          source: batch.source,
        });
        const record = receipt.snapshot;
        const metadata = record?.metadata;
        if (
          receipt.durable !== true ||
          receipt.warning !== null ||
          !record?.id ||
          !record.file ||
          metadata?.schema !== 1 ||
          metadata.documentId !== documentId ||
          metadata.name !== name ||
          metadata.baseline !== baseline ||
          metadata.parent !== parent ||
          metadata.sourceBytes !==
            new TextEncoder().encode(batch.source).byteLength ||
          !Number.isSafeInteger(metadata.generation) ||
          metadata.generation < 1 ||
          !Number.isFinite(metadata.createdAtMs) ||
          metadata.createdAtMs < 0
        )
          throw Error(
            'Native recovery acknowledgement does not match the captured attempt.',
          );
        const restored = await restoreSnapshot(record.file);
        if (restored.name !== name || restored.source !== batch.source)
          throw Error(
            'Native recovery readback differs from the captured attempt.',
          );
        heads.set(documentId, record.id);
        return { durable: true };
      });
      recovery = task.then(
        () => {},
        () => {},
      );
      return task;
    },
  };
}
/** Controlled legacy/test composition only. No close negotiation: not safe for native activation. */
export function createNativeProductHost(
  ports: NativeWorkspacePorts & RecoveryPorts = nativeDocuments,
) {
  const captured = { ...ports };
  return {
    workspace: createNativeWorkspace(captured, () => crypto.randomUUID()),
    services: createNativeProductServices(captured),
  };
}

/** Negotiated bootstrap only: construct the application model after awaiting this factory. */
export async function createGuardedNativeProductHost(
  ports: NativeWorkspacePorts & RecoveryPorts = nativeDocuments,
  closePorts?: NativeClosePorts,
): Promise<ReturnType<typeof createNativeProductHost>> {
  const captured = { ...ports };
  const closeGuard = await negotiateNativeCloseGuard(closePorts);
  const host = createNativeProductHost(captured);
  return {
    workspace: host.workspace,
    services: { ...host.services, closeGuard },
  };
}
