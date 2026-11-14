/** Messages exchanged between the UI thread and the database worker. */
import type { ImportFormat } from '../lib/fileFormats';
import type { PlanNode, QueryResult, TableInfo } from '../lib/types';
import type { ImportSummary } from './core';

export interface RequestMap {
  init: {
    input: { bytes: Uint8Array | null };
    output: { sqliteVersion: string; recovered: boolean };
  };
  run: { input: { sql: string; maxRows?: number }; output: QueryResult };
  schema: { input: undefined; output: TableInfo[] };
  explain: { input: { sql: string }; output: PlanNode[] };
  importFile: {
    input: { fileName: string; format: ImportFormat; buffer: ArrayBuffer };
    output: ImportSummary;
  };
  loadSample: { input: undefined; output: string[] };
  export: { input: undefined; output: Uint8Array };
  replace: { input: { bytes: Uint8Array | null }; output: null };
}

export type RequestKind = keyof RequestMap;

export type WorkerRequest = {
  [K in RequestKind]: { id: number; kind: K; input: RequestMap[K]['input'] };
}[RequestKind];

export type WorkerResponse =
  | { id: number; type: 'result'; output: unknown }
  | { id: number; type: 'error'; message: string }
  | { id: number; type: 'progress'; done: number; total: number; label: string };
