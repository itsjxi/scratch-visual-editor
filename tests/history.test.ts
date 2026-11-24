import { describe, it, expect } from 'vitest';
import { commit, createHistory, redo, undo, HISTORY_LIMIT } from '../src/editor/history';

describe('history', () => {
  it('undoes and redoes with labels', () => {
    let h = createHistory(0);
    h = commit(h, 1, 'add move', { now: 0 });
    h = commit(h, 2, 'add turn', { now: 5000 });
    const u = undo(h)!;
    expect(u.history.present).toBe(1);
    expect(u.label).toBe('add turn');
    const r = redo(u.history)!;
    expect(r.history.present).toBe(2);
    expect(r.label).toBe('add turn');
  });

  it('a new edit clears the redo stack', () => {
    let h = commit(commit(createHistory(0), 1, 'a', { now: 0 }), 2, 'b', { now: 5000 });
    h = undo(h)!.history;
    h = commit(h, 3, 'c', { now: 9000 });
    expect(redo(h)).toBeNull();
  });

  it('coalesces rapid edits to the same input into one step', () => {
    let h = createHistory('');
    h = commit(h, '1', 'edit', { coalesceKey: 'b1.steps', now: 0 });
    h = commit(h, '12', 'edit', { coalesceKey: 'b1.steps', now: 300 });
    h = commit(h, '123', 'edit', { coalesceKey: 'b1.steps', now: 600 });
    expect(h.past).toHaveLength(1);
    expect(undo(h)!.history.present).toBe('');
    h = commit(h, '1234', 'edit', { coalesceKey: 'b1.steps', now: 5000 }); // a pause starts a new step
    expect(h.past).toHaveLength(2);
  });

  it('ignores no-op commits and caps the stack', () => {
    let h = createHistory(0);
    expect(commit(h, 0, 'noop')).toBe(h);
    for (let i = 1; i <= HISTORY_LIMIT + 20; i++) h = commit(h, i, 'step', { now: i * 5000 });
    expect(h.past).toHaveLength(HISTORY_LIMIT);
  });
});
