/**
 * Undo/redo by snapshots. Because every edit returns a new immutable Project that shares
 * unchanged branches, a snapshot is just a pointer: 100 undo steps cost little memory and
 * no inverse operations have to be written (or kept correct) for each command.
 *
 * Typing in an input would create one step per keystroke, so edits that share a
 * `coalesceKey` within COALESCE_MS replace the previous step instead of adding one.
 */
export interface History<T> {
  past: { value: T; label: string }[];
  present: T;
  presentLabel: string;
  future: { value: T; label: string }[];
  lastKey: string | null;
  lastAt: number;
}

export const HISTORY_LIMIT = 100;
export const COALESCE_MS = 1000;

export function createHistory<T>(value: T): History<T> {
  return { past: [], present: value, presentLabel: '', future: [], lastKey: null, lastAt: 0 };
}

export function commit<T>(h: History<T>, value: T, label: string, { coalesceKey = null as string | null, now = Date.now() } = {}): History<T> {
  if (value === h.present) return h;
  const coalesce = coalesceKey !== null && coalesceKey === h.lastKey && now - h.lastAt < COALESCE_MS;
  if (coalesce) return { ...h, present: value, future: [], lastAt: now };
  const past = [...h.past, { value: h.present, label }].slice(-HISTORY_LIMIT);
  return { past, present: value, presentLabel: label, future: [], lastKey: coalesceKey, lastAt: now };
}

/** Returns the new history and the label of the step that was undone (for announcements). */
export function undo<T>(h: History<T>): { history: History<T>; label: string } | null {
  const previous = h.past[h.past.length - 1];
  if (!previous) return null;
  return {
    history: { past: h.past.slice(0, -1), present: previous.value, presentLabel: '', future: [{ value: h.present, label: previous.label }, ...h.future], lastKey: null, lastAt: 0 },
    label: previous.label,
  };
}

export function redo<T>(h: History<T>): { history: History<T>; label: string } | null {
  const next = h.future[0];
  if (!next) return null;
  return {
    history: { past: [...h.past, { value: h.present, label: next.label }], present: next.value, presentLabel: next.label, future: h.future.slice(1), lastKey: null, lastAt: 0 },
    label: next.label,
  };
}
