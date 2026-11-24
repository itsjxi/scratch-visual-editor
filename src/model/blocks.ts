import type { ArgValue, Block, Opcode } from './types';

export type Category = 'events' | 'motion' | 'looks' | 'control';
export type Shape = 'hat' | 'stack' | 'c' | 'cap-c';

export interface ArgSpec {
  name: string;
  type: 'number' | 'text';
  default: ArgValue;
  min?: number;
  max?: number;
  /** Accessible name for the input, e.g. "steps". */
  label: string;
}

export interface BlockSpec {
  opcode: Opcode;
  category: Category;
  shape: Shape;
  /** Words and {arg} placeholders, e.g. "move {steps} steps". {flag} draws the green flag. */
  template: string;
  args: ArgSpec[];
}

export const CATEGORIES: { id: Category; label: string; color: string }[] = [
  { id: 'events', label: 'Events', color: '#ffcf4a' },
  { id: 'motion', label: 'Motion', color: '#82b1ff' },
  { id: 'looks', label: 'Looks', color: '#bda6ff' },
  { id: 'control', label: 'Control', color: '#ffb36b' },
];

const n = (name: string, value: number, label = name, min?: number, max?: number): ArgSpec =>
  ({ name, type: 'number', default: value, label, min, max });
const t = (name: string, value: string, label = name): ArgSpec => ({ name, type: 'text', default: value, label });

export const BLOCKS: BlockSpec[] = [
  { opcode: 'whenFlag', category: 'events', shape: 'hat', template: 'when {flag} clicked', args: [] },
  { opcode: 'whenClicked', category: 'events', shape: 'hat', template: 'when this sprite clicked', args: [] },

  { opcode: 'move', category: 'motion', shape: 'stack', template: 'move {steps} steps', args: [n('steps', 10)] },
  { opcode: 'turnRight', category: 'motion', shape: 'stack', template: 'turn right {degrees} degrees', args: [n('degrees', 15)] },
  { opcode: 'turnLeft', category: 'motion', shape: 'stack', template: 'turn left {degrees} degrees', args: [n('degrees', 15)] },
  { opcode: 'goTo', category: 'motion', shape: 'stack', template: 'go to x: {x} y: {y}', args: [n('x', 0, 'x position'), n('y', 0, 'y position')] },
  { opcode: 'glide', category: 'motion', shape: 'stack', template: 'glide {secs} secs to x: {x} y: {y}', args: [n('secs', 1, 'seconds', 0), n('x', 100, 'x position'), n('y', 0, 'y position')] },
  { opcode: 'pointIn', category: 'motion', shape: 'stack', template: 'point in direction {direction}', args: [n('direction', 90)] },
  { opcode: 'changeX', category: 'motion', shape: 'stack', template: 'change x by {dx}', args: [n('dx', 10, 'x change')] },
  { opcode: 'changeY', category: 'motion', shape: 'stack', template: 'change y by {dy}', args: [n('dy', 10, 'y change')] },
  { opcode: 'bounce', category: 'motion', shape: 'stack', template: 'if on edge, bounce', args: [] },

  { opcode: 'sayFor', category: 'looks', shape: 'stack', template: 'say {text} for {secs} seconds', args: [t('text', 'Hello!', 'message'), n('secs', 2, 'seconds', 0)] },
  { opcode: 'say', category: 'looks', shape: 'stack', template: 'say {text}', args: [t('text', 'Hello!', 'message')] },
  { opcode: 'thinkFor', category: 'looks', shape: 'stack', template: 'think {text} for {secs} seconds', args: [t('text', 'Hmm…', 'thought'), n('secs', 2, 'seconds', 0)] },

  { opcode: 'wait', category: 'control', shape: 'stack', template: 'wait {secs} seconds', args: [n('secs', 1, 'seconds', 0)] },
  { opcode: 'repeat', category: 'control', shape: 'c', template: 'repeat {times}', args: [n('times', 10, 'times', 0)] },
  { opcode: 'forever', category: 'control', shape: 'cap-c', template: 'forever', args: [] },
];

export const SPECS = Object.fromEntries(BLOCKS.map((b) => [b.opcode, b])) as Record<Opcode, BlockSpec>;

export const colorOf = (opcode: Opcode) => CATEGORIES.find((c) => c.id === SPECS[opcode].category)!.color;
export const isHat = (block: Block) => SPECS[block.opcode].shape === 'hat';
export const isCap = (block: Block) => SPECS[block.opcode].shape === 'cap-c';
export const hasBody = (block: Block) => SPECS[block.opcode].shape === 'c' || SPECS[block.opcode].shape === 'cap-c';

let counter = 0;
export const createId = (prefix = 'b') => `${prefix}${Date.now().toString(36)}${(counter++).toString(36)}`;

export function createBlock(opcode: Opcode, args: Record<string, ArgValue> = {}, body?: Block[]): Block {
  const spec = SPECS[opcode];
  const values = Object.fromEntries(spec.args.map((a) => [a.name, args[a.name] ?? a.default]));
  return spec.shape === 'c' || spec.shape === 'cap-c'
    ? { id: createId(), opcode, args: values, body: body ?? [] }
    : { id: createId(), opcode, args: values };
}

/** Plain-language description of a block, for screen readers and announcements. */
export function describeBlock(block: Block): string {
  return SPECS[block.opcode].template
    .replace('{flag}', 'green flag')
    .replace(/\{(\w+)\}/g, (_, name: string) => String(block.args[name] ?? ''));
}

/** Clamp and coerce an input value according to its spec. */
export function coerceArg(spec: ArgSpec, raw: string): ArgValue {
  if (spec.type === 'text') return raw.slice(0, 200);
  const value = Number(raw);
  if (!Number.isFinite(value)) return spec.default;
  const min = spec.min ?? -100_000;
  const max = spec.max ?? 100_000;
  return Math.min(max, Math.max(min, value));
}
