import type { Block, Pose, Project, Script } from '../model/types';
import { STAGE } from '../model/project';

export interface Bubble {
  text: string;
  kind: 'say' | 'think';
}

export interface SpriteState extends Pose {
  bubble: Bubble | null;
}

export interface RuntimeSnapshot {
  sprites: Record<string, SpriteState>;
  /** Scripts with a running thread, for the glow in the editor. */
  activeScripts: string[];
  running: boolean;
}

/** What a thread hands back to the scheduler when it pauses. */
type Yield = { until: number } | 'frame';

interface Thread {
  spriteId: string;
  scriptId: string;
  blocks: Block[];
  gen: Generator<Yield, void, void>;
  waitUntil: number;
}

export interface RuntimeOptions {
  swapOnCollision?: boolean;
  onCollision?: (a: string, b: string) => void;
}

/** Half the drawn sprite size; used for edge fencing, bouncing and collisions. */
export const SPRITE_RADIUS = 34;
const HALF_W = STAGE.width / 2;
const HALF_H = STAGE.height / 2;
/**
 * Blocks a thread may run per frame before it is forced to yield, so a script that never
 * pauses (thousands of blocks in a row) can't freeze the page.
 */
export const MAX_BLOCKS_PER_FRAME = 10_000;

const toRadians = (deg: number) => (deg * Math.PI) / 180;
/** Scratch keeps directions in (-180, 180]. */
export function normalizeDirection(deg: number): number {
  const d = ((deg % 360) + 360) % 360;
  return d > 180 ? d - 360 : d;
}

/**
 * A cooperative interpreter, like Scratch's.
 *
 * Each running script is a generator ("thread"). step(now) resumes every thread once
 * per animation frame until it yields: at the end of each loop iteration, on every frame
 * of a glide, or while waiting. Threads read and write sprite state through the runtime,
 * never through a copy, so consecutive blocks always see each other's results. Time is
 * passed in, which makes the whole thing deterministic in tests.
 */
export class Runtime {
  private threads: Thread[] = [];
  private sprites: Record<string, SpriteState> = {};
  private listeners = new Set<() => void>();
  private snapshot: RuntimeSnapshot = { sprites: {}, activeScripts: [], running: false };
  private now = 0;
  private touching = new Set<string>();
  /** Blocks the current thread may still run this frame. */
  private budget = 0;
  swapOnCollision: boolean;
  private readonly onCollision?: (a: string, b: string) => void;

  constructor(poses: Record<string, Pose>, options: RuntimeOptions = {}) {
    this.swapOnCollision = options.swapOnCollision ?? true;
    this.onCollision = options.onCollision;
    for (const [id, pose] of Object.entries(poses)) this.sprites[id] = { ...pose, bubble: null };
    this.publish();
  }

  /* ---------- store protocol (useSyncExternalStore) ---------- */

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = () => this.snapshot;

  private publish() {
    this.snapshot = {
      sprites: Object.fromEntries(Object.entries(this.sprites).map(([id, s]) => [id, { ...s }])),
      activeScripts: [...new Set(this.threads.map((t) => t.scriptId))],
      running: this.threads.length > 0,
    };
    this.listeners.forEach((l) => l());
  }

  /* ---------- sprites ---------- */

  poses(): Record<string, Pose> {
    return Object.fromEntries(Object.entries(this.sprites).map(([id, s]) => [id, { x: s.x, y: s.y, direction: s.direction }]));
  }

  /** Keep runtime sprites in line with the project (sprites added, deleted or undone). */
  syncSprites(project: Project, defaultPose: (index: number) => Pose) {
    const ids = new Set(project.sprites.map((s) => s.id));
    let changed = false;
    project.sprites.forEach((s, i) => {
      if (!this.sprites[s.id]) { this.sprites[s.id] = { ...defaultPose(i), bubble: null }; changed = true; }
    });
    for (const id of Object.keys(this.sprites)) {
      if (!ids.has(id)) { delete this.sprites[id]; this.threads = this.threads.filter((t) => t.spriteId !== id); changed = true; }
    }
    if (changed) this.publish();
  }

  setPose(spriteId: string, pose: Partial<Pose>) {
    const s = this.sprites[spriteId];
    if (!s) return;
    Object.assign(s, pose);
    this.fence(s);
    this.publish();
  }

  /* ---------- starting and stopping ---------- */

  /** Green flag: stop everything, then start every "when flag clicked" script. */
  greenFlag(project: Project) {
    this.stop({ publish: false });
    for (const sprite of project.sprites) {
      for (const script of sprite.scripts) if (script.blocks[0]?.opcode === 'whenFlag') this.start(sprite.id, script);
    }
    this.publish();
  }

  /** Sprite clicked: (re)start its "when this sprite clicked" scripts. */
  clickSprite(project: Project, spriteId: string) {
    const sprite = project.sprites.find((s) => s.id === spriteId);
    if (!sprite) return;
    for (const script of sprite.scripts) {
      if (script.blocks[0]?.opcode !== 'whenClicked') continue;
      this.threads = this.threads.filter((t) => t.scriptId !== script.id);
      this.start(sprite.id, script);
    }
    this.publish();
  }

  /** Run one script on its own (clicking a stack in the editor). Clicking it again stops it. */
  toggleScript(spriteId: string, script: Script) {
    if (this.threads.some((t) => t.scriptId === script.id)) {
      this.threads = this.threads.filter((t) => t.scriptId !== script.id);
    } else {
      this.start(spriteId, script);
    }
    this.publish();
  }

  stop({ publish = true } = {}) {
    this.threads = [];
    this.touching.clear();
    for (const s of Object.values(this.sprites)) s.bubble = null;
    if (publish) this.publish();
  }

  get running() {
    return this.threads.length > 0;
  }

  private start(spriteId: string, script: Pick<Script, 'id' | 'blocks'>) {
    const blocks = script.blocks;
    this.threads.push({ spriteId, scriptId: script.id, blocks, gen: this.run(spriteId, blocks), waitUntil: 0 });
  }

  /* ---------- the scheduler ---------- */

  /** Advance every thread to its next yield. Call once per animation frame. */
  step(now: number) {
    this.now = now;
    if (this.threads.length === 0) return;
    for (const thread of [...this.threads]) {
      if (!this.threads.includes(thread)) continue; // stopped by a collision swap this frame
      if (thread.waitUntil > now) continue;
      thread.waitUntil = 0;
      this.budget = MAX_BLOCKS_PER_FRAME;
      for (;;) {
        const result = thread.gen.next();
        if (result.done) { this.threads = this.threads.filter((t) => t !== thread); break; }
        if (result.value === 'frame') break;
        thread.waitUntil = result.value.until;
        if (thread.waitUntil > now) break;
      }
    }
    this.checkCollisions();
    this.publish();
  }

  /* ---------- the interpreter ---------- */

  private *run(spriteId: string, blocks: Block[]): Generator<Yield, void, void> {
    for (const block of blocks) {
      if (--this.budget < 0) yield 'frame';
      const s = this.sprites[spriteId];
      if (!s) return; // sprite deleted while running
      const a = block.args;
      const num = (name: string) => Number(a[name]) || 0;

      switch (block.opcode) {
        case 'whenFlag':
        case 'whenClicked':
          break;
        case 'move': {
          const r = toRadians(s.direction);
          s.x += num('steps') * Math.sin(r);
          s.y += num('steps') * Math.cos(r);
          this.fence(s);
          break;
        }
        case 'turnRight': s.direction = normalizeDirection(s.direction + num('degrees')); break;
        case 'turnLeft': s.direction = normalizeDirection(s.direction - num('degrees')); break;
        case 'pointIn': s.direction = normalizeDirection(num('direction')); break;
        case 'goTo': s.x = num('x'); s.y = num('y'); this.fence(s); break;
        case 'changeX': s.x += num('dx'); this.fence(s); break;
        case 'changeY': s.y += num('dy'); this.fence(s); break;
        case 'bounce': this.bounce(s); break;
        case 'glide': {
          const start = this.now;
          const duration = Math.max(0, num('secs')) * 1000;
          const from = { x: s.x, y: s.y };
          const to = { x: num('x'), y: num('y') };
          while (this.now - start < duration) {
            const t = (this.now - start) / duration;
            s.x = from.x + (to.x - from.x) * t;
            s.y = from.y + (to.y - from.y) * t;
            yield 'frame';
          }
          s.x = to.x; s.y = to.y;
          this.fence(s);
          break;
        }
        case 'say': {
          const text = String(a.text ?? '');
          s.bubble = text ? { text, kind: 'say' } : null;
          break;
        }
        case 'sayFor':
        case 'thinkFor': {
          const bubble: Bubble = { text: String(a.text ?? ''), kind: block.opcode === 'sayFor' ? 'say' : 'think' };
          s.bubble = bubble;
          yield { until: this.now + Math.max(0, num('secs')) * 1000 };
          if (s.bubble === bubble) s.bubble = null; // don't clear a newer bubble
          break;
        }
        case 'wait': yield { until: this.now + Math.max(0, num('secs')) * 1000 }; break;
        case 'repeat': {
          const times = Math.max(0, Math.round(num('times')));
          for (let i = 0; i < times; i++) {
            yield* this.run(spriteId, block.body ?? []);
            yield 'frame'; // Scratch redraws after every loop iteration
          }
          break;
        }
        case 'forever':
          for (;;) {
            yield* this.run(spriteId, block.body ?? []);
            yield 'frame';
          }
      }
    }
  }

  /** Keep at least part of the sprite on the stage. */
  private fence(s: SpriteState) {
    s.x = Math.max(-HALF_W, Math.min(HALF_W, s.x));
    s.y = Math.max(-HALF_H, Math.min(HALF_H, s.y));
  }

  private bounce(s: SpriteState) {
    const maxX = HALF_W - SPRITE_RADIUS;
    const maxY = HALF_H - SPRITE_RADIUS;
    if (s.x > maxX || s.x < -maxX) {
      s.direction = normalizeDirection(-s.direction);
      s.x = Math.max(-maxX, Math.min(maxX, s.x));
    }
    if (s.y > maxY || s.y < -maxY) {
      s.direction = normalizeDirection(180 - s.direction);
      s.y = Math.max(-maxY, Math.min(maxY, s.y));
    }
  }

  /**
   * When two sprites start touching, they swap the scripts they are running and start
   * them over (the original assignment's "collision swap"). Edge-triggered: they must
   * separate before they can swap again, otherwise they'd swap on every frame.
   */
  private checkCollisions() {
    const ids = Object.keys(this.sprites);
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const a = this.sprites[ids[i]];
        const b = this.sprites[ids[j]];
        const key = `${ids[i]}|${ids[j]}`;
        const hit = Math.hypot(a.x - b.x, a.y - b.y) < SPRITE_RADIUS * 2;
        if (!hit) { this.touching.delete(key); continue; }
        if (this.touching.has(key)) continue;
        this.touching.add(key);
        if (this.swapOnCollision) this.swap(ids[i], ids[j]);
      }
    }
  }

  private swap(aId: string, bId: string) {
    const aThreads = this.threads.filter((t) => t.spriteId === aId);
    const bThreads = this.threads.filter((t) => t.spriteId === bId);
    if (aThreads.length === 0 && bThreads.length === 0) return;
    this.threads = this.threads.filter((t) => t.spriteId !== aId && t.spriteId !== bId);
    // Skip the hat so a swapped script doesn't wait for another click.
    const body = (t: Thread) => (t.blocks[0] && t.blocks[0].opcode.startsWith('when') ? t.blocks.slice(1) : t.blocks);
    for (const t of bThreads) this.start(aId, { id: t.scriptId, blocks: body(t) });
    for (const t of aThreads) this.start(bId, { id: t.scriptId, blocks: body(t) });
    this.onCollision?.(aId, bId);
  }
}
