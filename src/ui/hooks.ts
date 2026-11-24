import { useSyncExternalStore } from 'react';
import { useServices } from './context';
import type { RuntimeSnapshot } from '../runtime/runtime';
import type { DragState } from './drag';
import type { ListRef } from '../model/types';

export function useDragState(): DragState | null {
  const { drag } = useServices();
  return useSyncExternalStore(drag.subscribe, drag.getSnapshot);
}

export function useRuntime(): RuntimeSnapshot {
  const { runtime } = useServices();
  return useSyncExternalStore(runtime.subscribe, runtime.getSnapshot);
}

/**
 * The slot index being hovered in this list, or -1. Returns a number, so while dragging
 * only the list under the pointer re-renders, not every list on the canvas.
 */
export function useDropIndex(list: ListRef): number {
  const { drag } = useServices();
  return useSyncExternalStore(drag.subscribe, () => {
    const target = drag.getSnapshot()?.target;
    return target?.kind === 'slot' && target.slot.scriptId === list.scriptId && target.slot.parentId === list.parentId
      ? target.slot.index : -1;
  });
}
