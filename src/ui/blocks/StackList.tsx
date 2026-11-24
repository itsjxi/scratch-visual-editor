import { Fragment } from 'react';
import type { Block, ListRef } from '../../model/types';
import { BlockView } from './BlockView';
import { useDropIndex } from '../hooks';

interface Props {
  blocks: Block[];
  list: ListRef;
  onRunScript?: () => void;
}

/**
 * A list of blocks with an invisible slot marker before, between and after them. The
 * drag controller measures these markers to find where a dropped block would go.
 */
export function StackList({ blocks, list, onRunScript }: Props) {
  const dropIndex = useDropIndex(list);
  const isTarget = (index: number) => index === dropIndex;

  const marker = (index: number) => (
    <div
      className={`slot${isTarget(index) ? ' is-target' : ''}`}
      data-slot=""
      data-sprite={list.spriteId}
      data-script={list.scriptId}
      data-parent={list.parentId ?? ''}
      data-index={index}
    />
  );

  return (
    <div className="stack">
      {blocks.map((block, i) => (
        <Fragment key={block.id}>
          {marker(i)}
          <BlockView block={block} list={list} index={i} count={blocks.length} mode="canvas" onRunScript={onRunScript} />
        </Fragment>
      ))}
      {marker(blocks.length)}
      {blocks.length === 0 && <div className="c-empty" />}
    </div>
  );
}
