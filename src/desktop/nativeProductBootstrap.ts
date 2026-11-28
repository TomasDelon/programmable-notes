import { createNativeProduct } from '../application/nativeProduct';
import { nativeDocuments } from '../documents/native';
import type {
  ProductApplication,
  ProductCloseGuard,
} from '../product/productApplication';
import type { NativeClosePorts } from './nativeClose';
import { createGuardedNativeProductHost } from './nativeProductServices';
import { createNativeRootBoundary } from './NativeRootBoundary';

type NativeProductPorts = NonNullable<
  Parameters<typeof createGuardedNativeProductHost>[0]
>;
export interface NativeProductSession {
  readonly application: ProductApplication;
  readonly Boundary: ReturnType<typeof createNativeRootBoundary>;
}
const STARTUP_ERROR = 'Native workspace could not start safely.';
const FATAL_ERROR =
  'Native workspace failed. Native close outcome is uncertain.';

/** A window-lifetime owner. Construction captures bindings but performs no IPC. */
export function createNativeProductBootstrap(
  ports: NativeProductPorts = nativeDocuments,
  closePorts?: NativeClosePorts,
) {
  const captured = { ...ports };
  const capturedClose = closePorts ? { ...closePorts } : undefined;
  let failed = false;
  const fail = () => {
    failed = true;
  };
  const Boundary = createNativeRootBoundary(fail, () => failed);
  let host:
    Awaited<ReturnType<typeof createGuardedNativeProductHost>> | undefined;
  let startup: Promise<NativeProductSession> | undefined;
  function start(): Promise<NativeProductSession> {
    if (!startup) {
      startup = (async () => {
        try {
          // Load the whole presentation before negotiation, so a failed chunk
          // cannot strand a successfully negotiated guard.
          await import('./NativeProductEntry');
          if (failed) throw Error(STARTUP_ERROR);
          host = await createGuardedNativeProductHost(captured, capturedClose);
          if (failed) throw Error(STARTUP_ERROR);
          const guard = host.services.closeGuard;
          if (!guard) throw Error(STARTUP_ERROR);
          const { observe, resolve } = guard;
          const closeGuard: ProductCloseGuard = Object.freeze({
            observe,
            async resolve(request: string, action: 'cancel' | 'commit') {
              if (failed) throw Error(FATAL_ERROR);
              const receipt = await resolve(request, action);
              // Fatal failure cannot revoke a permit already dispatched. Never
              // turn its eventual acknowledgement into permission to resume.
              if (failed) throw Error(FATAL_ERROR);
              return receipt;
            },
          });
          const application = createNativeProduct(host.workspace, {
            ...host.services,
            closeGuard,
          });
          return Object.freeze({ application, Boundary });
        } catch {
          fail();
          throw Error(STARTUP_ERROR);
        }
      })();
    }
    // Both fulfillment and rejection stay sticky. The session's model retains
    // its workspace/services, including after fatal rendering failure.
    return startup;
  }
  return Object.freeze({ start, fail, Boundary });
}

// Inactive until the real native entry explicitly calls start; no startup effect.
export const nativeProductBootstrap = createNativeProductBootstrap();
