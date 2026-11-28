import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const kinds = new Set([
  'unit',
  'browser',
  'native-compile',
  'native-runtime',
  'security-runtime',
  'tooling',
]);
const object = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value) => typeof value === 'string' && value.trim().length > 0;
const count = (value) => Number.isSafeInteger(value) && value >= 0;

// Checks consistency of supplied records, not execution, log contents, or identity provenance.
export function validateEvidence(record) {
  const diagnostics = [];
  const add = (code, path) => diagnostics.push({ code, path });
  if (!object(record)) return [{ code: 'INVALID_OBJECT', path: '$' }];
  if (record.version !== 1) add('INVALID_VERSION', '$.version');
  if (!text(record.subject)) add('INVALID_STRING', '$.subject');
  for (const name of ['required', 'evidence']) {
    if (
      !Array.isArray(record[name]) ||
      (name === 'required' && !record[name].length)
    ) {
      add('INVALID_ARRAY', `$.${name}`);
    }
  }
  if (!Array.isArray(record.required) || !Array.isArray(record.evidence))
    return diagnostics;
  const required = new Map();
  const seen = new Set();
  for (const [name, entries] of [
    ['required', record.required],
    ['evidence', record.evidence],
  ]) {
    const gates = new Set();
    for (const [index, entry] of entries.entries()) {
      const path = `$.${name}[${index}]`;
      if (!object(entry)) {
        add('INVALID_OBJECT', path);
        continue;
      }
      if (!text(entry.gate)) add('INVALID_STRING', `${path}.gate`);
      if (!kinds.has(entry.kind)) add('INVALID_KIND', `${path}.kind`);
      if (gates.has(entry.gate)) add('DUPLICATE_GATE', `${path}.gate`);
      gates.add(entry.gate);
      if (name === 'required') {
        if (entry.allowedSkips !== undefined && !count(entry.allowedSkips)) {
          add('INVALID_COUNT', `${path}.allowedSkips`);
        }
        required.set(entry.gate, entry);
        continue;
      }
      seen.add(entry.gate);
      const requirement = required.get(entry.gate);
      if (!requirement) add('UNEXPECTED_GATE', `${path}.gate`);
      else if (entry.kind !== requirement.kind)
        add('KIND_MISMATCH', `${path}.kind`);
      for (const field of ['subject', 'command', 'log']) {
        if (!text(entry[field])) add('INVALID_STRING', `${path}.${field}`);
      }
      if (entry.subject !== record.subject)
        add('SUBJECT_MISMATCH', `${path}.subject`);
      if (entry.status !== 'passed') add('NOT_PASSED', `${path}.status`);
      for (const field of ['exitCode', 'failed', 'flaky']) {
        if (entry[field] !== 0) add('NOT_ZERO', `${path}.${field}`);
      }
      if (!count(entry.skipped)) add('INVALID_COUNT', `${path}.skipped`);
      else if (entry.skipped > (requirement?.allowedSkips ?? 0))
        add('SKIP_LIMIT', `${path}.skipped`);
    }
  }
  for (const [index, entry] of record.required.entries()) {
    if (object(entry) && !seen.has(entry.gate))
      add('MISSING_EVIDENCE', `$.required[${index}]`);
  }
  return diagnostics;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  let diagnostics;
  if (process.argv.length !== 3) diagnostics = [{ code: 'USAGE', path: '$' }];
  else {
    try {
      diagnostics = validateEvidence(
        JSON.parse(readFileSync(process.argv[2], 'utf8')),
      );
    } catch {
      diagnostics = [{ code: 'INPUT_UNREADABLE_OR_INVALID_JSON', path: '$' }];
    }
  }
  for (const diagnostic of diagnostics)
    console.error(`${diagnostic.code} ${diagnostic.path}`);
  process.exitCode = diagnostics.length ? 1 : 0;
}
