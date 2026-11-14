import { app } from 'electron';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const workspacePath = (): string => join(app.getPath('userData'), 'workspace.sqlite');

/** Reads the persisted SQLite workspace, or null on first launch. */
export async function loadWorkspace(): Promise<Uint8Array | null> {
  try {
    const buffer = await readFile(workspacePath());
    return new Uint8Array(buffer);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

let writeQueue: Promise<void> = Promise.resolve();

/**
 * Writes the workspace atomically: the bytes land in a temporary file that is
 * then renamed over the real one, so a crash mid-write never leaves a
 * half-written database. Writes are queued so they cannot interleave.
 */
export function saveWorkspace(bytes: Uint8Array): Promise<void> {
  const run = async (): Promise<void> => {
    const target = workspacePath();
    const temporary = `${target}.tmp`;
    await mkdir(dirname(target), { recursive: true });
    await writeFile(temporary, bytes);
    await rename(temporary, target);
  };
  writeQueue = writeQueue.then(run, run);
  return writeQueue;
}
