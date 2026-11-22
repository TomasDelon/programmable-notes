/** Non-gating, exact-byte mapping/edit benchmark. Node 24; no document execution. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import {
  editableMarkdown,
  markdownBlocks,
  patchMarkdown,
} from '../src/editor/markdownEdits.ts';

const samples = [];
for (let run = 0; run < 6; run++) {
  // Each run changes source, so measurements include its initial parse.
  const source = Array.from(
    { length: 5000 },
    (_, i) => `Paragraph ${i}: café stays exact. ${run}\r\n`,
  ).join('\r\n');
  const start = performance.now();
  const ranges = editableMarkdown(source);
  assert.equal(ranges.length, 5000);
  assert.equal(markdownBlocks(source).length, 5000);
  const range = ranges[2500];
  assert.equal(patchMarkdown(source, range, range.text), source);
  const text = 'Edited paragraph: café.';
  const next = patchMarkdown(source, range, text);
  assert.equal(
    next,
    source.slice(0, range.from) + text + source.slice(range.to),
  );
  assert.equal(editableMarkdown(next).length, 5000);
  assert.equal(markdownBlocks(next).length, 5000);
  samples.push({
    run,
    sourceBytes: Buffer.byteLength(source),
    sourceSha256: createHash('sha256').update(source).digest('hex'),
    milliseconds: Number((performance.now() - start).toFixed(2)),
  });
}
const warm = samples
  .slice(1)
  .map((s) => s.milliseconds)
  .sort((a, b) => a - b);
console.log(
  JSON.stringify(
    { node: process.version, warmMedianMs: warm[2], samples },
    null,
    2,
  ),
);
