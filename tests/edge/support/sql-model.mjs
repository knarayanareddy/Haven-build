// Shared SQL model for tests.
//
// Why this exists
// ───────────────
// A dozen suites in `tests/edge` asserted on migration *text*:
//
//     assert.ok(sql.includes('CREATE RULE'));
//     assert.ok(sql.includes('REVOKE UPDATE ON audit_log'));
//
// That form is satisfied by a comment, by a migration that was later superseded,
// or by any other statement on the same line — and it breaks when the DDL is
// reformatted but behaves identically. The migrations are the only artifact we
// have without a live database in CI, so the honest thing to assert on is their
// *structure*: which table has which policy, whether RLS is forced, whether a
// trigger rejects UPDATE, what a function's body does.
//
// This module splits migration files into statements (respecting dollar-quoted
// bodies, quoted identifiers and comments) and builds a model of the resulting
// schema. Tests then assert facts such as
// `model.policy('audit_log', 'UPDATE')` rather than searching for a string.
//
// Limitation, stated plainly: this is a model of the DDL, not a running database.
// A migration that fails at execution time still parses here. `scripts/ci/verify-sql.sh`
// and the `database` job in ci.yml cover that.

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
export const MIGRATIONS_DIR = join(ROOT, 'supabase', 'migrations');

/** Replaces comments with spaces so statement parsing cannot be fooled by them. */
export function stripComments(sql) {
  let out = '';
  let i = 0;
  while (i < sql.length) {
    const two = sql.slice(i, i + 2);
    if (two === '--') {
      const end = sql.indexOf('\n', i);
      i = end === -1 ? sql.length : end;
      out += ' ';
      continue;
    }
    if (two === '/*') {
      const end = sql.indexOf('*/', i + 2);
      i = end === -1 ? sql.length : end + 2;
      out += ' ';
      continue;
    }
    const ch = sql[i];
    if (ch === "'") {
      // single-quoted literal: copy verbatim, respecting '' escapes
      let j = i + 1;
      while (j < sql.length) {
        if (sql[j] === "'" && sql[j + 1] === "'") { j += 2; continue; }
        if (sql[j] === "'") { j += 1; break; }
        j += 1;
      }
      out += sql.slice(i, j);
      i = j;
      continue;
    }
    if (ch === '"') {
      const end = sql.indexOf('"', i + 1);
      const j = end === -1 ? sql.length : end + 1;
      out += sql.slice(i, j);
      i = j;
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

/** Splits SQL into statements, keeping dollar-quoted function bodies intact. */
export function splitStatements(sql) {
  const clean = stripComments(sql);
  const statements = [];
  let current = '';
  let i = 0;
  while (i < clean.length) {
    const ch = clean[i];

    if (ch === '$') {
      const tag = /^\$[A-Za-z0-9_]*\$/.exec(clean.slice(i));
      if (tag) {
        const end = clean.indexOf(tag[0], i + tag[0].length);
        const stop = end === -1 ? clean.length : end + tag[0].length;
        current += clean.slice(i, stop);
        i = stop;
        continue;
      }
    }
    if (ch === "'") {
      let j = i + 1;
      while (j < clean.length) {
        if (clean[j] === "'" && clean[j + 1] === "'") { j += 2; continue; }
        if (clean[j] === "'") { j += 1; break; }
        j += 1;
      }
      current += clean.slice(i, j);
      i = j;
      continue;
    }
    if (ch === ';') {
      if (current.trim()) statements.push(current.trim());
      current = '';
      i += 1;
      continue;
    }
    current += ch;
    i += 1;
  }
  if (current.trim()) statements.push(current.trim());
  return statements;
}

const norm = (text) => text.replace(/\s+/g, ' ').trim();

/** Splits a parenthesised list at top level, respecting nesting and quotes. */
export function splitList(text) {
  const parts = [];
  let depth = 0;
  let current = '';
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '(') depth += 1;
    if (ch === ')') depth -= 1;
    if (ch === ',' && depth === 0) { parts.push(current.trim()); current = ''; continue; }
    current += ch;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

const quoted = (raw) => raw.replace(/^"|"$/g, '').replace(/^'|'$/g, '');
/** Schema-qualified and unqualified names refer to the same object here. */
const bare = (raw) => quoted(raw).replace(/^(?:public|storage|auth)\./, '');

/** Parses `BEGIN ... END;` bodies and `$$ ... $$` bodies down to their inner text. */
function functionBody(statement) {
  const dollar = /\$[A-Za-z0-9_]*\$([\s\S]*)\$[A-Za-z0-9_]*\$/.exec(statement);
  if (dollar) return dollar[1].trim();
  const beginEnd = /\bAS\b[\s\S]*?\bBEGIN\b([\s\S]*)\bEND\b/i.exec(statement);
  if (beginEnd) return beginEnd[1].trim();
  const arrow = /=>\s*([\s\S]+)$/.exec(statement);
  return arrow ? arrow[1].trim() : '';
}

function parseColumnList(body) {
  const columns = [];
  for (const part of splitList(body)) {
    const name = /^"?([A-Za-z_][A-Za-z0-9_]*)"?/.exec(part);
    if (!name) continue;
    const upper = part.toUpperCase();
    if (/^(CONSTRAINT|PRIMARY|FOREIGN|UNIQUE|CHECK|EXCLUDE|LIKE|INHERITS)\b/.test(upper)) continue;
    columns.push({
      name: name[1],
      type: (/^"?[A-Za-z_][A-Za-z0-9_]*"?\s+([A-Za-z][A-Za-z0-9_ ]*)/.exec(part)?.[1] ?? '').trim(),
      raw: norm(part),
    });
  }
  return columns;
}

/** Builds the schema model from a set of SQL files. */
export function buildModel({ dir = MIGRATIONS_DIR, files = null } = {}) {
  const names = files ?? readdirSync(dir).filter((n) => n.endsWith('.sql')).sort();
  const tables = new Map();
  const policies = [];
  const rules = [];
  const triggers = [];
  const indexes = [];
  const functions = new Map();
  const views = new Map();
  const extensions = new Set();
  const foreignKeys = [];
  const dropFk = (table, name) => {
    const idx = foreignKeys.findIndex((fk) => fk.table === table && fk.name === name);
    if (idx >= 0) foreignKeys.splice(idx, 1);
  };
  const addFk = ({ table, column, references, onDelete, name, source }) => {
    const key = name || `${table}_${column}_fkey`;
    dropFk(table, key);
    foreignKeys.push({ table, column, references, onDelete: (onDelete || 'NO ACTION').toUpperCase().replace(/\s+/g, ' '), name: key, source });
  };
  const functionPrivileges = [];
  const defaultPrivileges = [];

  const table = (name) => {
    const key = bare(name);
    if (!tables.has(key)) {
      tables.set(key, {
        name: key, columns: [], rlsEnabled: false, forceRls: false,
        grants: [], revokes: [], owner: null, source: [],
      });
    }
    return tables.get(key);
  };

  for (const file of names) {
    const sql = readFileSync(join(dir, file), 'utf8');
    for (const statement of splitStatements(sql)) {
      const text = norm(statement);
      const upper = text.toUpperCase();

      // extension
      const ext = /^CREATE EXTENSION (?:IF NOT EXISTS )?"?([A-Za-z0-9_]+)"?/i.exec(text);
      if (ext) { extensions.add(ext[1].toLowerCase()); continue; }

      // create table
      const createTable = /^CREATE TABLE (?:IF NOT EXISTS )?("?[A-Za-z0-9_.]+"?)\s*\(([\s\S]*)\)\s*(?:PARTITION BY [\s\S]*)?$/i.exec(text);
      if (createTable) {
        const t = table(createTable[1]);
        t.columns = parseColumnList(createTable[2]);
        t.source.push(file);
        for (const match of createTable[2].matchAll(/([A-Za-z_][A-Za-z0-9_]*)[^,]*?REFERENCES\s+"?([A-Za-z0-9_.]+?)"?\s*\([^)]*\)([^,]*)/gi)) {
          const onDelete = /ON DELETE ([A-Z ]+?)(?=\s*(?:,|$)|\s+NOT|\s+DEFERRABLE)/i.exec(match[3] || '')?.[1];
          addFk({
            table: bare(createTable[1]), column: match[1], references: bare(match[2]),
            onDelete, source: file,
          });
        }
        continue;
      }

      // ALTER FUNCTION ... SET <config> — attribute changes that do not restate the body
      const alterFn = /^ALTER FUNCTION (?:[A-Za-z0-9_]+\.)??([A-Za-z0-9_]+)"?(?:\([\s\S]*?\))?\s*SET\s+([A-Za-z_]+)\s*(?:=|TO)\s*([^;]+)$/i.exec(text);
      if (alterFn) {
        const target = functions.get(alterFn[1]);
        if (target) {
          const key = alterFn[2].toLowerCase();
          const value = alterFn[3].trim().replace(/^'|'$/g, '');
          if (key === 'search_path') target.searchPath = value;
          else if (key === 'statement_timeout') target.statementTimeout = value;
        }
        continue;
      }

      // alter table ... enable/force row level security
      const alter = /^ALTER TABLE (?:IF EXISTS )?(?:ONLY )?("?[A-Za-z0-9_.]+"?)([\s\S]*)$/i.exec(text);
      if (alter) {
        const t = table(alter[1]);
        const rest = alter[2].toUpperCase();
        for (const match of alter[2].matchAll(/ENABLE ALWAYS TRIGGER "?([A-Za-z0-9_]+)"?/gi)) {
          const trigger = triggers.find((entry) => entry.name === match[1]);
          if (trigger) trigger.always = true;
        }
        if (/ENABLE ROW LEVEL SECURITY/.test(rest)) t.rlsEnabled = true;
        if (/FORCE ROW LEVEL SECURITY/.test(rest)) t.forceRls = true;
        if (/NO FORCE ROW LEVEL SECURITY/.test(rest)) t.forceRls = false;
        if (/DISABLE ROW LEVEL SECURITY/.test(rest)) t.rlsEnabled = false;
        if (/OWNER TO/.test(rest)) t.owner = quoted(/OWNER TO ("?[A-Za-z0-9_]+"?)/i.exec(alter[2])?.[1] ?? '');
        // ADD COLUMN is how later migrations extend a table; without this the
        // model would report stale columns.
        for (const match of alter[2].matchAll(/ADD COLUMN (?:IF NOT EXISTS )?"?([A-Za-z0-9_]+)"?([^,;]*?)REFERENCES\s+"?([A-Za-z0-9_.]+?)"?\s*\([^)]*\)([^,;]*)/gi)) {
          addFk({
            table: bare(alter[1]), column: match[1], references: bare(match[3]),
            onDelete: /ON DELETE ([A-Z ]+?)(?=\s*(?:,|;|$)|\s+NOT|\s+DEFERRABLE)/i.exec(match[4] || '')?.[1], source: file,
          });
        }

        // DROP CONSTRAINT / ADD CONSTRAINT ... FOREIGN KEY — how a later migration
        // changes a referential action without restating the table.
        for (const match of alter[2].matchAll(/DROP CONSTRAINT (?:IF EXISTS )?"?([A-Za-z0-9_]+)"?/gi)) {
          dropFk(bare(alter[1]), match[1]);
        }
        for (const match of alter[2].matchAll(/ADD CONSTRAINT "?([A-Za-z0-9_]+)"? FOREIGN KEY \("?([A-Za-z0-9_]+)"?\)\s*REFERENCES\s+"?([A-Za-z0-9_.]+?)"?\s*\([^)]*\)([^,;]*)/gi)) {
          addFk({
            table: bare(alter[1]), name: match[1], column: match[2], references: bare(match[3]),
            onDelete: /ON DELETE ([A-Z ]+?)(?=\s*(?:,|;|$)|\s+NOT|\s+DEFERRABLE)/i.exec(match[4] || '')?.[1], source: file,
          });
        }
        for (const match of alter[2].matchAll(/ADD COLUMN (?:IF NOT EXISTS )?"?([A-Za-z0-9_]+)"?[\s\S]*?(?=, ADD COLUMN|$)/gi)) {
          const name = match[1];
          if (!t.columns.some((c) => c.name === name)) {
            t.columns.push({ name, type: '', raw: norm(match[0]) });
          }
        }
        continue;
      }

      // policies
      const policy = /^CREATE POLICY "?([A-Za-z0-9_]+)"? ON ("?[A-Za-z0-9_.]+"?)([\s\S]*)$/i.exec(text);
      if (policy) {
        const rest = policy[3];
        const forMatch = /\bFOR\s+(SELECT|INSERT|UPDATE|DELETE|ALL)\b/i.exec(rest);
        const roles = /\bTO\s+([A-Za-z0-9_," ]+?)(?:\s+USING|\s+WITH CHECK|$)/i.exec(rest);
        const using = /\bUSING\s*\(([\s\S]*?)\)(?:\s+WITH CHECK|$)/i.exec(rest);
        const check = /\bWITH CHECK\s*\(([\s\S]*)\)\s*$/i.exec(rest);
        // A later CREATE POLICY with the same name replaces the earlier one (the
        // migration drops it first; otherwise the DDL would fail in production).
        const previous = policies.findIndex((entry) => entry.name === policy[1] && entry.table === bare(policy[2]));
        if (previous >= 0) policies.splice(previous, 1);
        policies.push({
          name: policy[1],
          table: bare(policy[2]),
          command: (forMatch?.[1] ?? 'ALL').toUpperCase(),
          roles: (roles?.[1] ?? 'PUBLIC').split(',').map((r) => quoted(r.trim())),
          using: using ? norm(using[1]) : null,
          withCheck: check ? norm(check[1]) : null,
          permissive: !/\bAS RESTRICTIVE\b/i.test(rest),
          source: file,
        });
        continue;
      }

      // rules (used by audit_log immutability)
      const rule = /^CREATE (?:OR REPLACE )?RULE "?([A-Za-z0-9_]+)"? AS ON (SELECT|INSERT|UPDATE|DELETE) TO ("?[A-Za-z0-9_.]+"?)([\s\S]*)$/i.exec(text);
      if (rule) {
        rules.push({ name: rule[1], event: rule[2].toUpperCase(), table: bare(rule[3]), body: norm(rule[4]), source: file });
        continue;
      }

      // triggers
      const trigger = /^CREATE (?:OR REPLACE )?TRIGGER "?([A-Za-z0-9_]+)"? (BEFORE|AFTER|INSTEAD OF) ([A-Za-z ]+?) ON ("?[A-Za-z0-9_.]+"?)([\s\S]*)$/i.exec(text);
      if (trigger) {
        triggers.push({
          name: trigger[1], timing: trigger[2].toUpperCase(), events: trigger[3].toUpperCase().split(/\s+OR\s+/),
          table: bare(trigger[4]), body: norm(trigger[5]), source: file,
        });
        continue;
      }

      // indexes
      const index = /^CREATE (UNIQUE )?INDEX (?:IF NOT EXISTS )?"?([A-Za-z0-9_]+)"? ON ("?[A-Za-z0-9_.]+"?)\s*(?:USING [A-Za-z0-9_]+ )?\(([\s\S]*?)\)/i.exec(text);
      if (index) {
        const after = text.slice(text.indexOf(index[0]) + index[0].length);
        const predicate = /^\s*WHERE\s+([\s\S]*)$/i.exec(after);
        indexes.push({
          name: index[2], unique: Boolean(index[1]), table: bare(index[3]),
          columns: splitList(index[4]).map((c) => norm(c)),
          predicate: predicate ? norm(predicate[1]) : null,
          source: file,
        });
        continue;
      }

      // functions
      const fn = /^CREATE (?:OR REPLACE )?FUNCTION (?:[A-Za-z0-9_]+\.)?"?([A-Za-z0-9_]+)"?\s*\(([\s\S]*?)\)\s*RETURNS ([\s\S]*)$/i.exec(text);
      if (fn) {
        const securityDefiner = /\bSECURITY DEFINER\b/i.test(text);
        // Only look at the header (up to the body) so a body that happens to contain
        // the words "SET search_path" cannot be mistaken for the clause.
        const header = text.split(/\$\$/)[0];
        const searchPath = /\bSET search_path\s*(?:=|TO)\s*([^;]+?)\s+AS\b/i.exec(header)?.[1]?.trim() ?? null;
        const statementTimeout = /\bSET statement_timeout\s*(?:=|TO)\s*'?([0-9a-z]+)'?/i.exec(header)?.[1]?.trim() ?? null;
        functions.set(fn[1], {
          name: fn[1], securityDefiner, searchPath, statementTimeout, returns: norm(fn[3]),
          args: fn[2].trim(),
          body: functionBody(statement), source: file,
        });
        continue;
      }

      // views
      const view = /^CREATE (?:OR REPLACE )?(?:MATERIALIZED )?VIEW (?:[A-Za-z0-9_]+\.)?"?([A-Za-z0-9_]+)"? AS ([\s\S]*)$/i.exec(text);
      if (view) {
        views.set(view[1], { name: view[1], definition: norm(view[2]), source: file });
        continue;
      }

      const defaultPriv = /^ALTER DEFAULT PRIVILEGES (?:IN SCHEMA ([A-Za-z0-9_]+) )?(GRANT|REVOKE) ([A-Z ]+?) ON (FUNCTIONS|TABLES|SEQUENCES)[\s\S]*?\b(TO|FROM)\s+([A-Za-z0-9_," ]+)$/i.exec(text);
      if (defaultPriv) {
        defaultPrivileges.push({
          schema: defaultPriv[1] ? bare(defaultPriv[1]) : null,
          verb: defaultPriv[2].toUpperCase(),
          privileges: norm(defaultPriv[3]).toUpperCase(),
          objects: defaultPriv[4].toUpperCase(),
          roles: defaultPriv[6].split(',').map((r) => quoted(r.trim())),
          source: file,
        });
        continue;
      }

      // function-level privileges: schema-wide sweeps and single-function grants
      const fnPriv = /^(GRANT|REVOKE) (EXECUTE|ALL(?: PRIVILEGES)?) ON ((?:ALL FUNCTIONS IN SCHEMA [A-Za-z0-9_]+)|(?:FUNCTION [A-Za-z0-9_.]+))[\s\S]*?\b(TO|FROM)\s+([A-Za-z0-9_," ]+)$/i.exec(text);
      if (fnPriv) {
        const rawTarget = fnPriv[3].replace(/^FUNCTION /i, '');
        functionPrivileges.push({
          verb: fnPriv[1].toUpperCase(),
          privileges: fnPriv[2].toUpperCase(),
          target: /^ALL FUNCTIONS IN SCHEMA/i.test(rawTarget) ? rawTarget.toUpperCase() : bare(rawTarget),
          direction: fnPriv[4].toUpperCase(),
          roles: fnPriv[5].split(',').map((r) => quoted(r.trim())),
          source: file,
        });
        continue;
      }

      // grants / revokes
      const grant = /^(GRANT|REVOKE) ([A-Z_ ,]+?) ON (?:TABLE |FUNCTION |SCHEMA |ALL TABLES IN SCHEMA )?("?[A-Za-z0-9_.]+"?)(?:.*?)\b(TO|FROM)\s+([A-Za-z0-9_," ]+)/i.exec(text);
      if (grant) {
        const entry = { verb: grant[1].toUpperCase(), privileges: grant[2].trim().toUpperCase(), target: bare(grant[3]), direction: grant[4].toUpperCase(), roles: grant[5].split(',').map((r) => quoted(r.trim())) };
        const t = tables.get(bare(grant[3]));
        if (t) (entry.verb === 'GRANT' ? t.grants : t.revokes).push(entry);
      }
    }
  }

  const api = {
    tables,
    policies,
    rules,
    triggers,
    indexes,
    functions,
    views,
    extensions,
    foreignKeys,
    functionPrivileges,
    defaultPrivileges,
    /**
     * Roles that may EXECUTE `name`, replaying schema-wide sweeps and
     * single-function grants in migration order.
     */
    executorsOf(name) {
      const roles = new Set();
      for (const entry of functionPrivileges) {
        if (entry.target !== name && entry.target !== 'ALL FUNCTIONS IN SCHEMA PUBLIC') continue;
        for (const role of entry.roles) {
          if (entry.verb === 'GRANT') roles.add(role);
          else roles.delete(role);
        }
      }
      return [...roles].sort();
    },
    references(tableName, column = null) {
      return foreignKeys.filter((fk) => fk.table === tableName && (!column || fk.column === column));
    },
    files: names,
    table(name) { return tables.get(name) ?? null; },
    tableNames() { return [...tables.keys()]; },
    columns(name) { return (tables.get(name)?.columns ?? []).map((c) => c.name); },
    column(name, columnName) {
      return (tables.get(name)?.columns ?? []).find((c) => c.name === columnName) ?? null;
    },
    policiesFor(tableName, command = null) {
      return policies.filter((p) => p.table === tableName && (!command || p.command === command || p.command === 'ALL'));
    },
    policy(tableName, command = null) { return api.policiesFor(tableName, command)[0] ?? null; },
    rulesFor(tableName, event = null) {
      return rules.filter((r) => r.table === tableName && (!event || r.event === event));
    },
    triggersFor(tableName) { return triggers.filter((t) => t.table === tableName); },
    trigger(tableName, event) {
      return triggers.find((t) => t.table === tableName && t.events.some((e) => e.includes(event))) ?? null;
    },
    indexesFor(tableName) { return indexes.filter((i) => i.table === tableName); },
    indexFor(tableName, column) {
      return indexes.find((i) => i.table === tableName && i.columns.some((c) => c.includes(column))) ?? null;
    },
    fn(name) { return functions.get(name) ?? null; },
    view(name) { return views.get(name) ?? null; },
    /** True when every table that is not explicitly service-role-only has RLS on. */
    rlsCoverage() {
      const missing = [...tables.values()].filter((t) => !t.rlsEnabled);
      return { total: tables.size, missing: missing.map((t) => t.name) };
    },
  };
  return api;
}
