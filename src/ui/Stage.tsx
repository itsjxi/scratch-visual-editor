import { useRef, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';
import { useEditor } from '../editor/store';
import { STAGE } from '../model/project';
import CatSprite from './CatSprite';
import { useServices } from './context';
import { useRuntime } from './hooks';

const pct = (x: number, y: number) => ({ left: `${((x + STAGE.width / 2) / STAGE.width) * 100}%`, top: `${((STAGE.height / 2 - y) / STAGE.height) * 100}%` });

/** Scratch's 480×360 stage, scaled to fit. Sprites can be dragged, clicked and moved with arrow keys. */
export function Stage() {
  const { store, runtime, ensureLoop } = useServices();
  const project = useEditor(store, (s) => s.history.present);
  const selected = useEditor(store, (s) => s.selectedSpriteId);
  const snapshot = useRuntime();
  const stageRef = useRef<HTMLDivElement>(null);

  const toStage = (clientX: number, clientY: number) => {
    const r = stageRef.current!.getBoundingClientRect();
    return { x: ((clientX - r.left) / r.width) * STAGE.width - STAGE.width / 2, y: STAGE.height / 2 - ((clientY - r.top) / r.height) * STAGE.height };
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>, spriteId: string) => {
    if (e.button !== 0) return;
    e.preventDefault();
    store.selectSprite(spriteId);
    const start = { x: e.clientX, y: e.clientY };
    const pose = snapshot.sprites[spriteId];
    const grab = toStage(e.clientX, e.clientY);
    const offset = { x: grab.x - pose.x, y: grab.y - pose.y };
    let moved = false;
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    const move = (ev: globalThis.PointerEvent) => {
      if (!moved && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < 4) return;
      moved = true;
      const p = toStage(ev.clientX, ev.clientY);
      runtime.setPose(spriteId, { x: Math.round(p.x - offset.x), y: Math.round(p.y - offset.y) });
    };
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      if (!moved) { runtime.clickSprite(store.project, spriteId); ensureLoop(); }
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>, spriteId: string) => {
    const step = e.shiftKey ? 1 : 10;
    const pose = snapshot.sprites[spriteId];
    const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
    if (moves[e.key]) {
      e.preventDefault();
      runtime.setPose(spriteId, { x: pose.x + moves[e.key][0], y: pose.y + moves[e.key][1] });
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      runtime.clickSprite(store.project, spriteId);
      ensureLoop();
    }
  };

  return (
    <div className="stage" ref={stageRef} aria-label="Stage" role="region">
      {project.sprites.map((sprite) => {
        const s = snapshot.sprites[sprite.id];
        if (!s) return null;
        const label = `${sprite.name}, x ${Math.round(s.x)}, y ${Math.round(s.y)}, direction ${Math.round(s.direction)}`;
        return (
          <div key={sprite.id} className="stage-item" style={pct(s.x, s.y)}>
            {s.bubble && (
              <div className={`bubble bubble-${s.bubble.kind}`} role="status">{s.bubble.text}</div>
            )}
            <div
              className={`sprite${sprite.id === selected ? ' is-selected' : ''}`}
              role="button"
              tabIndex={0}
              aria-label={label}
              aria-pressed={sprite.id === selected}
              style={{ transform: `rotate(${s.direction - 90}deg)` } as CSSProperties}
              onPointerDown={(e) => onPointerDown(e, sprite.id)}
              onKeyDown={(e) => onKeyDown(e, sprite.id)}
              onFocus={() => store.selectSprite(sprite.id)}
            >
              <CatSprite size={64} style={{ filter: sprite.hue ? `hue-rotate(${sprite.hue}deg)` : undefined }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
