import type { Block, Pose, Project, SpriteModel } from './types';
import { SPECS, createBlock as b, createId } from './blocks';

export const STAGE = { width: 480, height: 360 } as const;

export function newSprite(index: number): SpriteModel {
  return { id: createId('sp'), name: index === 0 ? 'Cat' : `Cat ${index + 1}`, hue: (index * 137) % 360, scripts: [] };
}

/** First-run project: shows loops, glide, speech and the collision swap. */
export function exampleProject(): { project: Project; poses: Record<string, Pose> } {
  const cat: SpriteModel = {
    id: createId('sp'), name: 'Cat', hue: 0,
    scripts: [{
      id: createId('s'), x: 32, y: 32,
      blocks: [
        b('whenFlag'),
        b('goTo', { x: -150, y: 0 }),
        b('pointIn', { direction: 90 }),
        b('sayFor', { text: 'Watch this!', secs: 1 }),
        b('repeat', { times: 30 }, [b('move', { steps: 8 }), b('bounce')]),
        b('sayFor', { text: 'Your turn', secs: 2 }),
      ],
    }],
  };
  const friend: SpriteModel = {
    id: createId('sp'), name: 'Cat 2', hue: 137,
    scripts: [{
      id: createId('s'), x: 32, y: 32,
      blocks: [
        b('whenFlag'),
        b('goTo', { x: 150, y: 0 }),
        b('repeat', { times: 12 }, [b('turnRight', { degrees: 30 }), b('wait', { secs: 0.1 })]),
      ],
    }],
  };
  return {
    project: { version: 1, sprites: [cat, friend] },
    poses: { [cat.id]: { x: -150, y: 0, direction: 90 }, [friend.id]: { x: 150, y: 0, direction: 90 } },
  };
}

/* ---------- validation (for localStorage and imported files) ---------- */

export class ProjectError extends Error {}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function validateBlock(value: unknown, path: string): Block {
  if (!isObject(value)) throw new ProjectError(`${path} is not a block`);
  const { id, opcode, args, body } = value;
  if (typeof id !== 'string' || !id) throw new ProjectError(`${path} has no id`);
  if (typeof opcode !== 'string' || !(opcode in SPECS)) throw new ProjectError(`${path} has an unknown opcode "${String(opcode)}"`);
  const spec = SPECS[opcode as keyof typeof SPECS];
  if (!isObject(args)) throw new ProjectError(`${path} has no args`);
  const cleanArgs: Block['args'] = {};
  for (const arg of spec.args) {
    const v = args[arg.name];
    cleanArgs[arg.name] = arg.type === 'number'
      ? (typeof v === 'number' && Number.isFinite(v) ? v : arg.default)
      : (typeof v === 'string' ? v.slice(0, 200) : arg.default);
  }
  const block: Block = { id, opcode: spec.opcode, args: cleanArgs };
  if (spec.shape === 'c' || spec.shape === 'cap-c') {
    if (body !== undefined && !Array.isArray(body)) throw new ProjectError(`${path}.body is not a list`);
    block.body = (body ?? []).map((child: unknown, i: number) => validateBlock(child, `${path}.body[${i}]`));
  }
  return block;
}

/** Turn untrusted JSON into a Project, or throw a ProjectError that says what's wrong. */
export function validateProject(value: unknown): Project {
  if (!isObject(value) || value.version !== 1) throw new ProjectError('Not a version 1 project file');
  if (!Array.isArray(value.sprites) || value.sprites.length === 0) throw new ProjectError('The project has no sprites');
  const ids = new Set<string>();
  const sprites = value.sprites.map((s: unknown, i: number): SpriteModel => {
    if (!isObject(s) || typeof s.id !== 'string' || typeof s.name !== 'string') throw new ProjectError(`sprites[${i}] is not a sprite`);
    if (!Array.isArray(s.scripts)) throw new ProjectError(`sprites[${i}] has no scripts`);
    return {
      id: s.id, name: s.name.slice(0, 40), hue: typeof s.hue === 'number' ? s.hue : 0,
      scripts: s.scripts.map((sc: unknown, j: number) => {
        if (!isObject(sc) || typeof sc.id !== 'string' || !Array.isArray(sc.blocks)) throw new ProjectError(`sprites[${i}].scripts[${j}] is not a script`);
        return {
          id: sc.id, x: Number(sc.x) || 0, y: Number(sc.y) || 0,
          blocks: sc.blocks.map((bl: unknown, k: number) => validateBlock(bl, `sprites[${i}].scripts[${j}].blocks[${k}]`)),
        };
      }),
    };
  });
  // Duplicate ids would make edits hit the wrong block.
  const walk = (blocks: Block[]) => blocks.forEach((bl) => {
    if (ids.has(bl.id)) throw new ProjectError(`Duplicate block id "${bl.id}"`);
    ids.add(bl.id);
    if (bl.body) walk(bl.body);
  });
  sprites.forEach((s) => s.scripts.forEach((sc) => walk(sc.blocks)));
  return { version: 1, sprites };
}

export function validatePoses(value: unknown, project: Project): Record<string, Pose> {
  const poses: Record<string, Pose> = {};
  project.sprites.forEach((s, i) => {
    const p = isObject(value) && isObject(value[s.id]) ? value[s.id] as Record<string, unknown> : {};
    poses[s.id] = {
      x: typeof p.x === 'number' ? p.x : -150 + i * 100,
      y: typeof p.y === 'number' ? p.y : 0,
      direction: typeof p.direction === 'number' ? p.direction : 90,
    };
  });
  return poses;
}
