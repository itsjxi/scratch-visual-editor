import type { CSSProperties } from 'react';
import { BLOCKS, CATEGORIES, createBlock, describeBlock, isHat } from '../model/blocks';
import type { Opcode, Project } from '../model/types';
import { addScript, canInsert, getSprite, insertAt } from '../model/tree';
import { BlockView } from './blocks/BlockView';
import { useServices } from './context';

/** Rough height of a stack, to place a new script below the existing ones. */
export function nextScriptY(project: Project, spriteId: string): number {
  const sprite = getSprite(project, spriteId);
  if (!sprite?.scripts.length) return 32;
  const height = (blocks: { body?: unknown[] }[]): number =>
    blocks.reduce((h, b) => h + 44 + (b.body ? 28 + height(b.body as { body?: unknown[] }[]) : 0), 0);
  return Math.max(...sprite.scripts.map((s) => s.y + height(s.blocks))) + 32;
}

/**
 * Click (or Enter) adds a block without dragging: to the end of the last script that can
 * take it, otherwise as a new script.
 */
export function addFromPalette(project: Project, spriteId: string, opcode: Opcode): Project {
  const block = createBlock(opcode);
  const sprite = getSprite(project, spriteId);
  if (!sprite) return project;
  if (!isHat(block)) {
    for (let i = sprite.scripts.length - 1; i >= 0; i--) {
      const script = sprite.scripts[i];
      if (canInsert(script.blocks, script.blocks.length, [block])) {
        return insertAt(project, { spriteId, scriptId: script.id, parentId: null, index: script.blocks.length }, [block]);
      }
    }
  }
  return addScript(project, spriteId, 32, nextScriptY(project, spriteId), [block]).project;
}

export function Palette() {
  const { store, drag } = useServices();

  const add = (opcode: Opcode) => {
    const spriteId = store.getState().selectedSpriteId;
    const name = `“${describeBlock(createBlock(opcode))}”`;
    store.edit((p) => addFromPalette(p, spriteId, opcode), `add ${name}`, { announce: `Added ${name}` });
  };

  return (
    <nav className="palette" aria-label="Blocks" data-drop="palette">
      {CATEGORIES.map((category) => (
        <section key={category.id} className="palette-group" aria-labelledby={`cat-${category.id}`} style={{ '--block': category.color } as CSSProperties}>
          <h2 id={`cat-${category.id}`} className="palette-heading"><span className="dot" aria-hidden="true" />{category.label}</h2>
          <ul>
            {BLOCKS.filter((b) => b.category === category.id).map((spec) => {
              const preview = createBlock(spec.opcode);
              return (
                <li key={spec.opcode}>
                  <div
                    className="palette-item"
                    role="button"
                    tabIndex={0}
                    onPointerDown={(e) => drag.press(e, { kind: 'palette', opcode: spec.opcode }, () => add(spec.opcode))}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); add(spec.opcode); } }}
                  >
                    <span className="visually-hidden">Add block: </span>
                    <BlockView block={preview} mode="palette" />
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      <p className="palette-hint">Drag blocks onto the canvas, or click to add. Drop a block here to delete it.</p>
    </nav>
  );
}
