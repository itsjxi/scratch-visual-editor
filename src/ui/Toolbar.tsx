import { useRef } from 'react';
import { useEditor } from '../editor/store';
import { exampleProject, validatePoses, validateProject, ProjectError } from '../model/project';
import { useServices } from './context';
import { useRuntime } from './hooks';
import { DownloadIcon, FlagIcon, RedoIcon, ResetIcon, StopIcon, UndoIcon, UploadIcon } from './icons';

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
const mod = isMac ? '⌘' : 'Ctrl';

export function Toolbar() {
  const { store, runtime, ensureLoop } = useServices();
  const canUndo = useEditor(store, (s) => s.history.past.length > 0);
  const canRedo = useEditor(store, (s) => s.history.future.length > 0);
  const { running } = useRuntime();
  const fileInput = useRef<HTMLInputElement>(null);

  const run = () => {
    runtime.greenFlag(store.project);
    ensureLoop();
    store.announce('Running');
  };

  const stop = () => {
    runtime.stop();
    store.announce('Stopped');
  };

  const exportFile = () => {
    const data = JSON.stringify({ project: store.project, poses: runtime.poses() }, null, 2);
    const url = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: 'project.sve.json' });
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    store.announce('Project downloaded');
  };

  const importFile = async (file: File) => {
    try {
      if (file.size > 2_000_000) throw new ProjectError('That file is too large to be a project');
      const data = JSON.parse(await file.text());
      const project = validateProject(data?.project ?? data); // our export wraps it; a bare project is fine too
      runtime.stop();
      store.replace(project, `open ${file.name}`);
      const poses = validatePoses(data.poses, project);
      Object.entries(poses).forEach(([id, pose]) => runtime.setPose(id, pose));
    } catch (err) {
      store.notify(err instanceof ProjectError ? `Couldn’t open the file: ${err.message}` : 'Couldn’t open the file: it isn’t valid JSON', { tone: 'error' });
    }
  };

  const reset = () => {
    const { project, poses } = exampleProject();
    runtime.stop();
    store.replace(project, 'load the example project');
    Object.entries(poses).forEach(([id, pose]) => runtime.setPose(id, pose));
  };

  return (
    <header className="toolbar">
      <div className="brand">
        <span className="brand-mark" aria-hidden="true" />
        <div>
          <h1>Scratch Visual Editor</h1>
          <p>Build with blocks, run with the flag</p>
        </div>
      </div>

      <div className="run-controls" role="group" aria-label="Run">
        <button type="button" className={`btn btn-run${running ? ' is-running' : ''}`} onClick={run} aria-label="Run (green flag)">
          <FlagIcon size={18} onColor /><span>Run</span>
        </button>
        <button type="button" className="btn btn-stop" onClick={stop} disabled={!running} aria-label="Stop">
          <StopIcon /><span>Stop</span>
        </button>
      </div>

      <div className="toolbar-actions">
        <div className="button-group" role="group" aria-label="History">
          <button type="button" className="icon-button" onClick={() => store.undo()} disabled={!canUndo} aria-label={`Undo (${mod}+Z)`} title={`Undo (${mod}+Z)`}><UndoIcon /></button>
          <button type="button" className="icon-button" onClick={() => store.redo()} disabled={!canRedo} aria-label={`Redo (${mod}+Shift+Z)`} title={`Redo (${mod}+Shift+Z)`}><RedoIcon /></button>
        </div>
        <div className="button-group" role="group" aria-label="Project">
          <button type="button" className="icon-button" onClick={() => fileInput.current?.click()} aria-label="Open a project file" title="Open"><UploadIcon /></button>
          <button type="button" className="icon-button" onClick={exportFile} aria-label="Download project" title="Download"><DownloadIcon /></button>
          <button type="button" className="icon-button" onClick={reset} aria-label="Load the example project" title="Example"><ResetIcon /></button>
        </div>
        <input ref={fileInput} type="file" accept=".json,application/json" hidden
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void importFile(f); e.target.value = ''; }} />
      </div>
    </header>
  );
}
