export function storageMode(value: unknown): 'browser' | 'cloud' {
  if (value === undefined || value === 'browser') return 'browser';
  if (value === 'cloud') return 'cloud';
  throw new Error('Invalid storage backend. Use browser or cloud explicitly.');
}
