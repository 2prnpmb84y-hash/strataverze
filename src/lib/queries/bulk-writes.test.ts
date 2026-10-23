import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * Guard: in Prisma 8, `update()` and `delete()` change only the FIRST row the
 * filter matches. A write meant for several rows (every allocation on a
 * transaction, every coverage item on a policy) must use `updateAndCount()` /
 * `deleteAndCount()` (or `updateAll()` / `deleteAll()`), otherwise the other
 * rows are silently left behind.
 *
 * This test flags `update` and `delete` whose where clause is not an equality
 * on `id`. Filters on a column that is unique in prisma/schema.prisma are
 * listed in UNIQUE_FILTERS.
 */

const ROOT = process.cwd();

/** "<Model>.<field>" filters known to match at most one row (@unique). */
const UNIQUE_FILTERS = new Set(["ContractorOnboarding.contractorBusinessId"]);

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return walk(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) && !path.includes(`${join("src", "test")}`)
      ? [path]
      : [];
  });
}

function modelOf(chain: string): string | null {
  return chain.match(/orm\.public\.(\w+)/)?.[1] ?? null;
}

describe("single-row writes", () => {
  const suspicious: string[] = [];
  for (const file of walk(join(ROOT, "src"))) {
    const text = readFileSync(file, "utf8");
    if (!/\.(update|delete)\(/.test(text)) continue;
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
    const visit = (node: ts.Node) => {
      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        (node.expression.name.text === "update" || node.expression.name.text === "delete")
      ) {
        let receiver: ts.Expression = node.expression.expression;
        let whereArg: string | null = null;
        while (receiver) {
          if (ts.isCallExpression(receiver) && ts.isPropertyAccessExpression(receiver.expression)) {
            if (receiver.expression.name.text === "where") {
              whereArg = receiver.arguments[0]?.getText(source) ?? "";
              break;
            }
            receiver = receiver.expression.expression;
          } else if (ts.isPropertyAccessExpression(receiver)) {
            receiver = receiver.expression;
          } else break;
        }
        if (whereArg !== null) {
          const byId = /\bid\.eq\(|\{\s*id\s*[:,}]/.test(whereArg) && !/\bid\.in\(/.test(whereArg);
          const field = whereArg.match(/\(?\w+\)?\s*=>\s*\w+\.(\w+)\.eq\(/)?.[1];
          const model = modelOf(node.expression.expression.getText(source));
          const unique = !!(model && field && UNIQUE_FILTERS.has(`${model}.${field}`));
          if (!byId && !unique) {
            const { line } = source.getLineAndCharacterOfPosition(node.expression.name.getStart());
            suspicious.push(`${relative(ROOT, file)}:${line + 1} ${model ?? "?"}.${node.expression.name.text}`);
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }

  it("filter by id or a unique column (use the AndCount forms for several rows)", () => {
    expect(suspicious).toEqual([]);
  });
});
