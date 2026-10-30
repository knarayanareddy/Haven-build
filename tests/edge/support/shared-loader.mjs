// Shared loader for exercising `supabase/functions/_shared/*.ts` under Node.
//
// The Edge Functions are Deno TypeScript; the test runner is Node. Rather than
// re-implement a mini transpiler in every test file (four hand-rolled copies
// existed, and each new import in a shared module broke all of them), this
// helper transpiles every module in `_shared/` once into a temp directory and
// rewrites the specifiers Node cannot resolve:
//
//   npm:@supabase/supabase-js@2.x   → ./supabase-stub.mjs
//   https://esm.sh/@supabase/...    → ./supabase-stub.mjs
//   ../../../packages/scam-engine/src/catalog.mjs → ./catalog-stub.mjs
//   "./foo.ts"                      → "./foo.mjs"
//
// Usage:
//   import { linkSharedModules } from './support/shared-loader.mjs';
//   const dir = await linkSharedModules();          // transpile all modules
//   const authz = await import(`${dir}/authz.mjs`); // import what you need
//
// `mock` is exposed to the stubbed Supabase client via
// `globalThis.__HAVEN_SUPABASE_MOCK__`, so tests can install their own client.

import { readdirSync, readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const SHARED_DIR = new URL('../../../supabase/functions/_shared/', import.meta.url);

const SUPABASE_STUB_CJS = `module.exports.createClient = function () { return globalThis.__HAVEN_SUPABASE_MOCK__; };\n`;
const SUPABASE_STUB_MJS = `export function createClient() { return globalThis.__HAVEN_SUPABASE_MOCK__; }\n`;
const CATALOG_STUB = `export function alertLevelFromScore(score) {
  if (score >= 90) return 'zwart';
  if (score >= 70) return 'rood';
  if (score >= 40) return 'amber';
  if (score >= 20) return 'geel';
  return 'groen';
}
export function scoreScamText() { return { score: 0, reasons: [], level: 'groen' }; }
`;

/** Minimal Deno global so shared modules that read env at import time work. */
export function installDenoShim(env = {}) {
  const base = {
    SUPABASE_URL: 'http://localhost:54321',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role-test-key',
    SUPABASE_ANON_KEY: 'anon-test-key',
    ...env,
  };
  globalThis.Deno = {
    env: {
      get(name) {
        return Object.hasOwn(base, name) ? base[name] : undefined;
      },
      set(name, value) {
        base[name] = value;
      },
    },
  };
  return base;
}

async function loadTypescript() {
  try {
    const mod = await import('typescript');
    return mod.default ?? mod;
  } catch {
    throw new Error(
      'TypeScript is required to load Edge Function modules in tests. Run `corepack pnpm install` first.',
    );
  }
}

/**
 * Transpiles one TypeScript file (with its relative `.ts` imports rewritten) into a
 * temp directory and returns the importable path. For app modules that are plain TS
 * with no Deno APIs — e.g. apps/elder/src/services/*.
 */
export async function transpileModuleFile(absoluteOrUrlPath, options = {}) {
  const ts = await loadTypescript();
  const url = absoluteOrUrlPath instanceof URL ? absoluteOrUrlPath : new URL(`file://${absoluteOrUrlPath}`);
  const source = readFileSync(url, 'utf8');
  // Pass the same `outDir` for modules that import each other.
  const dir = options.outDir ?? mkdtempSync(join(tmpdir(), 'haven-mod-'));
  const name = url.pathname.split('/').pop().replace(/\.tsx?$/, '');

  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
      removeComments: false,
      // Components are .tsx; without this the JSX is copied through and Node rejects it.
      // react-jsx matches tsconfig.base.json, so the emit imports react/jsx-runtime.
      jsx: ts.JsxEmit.ReactJSX,
    },
    fileName: url.pathname.split('/').pop(),
  });

  // TypeScript emits extensionless specifiers ('./crisis'); Node needs the
  // extension, so every relative import is normalised.
  const rewritten = outputText.replace(/from\s+['"](\.\/[A-Za-z0-9_-]+)(?:\.tsx?)?['"]/g, "from '$1.mjs'");
  writeFileSync(join(dir, `${name}.mjs`), rewritten);
  return join(dir, `${name}.mjs`);
}

/**
 * Transpiles every `_shared/*.ts` module into a temp directory.
 * @returns {Promise<string>} path of the directory containing `*.mjs`
 */
export async function linkSharedModules() {
  const ts = await loadTypescript();
  const outDir = mkdtempSync(join(tmpdir(), 'haven-shared-'));

  writeFileSync(join(outDir, 'supabase-stub.mjs'), SUPABASE_STUB_MJS);
  writeFileSync(join(outDir, 'supabase-stub.cjs'), SUPABASE_STUB_CJS);
  writeFileSync(join(outDir, 'catalog-stub.mjs'), CATALOG_STUB);

  const files = readdirSync(SHARED_DIR).filter((name) => name.endsWith('.ts'));

  for (const name of files) {
    const source = readFileSync(new URL(name, SHARED_DIR), 'utf8');
    const { outputText } = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
        removeComments: false,
        verbatimModuleSyntax: false,
      },
      fileName: name,
    });

    const rewritten = outputText
      .replace(/from\s+['"](?:https:\/\/esm\.sh\/|npm:)@supabase\/supabase-js(?:@[^'"]*)?['"]/g, "from './supabase-stub.mjs'")
      .replace(/from\s+['"]\.\.\/\.\.\/\.\.\/packages\/scam-engine\/src\/catalog\.mjs['"]/g, "from './catalog-stub.mjs'")
      .replace(/from\s+['"]\.\/([A-Za-z0-9_-]+)\.ts['"]/g, "from './$1.mjs'")
      .replace(/import\(\s*['"]\.\/([A-Za-z0-9_-]+)\.ts['"]\s*\)/g, "import('./$1.mjs')");

    writeFileSync(join(outDir, name.replace(/\.ts$/, '.mjs')), rewritten);
  }

  return outDir;
}
