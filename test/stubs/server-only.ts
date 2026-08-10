/**
 * Test stub for the `server-only` package.
 *
 * The real package throws unless it is resolved under React's `react-server`
 * condition, which Vitest does not set. Aliasing it here lets server modules be
 * unit tested directly while `next build` still resolves the real package — so
 * the guard against importing them from a client component stays intact.
 */
export {};
