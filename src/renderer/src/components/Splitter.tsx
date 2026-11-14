import { useCallback, useRef, type PointerEvent as ReactPointerEvent } from 'react';

interface SplitterProps {
  /** 'vertical' is a vertical bar that resizes width; 'horizontal' resizes height. */
  orientation: 'vertical' | 'horizontal';
  label: string;
  /** Called continuously with the pointer position along the resize axis, in viewport pixels. */
  onResize: (position: number) => void;
  /** Called when arrow keys are used; delta is in pixels. */
  onNudge: (delta: number) => void;
}

/** A draggable, keyboard-accessible divider between two panes. */
export function Splitter({ orientation, label, onResize, onNudge }: SplitterProps) {
  const dragging = useRef(false);
  const vertical = orientation === 'vertical';

  const onPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    dragging.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  }, []);

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (dragging.current) onResize(vertical ? event.clientX : event.clientY);
    },
    [onResize, vertical],
  );

  const onPointerUp = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    dragging.current = false;
    event.currentTarget.releasePointerCapture(event.pointerId);
  }, []);

  return (
    <div
      role="separator"
      tabIndex={0}
      aria-label={label}
      aria-orientation={vertical ? 'vertical' : 'horizontal'}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onKeyDown={(event) => {
        const step = event.shiftKey ? 40 : 12;
        if (event.key === (vertical ? 'ArrowLeft' : 'ArrowUp')) onNudge(-step);
        else if (event.key === (vertical ? 'ArrowRight' : 'ArrowDown')) onNudge(step);
        else return;
        event.preventDefault();
      }}
      className={`group relative z-10 flex-none touch-none bg-line-soft transition-colors hover:bg-accent focus-visible:bg-accent ${
        vertical ? 'w-px cursor-col-resize' : 'h-px cursor-row-resize'
      }`}
    >
      {/* A wider invisible hit area so the 1px line is easy to grab. */}
      <span className={`absolute ${vertical ? '-inset-x-1 inset-y-0' : '-inset-y-1 inset-x-0'}`} />
    </div>
  );
}
