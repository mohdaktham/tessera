/**
 * The Content-Security-Policy, defined once. The desktop app attaches it to
 * every response from its private `app://` scheme; the website sends the same
 * policy as an HTTP header (see `vercel.json`, which a unit test keeps in step).
 */
export const CSP_DIRECTIVES = [
  "default-src 'self'",
  // WebAssembly (SQLite) needs wasm-unsafe-eval; no remote or inline scripts are allowed.
  "script-src 'self' 'wasm-unsafe-eval'",
  // CodeMirror and Recharts inject style elements at runtime.
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "worker-src 'self' blob:",
  "connect-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
] as const;

export const CONTENT_SECURITY_POLICY = CSP_DIRECTIVES.join('; ');
