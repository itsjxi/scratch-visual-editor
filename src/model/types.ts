export type Opcode =
  | 'whenFlag' | 'whenClicked'
  | 'move' | 'turnRight' | 'turnLeft' | 'goTo' | 'glide' | 'pointIn' | 'changeX' | 'changeY' | 'bounce'
  | 'sayFor' | 'say' | 'thinkFor'
  | 'wait' | 'repeat' | 'forever';

export type ArgValue = number | string;

/** One block. C-blocks (repeat, forever) hold their inner blocks in `body`. */
export interface Block {
  id: string;
  opcode: Opcode;
  args: Record<string, ArgValue>;
  body?: Block[];
}

/** A stack of blocks placed on the script canvas. */
export interface Script {
  id: string;
  x: number;
  y: number;
  blocks: Block[];
}

export interface SpriteModel {
  id: string;
  name: string;
  /** Costume tint, in degrees of hue rotation. */
  hue: number;
  scripts: Script[];
}

/** Everything that undo/redo covers. Sprite positions live outside it, like in Scratch. */
export interface Project {
  version: 1;
  sprites: SpriteModel[];
}

/** Where a sprite is on the stage. Scratch coordinates: origin in the centre, y up, 90° = right. */
export interface Pose {
  x: number;
  y: number;
  direction: number;
}

/** A list of blocks: a script's top level (parentId null) or a C-block's body. */
export interface ListRef {
  spriteId: string;
  scriptId: string;
  parentId: string | null;
}

/** A position in a list. */
export interface Slot extends ListRef {
  index: number;
}
