import { useSyncExternalStore } from 'react';
import type { Pose, Project } from '../model/types';
import { commit, createHistory, redo, undo, type History } from './history';
import { exampleProject, validatePoses, validateProject } from '../model/project';

export const STORAGE_KEY = 'scratch-visual-editor:v2';

export interface EditorState {
  history: History<Project>;
  selectedSpriteId: string;
  /** Text for the polite live region. `n` changes so repeating a message is re-read. */
  announcement: { text: string; n: number };
  /** A visible message; `undo` adds an Undo button (after deletions). */
  toast: { text: string; tone: 'info' | 'error'; undo: boolean; n: number } | null;
}

export interface SavedFile {
  project: Project;
  poses: Record<string, Pose>;
}

/** Load the autosaved project, falling back to the example if it's missing or invalid. */
export function loadSaved(storage: Pick<Storage, 'getItem'> = localStorage): SavedFile {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      const project = validateProject(data.project);
      return { project, poses: validatePoses(data.poses, project) };
    }
  } catch {
    /* corrupt or old save: start fresh */
  }
  return exampleProject();
}

/**
 * A tiny external store (the same idea as Zustand): components subscribe with
 * useSyncExternalStore and re-render only when the slice they select changes.
 */
export class EditorStore {
  private state: EditorState;
  private listeners = new Set<() => void>();

  constructor(project: Project) {
    this.state = { history: createHistory(project), selectedSpriteId: project.sprites[0].id, announcement: { text: '', n: 0 }, toast: null };
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getState = () => this.state;

  get project() {
    return this.state.history.present;
  }

  private set(next: Partial<EditorState>) {
    this.state = { ...this.state, ...next };
    this.listeners.forEach((l) => l());
  }

  /** Apply an edit as one undoable step. */
  edit(fn: (p: Project) => Project, label: string, options: { coalesceKey?: string; announce?: string; toast?: string } = {}) {
    const next = fn(this.project);
    if (next === this.project) return;
    const history = commit(this.state.history, next, label, { coalesceKey: options.coalesceKey ?? null });
    this.set({ history, ...this.fixSelection(next) });
    if (options.toast) this.notify(options.toast, { undo: true });
    if (options.announce) this.announce(options.announce);
  }

  /** Show a message on screen (and announce it). */
  notify(text: string, { tone = 'info' as 'info' | 'error', undo = false } = {}) {
    this.set({ toast: { text, tone, undo, n: (this.state.toast?.n ?? 0) + 1 } });
    this.announce(undo ? `${text}. Press Ctrl+Z to undo.` : text);
  }

  dismissToast() {
    if (this.state.toast) this.set({ toast: null });
  }

  /** Replace the whole project (import, reset). Undoable too. */
  replace(project: Project, label: string) {
    this.set({ history: commit(this.state.history, project, label), selectedSpriteId: project.sprites[0].id });
    this.announce(label);
  }

  undo() {
    const result = undo(this.state.history);
    if (!result) return this.announce('Nothing to undo');
    this.set({ history: result.history, ...this.fixSelection(result.history.present) });
    this.announce(`Undid ${result.label}`);
  }

  redo() {
    const result = redo(this.state.history);
    if (!result) return this.announce('Nothing to redo');
    this.set({ history: result.history, ...this.fixSelection(result.history.present) });
    this.announce(`Redid ${result.label}`);
  }

  selectSprite(id: string) {
    if (id !== this.state.selectedSpriteId) this.set({ selectedSpriteId: id });
  }

  announce(text: string) {
    this.set({ announcement: { text, n: this.state.announcement.n + 1 } });
  }

  /** After undo or delete the selected sprite may be gone. */
  private fixSelection(project: Project): Partial<EditorState> {
    return project.sprites.some((s) => s.id === this.state.selectedSpriteId) ? {} : { selectedSpriteId: project.sprites[0].id };
  }
}

export function useEditor<T>(store: EditorStore, select: (s: EditorState) => T): T {
  return useSyncExternalStore(store.subscribe, () => select(store.getState()));
}
