import type { ReactNode } from 'react';

export function ChartMessage({ children }: { children: ReactNode }) {
  return (
    <div className="grid h-full place-items-center px-6 text-center text-sm leading-relaxed text-muted">
      {children}
    </div>
  );
}
