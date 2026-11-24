import { useEffect, useState } from 'react';
import type { ArgSpec } from '../../model/blocks';
import { coerceArg } from '../../model/blocks';
import type { ArgValue } from '../../model/types';

interface Props {
  spec: ArgSpec;
  value: ArgValue;
  /** Accessible name, e.g. "steps for move 10 steps". */
  label: string;
  readOnly?: boolean;
  onCommit?: (value: ArgValue) => void;
}

/**
 * An inline block input. It keeps a local draft so you can type "-" or "1." on the way to
 * a number; valid values are committed as you type (merged into one undo step), and the
 * field is cleaned up on blur.
 */
export function ArgInput({ spec, value, label, readOnly, onCommit }: Props) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);

  const commit = (raw: string) => {
    const next = coerceArg(spec, raw);
    if (next !== value) onCommit?.(next);
  };

  if (readOnly) return <span className={`arg arg-${spec.type}`}>{String(value)}</span>;

  return (
    <input
      className={`arg arg-${spec.type}`}
      value={draft}
      aria-label={label}
      inputMode={spec.type === 'number' ? 'decimal' : 'text'}
      style={{ width: `calc(${Math.max(spec.type === 'text' ? 3 : 1, draft.length)}ch + 22px)` }}
      onChange={(e) => {
        setDraft(e.target.value);
        if (spec.type === 'text' || /^-?\d+(\.\d+)?$/.test(e.target.value.trim())) commit(e.target.value);
      }}
      onBlur={() => { commit(draft); setDraft(String(coerceArg(spec, draft))); }}
      onKeyDown={(e) => {
        e.stopPropagation(); // typing never triggers block shortcuts
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') { setDraft(String(value)); (e.target as HTMLInputElement).blur(); }
      }}
    />
  );
}
