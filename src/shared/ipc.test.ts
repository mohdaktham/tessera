// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  ExternalUrlSchema,
  FileSaveSchema,
  MenuActionSchema,
  ThemeSchema,
  WorkspaceSaveSchema,
} from './ipc';

describe('IPC payload validation', () => {
  it('accepts a well-formed save request', () => {
    const request = {
      defaultName: 'result.csv',
      filters: [{ name: 'CSV', extensions: ['csv'] }],
      data: 'a,b\r\n',
    };
    expect(FileSaveSchema.parse(request)).toEqual(request);
    expect(FileSaveSchema.safeParse({ ...request, data: new Uint8Array([1, 2, 3]) }).success).toBe(
      true,
    );
  });

  it('rejects file names that try to smuggle in a path', () => {
    const base = { filters: [], data: '' };
    expect(FileSaveSchema.safeParse({ ...base, defaultName: '../../.bashrc' }).success).toBe(false);
    expect(
      FileSaveSchema.safeParse({ ...base, defaultName: 'C:\\Windows\\evil.dll' }).success,
    ).toBe(false);
    expect(FileSaveSchema.safeParse({ ...base, defaultName: '' }).success).toBe(false);
  });

  it('rejects payloads of the wrong type', () => {
    expect(FileSaveSchema.safeParse({ defaultName: 'x.csv', filters: [], data: 42 }).success).toBe(
      false,
    );
    expect(WorkspaceSaveSchema.safeParse('not bytes').success).toBe(false);
    expect(WorkspaceSaveSchema.safeParse(new Uint8Array(8)).success).toBe(true);
    expect(ThemeSchema.safeParse('neon').success).toBe(false);
    expect(MenuActionSchema.safeParse('format-disk').success).toBe(false);
  });

  it('only opens https links externally', () => {
    expect(ExternalUrlSchema.safeParse('https://github.com/').success).toBe(true);
    for (const url of [
      'http://example.com',
      'file:///etc/passwd',
      'javascript:alert(1)',
      'smb://host/share',
      'nonsense',
    ]) {
      expect(ExternalUrlSchema.safeParse(url).success, url).toBe(false);
    }
  });
});
