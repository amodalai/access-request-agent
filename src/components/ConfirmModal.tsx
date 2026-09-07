import { useEffect, useId, useRef, type ReactNode } from "react";

export function ConfirmModal({
  title,
  confirmLabel,
  busy,
  disabled,
  error,
  onConfirm,
  onCancel,
  children,
}: {
  title: string;
  confirmLabel: string;
  busy: boolean;
  disabled?: boolean;
  error?: string;
  onConfirm: () => void;
  onCancel: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const dialog = ref.current!;
    dialog.showModal();
    return () => {
      dialog.close();
      previous?.focus();
    };
  }, []);

  return (
    <dialog
      ref={ref}
      className="modal-overlay"
      aria-labelledby={titleId}
      aria-busy={busy}
      onCancel={(e) => { e.preventDefault(); if (!busy) onCancel(); }}
      onClick={(e) => { if (e.target === e.currentTarget && !busy) onCancel(); }}
    >
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2 id={titleId} className="modal__title">{title}</h2>
        {children}
        {error ? <div className="banner error" role="alert">{error}</div> : null}
        <div className="modal__actions">
          <button className="btn btn--ghost" disabled={busy} onClick={onCancel}>
            Cancel
          </button>
          <button className="btn" disabled={busy || disabled} onClick={onConfirm}>
            {busy ? "Saving…" : confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  );
}
