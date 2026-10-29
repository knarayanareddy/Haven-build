// Shared AST model for tests that used to grep source text.
//
// Why this exists
// ───────────────
// Suites such as `p1-contrast-ratios-closure.test.mjs` asserted things like
//
//     assert.ok(source.includes('accessibilityLiveRegion="assertive"'));
//
// A comment satisfied that. So did dead code in a branch nobody renders. And a
// rename of a variable broke it while the behaviour was unchanged. The assertions
// were about characters, not about the program.
//
// This module parses the real TypeScript/JSX with the compiler API (the same one
// `tsc` uses in CI) and exposes queries over the syntax tree: JSX element and
// attribute values, object literal properties, call expressions, imports, and the
// comment-stripped code text. A test can then ask "which elements set
// accessibilityLiveRegion, and to what" instead of "does this string appear".
//
// It is still static analysis — nothing here renders a component. For component
// behaviour the browser job is the authority; these tests pin the structure the
// component must have, and `tests/edge/support/shared-loader.mjs` is used instead
// wherever the logic can simply be executed.

import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { fileURLToPath } from 'node:url';

const cache = new Map();

/** Parses a file (path or file: URL) and caches the result. */
export function parseFile(pathOrUrl) {
  const key = String(pathOrUrl);
  if (cache.has(key)) return cache.get(key);
  const path = pathOrUrl instanceof URL ? fileURLToPath(pathOrUrl) : String(pathOrUrl);
  const text = readFileSync(path, 'utf8');
  const sf = ts.createSourceFile(path, text, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TSX);
  const model = createModel(sf, text);
  cache.set(key, model);
  return model;
}

function createModel(sf, text) {
  const jsx = [];
  const props = [];
  const calls = [];
  const objects = [];
  const strings = new Set();
  const imports = [];
  const exports = new Set();
  const declarations = new Map();

  const textOf = (node) => (node ? node.getText(sf) : '');

  const visit = (node) => {
    // JSX elements
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
      const opening = ts.isJsxElement(node) ? node.openingElement : node;
      const name = opening.tagName.getText(sf);
      const attributes = {};
      for (const attr of opening.attributes.properties) {
        if (!ts.isJsxAttribute(attr)) continue;
        const attrName = attr.name.getText(sf);
        let value = null;
        let expression = null;
        if (attr.initializer) {
          if (ts.isStringLiteral(attr.initializer)) {
            value = attr.initializer.text;
          } else if (ts.isJsxExpression(attr.initializer)) {
            expression = attr.initializer.expression ? attr.initializer.expression.getText(sf) : null;
            if (attr.initializer.expression && ts.isStringLiteral(attr.initializer.expression)) {
              value = attr.initializer.expression.text;
            }
          }
        }
        attributes[attrName] = { value, expression, raw: textOf(attr) };
        props.push({ tag: name, name: attrName, value, expression });
      }
      jsx.push({ tag: name, attributes });
    }

    // object literals
    if (ts.isObjectLiteralExpression(node)) {
      const entries = [];
      for (const property of node.properties) {
        if (!ts.isPropertyAssignment(property)) continue;
        entries.push({
          name: property.name.getText(sf).replace(/^['"]|['"]$/g, ''),
          value: property.initializer.getText(sf),
        });
      }
      objects.push({ entries, text: node.getText(sf) });
    }

    // calls
    if (ts.isCallExpression(node)) {
      const callee = node.expression.getText(sf);
      const parent = node.parent;
      const awaited = Boolean(parent && ts.isAwaitExpression(parent));
      calls.push({ callee, awaited, args: node.arguments.map((a) => a.getText(sf)) });
    }

    // literals
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) strings.add(node.text);

    // imports
    if (ts.isImportDeclaration(node) && node.moduleSpecifier) {
      const from = node.moduleSpecifier.getText(sf).replace(/['"]/g, '');
      const names = (node.importClause?.namedBindings && ts.isNamedImports(node.importClause.namedBindings))
        ? node.importClause.namedBindings.elements.map((e) => e.name.text)
        : [];
      const defaultName = node.importClause?.name?.text ?? null;
      imports.push({ from, names, defaultName });
    }

    // exported names + value declarations (for structural checks)
    if (ts.isVariableStatement(node)) {
      const isExported = node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
      for (const decl of node.declarationList.declarations) {
        const name = decl.name.getText(sf);
        declarations.set(name, { kind: 'const', text: decl.getText(sf), initializer: textOf(decl.initializer), exported: Boolean(isExported) });
        if (isExported) exports.add(name);
      }
    }
    if (ts.isFunctionDeclaration(node) && node.name) {
      const name = node.name.text;
      const isExported = node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
      declarations.set(name, { kind: 'function', text: node.getText(sf), body: textOf(node.body), exported: Boolean(isExported) });
      if (isExported) exports.add(name);
    }

    ts.forEachChild(node, visit);
  };
  visit(sf);

  // Comment-free text: `ts.getLeadingCommentRanges` is per node, so strip from raw
  // text with a scanner that also drops JSX text (which is not code either).
  const commentFree = (() => {
    let out = '';
    const scanner = ts.createScanner(ts.ScriptTarget.ES2022, false, ts.LanguageVariant.JSX, text);
    let token = scanner.scan();
    while (token !== ts.SyntaxKind.EndOfFileToken) {
      const value = scanner.getTokenText();
      out += token === ts.SyntaxKind.SingleLineCommentTrivia || token === ts.SyntaxKind.MultiLineCommentTrivia
        ? ' '
        : value;
      token = scanner.scan();
    }
    return out;
  })();

  const normalise = (value) => value.replace(/\s+/g, ' ').trim();

  return {
    path: sf.fileName,
    sf,
    text,
    commentFree,
    code: commentFree,
    jsx,
    props,
    calls,
    objects,
    strings,
    imports,
    exports,
    declarations,

    /** Elements by tag name (`Pressable`, `Text`, …). */
    elements(tag) { return jsx.filter((el) => el.tag === tag); },
    /** Every value of a JSX attribute name, across the file. */
    propValues(name) { return props.filter((p) => p.name === name).map((p) => p.value ?? p.expression); },
    /** Elements that set `name`, optionally to `value`. */
    elementsWithProp(name, value = undefined) {
      return jsx.filter((el) => Object.hasOwn(el.attributes, name)
        && (value === undefined
          || el.attributes[name].value === value
          || (el.attributes[name].expression ?? '').includes(value)));
    },
    /** True when some element sets the attribute (optionally to a value). */
    hasProp(name, value = undefined) { return this.elementsWithProp(name, value).length > 0; },
    /** Object literal that declares `key`, with its properties. */
    objectWith(key) { return objects.find((o) => o.entries.some((e) => e.name === key)) ?? null; },
    /** Value expression of `key` inside the first object that declares it. */
    objectValue(key) {
      for (const object of objects) {
        const entry = object.entries.find((e) => e.name === key);
        if (entry) return entry.value;
      }
      return null;
    },
    /** Every value expression declared for `key` in any object literal. */
    objectValues(key) {
      return objects.flatMap((o) => o.entries.filter((e) => e.name === key).map((e) => e.value));
    },
    /** Callee names called in the file (e.g. `Haptics.notificationAsync`). */
    callees() { return calls.map((c) => c.callee); },
    called(callee) { return calls.some((c) => c.callee === callee || c.callee.endsWith(`.${callee}`)); },
    declaration(name) { return declarations.get(name) ?? null; },
    hasString(value) { return strings.has(value); },
    /** Whitespace-insensitive presence of an expression in comment-free code. */
    hasCode(snippet) { return normalise(commentFree).includes(normalise(snippet)); },
  };
}

/** The WCAG 2.x relative-luminance contrast ratio between two hex colours. */
export function contrastRatio(hexA, hexB) {
  const luminance = (hex) => {
    const clean = hex.replace('#', '');
    const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255)
      .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const [light, dark] = [luminance(hexA), luminance(hexB)].sort((a, b) => b - a);
  return (light + 0.05) / (dark + 0.05);
}
