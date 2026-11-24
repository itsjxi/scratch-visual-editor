import { describe, it, expect } from 'vitest';
import { createBlock as b } from '../src/model/blocks';
import { addScript, canInsert, detachFrom, findBlock, getList, insertAt, moveScript, removeBlock, setArg, shiftBlock, cloneBlocks } from '../src/model/tree';
import type { Project } from '../src/model/types';

function setup() {
  const hat = b('whenFlag');
  const move = b('move', { steps: 5 });
  const inner = b('turnRight');
  const loop = b('repeat', { times: 3 }, [inner]);
  const say = b('say');
  const project: Project = { version: 1, sprites: [{ id: 'sp', name: 'Cat', hue: 0, scripts: [{ id: 's1', x: 0, y: 0, blocks: [hat, move, loop, say] }] }] };
  return { project, hat, move, inner, loop, say };
}
const top = (p: Project) => p.sprites[0].scripts[0]?.blocks.map((x) => x.opcode);

describe('tree edits', () => {
  it('finds nested blocks with their list and index', () => {
    const { project, inner, loop } = setup();
    const found = findBlock(project, inner.id)!;
    expect(found.list.parentId).toBe(loop.id);
    expect(found.index).toBe(0);
  });

  it('detaches a block and everything below it, like dragging in Scratch', () => {
    const { project } = setup();
    const { project: next, blocks } = detachFrom(project, { spriteId: 'sp', scriptId: 's1', parentId: null, index: 2 });
    expect(blocks.map((x) => x.opcode)).toEqual(['repeat', 'say']);
    expect(top(next)).toEqual(['whenFlag', 'move']);
  });

  it('removes a stack that becomes empty', () => {
    const { project } = setup();
    const { project: next } = detachFrom(project, { spriteId: 'sp', scriptId: 's1', parentId: null, index: 0 });
    expect(next.sprites[0].scripts).toHaveLength(0);
  });

  it('inserts into a C-block body without touching unrelated branches', () => {
    const { project, loop } = setup();
    const next = insertAt(project, { spriteId: 'sp', scriptId: 's1', parentId: loop.id, index: 1 }, [b('wait')]);
    expect(getList(next, { spriteId: 'sp', scriptId: 's1', parentId: loop.id })!.map((x) => x.opcode)).toEqual(['turnRight', 'wait']);
    expect(project.sprites[0].scripts[0].blocks[2].body).toHaveLength(1); // original untouched
    expect(next.sprites[0].scripts[0].blocks[1]).toBe(project.sprites[0].scripts[0].blocks[1]); // shared
  });

  it('removes one block and closes the gap', () => {
    const { project, move } = setup();
    expect(top(removeBlock(project, move.id))).toEqual(['whenFlag', 'repeat', 'say']);
  });

  it('edits arguments immutably and returns the same object when nothing changes', () => {
    const { project, inner } = setup();
    const next = setArg(project, inner.id, 'degrees', 90);
    expect(findBlock(next, inner.id)!.block.args.degrees).toBe(90);
    expect(findBlock(project, inner.id)!.block.args.degrees).toBe(15);
    expect(setArg(next, inner.id, 'degrees', 90)).toBe(next);
  });

  it('reorders with the keyboard but never above a hat', () => {
    const { project, move, say } = setup();
    expect(shiftBlock(project, move.id, -1)).toBe(project);
    expect(top(shiftBlock(project, say.id, -1))).toEqual(['whenFlag', 'move', 'say', 'repeat']);
  });

  it('adds and moves scripts on the canvas', () => {
    const { project } = setup();
    const { project: next, scriptId } = addScript(project, 'sp', 100.4, 50.6, [b('wait')]);
    const moved = moveScript(next, 'sp', scriptId, 10, 20);
    expect(moved.sprites[0].scripts[1]).toMatchObject({ x: 10, y: 20 });
  });

  it('clones with fresh ids', () => {
    const { loop } = setup();
    const [copy] = cloneBlocks([loop]);
    expect(copy.id).not.toBe(loop.id);
    expect(copy.body![0].id).not.toBe(loop.body![0].id);
  });
});

describe('attachment rules', () => {
  const hat = b('whenFlag');
  const list = [hat, b('move')];
  it('blocks hats from attaching and anything from going above a hat', () => {
    expect(canInsert(list, 1, [b('whenClicked')])).toBe(false);
    expect(canInsert(list, 0, [b('move')])).toBe(false);
    expect(canInsert(list, 1, [b('move')])).toBe(true);
  });
  it('allows nothing after a forever, and forever only at the end', () => {
    const withForever = [hat, b('forever')];
    expect(canInsert(withForever, 2, [b('move')])).toBe(false);
    expect(canInsert(list, 1, [b('forever')])).toBe(false);
    expect(canInsert(list, 2, [b('forever')])).toBe(true);
  });
});
