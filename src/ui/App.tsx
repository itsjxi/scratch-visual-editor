import { useEffect, useMemo, useState } from 'react';
import { EditorStore, STORAGE_KEY, loadSaved, useEditor } from '../editor/store';
import { Runtime } from '../runtime/runtime';
import { DragController } from './drag';
import { EditorContext, type EditorServices } from './context';
import { Toolbar } from './Toolbar';
import { Palette } from './Palette';
import { Canvas } from './Canvas';
import { Stage } from './Stage';
import { SpritePanel } from './SpritePanel';
import { Toast } from './Toast';

function createServices(): EditorServices {
  const saved = loadSaved();
  const store = new EditorStore(saved.project);
  const name = (id: string) => store.project.sprites.find((s) => s.id === id)?.name ?? 'A sprite';
  const runtime = new Runtime(saved.poses, {
    onCollision: (a, b) => store.notify(`${name(a)} and ${name(b)} collided and swapped scripts`),
  });
  let frame = 0;
  const tick = () => {
    runtime.step(performance.now());
    frame = runtime.running ? requestAnimationFrame(tick) : 0;
  };
  const ensureLoop = () => {
    if (!frame) frame = requestAnimationFrame(tick);
  };
  return { store, runtime, ensureLoop, drag: new DragController(store) };
}

export function App({ services: injected }: { services?: EditorServices }) {
  const services = useMemo(() => injected ?? createServices(), [injected]);
  const { store, runtime } = services;
  const project = useEditor(store, (s) => s.history.present);
  const announcement = useEditor(store, (s) => s.announcement);
  const [swap, setSwap] = useState(runtime.swapOnCollision);

  // Keep runtime sprites in step with the project (add, delete, undo).
  useEffect(() => {
    runtime.syncSprites(project, (i) => ({ x: -150 + ((i * 90) % 300), y: ((i * 70) % 200) - 100, direction: 90 }));
  }, [project, runtime]);

  // Autosave the project and sprite positions.
  useEffect(() => {
    let timer = 0;
    const save = () => {
      clearTimeout(timer);
      timer = window.setTimeout(() => {
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify({ project: store.project, poses: runtime.poses() }));
        } catch { /* storage full or blocked */ }
      }, 400);
    };
    const offStore = store.subscribe(save);
    const offRuntime = runtime.subscribe(() => { if (!runtime.running) save(); });
    return () => { offStore(); offRuntime(); clearTimeout(timer); };
  }, [store, runtime]);

  // Global undo/redo, except while typing (inputs keep their own undo).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement).closest?.('input, textarea');
      if (typing || !(e.metaKey || e.ctrlKey)) return;
      const key = e.key.toLowerCase();
      if (key === 'z' && !e.shiftKey) { e.preventDefault(); store.undo(); }
      else if ((key === 'z' && e.shiftKey) || key === 'y') { e.preventDefault(); store.redo(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [store]);

  return (
    <EditorContext.Provider value={services}>
      <div className="app">
        <Toolbar />
        <main className="workspace">
          <Palette />
          <Canvas />
          <aside className="side" aria-label="Stage and sprites">
            <Stage />
            <label className="toggle">
              <input type="checkbox" checked={swap} onChange={(e) => { runtime.swapOnCollision = e.target.checked; setSwap(e.target.checked); }} />
              <span className="toggle-track" aria-hidden="true" />
              <span>Swap scripts when sprites collide</span>
            </label>
            <SpritePanel />
          </aside>
        </main>
        <Toast />
        {/* The region stays mounted; a zero-width space makes a repeated message count as new text. */}
        <div className="visually-hidden" aria-live="polite" aria-atomic="true">{announcement.text}{announcement.n % 2 ? '\u200b' : ''}</div>
      </div>
    </EditorContext.Provider>
  );
}
