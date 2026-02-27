import { describe, it } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("eval regression api contracts", () => {
  it("registers regression cockpit endpoints in routes_v2", () => {
    const routesFile = readFileSync(resolve(process.cwd(), "server/routes_v2.ts"), "utf-8");
    const requiredRoutes = [
      "/api/eval-runs/:id/diff",
      "/api/eval-runs/:id/regressed-cases",
      "/api/eval-suites/:id/trends",
      "/api/eval-results/:id/drilldown",
      "/api/eval-suites/:id/baseline",
      "/api/eval-suites/:id/thresholds",
    ];
    for (const route of requiredRoutes) {
      assert.ok(routesFile.includes(route), `Expected route to exist: ${route}`);
    }
    assert.ok(routesFile.includes("baselineMode"), "Expected baselineMode query support");
    assert.ok(routesFile.includes("windowDays"), "Expected windowDays query support");
  });

  it("registers eval drilldown page in router", () => {
    const appFile = readFileSync(resolve(process.cwd(), "client/src/App.tsx"), "utf-8");
    assert.ok(appFile.includes("/admin/evals"), "Expected /admin/evals route");
    assert.ok(appFile.includes("/admin/evals/runs/:runId/cases/:resultId"), "Expected eval case drilldown route");
  });
});
