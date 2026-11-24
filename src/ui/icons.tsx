const base = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true, focusable: false };

/** Green flag. `onColor` draws it in white for use on the green Run button. */
export const FlagIcon = ({ size = 18, onColor = false }: { size?: number; onColor?: boolean }) => (
  <svg {...base} width={size} height={size} viewBox="0 0 24 24" stroke="none">
    <path d="M5 21V4" stroke={onColor ? '#fff' : '#1f7a3a'} strokeWidth="2.2" strokeLinecap="round" />
    <path d="M6 4.5c3-1.6 5.4 1.4 8.4 0 1.5-.7 2.8-.8 4.1-.4v9.4c-1.3-.4-2.6-.3-4.1.4-3 1.4-5.4-1.6-8.4 0z" fill={onColor ? '#fff' : '#2fb35a'} />
  </svg>
);
export const StopIcon = () => (<svg {...base} stroke="none"><rect x="6" y="6" width="12" height="12" rx="2.5" fill="#e2483d" /></svg>);
export const UndoIcon = () => (<svg {...base}><path d="M9 14 4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" /></svg>);
export const RedoIcon = () => (<svg {...base}><path d="m15 14 5-5-5-5" /><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" /></svg>);
export const PlusIcon = () => (<svg {...base}><path d="M12 5v14M5 12h14" /></svg>);
export const CloseIcon = () => (<svg {...base} width={14} height={14}><path d="M6 6l12 12M18 6 6 18" /></svg>);
export const DownloadIcon = () => (<svg {...base}><path d="M12 4v11M7 10l5 5 5-5M5 20h14" /></svg>);
export const UploadIcon = () => (<svg {...base}><path d="M12 20V9M7 14l5-5 5 5M5 4h14" /></svg>);
export const ResetIcon = () => (<svg {...base}><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /></svg>);
export const TrashIcon = () => (<svg {...base}><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></svg>);
