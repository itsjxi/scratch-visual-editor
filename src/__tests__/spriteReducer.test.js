import { describe, it, expect } from 'vitest';
import { spriteReducer, initialState } from '../store/SpriteStore';

const withTwo = () => ({
  ...initialState,
  sprites: [
    { ...initialState.sprites[0], animations: [{ type: 'MOVE_STEPS', steps: 10 }] },
    { id: 'sprite2', name: 'Dog', x: 50, y: 50, rotation: 0, animations: [{ type: 'TURN_DEGREES', degrees: 15 }] },
  ],
});

describe('spriteReducer', () => {
  it('updates only the targeted sprite', () => {
    const state = withTwo();
    const next = spriteReducer(state, { type: 'UPDATE_SPRITE', payload: { id: 'sprite2', updates: { x: 99 } } });
    expect(next.sprites[1].x).toBe(99);
    expect(next.sprites[0]).toBe(state.sprites[0]); // untouched sprites keep their identity
  });

  it('swaps animation scripts between two colliding sprites', () => {
    const next = spriteReducer(withTwo(), { type: 'SWAP_ANIMATIONS', payload: { sprite1Id: 'sprite1', sprite2Id: 'sprite2' } });
    expect(next.sprites[0].animations[0].type).toBe('TURN_DEGREES');
    expect(next.sprites[1].animations[0].type).toBe('MOVE_STEPS');
  });

  it('ignores a swap with an unknown sprite', () => {
    const state = withTwo();
    expect(spriteReducer(state, { type: 'SWAP_ANIMATIONS', payload: { sprite1Id: 'sprite1', sprite2Id: 'nope' } })).toBe(state);
  });

  it('selects another sprite when the selected one is deleted', () => {
    const next = spriteReducer(withTwo(), { type: 'DELETE_SPRITE', payload: 'sprite1' });
    expect(next.sprites).toHaveLength(1);
    expect(next.selectedSpriteId).toBe('sprite2');
  });

  it('adds animations to the selected sprite only', () => {
    const next = spriteReducer(withTwo(), { type: 'ADD_ANIMATION', payload: { type: 'WAIT', seconds: 1 } });
    expect(next.sprites[0].animations).toHaveLength(2);
    expect(next.sprites[1].animations).toHaveLength(1);
  });
});
