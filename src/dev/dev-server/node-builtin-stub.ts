/**
 * Browser-safe stand-in for Node built-in modules (`node:fs`, `node:path`,
 * `node:url`) that templates may import at module-load time.
 *
 * Vite externalizes these by default, replacing them with a throwing stub
 * — but the stub throws on any property access, which means the static
 * import `import { readFileSync } from 'node:fs'` blows up before any
 * user code runs. We alias the built-ins to this module instead, so
 * destructuring imports get harmless no-ops.
 *
 * The dev viewer doesn't need real file I/O — templates that genuinely
 * need Node-only behaviour (reading SKILL.md, resolving paths) will get
 * an empty string / identity path. That's fine for visual preview.
 */

const noop = (): string => '';
const identity = <T>(x: T): T => x;
const joinPath = (...parts: string[]): string => parts.filter(Boolean).join('/');

// node:fs
export const readFileSync = noop;
export const writeFileSync = (): void => undefined;
export const existsSync = (): boolean => false;
export const mkdirSync = (): void => undefined;
export const readdirSync = (): readonly string[] => [];
export const statSync = (): unknown => ({ isDirectory: () => false, isFile: () => false });
export const rmSync = (): void => undefined;
export const cpSync = (): void => undefined;
export const symlinkSync = (): void => undefined;
export const readlinkSync = (): string => '';
export const unlinkSync = (): void => undefined;
export const promises = {
  readFile: async (): Promise<string> => '',
  writeFile: async (): Promise<void> => undefined,
  mkdir: async (): Promise<void> => undefined,
  readdir: async (): Promise<readonly string[]> => [],
  rm: async (): Promise<void> => undefined,
  stat: async (): Promise<unknown> => ({ isDirectory: () => false, isFile: () => false }),
};

// node:path
export const dirname = (p: string): string => {
  const idx = p.lastIndexOf('/');
  return idx >= 0 ? p.slice(0, idx) : p;
};
export const resolve = joinPath;
export const join = joinPath;
export const basename = (p: string): string => {
  const idx = p.lastIndexOf('/');
  return idx >= 0 ? p.slice(idx + 1) : p;
};
export const extname = (p: string): string => {
  const idx = p.lastIndexOf('.');
  return idx >= 0 ? p.slice(idx) : '';
};

// node:url
export const fileURLToPath = (u: string | URL): string => String(u);
export const pathToFileURL = (p: string): URL => new URL(`file://${p}`);

// Default export — some Node built-ins can be default-imported in some setups.
export default {
  readFileSync,
  writeFileSync,
  existsSync,
  dirname,
  resolve,
  join: joinPath,
  fileURLToPath,
  pathToFileURL,
  promises,
};

// Also tag this as `node:module`-shaped if someone imports createRequire.
export const createRequire = () => identity;
