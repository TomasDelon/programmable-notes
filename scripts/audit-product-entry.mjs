import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const defaultEntry = fileURLToPath(
  new URL('../src/web/EditorEntry.tsx', import.meta.url),
);
const limits = [
  'Inspects only the exported EditorEntry function and its directly rendered static import or React lazy factory for native and browser pathname /. Explicit /engine is excluded. Native selection in main.tsx and window-lifetime bootstrap are outside this audit; a browser-only entry must not be interpreted as native routing proof.',
  'Module identities are normalized relative import paths plus named/default exports; no transitive import graph, re-export resolution, module existence or runtime behavior is verified.',
  'Different direct boot modules may wrap one shared product root. Wrapper resolution is unsupported; --require-shared-entry checks direct entry identity only, not universal architectural acceptance.',
  'A shared entry does not prove product parity, native inline React isolation, filesystem authority, mobile support or security. Independent semantic and real-platform review remain required.',
];

/** Bounded, read-only AST audit. Unsupported syntax fails to inconclusive. */
export function auditEntry(source, filename = defaultEntry) {
  const report = {
    entry: resolve(filename),
    status: 'inconclusive',
    productReadinessVerified: false,
    routes: {},
    reasons: [],
    limits,
  };
  try {
    const tree = ts.createSourceFile(
      filename,
      source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
    if (tree.parseDiagnostics.length)
      throw Error('Entry contains syntax errors.');
    const imports = new Map();
    const variables = new Map();
    let entry;
    for (const statement of tree.statements) {
      if (ts.isImportDeclaration(statement)) {
        if (!statement.importClause?.isTypeOnly && statement.importClause?.name)
          imports.set(statement.importClause.name.text, {
            module: statement.moduleSpecifier.text,
            name: 'default',
          });
        const bindings = statement.importClause?.namedBindings;
        if (
          !statement.importClause?.isTypeOnly &&
          bindings &&
          ts.isNamedImports(bindings)
        ) {
          for (const item of bindings.elements)
            if (!item.isTypeOnly)
              imports.set(item.name.text, {
                module: statement.moduleSpecifier.text,
                name: item.propertyName?.text ?? item.name.text,
              });
        }
      }
      if (ts.isVariableStatement(statement))
        for (const declaration of statement.declarationList.declarations)
          if (ts.isIdentifier(declaration.name))
            variables.set(declaration.name.text, declaration.initializer);
      if (
        ts.isFunctionDeclaration(statement) &&
        statement.name?.text === 'EditorEntry' &&
        statement.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
      )
        entry = statement;
    }
    if (
      variables.has('location') ||
      variables.has('window') ||
      [...variables.keys()].some((name) => imports.has(name)) ||
      entry?.parameters.length
    )
      throw Error(
        'Shadowed route bindings or entry parameters are unsupported.',
      );
    const body = entry?.body?.statements;
    if (body?.length !== 1 || !ts.isReturnStatement(body[0]))
      throw Error(
        'Expected exported EditorEntry to directly return one JSX element.',
      );
    const jsx = body[0].expression;
    const tag = ts.isJsxSelfClosingElement(jsx)
      ? jsx.tagName
      : ts.isJsxElement(jsx)
        ? jsx.openingElement.tagName
        : undefined;
    if (!tag || !ts.isIdentifier(tag)) throw Error('Unknown entry JSX root.');
    const staticRoot = imports.get(tag.text);
    if (staticRoot?.module.startsWith('.')) {
      const root = {
        module: resolve(dirname(resolve(filename)), staticRoot.module),
        export: staticRoot.name,
      };
      report.routes = { native: { ...root }, browser: { ...root } };
      report.status = 'shared-entry-only';
      report.reasons.push(
        'Both production routes directly render the same statically imported module/export root; parity and security remain unverified.',
      );
      return report;
    }
    const lazy = variables.get(tag.text);
    if (
      !lazy ||
      !ts.isCallExpression(lazy) ||
      !ts.isIdentifier(lazy.expression) ||
      imports.get(lazy.expression.text)?.module !== 'react' ||
      imports.get(lazy.expression.text)?.name !== 'lazy' ||
      lazy.arguments.length !== 1
    )
      throw Error(
        'Expected the rendered root to be a relative static import or directly declared React lazy factory.',
      );
    const factory = lazy.arguments[0];
    if (
      !(ts.isArrowFunction(factory) || ts.isFunctionExpression(factory)) ||
      factory.parameters.length ||
      !ts.isBlock(factory.body)
    )
      throw Error('Unsupported lazy factory shape.');

    const unwrap = (node) => {
      while (node && ts.isParenthesizedExpression(node)) node = node.expression;
      return node;
    };
    const condition = (node, native) => {
      node = unwrap(node);
      if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
      if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
      if (
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        !node.arguments.length &&
        imports.get(node.expression.text)?.module === '@tauri-apps/api/core' &&
        imports.get(node.expression.text)?.name === 'isTauri'
      )
        return native;
      if (
        ts.isPrefixUnaryExpression(node) &&
        node.operator === ts.SyntaxKind.ExclamationToken
      )
        return !condition(node.operand, native);
      if (ts.isBinaryExpression(node)) {
        const pathname = (value) =>
          ts.isPropertyAccessExpression(value) &&
          value.name.text === 'pathname' &&
          (ts.isIdentifier(value.expression)
            ? value.expression.text === 'location'
            : ts.isPropertyAccessExpression(value.expression) &&
              value.expression.name.text === 'location' &&
              ts.isIdentifier(value.expression.expression) &&
              value.expression.expression.text === 'window');
        let text;
        if (pathname(node.left) && ts.isStringLiteral(node.right))
          text = node.right.text;
        if (pathname(node.right) && ts.isStringLiteral(node.left))
          text = node.left.text;
        if (text !== undefined) {
          if (node.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken)
            return text === '/';
          if (
            node.operatorToken.kind ===
            ts.SyntaxKind.ExclamationEqualsEqualsToken
          )
            return text !== '/';
        }
      }
      throw Error(
        'Unknown route condition; cannot safely select a production route.',
      );
    };
    const returnedRoot = (expression) => {
      expression = unwrap(expression);
      if (
        !expression ||
        !ts.isObjectLiteralExpression(expression) ||
        expression.properties.length !== 1
      )
        throw Error(
          'Expected a lazy result with exactly one default export binding.',
        );
      const property = expression.properties[0];
      if (
        !ts.isPropertyAssignment(property) ||
        property.name.getText(tree) !== 'default'
      )
        throw Error('Unsupported lazy default binding.');
      const value = unwrap(property.initializer);
      if (!ts.isPropertyAccessExpression(value))
        throw Error('Expected a named module export.');
      const awaited = unwrap(value.expression);
      if (!ts.isAwaitExpression(awaited))
        throw Error('Expected an awaited dynamic import.');
      const imported = unwrap(awaited.expression);
      if (
        !ts.isCallExpression(imported) ||
        imported.expression.kind !== ts.SyntaxKind.ImportKeyword ||
        imported.arguments.length !== 1 ||
        !ts.isStringLiteral(imported.arguments[0]) ||
        !imported.arguments[0].text.startsWith('.')
      )
        throw Error('Expected a literal relative dynamic import.');
      return {
        module: resolve(dirname(resolve(filename)), imported.arguments[0].text),
        export: value.name.text,
      };
    };
    const walk = (statements, native) => {
      for (const statement of statements) {
        if (ts.isReturnStatement(statement))
          return returnedRoot(statement.expression);
        if (ts.isIfStatement(statement)) {
          const branch = condition(statement.expression, native)
            ? statement.thenStatement
            : statement.elseStatement;
          if (branch) {
            const result = walk(
              ts.isBlock(branch) ? branch.statements : [branch],
              native,
            );
            if (result) return result;
          }
        } else if (!ts.isEmptyStatement(statement)) {
          throw Error('Unsupported executed statement in route factory.');
        }
      }
      return undefined;
    };
    for (const [platform, native] of [
      ['native', true],
      ['browser', false],
    ]) {
      const root = walk(factory.body.statements, native);
      if (!root) throw Error(`No returned root for ${platform}.`);
      report.routes[platform] = root;
    }
    report.status =
      report.routes.native.module === report.routes.browser.module &&
      report.routes.native.export === report.routes.browser.export
        ? 'shared-entry-only'
        : 'divergent';
    report.reasons.push(
      report.status === 'divergent'
        ? 'Native and browser production routes return different direct module/export entries; transitive sharing and product parity remain unverified.'
        : 'Both production routes return the same module/export root; parity and security remain unverified.',
    );
  } catch (error) {
    report.reasons.push(error.message);
  }
  return report;
}

export function main(args = process.argv.slice(2)) {
  let filename = defaultEntry;
  let strict = false;
  let seenEntry = false;
  try {
    for (let index = 0; index < args.length; index++) {
      if (args[index] === '--require-shared-entry' && !strict) strict = true;
      else if (args[index] === '--entry' && !seenEntry) {
        const value = args[++index];
        if (!value || value.startsWith('-'))
          throw Error('--entry requires a file path.');
        filename = resolve(value);
        seenEntry = true;
      } else throw Error(`Unknown or duplicate argument: ${args[index]}`);
    }
    const report = auditEntry(readFileSync(filename, 'utf8'), filename);
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return strict && report.status !== 'shared-entry-only' ? 1 : 0;
  } catch (error) {
    process.stderr.write(
      `${error.message}\nUsage: node scripts/audit-product-entry.mjs [--entry FILE] [--require-shared-entry]\n`,
    );
    return 2;
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  process.exitCode = main();
