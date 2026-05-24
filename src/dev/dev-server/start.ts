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
const SERVER_ONLY_STUB = pathResolve(here, 'server-only-stub.ts');

const SERVER_ONLY_RE = /\/(core|react-pptx)\/(src|dist)\/(pptx-runtime|op-translator-pptx)\.[tj]s$/;

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
              const [mod, reconcilerMod, runtimeMod] = await Promise.all([
                viteServer.ssrLoadModule(templatePath),
                viteServer.ssrLoadModule('react-pptx/reconciler'),
                viteServer.ssrLoadModule('react-pptx/pptx-runtime'),
              ]);
              const { renderToOps } = reconcilerMod;
              const { PptxSlidesRuntime } = runtimeMod;
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
        name: 'slides-dev:stub-server-only',
        enforce: 'pre' as const,
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
      include: ['react', 'react-dom', 'react-dom/client'],
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
