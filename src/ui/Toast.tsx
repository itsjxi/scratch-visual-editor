import { useEffect } from 'react';
import { useEditor } from '../editor/store';
import { useServices } from './context';
import { CloseIcon } from './icons';

const VISIBLE_MS = 5000;

/**
 * Visible feedback for things that happen out of sight: deletions (with Undo), file
 * errors and collisions. Screen readers already hear these through the live region, so
 * the toast's text is hidden from them to avoid saying it twice; its buttons stay reachable.
 */
export function Toast() {
  const { store } = useServices();
  const toast = useEditor(store, (s) => s.toast);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => store.dismissToast(), toast.tone === 'error' ? VISIBLE_MS * 2 : VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [toast, store]);

  if (!toast) return null;
  return (
    <div className={`toast toast-${toast.tone}`}>
      <span aria-hidden="true">{toast.text}</span>
      {toast.undo && (
        <button type="button" className="toast-action" onClick={() => { store.undo(); store.dismissToast(); }}>Undo</button>
      )}
      <button type="button" className="toast-close" aria-label="Dismiss message" onClick={() => store.dismissToast()}><CloseIcon /></button>
    </div>
  );
}
