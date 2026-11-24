import type { Block, Opcode, Project, Slot } from '../model/types';
import { createBlock, describeBlock } from '../model/blocks';
import { addScript, canInsert, detachFrom, findBlock, getList, insertAt } from '../model/tree';
import type { EditorStore } from '../editor/store';

export type DropTarget =
  | { kind: 'slot'; slot: Slot }
  | { kind: 'canvas'; x: number; y: number }
  | { kind: 'delete' }
  | null;

export interface DragState {
  blocks: Block[];
  /** The project with the dragged blocks taken out; the canvas renders this while dragging. */
  base: Project;
  spriteId: string;
  pointer: { x: number; y: number };
  /** Where the pointer grabbed the block, relative to its top-left corner. */
  grab: { x: number; y: number };
  target: DropTarget;
  fromPalette: boolean;
}

export type DragSource = { kind: 'palette'; opcode: Opcode } | { kind: 'block'; blockId: string };

const DRAG_THRESHOLD = 4;
const SNAP_Y = 28;

/**
 * Drag and drop on pointer events rather than the HTML5 drag API, which has no touch
 * support, a fixed drag image and no way to snap. A press only becomes a drag after
 * moving a few pixels; otherwise it is a click.
 */
export class DragController {
  private state: DragState | null = null;
  private listeners = new Set<() => void>();
  private frame = 0;

  constructor(private readonly store: EditorStore) {}

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = () => this.state;

  private set(state: DragState | null) {
    this.state = state;
    this.listeners.forEach((l) => l());
  }

  /** Call from onPointerDown. `onClick` runs if the pointer is released without dragging. */
  press(event: React.PointerEvent<HTMLElement>, source: DragSource, onClick: () => void) {
    if (event.button !== 0 || (event.target as HTMLElement).closest('input, button, textarea')) return;
    event.stopPropagation();
    const start = { x: event.clientX, y: event.clientY };
    const rect = event.currentTarget.getBoundingClientRect();
    const grab = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    let dragging = false;

    const move = (e: PointerEvent) => {
      if (!dragging) {
        if (Math.hypot(e.clientX - start.x, e.clientY - start.y) < DRAG_THRESHOLD) return;
        dragging = this.begin(source, grab, e);
        if (!dragging) return finish();
      }
      e.preventDefault();
      this.set({ ...this.state!, pointer: { x: e.clientX, y: e.clientY } });
      cancelAnimationFrame(this.frame);
      this.frame = requestAnimationFrame(() => this.state && this.set({ ...this.state, target: this.findTarget() }));
    };
    const up = () => {
      finish();
      if (dragging) this.drop();
      else onClick();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && dragging) { finish(); this.cancel(); }
    };
    const finish = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      window.removeEventListener('keydown', key);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    window.addEventListener('keydown', key);
  }

  private begin(source: DragSource, grab: { x: number; y: number }, e: PointerEvent): boolean {
    const project = this.store.project;
    const spriteId = this.store.getState().selectedSpriteId;
    let blocks: Block[];
    let base = project;
    if (source.kind === 'palette') {
      blocks = [createBlock(source.opcode)];
    } else {
      const found = findBlock(project, source.blockId);
      if (!found) return false;
      ({ project: base, blocks } = detachFrom(project, { ...found.list, index: found.index }));
    }
    document.body.classList.add('is-dragging');
    this.set({ blocks, base, spriteId, grab, pointer: { x: e.clientX, y: e.clientY }, target: null, fromPalette: source.kind === 'palette' });
    return true;
  }

  /** Nearest valid insertion slot to the ghost's top-left corner, else the canvas, palette or nothing. */
  private findTarget(): DropTarget {
    const state = this.state!;
    const under = document.elementFromPoint(state.pointer.x, state.pointer.y)?.closest<HTMLElement>('[data-drop]');
    if (!under) return null;
    if (under.dataset.drop === 'palette') return { kind: 'delete' };

    const gx = state.pointer.x - state.grab.x;
    const gy = state.pointer.y - state.grab.y;
    let best: { slot: Slot; score: number } | null = null;
    for (const marker of under.querySelectorAll<HTMLElement>('[data-slot]')) {
      const r = marker.getBoundingClientRect();
      const dx = gx - r.left;
      const dy = gy - r.top;
      if (Math.abs(dy) > SNAP_Y || dx < -48 || dx > 160) continue;
      const score = Math.abs(dy) + Math.abs(dx) * 0.3;
      if (best && score >= best.score) continue;
      const slot: Slot = {
        spriteId: marker.dataset.sprite!, scriptId: marker.dataset.script!,
        parentId: marker.dataset.parent || null, index: Number(marker.dataset.index),
      };
      const list = getList(state.base, slot);
      if (list && canInsert(list, slot.index, state.blocks)) best = { slot, score };
    }
    if (best) return { kind: 'slot', slot: best.slot };

    const content = under.querySelector<HTMLElement>('.canvas-content')!.getBoundingClientRect();
    return { kind: 'canvas', x: Math.max(8, gx - content.left), y: Math.max(8, gy - content.top) };
  }

  private drop() {
    const state = this.state;
    if (!state) return;
    cancelAnimationFrame(this.frame);
    const target = this.findTarget();
    this.end();
    const name = `“${describeBlock(state.blocks[0])}”${state.blocks.length > 1 ? ` and ${state.blocks.length - 1} below` : ''}`;

    if (target?.kind === 'slot') {
      this.store.edit(() => insertAt(state.base, target.slot, state.blocks), `${state.fromPalette ? 'add' : 'move'} ${name}`,
        { announce: `${state.fromPalette ? 'Added' : 'Moved'} ${name}` });
    } else if (target?.kind === 'canvas') {
      this.store.edit(() => addScript(state.base, state.spriteId, target.x, target.y, state.blocks).project,
        `${state.fromPalette ? 'add' : 'move'} ${name}`, { announce: `${state.fromPalette ? 'Added' : 'Moved'} ${name}` });
    } else if (target?.kind === 'delete' && !state.fromPalette) {
      this.store.edit(() => state.base, `delete ${name}`, { toast: `Deleted ${name}` });
    }
    // dropped anywhere else: nothing changes
  }

  private cancel() {
    this.end();
    this.store.announce('Drag cancelled');
  }

  private end() {
    document.body.classList.remove('is-dragging');
    this.set(null);
  }
}
