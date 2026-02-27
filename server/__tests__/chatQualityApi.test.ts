import { describe, it } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("chat quality api contracts", () => {
  it("registers required admin chat endpoints in routes_v2", () => {
    const routesFile = readFileSync(resolve(process.cwd(), "server/routes_v2.ts"), "utf-8");
    const requiredRoutes = [
      "/api/admin/chats",
      "/api/admin/chats/overview",
      "/api/admin/chats/timeseries",
      "/api/admin/chats/:chatId",
      "/api/admin/chats/:chatId/replies/:replyId",
      "/api/admin/chats/baselines",
      "/api/admin/chats/compare",
    ];
    for (const route of requiredRoutes) {
      assert.ok(routesFile.includes(route), `Expected route to exist: ${route}`);
    }
  });

  it("registers new admin chat pages in client router", () => {
    const appFile = readFileSync(resolve(process.cwd(), "client/src/App.tsx"), "utf-8");
    assert.ok(appFile.includes("/admin/chats"), "Expected /admin/chats route");
    assert.ok(appFile.includes("/admin/chats/:chatId"), "Expected chat detail route");
    assert.ok(appFile.includes("/admin/chats/:chatId/replies/:replyId"), "Expected reply detail route");
  });
});
