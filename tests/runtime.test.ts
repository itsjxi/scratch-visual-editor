import { describe, it, expect, vi } from 'vitest';
import { Runtime, normalizeDirection } from '../src/runtime/runtime';
import { createBlock as b } from '../src/model/blocks';
import type { Block, Project } from '../src/model/types';

const project = (...scripts: Block[][]): Project => ({
  version: 1,
  sprites: [{ id: 'cat', name: 'Cat', hue: 0, scripts: scripts.map((blocks, i) => ({ id: `s${i}`, x: 0, y: 0, blocks })) }],
});
const start = { cat: { x: 0, y: 0, direction: 90 } };

/** Drive the runtime with a fake clock: one call = `frames` frames of 1000/60 ms. */
function frames(rt: Runtime, count: number, from = { t: 0 }) {
  for (let i = 0; i < count; i++) { from.t += 1000 / 60; rt.step(from.t); }
  return from;
}

describe('runtime', () => {
  it('consecutive blocks see each other’s results (the old stale-sprite bug)', () => {
    const rt = new Runtime(start);
    rt.greenFlag(project([b('whenFlag'), b('move', { steps: 10 }), b('move', { steps: 10 }), b('turnRight', { degrees: 90 }), b('move', { steps: 5 })]));
    frames(rt, 1);
    const cat = rt.getSnapshot().sprites.cat;
    expect(cat.x).toBeCloseTo(20);
    expect(cat.y).toBeCloseTo(-5); // direction 180 = down
    expect(rt.running).toBe(false);
  });

  it('yields once per loop iteration, so a repeat animates over frames', () => {
    const rt = new Runtime(start);
    rt.greenFlag(project([b('whenFlag'), b('repeat', { times: 3 }, [b('move', { steps: 10 })])]));
    frames(rt, 1);
    expect(rt.getSnapshot().sprites.cat.x).toBeCloseTo(10);
    frames(rt, 2);
    expect(rt.getSnapshot().sprites.cat.x).toBeCloseTo(30);
    frames(rt, 1);
    expect(rt.running).toBe(false);
  });

  it('waits and shows timed speech, without blocking other threads', () => {
    const rt = new Runtime(start);
    rt.greenFlag(project(
      [b('whenFlag'), b('sayFor', { text: 'Hi', secs: 1 }), b('changeX', { dx: 50 })],
      [b('whenFlag'), b('changeY', { dy: 20 })],
    ));
    const clock = frames(rt, 1);
    expect(rt.getSnapshot().sprites.cat).toMatchObject({ y: 20, bubble: { text: 'Hi', kind: 'say' } });
    expect(rt.getSnapshot().sprites.cat.x).toBe(0);
    frames(rt, 61, clock); // just past one second
    expect(rt.getSnapshot().sprites.cat).toMatchObject({ x: 50, bubble: null });
  });

  it('glides smoothly over the given time', () => {
    const rt = new Runtime(start);
    rt.greenFlag(project([b('whenFlag'), b('glide', { secs: 1, x: 100, y: 0 })]));
    const clock = frames(rt, 1);
    frames(rt, 30, clock); // ~0.5 s in
    expect(rt.getSnapshot().sprites.cat.x).toBeGreaterThan(40);
    expect(rt.getSnapshot().sprites.cat.x).toBeLessThan(60);
    frames(rt, 40, clock);
    expect(rt.getSnapshot().sprites.cat.x).toBe(100);
  });

  it('bounces off the edge and keeps sprites on stage', () => {
    const rt = new Runtime({ cat: { x: 200, y: 0, direction: 90 } });
    rt.greenFlag(project([b('whenFlag'), b('move', { steps: 50 }), b('bounce')]));
    frames(rt, 1);
    const cat = rt.getSnapshot().sprites.cat;
    expect(cat.direction).toBe(-90);
    expect(cat.x).toBeLessThanOrEqual(240 - 34);
    rt.setPose('cat', { x: 9999, y: -9999 });
    expect(rt.getSnapshot().sprites.cat).toMatchObject({ x: 240, y: -180 });
  });

  it('stop ends forever loops and clears speech', () => {
    const rt = new Runtime(start);
    rt.greenFlag(project([b('whenFlag'), b('say', { text: 'go' }), b('forever', {}, [b('turnRight', { degrees: 1 })])]));
    frames(rt, 10);
    expect(rt.running).toBe(true);
    rt.stop();
    expect(rt.running).toBe(false);
    expect(rt.getSnapshot().sprites.cat.bubble).toBeNull();
  });

  it('a script that never yields cannot freeze the frame', () => {
    const many = Array.from({ length: 20_000 }, () => b('changeX', { dx: 0 }));
    const rt = new Runtime(start);
    rt.greenFlag(project([b('whenFlag'), ...many]));
    frames(rt, 1);
    expect(rt.running).toBe(true); // split across frames
    frames(rt, 2);
    expect(rt.running).toBe(false);
  });

  it('runs "when this sprite clicked" scripts only on click', () => {
    const rt = new Runtime(start);
    const p = project([b('whenClicked'), b('changeX', { dx: 7 })]);
    rt.greenFlag(p);
    frames(rt, 1);
    expect(rt.getSnapshot().sprites.cat.x).toBe(0);
    rt.clickSprite(p, 'cat');
    frames(rt, 1);
    expect(rt.getSnapshot().sprites.cat.x).toBe(7);
  });

  it('swaps running scripts when two sprites start touching, once per contact', () => {
    const onCollision = vi.fn();
    const rt = new Runtime({ a: { x: -100, y: 0, direction: 90 }, b: { x: 100, y: 0, direction: 90 } }, { onCollision });
    const p: Project = {
      version: 1,
      sprites: [
        { id: 'a', name: 'A', hue: 0, scripts: [{ id: 'sa', x: 0, y: 0, blocks: [b('whenFlag'), b('forever', {}, [b('changeX', { dx: 10 })])] }] },
        { id: 'b', name: 'B', hue: 0, scripts: [{ id: 'sb', x: 0, y: 0, blocks: [b('whenFlag'), b('forever', {}, [b('changeY', { dy: 1 })])] }] },
      ],
    };
    rt.greenFlag(p);
    const clock = frames(rt, 14); // A reaches B
    expect(onCollision).toHaveBeenCalledTimes(1);
    const after = rt.getSnapshot().sprites;
    frames(rt, 5, clock);
    const later = rt.getSnapshot().sprites;
    expect(later.a.x).toBeCloseTo(after.a.x); // A now runs B's script: moves in y, not x
    expect(later.a.y).toBeGreaterThan(after.a.y);
    expect(later.b.x).toBeGreaterThan(after.b.x); // and B runs A's
    expect(onCollision).toHaveBeenCalledTimes(1);
  });

  it('normalizes directions like Scratch', () => {
    expect([90, 270, -190, 540, 180].map(normalizeDirection)).toEqual([90, -90, 170, 180, 180]);
  });
});
