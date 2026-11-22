type HoverZone = 'left' | 'right' | 'top';
type Panels = { leftExpanded?: boolean; rightExpanded?: boolean };
type Timer = ReturnType<typeof setTimeout>;
type Position = {
  x: number;
  y: number;
  width: number;
  time: number;
  speed: number;
};

/**
 * Shared pointer-intent controller for two full-height edge rails and the
 * top Source / Preview island. No DOM dependencies; one timer per candidate.
 *
 * Intent is a *dwell in a hit region*, not a CSS :hover. A fast pass that
 * leaves the region before the dwell expires cannot open anything. A moving
 * pointer along a border must slow down or stop before opening. We do not
 * restart the entire dwell timer on every pointermove: that caused erratic
 * waits for the side rails and the top capsule.
 */
export const HOVER_INTENT = Object.freeze({
  edgePx: 16,
  cornerPx: 48,
  cornerHeightPx: 66,
  railPx: 54,
  railHysteresisPx: 8,
  topHalfWidthPx: 79,
  topTriggerHeightPx: 48,
  topHysteresisPx: 8,
  closeMs: 46,
  movingThreshold: 0.95, // CSS px/ms
  fastSettleMs: 38,
});

export function hoverTargetAt({
  x,
  y,
  width,
  shown = null,
  leftExpanded = false,
  rightExpanded = false,
}: { x: number; y: number; width: number; shown?: HoverZone | null } & Panels) {
  if (![x, y, width].every(Number.isFinite) || width <= 0) return null;
  if (x < 0 || x > width || y < 0) return null;
  const c = HOVER_INTENT;
  // Click-open panels own their side and must never spawn a hover rail.
  if (
    !leftExpanded &&
    (x <= c.edgePx ||
      (x <= c.cornerPx && y <= c.cornerHeightPx) ||
      (shown === 'left' && x <= c.railPx + c.railHysteresisPx))
  )
    return 'left';
  if (
    !rightExpanded &&
    (x >= width - c.edgePx ||
      (x >= width - c.cornerPx && y <= c.cornerHeightPx) ||
      (shown === 'right' && x >= width - c.railPx - c.railHysteresisPx))
  )
    return 'right';
  if (
    Math.abs(x - width / 2) <= c.topHalfWidthPx &&
    y <= c.topTriggerHeightPx + (shown === 'top' ? c.topHysteresisPx : 0)
  )
    return 'top';
  return null;
}

/** Adaptive but bounded pause, quicker after a clear deceleration. */
export function intentDelayMs({
  speed = 0,
  priorSpeed = 0,
  toward = false,
}: { speed?: number; priorSpeed?: number; toward?: boolean } = {}) {
  let delay = speed > 1 ? 96 : speed > 0.45 ? 77 : 63;
  if (toward && priorSpeed > 0.3 && speed < priorSpeed * 0.72) delay -= 10;
  return Math.max(53, delay);
}

export function createHoverIntentController({
  onShow,
  onHide,
  now = () => performance.now(),
  schedule = (fn, ms) => setTimeout(fn, ms),
  cancel = (id) => clearTimeout(id),
}: {
  onShow: (zone: HoverZone) => void;
  onHide: (zone: HoverZone) => void;
  now?: () => number;
  schedule?: (fn: () => void, ms: number) => Timer;
  cancel?: (id: Timer) => void;
}) {
  let shown: HoverZone | null = null;
  let candidate: HoverZone | null = null;
  let openTimer: Timer | null = null;
  let closeTimer: Timer | null = null;
  let latest: (Position & { target: HoverZone | null }) | null = null;
  let previous: Omit<Position, 'width'> | null = null;
  let lastFastAt = Number.NEGATIVE_INFINITY;
  let disposed = false;

  function cancelOpen() {
    if (openTimer !== null) cancel(openTimer);
    openTimer = null;
    candidate = null;
  }
  function cancelClose() {
    if (closeTimer !== null) cancel(closeTimer);
    closeTimer = null;
  }
  function hide(target: HoverZone) {
    if (shown !== target) return;
    shown = null;
    onHide(target);
  }
  function evaluateIntent(target: HoverZone) {
    openTimer = null;
    if (disposed || candidate !== target || latest?.target !== target) return;
    const waitForSettle = HOVER_INTENT.fastSettleMs - (now() - lastFastAt);
    if (waitForSettle > 0) {
      openTimer = schedule(
        () => evaluateIntent(target),
        Math.max(8, waitForSettle),
      );
      return;
    }
    candidate = null;
    cancelClose();
    if (shown && shown !== target) hide(shown);
    if (shown !== target) {
      shown = target;
      onShow(target);
    }
  }
  function beginCandidate(
    target: HoverZone | null,
    motion: { speed: number; priorSpeed: number; toward: boolean },
  ) {
    cancelOpen();
    if (!target) return;
    candidate = target;
    lastFastAt =
      motion.speed > HOVER_INTENT.movingThreshold
        ? now()
        : Number.NEGATIVE_INFINITY;
    openTimer = schedule(() => evaluateIntent(target), intentDelayMs(motion));
  }
  function queueHide(target: HoverZone) {
    if (closeTimer !== null) return;
    closeTimer = schedule(() => {
      closeTimer = null;
      if (!disposed && shown === target && latest?.target !== target)
        hide(target);
    }, HOVER_INTENT.closeMs);
  }
  function move(
    {
      x,
      y,
      width,
      time = now(),
      pointerType = 'mouse',
    }: {
      x: number;
      y: number;
      width: number;
      time?: number;
      pointerType?: string;
    },
    panels: Panels = {},
  ) {
    if (disposed || pointerType !== 'mouse') return;
    const prev = previous;
    const dt = prev ? time - prev.time : 0;
    const dx = prev ? x - prev.x : 0;
    const dy = prev ? y - prev.y : 0;
    const speed = dt >= 2 && dt <= 130 ? Math.hypot(dx, dy) / dt : 0;
    const priorSpeed = prev?.speed || 0;
    const target = hoverTargetAt({ x, y, width, shown, ...panels });
    latest = { x, y, width, time, speed, target };
    previous = { x, y, time, speed };

    if (shown) {
      if (target === shown) cancelClose();
      else queueHide(shown);
    }
    if (target === shown || target === null) {
      cancelOpen();
      return;
    }
    const toward =
      (target === 'left' && dx < 0) ||
      (target === 'right' && dx > 0) ||
      (target === 'top' && dy < 0);
    if (candidate !== target)
      beginCandidate(target, { speed, priorSpeed, toward });
    // Crucially: moving quickly in the region postpones opening WITHOUT
    // resetting the entire dwell timer and causing irregular latency.
    else if (speed > HOVER_INTENT.movingThreshold) lastFastAt = now();
  }
  function markShown(target: HoverZone) {
    if (disposed) return;
    cancelOpen();
    cancelClose();
    if (shown && shown !== target) hide(shown);
    shown = target;
  }
  function clear(target: HoverZone | null = null) {
    cancelOpen();
    cancelClose();
    if (!target || shown === target) {
      if (shown) hide(shown);
    }
    latest = null;
    previous = null;
  }
  function destroy() {
    clear();
    disposed = true;
  }
  return { move, markShown, clear, destroy, getShown: () => shown };
}
