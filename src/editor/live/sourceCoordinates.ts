/**
 * Source coordinate mapping, adapted from the PN-E1 prototype (2026-11-22).
 * Raw source is authoritative; all offsets refer to UTF-16 code units.
 * Integrated by SourceEditor; source remains authoritative in its state field.
 *
 * No parser, CodeMirror or filesystem capabilities are imported. This module
 * only proposes a safe mapping between an immutable raw snapshot and a
 * line-normalized editor representation, then validates explicit change plans.
 */

export type PhysicalBreak = '\n' | '\r\n' | '\r';

export interface BreakRecord {
  readonly rawFrom: number;
  readonly rawTo: number;
  readonly displayFrom: number;
  readonly displayTo: number;
  readonly physical: PhysicalBreak;
  readonly cumulativeExtra: number;
}

export interface DisplayChange {
  readonly from: number;
  readonly to: number;
  /** The editor's LF-normalized inserted text. */
  readonly insert: string;
}

export interface RawPatch {
  readonly rawFrom: number;
  readonly rawTo: number;
  readonly insertRaw: string;
}

export type PatchFailureCode =
  | 'STALE_DISPLAY'
  | 'INVALID_RANGE'
  | 'SPLIT_SURROGATE'
  | 'CHANGES_OVERLAP'
  | 'RAW_NEWLINE_IN_INSERT'
  | 'LINE_ENDING_POLICY_REQUIRED'
  | 'ROUNDTRIP_FAILED';

export type PatchPlan =
  | {
      readonly ok: true;
      readonly raw: string;
      readonly display: string;
      readonly patches: readonly RawPatch[];
    }
  | {
      readonly ok: false;
      readonly code: PatchFailureCode;
      readonly detail: string;
    };

/** Number of sorted entries for which `at(entry) <= offset`. */
function completedCount<T>(
  values: readonly T[],
  offset: number,
  at: (value: T) => number,
): number {
  let low = 0;
  let high = values.length;
  while (low < high) {
    const mid = low + Math.floor((high - low) / 2);
    if (at(values[mid]!) <= offset) low = mid + 1;
    else high = mid;
  }
  return low;
}

function validBoundary(text: string, offset: number): boolean {
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > text.length)
    return false;
  if (offset === 0 || offset === text.length) return true;
  const before = text.charCodeAt(offset - 1);
  const after = text.charCodeAt(offset);
  return !(
    before >= 0xd800 &&
    before <= 0xdbff &&
    after >= 0xdc00 &&
    after <= 0xdfff
  );
}

export class RawSourceMap {
  readonly raw: string;
  readonly display: string;
  readonly breaks: readonly BreakRecord[];

  constructor(raw: string) {
    this.raw = raw;
    const found: BreakRecord[] = [];
    const parts: string[] = [];
    let rawOffset = 0;
    let displayOffset = 0;
    while (rawOffset < raw.length) {
      const char = raw[rawOffset];
      let physical: PhysicalBreak | undefined;
      if (char === '\r') physical = raw[rawOffset + 1] === '\n' ? '\r\n' : '\r';
      else if (char === '\n') physical = '\n';
      if (physical) {
        const rawTo = rawOffset + physical.length;
        found.push({
          rawFrom: rawOffset,
          rawTo,
          displayFrom: displayOffset,
          displayTo: displayOffset + 1,
          physical,
          cumulativeExtra: rawTo - (displayOffset + 1),
        });
        parts.push('\n');
        rawOffset = rawTo;
        displayOffset++;
      } else {
        parts.push(char!);
        rawOffset++;
        displayOffset++;
      }
    }
    this.display = parts.join('');
    this.breaks = found;
  }

  /** Raw -> LF-normalized CM position; null inside a CRLF pair or outside document. */
  toDisplay(rawOffset: number): number | null {
    if (
      !Number.isSafeInteger(rawOffset) ||
      rawOffset < 0 ||
      rawOffset > this.raw.length
    )
      return null;
    const before = completedCount(this.breaks, rawOffset, (b) => b.rawTo);
    const next = this.breaks[before];
    if (next && rawOffset > next.rawFrom && rawOffset < next.rawTo) return null;
    const extra = before ? this.breaks[before - 1]!.cumulativeExtra : 0;
    return rawOffset - extra;
  }

  /** LF-normalized CM -> exact raw source offset; null outside document. */
  toRaw(displayOffset: number): number | null {
    if (
      !Number.isSafeInteger(displayOffset) ||
      displayOffset < 0 ||
      displayOffset > this.display.length
    )
      return null;
    const before = completedCount(
      this.breaks,
      displayOffset,
      (b) => b.displayTo,
    );
    const extra = before ? this.breaks[before - 1]!.cumulativeExtra : 0;
    return displayOffset + extra;
  }

  /** Validate exact mapping, including UTF-16 scalar boundaries for editor edits. */
  hasSafeEditBoundary(offset: number): boolean {
    return validBoundary(this.display, offset) && this.toRaw(offset) !== null;
  }
}

function fail(code: PatchFailureCode, detail: string): PatchPlan {
  return { ok: false, code, detail };
}

/**
 * Convert a CodeMirror-style multi-change transaction to a raw-source plan.
 * Requires the caller's exact displayed snapshot (fail closed if stale).
 * New physical line endings require an explicit caller policy:
 * a change containing newlines must pass an explicit insertion policy.
 */
export function planRawChanges(
  raw: string,
  expectedDisplay: string,
  changes: readonly DisplayChange[],
  options: { readonly insertedLineBreak?: PhysicalBreak } = {},
): PatchPlan {
  const map = new RawSourceMap(raw);
  if (map.display !== expectedDisplay)
    return fail('STALE_DISPLAY', 'Editor and canonical raw snapshot disagree');
  const sorted = [...changes].sort((a, b) => a.from - b.from || a.to - b.to);
  const patches: RawPatch[] = [];
  let previousEnd = -1;
  let previousStart = -1;
  for (const item of sorted) {
    const { from, to, insert } = item;
    if (
      !Number.isSafeInteger(from) ||
      !Number.isSafeInteger(to) ||
      from < 0 ||
      to < from ||
      to > map.display.length
    )
      return fail('INVALID_RANGE', 'Invalid change boundaries');
    if (!map.hasSafeEditBoundary(from) || !map.hasSafeEditBoundary(to))
      return fail(
        'SPLIT_SURROGATE',
        'Change intersects a UTF-16 surrogate pair',
      );
    if (from < previousEnd || (from === previousStart && previousEnd === from))
      return fail(
        'CHANGES_OVERLAP',
        'Ambiguous overlapping or same-position changes',
      );
    previousEnd = to;
    previousStart = from;
    if (insert.includes('\r'))
      return fail(
        'RAW_NEWLINE_IN_INSERT',
        'Editor insertion must be LF-normalized',
      );
    // Replacing a span with exactly itself is a source-identity operation,
    // even if it contains original mixed physical line endings.
    if (insert === map.display.slice(from, to)) continue;
    if (insert.includes('\n') && !options.insertedLineBreak)
      return fail(
        'LINE_ENDING_POLICY_REQUIRED',
        'Newlines need a C0-approved physical-break policy',
      );
    const rawFrom = map.toRaw(from)!;
    const rawTo = map.toRaw(to)!;
    const insertRaw = options.insertedLineBreak
      ? insert.replace(/\n/g, options.insertedLineBreak)
      : insert;
    patches.push({ rawFrom, rawTo, insertRaw });
  }
  let cursor = 0;
  let nextRaw = '';
  for (const p of patches) {
    nextRaw += raw.slice(cursor, p.rawFrom) + p.insertRaw;
    cursor = p.rawTo;
  }
  nextRaw += raw.slice(cursor);
  // Rebuild the expected display from the same old normalized positions.
  let displayCursor = 0;
  let expected = '';
  for (const c of sorted) {
    expected += map.display.slice(displayCursor, c.from) + c.insert;
    displayCursor = c.to;
  }
  expected += map.display.slice(displayCursor);
  const actual = new RawSourceMap(nextRaw).display;
  if (actual !== expected)
    return fail(
      'ROUNDTRIP_FAILED',
      'Raw patch would not reproduce the editor transaction',
    );
  return { ok: true, raw: nextRaw, display: actual, patches };
}

/** A candidate marker may be visually hidden; data stays in the CodeMirror doc. */
export interface MarkerCandidate {
  readonly from: number;
  readonly to: number;
  readonly blockFrom: number;
  readonly blockTo: number;
  readonly exactMarker: string;
  readonly grammar: 'validated-markdown' | 'opaque';
}
export interface ReservedRange {
  readonly from: number;
  readonly to: number;
  readonly owner: 'opaque' | 'math' | 'wikilink';
}
export interface CursorSelection {
  readonly anchor: number;
  readonly head: number;
}
export interface PresentationContext {
  readonly composing: boolean;
  readonly selections: readonly CursorSelection[];
  readonly reserved: readonly ReservedRange[];
}
export interface MarkerDecision {
  readonly marker: MarkerCandidate;
  readonly mode: 'hide' | 'source';
  readonly reason:
    | 'safe'
    | 'active-block'
    | 'composition'
    | 'protected'
    | 'stale-or-invalid'
    | 'conflict';
}

const overlaps = (
  a: { from: number; to: number },
  b: { from: number; to: number },
): boolean => a.from < b.to && b.from < a.to;

/**
 * Pure fail-closed presentation policy. Not a Markdown/MDX parser and does not
 * call CodeMirror, React or the preview iframe. Parser validation is required.
 */
export function selectMarkerVisibility(
  display: string,
  markers: readonly MarkerCandidate[],
  context: PresentationContext,
): readonly MarkerDecision[] {
  const ranges = markers.map((m) => ({ from: m.from, to: m.to }));
  return markers.map((marker, i): MarkerDecision => {
    const original = display.slice(marker.from, marker.to);
    if (
      marker.grammar !== 'validated-markdown' ||
      !validBoundary(display, marker.from) ||
      !validBoundary(display, marker.to) ||
      !validBoundary(display, marker.blockFrom) ||
      !validBoundary(display, marker.blockTo) ||
      marker.from >= marker.to ||
      marker.blockFrom > marker.from ||
      marker.blockTo < marker.to ||
      original !== marker.exactMarker ||
      marker.exactMarker.includes('\n')
    )
      return { marker, mode: 'source', reason: 'stale-or-invalid' };
    if (context.composing)
      return { marker, mode: 'source', reason: 'composition' };
    if (context.reserved.some((r) => overlaps(marker, r)))
      return { marker, mode: 'source', reason: 'protected' };
    if (ranges.some((range, j) => j !== i && overlaps(marker, range)))
      return { marker, mode: 'source', reason: 'conflict' };
    const active = context.selections.some(({ anchor, head }) => {
      const from = Math.min(anchor, head);
      const to = Math.max(anchor, head);
      if (from === to)
        return from >= marker.blockFrom && from <= marker.blockTo;
      return from <= marker.blockTo && to >= marker.blockFrom;
    });
    if (active) return { marker, mode: 'source', reason: 'active-block' };
    return { marker, mode: 'hide', reason: 'safe' };
  });
}
