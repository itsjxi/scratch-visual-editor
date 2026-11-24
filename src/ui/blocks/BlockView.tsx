import { memo, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import type { Block, ListRef } from '../../model/types';
import { SPECS, colorOf, describeBlock } from '../../model/blocks';
import { removeBlock, setArg, shiftBlock } from '../../model/tree';
import { ArgInput } from './ArgInput';
import { FlagIcon } from '../icons';
import { useServices } from '../context';
import { StackList } from './StackList';

interface Props {
  block: Block;
  /** Where the block sits; absent for palette and drag-ghost blocks. */
  list?: ListRef;
  index?: number;
  count?: number;
  mode: 'canvas' | 'palette' | 'ghost';
  /** The script this block belongs to, so clicking a block can run its script. */
  onRunScript?: () => void;
}

/** Label words with inputs and icons in place of the {placeholders}. */
function Label({ block, mode, onArg }: { block: Block; mode: Props['mode']; onArg: (name: string, v: string | number) => void }) {
  const spec = SPECS[block.opcode];
  const parts: ReactNode[] = [];
  spec.template.split(/(\{\w+\})/).forEach((part, i) => {
    const name = part.match(/^\{(\w+)\}$/)?.[1];
    if (!name) { if (part.trim()) parts.push(<span key={i}>{part.trim()}</span>); return; }
    if (name === 'flag') { parts.push(<FlagIcon key={i} size={18} />, <span key={`${i}t`} className="visually-hidden">green flag</span>); return; }
    const arg = spec.args.find((a) => a.name === name)!;
    parts.push(
      <ArgInput key={i} spec={arg} value={block.args[name]} readOnly={mode !== 'canvas'}
        label={`${arg.label} for ${describeBlock(block)}`} onCommit={(v) => onArg(name, v)} />,
    );
  });
  return <>{parts}</>;
}

function BlockViewInner({ block, list, index = 0, count = 1, mode, onRunScript }: Props) {
  const { store, drag } = useServices();
  const spec = SPECS[block.opcode];
  const style = { '--block': colorOf(block.opcode) } as CSSProperties;
  const isC = spec.shape === 'c' || spec.shape === 'cap-c';
  const interactive = mode === 'canvas';

  const onArg = (name: string, value: string | number) =>
    store.edit((p) => setArg(p, block.id, name, value), `edit ${describeBlock(block)}`, { coalesceKey: `${block.id}.${name}` });

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return; // keys from inputs or nested blocks
    const label = `“${describeBlock(block)}”`;
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      const next = (e.currentTarget.nextElementSibling?.nextElementSibling ?? e.currentTarget.previousElementSibling?.previousElementSibling) as HTMLElement | null;
      store.edit((p) => removeBlock(p, block.id), `delete ${label}`, { toast: `Deleted ${label}` });
      requestAnimationFrame(() => (next?.isConnected ? next : document.querySelector<HTMLElement>('.canvas [data-block]'))?.focus());
    } else if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault();
      const before = store.project;
      store.edit((p) => shiftBlock(p, block.id, e.key === 'ArrowUp' ? -1 : 1), `move ${label}`);
      if (store.project === before) store.announce(`Can't move ${label} further`);
      else store.announce(`Moved ${label} ${e.key === 'ArrowUp' ? 'up' : 'down'}`);
      requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-block="${block.id}"]`)?.focus());
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const all = [...document.querySelectorAll<HTMLElement>('.canvas [data-block]')];
      all[all.indexOf(e.currentTarget) + (e.key === 'ArrowDown' ? 1 : -1)]?.focus();
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onRunScript?.();
    }
  };

  const shapeClass = `block block-${spec.shape} cat-${spec.category}`;
  const content = (
    <div className="block-row">
      <Label block={block} mode={mode} onArg={onArg} />
    </div>
  );

  if (!interactive) {
    return (
      <div className={shapeClass} style={style} aria-hidden={mode === 'ghost' || undefined}>
        {content}
        {isC && (
          <div className="c-mouth">
            <div className="stack">
              {block.body?.length ? block.body.map((child) => <BlockView key={child.id} block={child} mode={mode} />) : <div className="c-empty" />}
            </div>
          </div>
        )}
        {isC && <div className="c-foot" />}
      </div>
    );
  }

  return (
    <div
      className={shapeClass}
      style={style}
      data-block={block.id}
      tabIndex={0}
      role="group"
      aria-roledescription="block"
      aria-label={`${describeBlock(block)}, ${index + 1} of ${count}`}
      onKeyDown={onKeyDown}
      onPointerDown={(e) => drag.press(e, { kind: 'block', blockId: block.id }, () => onRunScript?.())}
    >
      {content}
      {isC && list && (
        <div className="c-mouth">
          <StackList blocks={block.body ?? []} list={{ ...list, parentId: block.id }} onRunScript={onRunScript} />
        </div>
      )}
      {isC && <div className="c-foot" />}
    </div>
  );
}

export const BlockView = memo(BlockViewInner);
