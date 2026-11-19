// One trusted operation queue across mounts, source changes and explicit retries.
// Rejections never bypass the next operation's own error handling.
let queue: Promise<unknown> = Promise.resolve();
export function enqueueNativeOperation<T>(
  operation: () => Promise<T>,
): Promise<T> {
  const result = queue.catch(() => undefined).then(operation);
  queue = result;
  return result;
}
