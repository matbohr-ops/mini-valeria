import test from "node:test";
import assert from "node:assert/strict";
import { authorizeTool, executeTool } from "../src/tools.js";
import {
  getSubagentCatalog,
  getSubagentById,
  getAllowedToolDefinitionsForAgent,
  executeSubagentTool
} from "../src/agents.js";

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

test("V1.9-G: requires confirmation for destructive tools when confirmationProvided is false", async () => {
  assert.deepEqual(
    authorizeTool("delete_memory", ["memory:delete"], false),
    {
      allowed: false,
      reason: "confirmation_required",
      capability: "memory:delete"
    }
  );

  await assert.rejects(
    async () => {
      try {
        await executeTool("delete_memory", { memoryId: "mem-123" }, {
          env: {},
          userId: "test-user",
          grantedCapabilities: ["memory:delete"],
          confirmationProvided: false
        });
      } catch (err) {
        assert.equal(err.code, "CONFIRMATION_REQUIRED");
        assert.equal(err.pendingConfirmation.toolName, "delete_memory");
        throw err;
      }
    },
    {
      message: "Esta herramienta requiere confirmación antes de ejecutarse."
    }
  );
});

test("V2.0: subagents only receive tools matching their grantedCapabilities", () => {
  const advisor = getSubagentById("strategic_advisor");
  assert.ok(advisor);

  const advisorTools = getAllowedToolDefinitionsForAgent(advisor).map((t) => t.name);
  assert.ok(advisorTools.includes("get_memories"));
  assert.ok(advisorTools.includes("get_projects"));
  assert.ok(!advisorTools.includes("save_memory"));
  assert.ok(!advisorTools.includes("delete_memory"));
  assert.ok(!advisorTools.includes("create_project"));

  const projectManager = getSubagentById("project_manager");
  const pmTools = getAllowedToolDefinitionsForAgent(projectManager).map((t) => t.name);
  assert.ok(pmTools.includes("create_project"));
  assert.ok(pmTools.includes("create_document"));
  assert.ok(!pmTools.includes("save_memory"));
});

test("V2.0: executeSubagentTool blocks out-of-scope tools for a subagent", async () => {
  const advisor = getSubagentById("strategic_advisor");
  await assert.rejects(
    () =>
      executeSubagentTool(advisor, "save_memory", { text: "intento no autorizado" }, {
        env: {},
        userId: "test-user"
      }),
    {
      message: "La herramienta requiere la capability memory:write."
    }
  );
});

test("V2.0: catalog exposes all 4 specialized subagents", () => {
  const catalog = getSubagentCatalog();
  assert.equal(catalog.length, 4);
  const ids = catalog.map((a) => a.id);
  assert.deepEqual(ids, [
    "memory_curator",
    "project_manager",
    "session_ops",
    "strategic_advisor"
  ]);
});
