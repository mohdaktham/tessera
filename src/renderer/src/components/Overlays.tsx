import { useEffect, useState } from 'react';
import { CircleAlert, CircleCheck, Info, X } from 'lucide-react';
import { SHORTCUT_GROUPS, formatKeys } from '@/actions';
import { useWorkspace } from '@/store/workspace';
import { Dialog } from './Dialog';

export function Toasts() {
  const toasts = useWorkspace((state) => state.toasts);
  const dismiss = useWorkspace((state) => state.dismissToast);
  return (
    <div
      className="pointer-events-none fixed right-4 bottom-10 z-50 flex w-[360px] max-w-[calc(100vw-32px)] flex-col gap-2"
      aria-live="polite"
    >
      {toasts.map((toast) => {
        const Icon =
          toast.kind === 'error' ? CircleAlert : toast.kind === 'success' ? CircleCheck : Info;
        const tone =
          toast.kind === 'error'
            ? 'text-danger'
            : toast.kind === 'success'
              ? 'text-success'
              : 'text-accent';
        return (
          <div
            key={toast.id}
            role={toast.kind === 'error' ? 'alert' : 'status'}
            className="pop-in pointer-events-auto flex items-start gap-2.5 rounded-lg border border-line bg-surface py-2.5 pr-2 pl-3 shadow-pop"
          >
            <Icon size={16} className={`mt-px flex-none ${tone}`} />
            <p className="selectable min-w-0 flex-1 text-sm leading-snug break-words">
              {toast.message}
            </p>
            <button
              type="button"
              className="icon-btn -my-1 h-6 w-6"
              onClick={() => dismiss(toast.id)}
              aria-label="Dismiss"
            >
              <X size={13} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

export function ConfirmDialog() {
  const request = useWorkspace((state) => state.confirm);
  const close = useWorkspace((state) => state.closeConfirm);
  const [busy, setBusy] = useState(false);

  return (
    <Dialog open={request !== null} title={request?.title ?? ''} onClose={close}>
      <div className="px-4 pt-3 pb-4">
        <p className="text-sm leading-relaxed text-muted">{request?.body}</p>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className="btn" onClick={close}>
            Cancel
          </button>
          <button
            type="button"
            className={request?.destructive ? 'btn btn-danger' : 'btn btn-primary'}
            disabled={busy}
            onClick={async () => {
              if (!request) return;
              setBusy(true);
              try {
                await request.onConfirm();
              } finally {
                setBusy(false);
                close();
              }
            }}
          >
            {request?.confirmLabel}
          </button>
        </div>
      </div>
    </Dialog>
  );
}

export function PromptDialog() {
  const request = useWorkspace((state) => state.prompt);
  const close = useWorkspace((state) => state.closePrompt);
  const [value, setValue] = useState('');

  useEffect(() => {
    if (request) setValue(request.initialValue);
  }, [request]);

  const trimmed = value.trim();

  return (
    <Dialog open={request !== null} title={request?.title ?? ''} onClose={close} width={400}>
      <form
        className="px-4 pt-3 pb-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (!request || !trimmed) return;
          request.onSubmit(trimmed);
          close();
        }}
      >
        <label className="block text-sm font-medium" htmlFor="prompt-input">
          {request?.label}
        </label>
        <input
          id="prompt-input"
          className="field mt-1.5 h-8"
          value={value}
          maxLength={80}
          autoFocus
          onChange={(event) => setValue(event.target.value)}
        />
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className="btn" onClick={close}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={!trimmed}>
            {request?.confirmLabel}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

export function ShortcutsDialog() {
  const open = useWorkspace((state) => state.shortcutsOpen);
  const setOpen = useWorkspace((state) => state.setShortcutsOpen);
  return (
    <Dialog open={open} title="Keyboard shortcuts" onClose={() => setOpen(false)} width={560}>
      <div className="grid max-h-[70vh] grid-cols-1 gap-x-8 gap-y-5 overflow-y-auto px-4 py-4 sm:grid-cols-2">
        {SHORTCUT_GROUPS.map((group) => (
          <section key={group.title}>
            <h3 className="mb-1.5 text-xs font-semibold text-faint">{group.title}</h3>
            <ul className="space-y-1">
              {group.items.map((item) => (
                <li key={item.label} className="flex items-center justify-between gap-3 py-0.5">
                  <span className="text-sm">{item.label}</span>
                  <span className="flex gap-1">
                    {formatKeys(item.keys).map((key) => (
                      <kbd key={key} className="kbd">
                        {key}
                      </kbd>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </Dialog>
  );
}
