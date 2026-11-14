import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';

interface DialogProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  width?: number;
}

/**
 * A modal built on the native <dialog> element, which provides the focus
 * trap, Escape handling and inert background for free.
 */
export function Dialog({ open, title, onClose, children, width = 440 }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  if (!open) return null;

  return (
    <dialog
      ref={ref}
      aria-label={title}
      onClose={onClose}
      onClick={(event) => {
        // A click on the backdrop lands on the dialog element itself.
        if (event.target === event.currentTarget) onClose();
      }}
      className="pop-in m-auto rounded-xl border border-line bg-surface p-0 shadow-pop"
      style={{ width, maxWidth: 'calc(100vw - 32px)' }}
    >
      <div className="flex items-center justify-between border-b border-line-soft py-2.5 pr-2.5 pl-4">
        <h2 className="text-base font-semibold">{title}</h2>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
          <X size={15} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
