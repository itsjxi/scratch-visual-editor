import { useEditor } from '../editor/store';
import { getSprite } from '../model/tree';
import { StackList } from './blocks/StackList';
import { BlockView } from './blocks/BlockView';
import { useServices } from './context';
import { useDragState, useRuntime } from './hooks';
import type { Script } from '../model/types';

export function Canvas() {
  const { store, runtime, ensureLoop } = useServices();
  const project = useEditor(store, (s) => s.history.present);
  const spriteId = useEditor(store, (s) => s.selectedSpriteId);
  const drag = useDragState();
  const { activeScripts } = useRuntime();
  // While dragging, show the project without the dragged blocks.
  const shown = drag ? drag.base : project;
  const sprite = getSprite(shown, spriteId);

  const run = (script: Script) => {
    runtime.toggleScript(spriteId, script);
    ensureLoop();
  };

  return (
    <section className="canvas" aria-label={`Scripts for ${sprite?.name ?? 'sprite'}`} data-drop="canvas">
      <div className="canvas-content">
        {sprite?.scripts.map((script) => (
          <div
            key={script.id}
            className={`script${activeScripts.includes(script.id) ? ' is-running' : ''}`}
            style={{ left: script.x, top: script.y }}
          >
            <StackList blocks={script.blocks} list={{ spriteId, scriptId: script.id, parentId: null }} onRunScript={() => run(script)} />
          </div>
        ))}
        {sprite && sprite.scripts.length === 0 && !drag && (
          <div className="canvas-empty">
            <p className="canvas-empty-title">No scripts yet</p>
            <p>Drag a block here from the left, or select one and press Enter. Start with <strong>when green flag clicked</strong>.</p>
          </div>
        )}
      </div>
      {drag && (
        <div className="ghost" style={{ left: drag.pointer.x - drag.grab.x, top: drag.pointer.y - drag.grab.y }} aria-hidden="true">
          {drag.blocks.map((b) => <BlockView key={b.id} block={b} mode="ghost" />)}
        </div>
      )}
    </section>
  );
}
