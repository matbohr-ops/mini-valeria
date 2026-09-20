import test from "node:test";
import assert from "node:assert/strict";
import { authorizeTool, executeTool } from "../src/tools.js";

test("allows a tool when its capability is granted", () => {
  assert.deepEqual(
    authorizeTool("get_memories", ["memory:read"]),
    { allowed: true }
  );
});

test("denies a tool when its capability is missing", () => {
  assert.deepEqual(
    authorizeTool("get_memories", []),
    {
      allowed: false,
      reason: "capability_denied",
      capability: "memory:read"
    }
  );
});

test("denies an unknown tool", () => {
  assert.deepEqual(
    authorizeTool("tool_that_does_not_exist", []),
    { allowed: false, reason: "unknown_tool" }
  );
});

test("executeTool blocks before touching storage when capability is denied", async () => {
  await assert.rejects(
    () =>
      executeTool("get_memories", {}, {
        env: {},
        userId: "test-user",
        grantedCapabilities: []
      }),
    {
      message: "La herramienta requiere la capability memory:read."
    }
  );
});
