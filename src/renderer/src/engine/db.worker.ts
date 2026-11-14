/// <reference lib="webworker" />
/**
 * Database worker. SQLite runs here, off the UI thread, so a heavy query or a
 * large import never freezes the interface.
 */
import initSqlJs from 'sql.js';
import wasmUrl from 'sql.js/dist/sql-wasm-browser.wasm?url';
import { parseFile } from '../lib/importers';
import { tableNameFromFile } from '../lib/inferTypes';
import { Engine, type ProgressHandler } from './core';
import type { RequestKind, RequestMap, WorkerRequest, WorkerResponse } from './protocol';

const scope = self as unknown as DedicatedWorkerGlobalScope;
let engine: Engine | null = null;

const post = (message: WorkerResponse, transfer: Transferable[] = []): void =>
  scope.postMessage(message, transfer);

function requireEngine(): Engine {
  if (!engine) throw new Error('The database engine has not started yet.');
  return engine;
}

type Handlers = {
  [K in RequestKind]: (
    input: RequestMap[K]['input'],
    progress: ProgressHandler,
  ) => Promise<RequestMap[K]['output']> | RequestMap[K]['output'];
};

const handlers: Handlers = {
  async init({ bytes }) {
    const sql = await initSqlJs({ locateFile: () => wasmUrl });
    let recovered = false;
    try {
      engine = new Engine(sql, bytes);
    } catch {
      // A corrupt workspace file should not brick the app: start empty and say so.
      engine = new Engine(sql);
      recovered = bytes !== null;
    }
    return { sqliteVersion: engine.sqliteVersion, recovered };
  },
  run: ({ sql, maxRows }) => requireEngine().run(sql, maxRows),
  schema: () => requireEngine().schema(),
  explain: ({ sql }) => requireEngine().explain(sql),
  importFile({ fileName, format, buffer }, progress) {
    progress(0, 1, 'Reading file');
    const text = new TextDecoder('utf-8').decode(buffer);
    const parsed = parseFile(text, format);
    return requireEngine().importTable(
      tableNameFromFile(fileName),
      parsed.headers,
      parsed.rows,
      progress,
    );
  },
  loadSample: (_input, progress) => requireEngine().loadSample(progress),
  export: () => requireEngine().export(),
  replace({ bytes }) {
    requireEngine().replace(bytes);
    return null;
  },
};

scope.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const { id, kind, input } = event.data;
  const progress: ProgressHandler = (done, total, label) =>
    post({ id, type: 'progress', done, total, label });
  try {
    const handler = handlers[kind] as (input: unknown, progress: ProgressHandler) => unknown;
    const output = await handler(input, progress);
    const transfer = output instanceof Uint8Array ? [output.buffer as ArrayBuffer] : [];
    post({ id, type: 'result', output }, transfer);
  } catch (error) {
    post({ id, type: 'error', message: error instanceof Error ? error.message : String(error) });
  }
};
