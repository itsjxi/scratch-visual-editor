import { createContext, useContext } from 'react';
import type { EditorStore } from '../editor/store';
import type { Runtime } from '../runtime/runtime';
import type { DragController } from './drag';

export interface EditorServices {
  store: EditorStore;
  runtime: Runtime;
  /** Start the animation-frame loop if it isn't running. */
  ensureLoop: () => void;
  drag: DragController;
}

export const EditorContext = createContext<EditorServices | null>(null);

export function useServices(): EditorServices {
  const services = useContext(EditorContext);
  if (!services) throw new Error('useServices must be used inside <EditorContext.Provider>');
  return services;
}
