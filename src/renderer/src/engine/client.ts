/**
 * Promise-based client for the database worker. Each call gets an id; the
 * worker's reply resolves the matching promise. Long operations report
 * progress through an optional callback.
 */
import type { RequestKind, RequestMap, WorkerRequest, WorkerResponse } from './protocol';

export type ProgressListener = (done: number, total: number, label: string) => void;

export class EngineCancelledError extends Error {
  constructor() {
    super('The query was stopped.');
    this.name = 'EngineCancelledError';
  }
}

interface Pending {
  resolve: (value: never) => void;
  reject: (reason: Error) => void;
  onProgress?: ProgressListener;
}

export class EngineClient {
  private worker: Worker;
  private nextId = 1;
  private readonly pending = new Map<number, Pending>();

  constructor() {
    this.worker = this.spawn();
  }

  private spawn(): Worker {
    const worker = new Worker(new URL('./db.worker.ts', import.meta.url), {
      type: 'module',
      name: 'tessera-db',
    });
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => this.receive(event.data);
    worker.onerror = (event) =>
      this.failAll(new Error(event.message || 'The database worker crashed.'));
    return worker;
  }

  private receive(message: WorkerResponse): void {
    const entry = this.pending.get(message.id);
    if (!entry) return;
    if (message.type === 'progress') {
      entry.onProgress?.(message.done, message.total, message.label);
      return;
    }
    this.pending.delete(message.id);
    if (message.type === 'result') entry.resolve(message.output as never);
    else entry.reject(new Error(message.message));
  }

  private failAll(error: Error): void {
    for (const entry of this.pending.values()) entry.reject(error);
    this.pending.clear();
  }

  call<K extends RequestKind>(
    kind: K,
    input: RequestMap[K]['input'],
    options: { onProgress?: ProgressListener; transfer?: Transferable[] } = {},
  ): Promise<RequestMap[K]['output']> {
    const id = this.nextId++;
    return new Promise<RequestMap[K]['output']>((resolve, reject) => {
      this.pending.set(id, { resolve, reject, onProgress: options.onProgress });
      this.worker.postMessage({ id, kind, input } as WorkerRequest, options.transfer ?? []);
    });
  }

  /**
   * SQLite runs synchronously inside the worker, so the only way to stop a
   * runaway query is to terminate the worker. Callers then start a fresh one
   * from the last saved workspace.
   */
  restart(): void {
    this.worker.terminate();
    this.failAll(new EngineCancelledError());
    this.worker = this.spawn();
  }
}
