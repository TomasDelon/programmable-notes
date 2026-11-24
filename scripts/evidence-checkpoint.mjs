import { randomUUID } from 'node:crypto';
import { rename, writeFile } from 'node:fs/promises';

// Process-interruption protection for diagnostic artifacts, not a durable
// document store. An interrupted temporary file is not a completed checkpoint.
export async function checkpointEvidence(file, value) {
  const contents = JSON.stringify(value, null, 2) + '\n';
  const temporary = `${file}.${randomUUID()}.tmp`;
  await writeFile(temporary, contents, { flag: 'wx', mode: 0o600 });
  await rename(temporary, file);
}
