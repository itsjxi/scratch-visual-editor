/**
 * Pure, immutable edits on the project tree. Every function returns a new Project and
 * shares every untouched branch with the old one (structural sharing), which is what
 * makes snapshot-based undo cheap and React re-renders precise.
 */
import type { ArgValue, Block, ListRef, Project, Script, Slot, SpriteModel } from './types';
import { createId, isCap, isHat } from './blocks';

export interface Found {
  sprite: SpriteModel;
  script: Script;
  /** The list that holds the block. */
  list: ListRef;
  index: number;
  block: Block;
}

/** Depth-first search for a block by id. */
export function findBlock(project: Project, blockId: string): Found | null {
  for (const sprite of project.sprites) {
    for (const script of sprite.scripts) {
      const hit = searchList(script.blocks, null);
      if (hit) return { sprite, script, list: { spriteId: sprite.id, scriptId: script.id, parentId: hit.parentId }, index: hit.index, block: hit.block };
    }
  }
  return null;

  function searchList(blocks: Block[], parentId: string | null): { parentId: string | null; index: number; block: Block } | null {
    for (let i = 0; i < blocks.length; i++) {
      if (blocks[i].id === blockId) return { parentId, index: i, block: blocks[i] };
      const body = blocks[i].body;
      if (body) {
        const hit = searchList(body, blocks[i].id);
        if (hit) return hit;
      }
    }
    return null;
  }
}

export function getSprite(project: Project, spriteId: string): SpriteModel | undefined {
  return project.sprites.find((s) => s.id === spriteId);
}

export function getList(project: Project, ref: ListRef): Block[] | null {
  const script = getSprite(project, ref.spriteId)?.scripts.find((s) => s.id === ref.scriptId);
  if (!script) return null;
  if (ref.parentId === null) return script.blocks;
  const parent = findInBlocks(script.blocks, ref.parentId);
  return parent?.body ?? null;
}

function findInBlocks(blocks: Block[], id: string): Block | null {
  for (const block of blocks) {
    if (block.id === id) return block;
    if (block.body) {
      const hit = findInBlocks(block.body, id);
      if (hit) return hit;
    }
  }
  return null;
}

/* ---------- copy-on-write helpers ---------- */

function updateSprite(project: Project, spriteId: string, fn: (s: SpriteModel) => SpriteModel): Project {
  return { ...project, sprites: project.sprites.map((s) => (s.id === spriteId ? fn(s) : s)) };
}

function updateScript(project: Project, ref: { spriteId: string; scriptId: string }, fn: (s: Script) => Script | null): Project {
  return updateSprite(project, ref.spriteId, (sprite) => ({
    ...sprite,
    scripts: sprite.scripts.flatMap((s) => {
      if (s.id !== ref.scriptId) return [s];
      const next = fn(s);
      return next ? [next] : [];
    }),
  }));
}

/** Replace one list (top level or a C-block body) using fn; everything else is shared. */
function updateList(project: Project, ref: ListRef, fn: (blocks: Block[]) => Block[]): Project {
  return updateScript(project, ref, (script) => {
    if (ref.parentId === null) {
      const blocks = fn(script.blocks);
      return blocks.length ? { ...script, blocks } : null; // an emptied stack disappears
    }
    return { ...script, blocks: mapBody(script.blocks, ref.parentId, fn) };
  });
}

function mapBody(blocks: Block[], parentId: string, fn: (blocks: Block[]) => Block[]): Block[] {
  let changed = false;
  const next = blocks.map((block) => {
    if (block.id === parentId) {
      changed = true;
      return { ...block, body: fn(block.body ?? []) };
    }
    if (block.body) {
      const body = mapBody(block.body, parentId, fn);
      if (body !== block.body) {
        changed = true;
        return { ...block, body };
      }
    }
    return block;
  });
  return changed ? next : blocks;
}

function mapBlock(blocks: Block[], id: string, fn: (b: Block) => Block): Block[] {
  let changed = false;
  const next = blocks.map((block) => {
    if (block.id === id) {
      changed = true;
      return fn(block);
    }
    if (block.body) {
      const body = mapBlock(block.body, id, fn);
      if (body !== block.body) {
        changed = true;
        return { ...block, body };
      }
    }
    return block;
  });
  return changed ? next : blocks;
}

/* ---------- edits ---------- */

/**
 * Detach the block at `slot` and every block below it (Scratch's drag rule: you pick up
 * the rest of the stack). Returns the new project and the detached blocks.
 */
export function detachFrom(project: Project, slot: Slot): { project: Project; blocks: Block[] } {
  const list = getList(project, slot) ?? [];
  const blocks = list.slice(slot.index);
  return { project: updateList(project, slot, (l) => l.slice(0, slot.index)), blocks };
}

/** Remove a single block (and its body); the blocks below close the gap. */
export function removeBlock(project: Project, blockId: string): Project {
  const found = findBlock(project, blockId);
  if (!found) return project;
  return updateList(project, found.list, (l) => l.filter((b) => b.id !== blockId));
}

export function insertAt(project: Project, slot: Slot, blocks: Block[]): Project {
  return updateList(project, slot, (l) => [...l.slice(0, slot.index), ...blocks, ...l.slice(slot.index)]);
}

export function addScript(project: Project, spriteId: string, x: number, y: number, blocks: Block[]): { project: Project; scriptId: string } {
  const scriptId = createId('s');
  const script: Script = { id: scriptId, x: Math.round(x), y: Math.round(y), blocks };
  return { project: updateSprite(project, spriteId, (s) => ({ ...s, scripts: [...s.scripts, script] })), scriptId };
}

export function moveScript(project: Project, spriteId: string, scriptId: string, x: number, y: number): Project {
  return updateScript(project, { spriteId, scriptId }, (s) => ({ ...s, x: Math.round(x), y: Math.round(y) }));
}

export function setArg(project: Project, blockId: string, name: string, value: ArgValue): Project {
  const found = findBlock(project, blockId);
  if (!found || found.block.args[name] === value) return project;
  return updateScript(project, found.list, (script) => ({
    ...script,
    blocks: mapBlock(script.blocks, blockId, (b) => ({ ...b, args: { ...b.args, [name]: value } })),
  }));
}

/**
 * Move one block up or down within its list (keyboard reordering). Blocks never move
 * above a hat block, and nothing moves below a cap block (forever).
 */
export function shiftBlock(project: Project, blockId: string, delta: -1 | 1): Project {
  const found = findBlock(project, blockId);
  if (!found) return project;
  const list = getList(project, found.list)!;
  const target = found.index + delta;
  if (target < 0 || target >= list.length) return project;
  if (isHat(found.block) || isHat(list[target]) || isCap(found.block) || isCap(list[target])) return project;
  return updateList(project, found.list, (l) => {
    const next = [...l];
    [next[found.index], next[target]] = [next[target], next[found.index]];
    return next;
  });
}

/**
 * Scratch's attachment rules:
 * - a stack that starts with a hat can't be attached anywhere (it starts a new script)
 * - nothing goes above a hat block
 * - nothing attaches below a cap block (forever)
 * - a stack ending in a cap can only go at the end of a list
 */
export function canInsert(list: Block[], index: number, blocks: Block[]): boolean {
  if (blocks.length === 0 || isHat(blocks[0])) return false;
  if (index === 0 && list[0] && isHat(list[0])) return false;
  if (index > 0 && isCap(list[index - 1])) return false;
  if (isCap(blocks[blocks.length - 1]) && index < list.length) return false;
  return true;
}

export function renameSprite(project: Project, spriteId: string, name: string): Project {
  const clean = name.trim().slice(0, 40);
  return clean ? updateSprite(project, spriteId, (s) => ({ ...s, name: clean })) : project;
}

export function addSprite(project: Project, sprite: SpriteModel): Project {
  return { ...project, sprites: [...project.sprites, sprite] };
}

export function deleteSprite(project: Project, spriteId: string): Project {
  if (project.sprites.length <= 1) return project;
  return { ...project, sprites: project.sprites.filter((s) => s.id !== spriteId) };
}

/** Deep copy with fresh ids (duplicating a stack). */
export function cloneBlocks(blocks: Block[]): Block[] {
  return blocks.map((b) => ({ ...b, id: createId(), args: { ...b.args }, ...(b.body ? { body: cloneBlocks(b.body) } : {}) }));
}
