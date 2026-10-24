/**
 * Mini Valeria — V2.0
 * Arquitectura de Subagentes Especializados (inspirado en OpenJarvis).
 *
 * En lugar de que un único agente cargue todas las herramientas y permisos
 * mezclados sin distinción de rol, Mini Valeria actúa como Orquestadora
 * Central y puede delegar tareas específicas a Subagentes Especialistas.
 *
 * Cada Subagente tiene:
 * 1. Identidad y misión clara (systemPrompt especializado).
 * 2. Conjunto estricto de permisos (grantedCapabilities — principio de menor privilegio).
 * 3. Acceso únicamente a las herramientas autorizadas por sus capabilities.
 */

import {
  getToolDefinitions,
  getToolMetadata,
  executeTool
} from "./tools.js";

const SUBAGENT_CATALOG = Object.freeze({
  memory_curator: {
    id: "memory_curator",
    name: "Subagente Curador de Memoria",
    description:
      "Especialista en consultar, organizar, guardar, actualizar o depurar las memorias personales a largo plazo de Teo.",
    grantedCapabilities: Object.freeze([
      "memory:read",
      "memory:write",
      "memory:delete"
    ]),
    systemInstruction: `
Eres el Subagente Curador de Memoria de Mini Valeria.
Tu única misión es gestionar con precisión las memorias persistentes de Teo.
Reglas:
- Consulta primero las memorias existentes antes de modificar o eliminar para evitar duplicados o errores.
- Resume hechos claros, estables y útiles a largo plazo.
- Devuelve un reporte claro y conciso a Mini Valeria con lo que encontraste o ejecutaste.
`.trim()
  },

  project_manager: {
    id: "project_manager",
    name: "Subagente Gestor de Proyectos y Documentos",
    description:
      "Especialista en estructurar proyectos, leer y redactar documentos técnicos o estratégicos, y mantener organizado el espacio de trabajo de Teo.",
    grantedCapabilities: Object.freeze([
      "project:read",
      "project:write",
      "project:delete",
      "document:read",
      "document:write",
      "document:delete"
    ]),
    systemInstruction: `
Eres el Subagente Gestor de Proyectos y Documentos de Mini Valeria.
Tu misión es consultar, estructurar, crear o actualizar proyectos y sus documentos asociados para Teo.
Reglas:
- Verifica siempre el proyecto y sus documentos existentes antes de proponer cambios.
- Mantén orden, claridad y estructura en cada documento o descripción de proyecto.
- Devuelve a Mini Valeria un resumen ejecutivo exacto de los datos consultados o los cambios realizados.
`.trim()
  },

  session_ops: {
    id: "session_ops",
    name: "Subagente de Operaciones de Conversación",
    description:
      "Especialista en inspeccionar conversaciones pasadas y gestionar el contexto temporal o las instrucciones activas de la sesión.",
    grantedCapabilities: Object.freeze([
      "conversation:read",
      "conversation:write",
      "conversation:delete",
      "context:read",
      "context:write",
      "context:delete",
      "instructions:read",
      "instructions:write",
      "instructions:delete"
    ]),
    systemInstruction: `
Eres el Subagente de Operaciones de Conversación de Mini Valeria.
Tu misión es consultar historiales de conversaciones y administrar el contexto temporal o las instrucciones de trabajo de la sesión actual.
Reglas:
- Distingue claramente entre contexto temporal (datos de referencia) e instrucciones de conversación (cómo trabajar).
- Devuelve un reporte preciso a Mini Valeria con el estado o los cambios aplicados.
`.trim()
  },

  strategic_advisor: {
    id: "strategic_advisor",
    name: "Subagente Consejero Estratégico",
    description:
      "Analista de solo lectura que cruza memorias, proyectos, documentos y conversaciones de Teo para detectar cuellos de botella, prioridades y dar recomendaciones estratégicas.",
    grantedCapabilities: Object.freeze([
      "memory:read",
      "project:read",
      "document:read",
      "conversation:read",
      "context:read",
      "instructions:read"
    ]),
    systemInstruction: `
Eres el Subagente Consejero Estratégico de Mini Valeria.
Tienes acceso de SOLO LECTURA a las memorias, proyectos, documentos y conversaciones de Teo.
Tu misión es cruzar información, encontrar patrones, detectar riesgos u obstáculos y proponer el siguiente paso más inteligente y accionable.
No intentes modificar datos; entrega un análisis directo y estructurado a Mini Valeria.
`.trim()
  }
});

function getSubagentCatalog() {
  return Object.values(SUBAGENT_CATALOG).map((agent) => ({
    id: agent.id,
    name: agent.name,
    description: agent.description,
    grantedCapabilities: [...agent.grantedCapabilities]
  }));
}

function getSubagentById(agentId) {
  if (!agentId || typeof agentId !== "string") return null;
  return SUBAGENT_CATALOG[agentId.trim()] || null;
}

/**
 * Filtra las herramientas del sistema para entregarle a un subagente
 * ÚNICAMENTE aquellas cuya capability esté dentro de sus grantedCapabilities.
 */
function getAllowedToolDefinitionsForAgent(agent) {
  if (!agent) return [];
  const grantedSet = new Set(agent.grantedCapabilities || []);
  return getToolDefinitions().filter((toolDef) => {
    const metadata = getToolMetadata(toolDef.name);
    return metadata && grantedSet.has(metadata.capability);
  });
}

/**
 * Ejecuta una herramienta en nombre de un subagente, aplicando estrictamente
 * las capabilities asignadas a ese subagente.
 */
async function executeSubagentTool(agent, toolName, args, { env, userId, sessionId, confirmationProvided = false }) {
  if (!agent) {
    throw new Error("Subagente no encontrado.");
  }

  return await executeTool(toolName, args, {
    env,
    userId,
    sessionId,
    grantedCapabilities: agent.grantedCapabilities,
    confirmationProvided
  });
}

const DELEGATE_SUBAGENT_DECLARATION = {
  name: "delegate_to_subagent",
  description:
    "Delega una tarea compleja o especializada a uno de los Subagentes de Mini Valeria (memory_curator, project_manager, session_ops, strategic_advisor). El subagente operará únicamente con sus permisos autorizados y devolverá un reporte estructurado.",
  parameters: {
    type: "object",
    properties: {
      agentId: {
        type: "string",
        description:
          "ID del subagente especialista: 'memory_curator', 'project_manager', 'session_ops' o 'strategic_advisor'."
      },
      task: {
        type: "string",
        description:
          "Instrucción clara y detallada de lo que el subagente debe investigar, analizar o ejecutar."
      }
    },
    required: ["agentId", "task"]
  }
};

export {
  SUBAGENT_CATALOG,
  DELEGATE_SUBAGENT_DECLARATION,
  getSubagentCatalog,
  getSubagentById,
  getAllowedToolDefinitionsForAgent,
  executeSubagentTool
};
