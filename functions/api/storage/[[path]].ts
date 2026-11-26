import { handleStorage } from '../../../backend/server';
import type { StorageEnvironment } from '../../../backend/types';

/** Pages supplies bindings and the Access assertion; no client-side credentials. */
export function onRequest(context: {
  request: Request;
  env: StorageEnvironment;
}) {
  return handleStorage(context.request, context.env);
}
