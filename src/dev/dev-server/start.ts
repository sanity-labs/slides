import { existsSync, readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, resolve as pathResolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { createServer, type ViteDevServer } from 'vite';

const VIRTUAL_ID = 'virtual:slides-dev/template';
const RESOLVED_VIRTUAL_ID = `\0${VIRTUAL_ID}`;

export type StartDevServerOptions = {
  readonly cwd: string;
  readonly host?: string;
  readonly port?: number;
};

export type DevServerHandle = {
  readonly server: ViteDevServer;
  readonly url: string;
  readonly templatePath: string;
  readonly startedInMs: number;
};

const here = dirname(fileURLToPath(import.meta.url));
const CLIENT_ROOT = pathResolve(here, 'client');

/**
 * The empty stub modules Vite swaps in for server-only imports.
 *
 * Two layouts:
 *  - dev:       `src/dev/dev-server/*-stub.ts`
 *  - published: `dist/dev/dev-server/*-stub.js`
 *
 * Pick whichever exists next to this file.
 */
const pickStub = (basename: string): string => {
  const tsPath = pathResolve(here, `${basename}.ts`);
  const jsPath = pathResolve(here, `${basename}.js`);
  return existsSync(jsPath) ? jsPath : tsPath;
};

const SERVER_ONLY_STUB = pickStub('server-only-stub');
const NODE_BUILTIN_STUB = pickStub('node-builtin-stub');

/**
 * Match the server-only modules that should be stubbed when the dev viewer
 * imports `@sanity-labs/slides` from the browser. These files pull in
 * Node-only deps (`@resvg/resvg-js`, `pptxgenjs`) that can't run in Vite's
 * dependency-optimization step or in the browser.
 *
 * The current layout is `<pkg>/dist/core/{pptx-runtime,op-translator-pptx}.js`
 * when published and `<pkg>/src/core/{pptx-runtime,op-translator-pptx}.ts`
 * when running from a dev checkout. Match `core/<filename>` regardless of
 * what comes before it.
 */
const SERVER_ONLY_RE = /(?:^|\/)core\/(?:pptx-runtime|op-translator-pptx)\.[tj]s$/;

export const startDevServer = async (options: StartDevServerOptions): Promise<DevServerHandle> => {
  const startedAt = performance.now();
  const templatePath = await resolveTemplatePath(options);
  const templateExportName = pickTemplateExportName(templatePath);

  const server = await createServer({
    root: CLIENT_ROOT,
    server: {
      host: options.host ?? 'localhost',
      port: options.port ?? 5173,
      fs: { allow: [CLIENT_ROOT, options.cwd, pathResolve(options.cwd, '../..')] },
    },
    ssr: {
      noExternal: ['pptxgenjs'],
    },
    plugins: [
      react(),
      tailwindcss(),
      {
        name: 'slides-dev:export',
        configureServer(viteServer) {
          viteServer.middlewares.use('/api/export.pptx', async (_req, res) => {
            try {
              const [mod, slidesMod] = await Promise.all([
                viteServer.ssrLoadModule(templatePath),
                // Single consolidated package since the workspace collapse.
                // The reconciler and PPTX runtime both live at the root.
                viteServer.ssrLoadModule('@sanity-labs/slides'),
              ]);
              const { renderToOps, PptxSlidesRuntime } = slidesMod;
              const template = mod[templateExportName];
              if (!template) throw new Error('Template export not found');
              const tree = template.preview ? template.preview() : null;
              if (!tree) throw new Error('Template has no preview()');
              const { ops } = renderToOps({ tree, template, deckId: 'export' });
              const runtime = new PptxSlidesRuntime({});
              const { deckId } = await runtime.createDeckFromMaster(template.name, template.name);
              await runtime.applyOps(deckId, ops);
              const buffer = await runtime.toBuffer(deckId);
              res.setHeader(
                'Content-Type',
                'application/vnd.openxmlformats-officedocument.presentationml.presentation',
              );
              res.setHeader('Content-Disposition', `attachment; filename="${template.name}.pptx"`);
              res.end(buffer);
            } catch (err) {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'text/plain');
              res.end(err instanceof Error ? err.message : String(err));
            }
          });
        },
      },

      {
        // Browser-only stubs for Node-only packages and built-ins the dev
        // viewer can't load. SSR is exempt so the export endpoint can still
        // load the real pptxgenjs / resvg / node:fs to generate the .pptx.
        //
        // `resolveId` redirects bare imports BEFORE Vite's esbuild dep
        // scanner sees them — critical because the scanner runs ahead of
        // the `load` hook and would otherwise crash on @resvg's native .node
        // binary or node:fs externalization.
        name: 'slides-dev:stub-server-only',
        enforce: 'pre' as const,
        resolveId(source, _importer, options) {
          if (options?.ssr) return null;
          if (source === '@resvg/resvg-js' || source === 'pptxgenjs') return SERVER_ONLY_STUB;
          if (
            source === 'node:fs' ||
            source === 'node:path' ||
            source === 'node:url' ||
            source === 'node:module'
          ) {
            return NODE_BUILTIN_STUB;
          }
          return null;
        },
        load(id, options) {
          if (options?.ssr) return null;
          const cleanId = id.split('?')[0] ?? '';
          if (SERVER_ONLY_RE.test(cleanId)) {
            return { code: readFileSync(SERVER_ONLY_STUB, 'utf8') };
          }
          return null;
        },
      },
      {
        name: 'slides-dev:virtual-template',
        resolveId(source) {
          if (source === VIRTUAL_ID) return RESOLVED_VIRTUAL_ID;
          return null;
        },
        load(id) {
          if (id !== RESOLVED_VIRTUAL_ID) return null;
          return `export { ${templateExportName} as template } from ${JSON.stringify(templatePath)};`;
        },
      },
    ],
    optimizeDeps: {
      // Force these into a single pre-bundled chunk per package. `lucide-react`
      // in particular publishes each icon as a separate ESM file; in dev mode
      // the browser would request hundreds of individual icon URLs, and any
      // user with an ad blocker that matches on filename ("fingerprint.js",
      // "crypto.js", etc.) breaks the whole tree because the import never
      // resolves. Pre-bundling collapses them into one URL.
      include: ['react', 'react-dom', 'react-dom/client', 'lucide-react', 'react-zoom-pan-pinch'],
      // Skip these in pre-bundling so the esbuild scanner doesn't try to
      // follow them. The `slides-dev:stub-server-only` plugin below catches
      // them when they're loaded on demand and substitutes a browser-safe
      // stub. Without `exclude`, the scanner runs ahead of plugins and dies
      // on @resvg's native `.node` binary / pptxgenjs's Node-only deps.
      exclude: ['@resvg/resvg-js', 'pptxgenjs'],
      // `yoga-layout` (used by the reconciler) uses top-level `await` in its
      // ESM build. esbuild's default target (chrome87) doesn't support it,
      // which crashes Vite's pre-bundling step. Bump to esnext so it goes
      // through verbatim.
      esbuildOptions: { target: 'esnext' },
    },
  });

  await server.listen();
  const url = server.resolvedUrls?.local[0] ?? `http://localhost:${options.port ?? 5173}/`;
  const startedInMs = Math.round(performance.now() - startedAt);
  return { server, url, templatePath, startedInMs };
};

const resolveTemplatePath = async (options: StartDevServerOptions): Promise<string> => {
  const pkgPath = pathResolve(options.cwd, 'package.json');
  if (!existsSync(pkgPath)) {
    throw new Error(
      `slides-dev: ${options.cwd} has no package.json — run from a template package directory.`,
    );
  }
  const pkg = JSON.parse(await readFile(pkgPath, 'utf8')) as { main?: string };
  if (!pkg.main) {
    throw new Error(
      `slides-dev: ${pkgPath} has no "main" field — point it at the file that exports your Template.`,
    );
  }
  const templatePath = pathResolve(options.cwd, pkg.main);
  if (!existsSync(templatePath)) {
    throw new Error(`slides-dev: template entry "${templatePath}" not found.`);
  }
  return templatePath;
};

const pickTemplateExportName = (templatePath: string): string => {
  const patterns: RegExp[] = [
    /export\s+const\s+([A-Za-z_$][\w$]*)\s*=\s*defineTemplate\s*\(/,
    /export\s+const\s+([A-Za-z_$][\w$]*)\s*:\s*Template/,
  ];
  try {
    const src = readFileSync(templatePath, 'utf8');
    for (const pattern of patterns) {
      const m = src.match(pattern);
      if (m && m[1]) return m[1];
    }
  } catch {
    /* empty */
  }
  return 'default';
};
