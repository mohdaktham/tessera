// @vitest-environment node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CONTENT_SECURITY_POLICY, CSP_DIRECTIVES } from './csp';

interface HeaderRule {
  source: string;
  headers: Array<{ key: string; value: string }>;
}

const vercel = JSON.parse(readFileSync(resolve(__dirname, '../../vercel.json'), 'utf8')) as {
  headers: HeaderRule[];
};
const siteHeaders = new Map(
  vercel.headers
    .find((rule) => rule.source === '/(.*)')
    ?.headers.map(({ key, value }) => [key, value]),
);

describe('Content-Security-Policy', () => {
  it('is the same on the website as in the desktop app', () => {
    expect(siteHeaders.get('Content-Security-Policy')).toBe(CONTENT_SECURITY_POLICY);
  });

  it('allows no remote, inline or evaluated scripts', () => {
    const scripts = CSP_DIRECTIVES.find((directive) => directive.startsWith('script-src'));
    expect(scripts).toBe("script-src 'self' 'wasm-unsafe-eval'");
    expect(CONTENT_SECURITY_POLICY).not.toMatch(/https?:|\*/);
    expect(CSP_DIRECTIVES).toContain("frame-ancestors 'none'");
  });

  it('ships the other hardening headers on every response', () => {
    expect(siteHeaders.get('X-Content-Type-Options')).toBe('nosniff');
    expect(siteHeaders.get('X-Frame-Options')).toBe('DENY');
    expect(siteHeaders.get('Referrer-Policy')).toBe('no-referrer');
  });
});
