/**
 * Mini Valeria — V1.9-A
 * Sistema base de herramientas internas.
 *
 * Este módulo NO llama a Gemini y NO decide cuándo usar una herramienta.
 * Solo define:
 * 1. el catálogo de herramientas que Gemini podrá conocer;
 * 2. la validación básica de argumentos;
 * 3. la ejecución controlada de herramientas usando el userId del servidor.
 *
 * V1.9-B conectará estas herramientas al Worker.
 * V1.9-C conectará el catálogo al tool/function calling de Gemini.
 */

const MAX_TOOL_ARGUMENT_LENGTH = 500;
const MAX_TOOL_RESULT_LENGTH = 60000;

const TOOL_DEFINITIONS = [
  {
    name: "get_memories",
    description: "Obtiene las memorias persistentes de Teo.",
    parameters: {
      type: "object",
      properties: {},
      required: []
    }
  },
  {
    name: "get_projects",
    description: "Obtiene los proyectos persistentes de Teo.",
    parameters: {
      type: "object",
      properties: {},
      required: []
    }
  },
  {
    name: "get_project",
    description: "Obtiene un proyecto específico de Teo por su ID o por su nombre exacto.",
    parameters: {
      type: "object",
      properties: {
        projectId: {
          type: "string",
          description: "ID del proyecto o nombre exacto del proyecto."
        }
      },
      required: ["projectId"]
    }
  },
  {
    name: "get_documents",
    description: "Obtiene los documentos guardados dentro de un proyecto.",
    parameters: {
      type: "object",
      properties: {
        projectId: {
          type: "string",
          description: "ID del proyecto o nombre exacto del proyecto."
        }
      },
      required: ["projectId"]
    }
  },
  {
    name: "get_document",
    description: "Obtiene un documento específico de un proyecto.",
    parameters: {
      type: "object",
      properties: {
        projectId: {
          type: "string",
          description: "ID del proyecto o nombre exacto del proyecto."
        },
        documentId: {
          type: "string",
          description: "ID del documento."
        }
      },
      required: ["projectId", "documentId"]
    }
  },
  {
    name: "get_conversation",
    description: "Obtiene una conversación persistente, incluyendo su historial y contexto adjunto.",
    parameters: {
      type: "object",
      properties: {
        conversationId: {
          type: "string",
          description: "ID de la conversación."
        }
      },
      required: ["conversationId"]
    }
  }
];

function getToolDefinitions() {
  return TOOL_DEFINITIONS.map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters
  }));
}

function getToolByName(name) {
  return TOOL_DEFINITIONS.find((tool) => tool.name === name) || null;
}

function validateToolArguments(tool, args) {
  if (!tool) {
    throw new Error("Herramienta no encontrada.");
  }

  if (args === null || typeof args !== "object" || Array.isArray(args)) {
    throw new Error("Los argumentos de la herramienta deben ser un objeto.");
  }

  const required = tool.parameters.required || [];
  for (const field of required) {
    if (
      !Object.prototype.hasOwnProperty.call(args, field) ||
      typeof args[field] !== "string" ||
      !args[field].trim()
    ) {
      throw new Error(`Falta el argumento requerido: ${field}.`);
    }
  }

  for (const [key, value] of Object.entries(args)) {
    const property = tool.parameters.properties[key];

    if (!property) {
      throw new Error(`Argumento no permitido: ${key}.`);
    }

    if (property.type === "string" && typeof value !== "string") {
      throw new Error(`El argumento ${key} debe ser texto.`);
    }

    if (property.type === "string" && typeof value === "string" && value.length > MAX_TOOL_ARGUMENT_LENGTH) {
      throw new Error(`El argumento ${key} supera el límite de ${MAX_TOOL_ARGUMENT_LENGTH} caracteres.`);
    }
  }
}

async function resolveProject(userStub, projectRef) {
  const projectById = await userStub.getProject(projectRef);
  if (projectById) {
    return projectById;
  }

  const projects = await userStub.getProjects();
  const normalizedRef = projectRef.trim().toLowerCase();

  return (
    projects.find(
      (project) =>
        typeof project.name === "string" &&
        project.name.trim().toLowerCase() === normalizedRef
    ) || null
  );
}

async function executeTool(name, args, { env, userId }) {
  const tool = getToolByName(name);
  validateToolArguments(tool, args);

  if (!userId || typeof userId !== "string") {
    throw new Error("No se recibió un userId válido para ejecutar la herramienta.");
  }

  const userDoId = env.USER_MEMORY.idFromName(userId);
  const userStub = env.USER_MEMORY.get(userDoId);

  switch (name) {
    case "get_memories":
      return await userStub.getMemories();

    case "get_projects":
      return await userStub.getProjects();

    case "get_project": {
      const project = await resolveProject(userStub, args.projectId);
      if (!project) throw new Error("El proyecto solicitado no existe.");
      return project;
    }

    case "get_documents": {
      const project = await resolveProject(userStub, args.projectId);
      if (!project) {
        throw new Error("El proyecto solicitado no existe.");
      }
      return await userStub.getDocuments(project.id);
    }

    case "get_document": {
      const project = await resolveProject(userStub, args.projectId);
      if (!project) {
        throw new Error("El proyecto solicitado no existe.");
      }
      const document = await userStub.getDocument(args.documentId, project.id);
      if (!document) throw new Error("El documento solicitado no existe.");
      return document;
    }

    case "get_conversation": {
      const conversation = await userStub.getConversation(args.conversationId);
      if (!conversation) {
        throw new Error("La conversación solicitada no existe.");
      }

      const sessionDoId = env.CONVERSATION_SESSION.idFromName(conversation.sessionId);
      const sessionStub = env.CONVERSATION_SESSION.get(sessionDoId);

      const history = await sessionStub.getHistory();
      const context = await sessionStub.getContext();
      const instructions = await sessionStub.getInstructions();

      return {
        conversation,
        history,
        context,
        instructions
      };
    }

    default:
      throw new Error("Herramienta no implementada.");
  }
}

export {
  getToolDefinitions,
  getToolByName,
  executeTool
};
