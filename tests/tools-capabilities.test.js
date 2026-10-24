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

test("V2.0 & V2.1: catalog exposes all 5 specialized subagents including cronos", () => {
  const catalog = getSubagentCatalog();
  assert.equal(catalog.length, 5);
  const ids = catalog.map((a) => a.id);
  assert.deepEqual(ids, [
    "memory_curator",
    "project_manager",
    "session_ops",
    "strategic_advisor",
    "cronos"
  ]);
});

test("V2.1 (Paso 3): cronos subagent has calendar and task capabilities and enforces confirmation on delete", async () => {
  const cronos = getSubagentById("cronos");
  assert.ok(cronos);

  const cronosTools = getAllowedToolDefinitionsForAgent(cronos).map((t) => t.name);
  assert.ok(cronosTools.includes("get_calendar_events"));
  assert.ok(cronosTools.includes("create_calendar_event"));
  assert.ok(cronosTools.includes("update_calendar_event"));
  assert.ok(cronosTools.includes("delete_calendar_event"));
  assert.ok(cronosTools.includes("get_tasks"));
  assert.ok(cronosTools.includes("create_task"));
  assert.ok(cronosTools.includes("update_task"));
  assert.ok(cronosTools.includes("delete_task"));
  assert.ok(!cronosTools.includes("save_memory"));
  assert.ok(!cronosTools.includes("delete_memory"));

  await assert.rejects(
    async () => {
      try {
        await executeSubagentTool(
          cronos,
          "delete_calendar_event",
          { eventId: "evt-1" },
          { env: {}, userId: "test-user", confirmationProvided: false }
        );
      } catch (err) {
        assert.equal(err.code, "CONFIRMATION_REQUIRED");
        assert.equal(err.pendingConfirmation.toolName, "delete_calendar_event");
        throw err;
      }
    },
    { message: "Esta herramienta requiere confirmación antes de ejecutarse." }
  );

  await assert.rejects(
    async () => {
      try {
        await executeSubagentTool(
          cronos,
          "delete_task",
          { taskId: "tsk-1" },
          { env: {}, userId: "test-user", confirmationProvided: false }
        );
      } catch (err) {
        assert.equal(err.code, "CONFIRMATION_REQUIRED");
        assert.equal(err.pendingConfirmation.toolName, "delete_task");
        throw err;
      }
    },
    { message: "Esta herramienta requiere confirmación antes de ejecutarse." }
  );
});

test("V2.1 (Paso 3): executeSubagentTool for cronos creates and lists calendar events and tasks", async () => {
  const cronos = getSubagentById("cronos");
  const mockEvents = [];
  const mockTasks = [];

  const mockStub = {
    saveCalendarEvent: async (evt) => {
      const created = { id: "evt-100", ...evt };
      mockEvents.push(created);
      return created;
    },
    getCalendarEvents: async () => mockEvents,
    saveTask: async (tsk) => {
      const created = { id: "tsk-200", status: "pending", ...tsk };
      mockTasks.push(created);
      return created;
    },
    getTasks: async () => mockTasks
  };

  const mockEnv = {
    USER_MEMORY: {
      idFromName: () => "do-id",
      get: () => mockStub
    }
  };

  const createdEvent = await executeSubagentTool(
    cronos,
    "create_calendar_event",
    {
      title: "Reunión Shift",
      startTime: "2026-10-25T10:00",
      location: "Google Meet"
    },
    { env: mockEnv, userId: "matiu" }
  );
  assert.equal(createdEvent.id, "evt-100");
  assert.equal(createdEvent.title, "Reunión Shift");

  const createdTask = await executeSubagentTool(
    cronos,
    "create_task",
    {
      title: "Revisar QA de Getincloud ARM",
      priority: "high",
      dueDate: "2026-10-24"
    },
    { env: mockEnv, userId: "matiu" }
  );
  assert.equal(createdTask.id, "tsk-200");
  assert.equal(createdTask.priority, "high");

  const events = await executeSubagentTool(
    cronos,
    "get_calendar_events",
    {},
    { env: mockEnv, userId: "matiu" }
  );
  assert.equal(events.length, 1);

  const tasks = await executeSubagentTool(
    cronos,
    "get_tasks",
    {},
    { env: mockEnv, userId: "matiu" }
  );
  assert.equal(tasks.length, 1);
});
