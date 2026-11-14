// @vitest-environment node
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveAssetPath } from './assetPath';

const root = resolve('/srv/app/renderer');

describe('resolveAssetPath', () => {
  it('serves index.html for the root URL', () => {
    expect(resolveAssetPath(root, 'app://tessera/')).toBe(join(root, 'index.html'));
  });

  it('maps nested asset paths inside the root', () => {
    expect(resolveAssetPath(root, 'app://tessera/assets/index-abc.js')).toBe(
      join(root, 'assets', 'index-abc.js'),
    );
  });

  it('ignores query strings and fragments', () => {
    expect(resolveAssetPath(root, 'app://tessera/index.html?x=1#top')).toBe(
      join(root, 'index.html'),
    );
  });

  it.each([
    'app://tessera/../../etc/passwd',
    'app://tessera/%2e%2e/%2e%2e/etc/passwd',
    'app://tessera/assets/..%2f..%2f..%2fsecret.txt',
    'app://tessera/%5c..%5c..%5cwindows%5csystem.ini',
  ])('never resolves outside the root: %s', (url) => {
    const resolved = resolveAssetPath(root, url);
    // Either rejected outright, or normalised to a path that is still inside the root.
    if (resolved !== null) expect(resolved.startsWith(root)).toBe(true);
  });

  it('rejects malformed URLs and null bytes', () => {
    expect(resolveAssetPath(root, 'not a url')).toBeNull();
    expect(resolveAssetPath(root, 'app://tessera/%00index.html')).toBeNull();
    expect(resolveAssetPath(root, 'app://tessera/%E0%A4%A')).toBeNull();
  });
});
