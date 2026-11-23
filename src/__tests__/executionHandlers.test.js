import { describe, it, expect, vi, afterEach } from 'vitest';
import { EXECUTION_HANDLERS as H } from '../engine/ExecutionHandlers';

const sprite = (over = {}) => ({ id: 's1', x: 0, y: 0, rotation: 0, ...over });

afterEach(() => vi.useRealTimers());

describe('motion handlers', () => {
  it('moves along the current heading', async () => {
    const dispatch = vi.fn();
    const right = await H.moveSteps(sprite(), { steps: 10 }, dispatch);
    expect(right.x).toBeCloseTo(10);
    expect(right.y).toBeCloseTo(0);

    const down = await H.moveSteps(sprite({ rotation: 90 }), { steps: 10 }, dispatch);
    expect(down.x).toBeCloseTo(0);
    expect(down.y).toBeCloseTo(10);
    expect(dispatch).toHaveBeenLastCalledWith({
      type: 'UPDATE_SPRITE', payload: { id: 's1', updates: { x: down.x, y: down.y } },
    });
  });

  it('turns relative to the current rotation and jumps with goTo', async () => {
    expect((await H.turnDegrees(sprite({ rotation: 30 }), { degrees: 15 }, vi.fn())).rotation).toBe(45);
    expect(await H.goTo(sprite(), { x: 5, y: -5 }, vi.fn())).toMatchObject({ x: 5, y: -5 });
  });
});

describe('looks handlers', () => {
  it('shows a speech bubble for the given duration, then clears it', async () => {
    vi.useFakeTimers();
    const dispatch = vi.fn();
    const done = H.say(sprite(), { text: 'Hi', duration: 2 }, dispatch);
    expect(dispatch).toHaveBeenLastCalledWith({ type: 'UPDATE_SPRITE', payload: { id: 's1', updates: { speechBubble: 'Hi' } } });
    await vi.advanceTimersByTimeAsync(2000);
    await done;
    expect(dispatch).toHaveBeenLastCalledWith({ type: 'UPDATE_SPRITE', payload: { id: 's1', updates: { speechBubble: null } } });
  });
});

describe('control handlers', () => {
  it('runs its children N times, threading sprite state between blocks', async () => {
    vi.useFakeTimers();
    const executeBlock = vi.fn(async (s) => ({ ...s, x: s.x + 1 }));
    const done = H.repeat(sprite(), { times: 3, children: [{ type: 'MOVE_STEPS' }, { type: 'MOVE_STEPS' }] }, vi.fn(), executeBlock);
    await vi.runAllTimersAsync();
    await done;
    expect(executeBlock).toHaveBeenCalledTimes(6);
    expect(executeBlock.mock.calls.at(-1)[0].x).toBe(5); // each call sees the previous result
  });

  it('does nothing for an empty repeat', async () => {
    const executeBlock = vi.fn();
    await H.repeat(sprite(), { times: 5, children: [] }, vi.fn(), executeBlock);
    expect(executeBlock).not.toHaveBeenCalled();
  });
});
