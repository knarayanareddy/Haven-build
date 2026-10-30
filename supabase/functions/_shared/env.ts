/**
 * Environment access that works in both runtimes.
 *
 * Edge Functions run on Deno; the contract tests run the same modules under Node
 * (`node --experimental-transform-types`). Reading `Deno.env` unguarded makes a
 * module impossible to unit-test, which is how several security controls ended up
 * covered only by grep assertions.
 */
export function readEnv(name: string): string | undefined {
  const deno = (globalThis as { Deno?: { env?: { get(key: string): string | undefined } } }).Deno;
  if (deno?.env?.get) {
    try {
      return deno.env.get(name);
    } catch {
      return undefined;
    }
  }
  const proc = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
  return proc?.env?.[name];
}
