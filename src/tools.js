/**
 * Mini Valeria — V1.9-E
 * Sistema de herramientas internas de lectura y escritura.
 *
 * Este módulo NO llama a Gemini y NO decide cuándo usar una herramienta.
 * Solo define:
 * 1. el catálogo de herramientas que Gemini puede conocer;
 * 2. la validación de argumentos;
 * 3. la ejecución controlada usando el userId del servidor.
 *
 * Las herramientas de escritura solo deben ejecutarse cuando Teo haya
 * expresado explícitamente la intención de crear o guardar información.
 */

const MAX_TOOL_ARGUMENT_LENGTH = 500;
const MAX_MEMORY_LENGTH = 1000;
const MAX_PROJECT_NAME_LENGTH = 100;
const MAX_PROJECT_DESCRIPTION_LENGTH = 5000;
const MAX_DOCUMENT_NAME_LENGTH = 200;
const MAX_DOCUMENT_CONTENT_LENGTH = 100000;
const MAX_TOOL_RESULT_LENGTH = 60000;

const TOOL_DEFINITIONS = [
  {
    name: "get_memories",
    description: "Obtiene las memorias persistentes de Teo.",
    parameters: { type: "object", properties: {}, required: [] }
  },
  {
    name: "get_projects",
    description: "Obtiene los proyectos persistentes de Teo.",
    parameters: { type: "object", properties: {}, required: [] }
  },
  {
    name: "get_project",
    description: "Obtiene un proyecto específico de Teo por su ID o por su nombre exacto.",
    parameters: {
      type: "object",
      properties: {
        projectId: { type: "string", description: "ID del proyecto o nombre exacto del proyecto." }
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
        projectId: { type: "string", description: "ID del proyecto o nombre exacto del proyecto." }
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
        projectId: { type: "string", description: "ID del proyecto o nombre exacto del proyecto." },
        documentId: { type: "string", description: "ID del documento." }
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
        conversationId: { type: "string", description: "ID de la conversación." }
      },
      required: ["conversationId"]
    }
  },
  {
    name: "save_memory",
    description: "Guarda una memoria persistente de Teo. Úsala solo cuando Teo haya pedido explícitamente guardar o recordar esa información.",
    parameters: {
      type: "object",
      properties: {
        text: { type: "string", description: "Texto breve de la memoria que se debe guardar." }
      },
      required: ["text"]
    }
  },
  {
    name: "create_project",
    description: "Crea un proyecto persistente para Teo. Úsala solo cuando Teo haya pedido explícitamente crear o guardar un proyecto.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Nombre del proyecto." },
        description: { type: "string", description: "Descripción del proyecto." }
      },
      required: ["name"]
    }
  },
  {
    name: "create_document",
    description: "Crea un documento persistente dentro de un proyecto. Úsala solo cuando Teo haya pedido explícitamente crear o guardar un documento.",
    parameters: {
      type: "object",
      properties: {
        projectId: { type: "string", description: "ID del proyecto o nombre exacto del proyecto." },
        name: { type: "string", description: "Nombre del documento." },
        content: { type: "string", description: "Contenido completo del documento." }
      },
      required: ["projectId", "name", "content"]
    }
  },
  {
    name: "update_memory",
    description: "Actualiza una memoria persistente existente de Teo. Úsala solo cuando Teo haya pedido explícitamente corregir, cambiar o actualizar una memoria concreta.",
    parameters: {
      type: "object",
      properties: {
        memoryId: { type: "string", description: "ID de la memoria que se debe actualizar." },
        text: { type: "string", description: "Nuevo texto completo de la memoria." }
      },
      required: ["memoryId", "text"]
    }
  },
  {
    name: "update_project",
    description: "Actualiza un proyecto persistente existente de Teo. Úsala solo cuando Teo haya pedido explícitamente modificar o actualizar un proyecto concreto.",
    parameters: {
      type: "object",
      properties: {
        projectId: { type: "string", description: "ID del proyecto o nombre exacto del proyecto." },
        name: { type: "string", description: "Nuevo nombre del proyecto, si se quiere cambiar." },
        description: { type: "string", description: "Nueva descripción del proyecto, si se quiere cambiar." }
      },
      required: ["projectId"]
    }
  },
  {
    name: "update_document",
    description: "Actualiza un documento persistente existente dentro de un proyecto. Úsala solo cuando Teo haya pedido explícitamente modificar o actualizar un documento concreto.",
    parameters: {
      type: "object",
      properties: {
        projectId: { type: "string", description: "ID del proyecto o nombre exacto del proyecto." },
        documentId: { type: "string", description: "ID del documento que se debe actualizar." },
        name: { type: "string", description: "Nuevo nombre del documento, si se quiere cambiar." },
        content: { type: "string", description: "Nuevo contenido completo del documento, si se quiere cambiar." }
      },
      required: ["projectId", "documentId"]
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
  if (!tool) throw new Error("Herramienta no encontrada.");

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

    if (property.type === "string" && typeof value === "string") {
      let maxLength = MAX_TOOL_ARGUMENT_LENGTH;

      if (tool.name === "save_memory" && key === "text") {
        maxLength = MAX_MEMORY_LENGTH;
      }

      if (tool.name === "create_project" && key === "name") {
        maxLength = MAX_PROJECT_NAME_LENGTH;
      }

      if (tool.name === "create_project" && key === "description") {
        maxLength = MAX_PROJECT_DESCRIPTION_LENGTH;
      }

      if (tool.name === "create_document" && key === "name") {
        maxLength = MAX_DOCUMENT_NAME_LENGTH;
      }

      if (
        (tool.name === "update_document" && key === "content") ||
        (tool.name === "create_document" && key === "content")
      ) {
        maxLength = MAX_DOCUMENT_CONTENT_LENGTH;
      }

      if (
        (tool.name === "update_memory" && key === "text")
      ) {
        maxLength = MAX_MEMORY_LENGTH;
      }

      if (
        (tool.name === "update_project" && key === "name")
      ) {
        maxLength = MAX_PROJECT_NAME_LENGTH;
      }

      if (
        (tool.name === "update_project" && key === "description")
      ) {
        maxLength = MAX_PROJECT_DESCRIPTION_LENGTH;
      }

      if (
        (tool.name === "update_document" && key === "name")
      ) {
        maxLength = MAX_DOCUMENT_NAME_LENGTH;
      }

      if (value.length > maxLength) {
        throw new Error(`El argumento ${key} supera el límite de ${maxLength} caracteres.`);
      }
    }
  }
}

async function resolveProject(userStub, projectRef) {
  const projectById = await userStub.getProject(projectRef);
  if (projectById) return projectById;

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

function compactCreatedDocument(document) {
  return {
    id: document.id,
    projectId: document.projectId,
    name: document.name,
    createdAt: document.createdAt
  };
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
      if (!project) throw new Error("El proyecto solicitado no existe.");
      return await userStub.getDocuments(project.id);
    }

    case "get_document": {
      const project = await resolveProject(userStub, args.projectId);
      if (!project) throw new Error("El proyecto solicitado no existe.");
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

      return { conversation, history, context, instructions };
    }

    case "save_memory": {
      const memory = await userStub.saveMemory(args.text.trim());
      return {
        id: memory.id,
        text: memory.text,
        createdAt: memory.createdAt
      };
    }

    case "create_project": {
      const project = await userStub.saveProject(
        args.name.trim(),
        typeof args.description === "string" ? args.description.trim() : ""
      );

      return {
        id: project.id,
        name: project.name,
        description: project.description,
        createdAt: project.createdAt
      };
    }

    case "create_document": {
      const project = await resolveProject(userStub, args.projectId);
      if (!project) {
        throw new Error("El proyecto solicitado no existe.");
      }

      const document = await userStub.saveDocument(
        project.id,
        args.name.trim(),
        args.content
      );

      return compactCreatedDocument(document);
    }

    case "update_memory": {
      const memory = await userStub.updateMemory(args.memoryId, args.text.trim());
      if (!memory) {
        throw new Error("La memoria solicitada no existe.");
      }

      return {
        id: memory.id,
        text: memory.text,
        createdAt: memory.createdAt,
        updatedAt: memory.updatedAt
      };
    }

    case "update_project": {
      if (args.name === undefined && args.description === undefined) {
        throw new Error("Debes indicar al menos un campo para actualizar.");
      }

      const project = await resolveProject(userStub, args.projectId);
      if (!project) {
        throw new Error("El proyecto solicitado no existe.");
      }

      const updated = await userStub.updateProject(
        project.id,
        args.name !== undefined ? args.name.trim() : undefined,
        args.description !== undefined ? args.description.trim() : undefined
      );

      return updated;
    }

    case "update_document": {
      if (args.name === undefined && args.content === undefined) {
        throw new Error("Debes indicar al menos un campo para actualizar.");
      }

      const project = await resolveProject(userStub, args.projectId);
      if (!project) {
        throw new Error("El proyecto solicitado no existe.");
      }

      const document = await userStub.getDocument(args.documentId, project.id);
      if (!document) {
        throw new Error("El documento solicitado no existe.");
      }

      const updated = await userStub.updateDocument(
        document.id,
        project.id,
        args.name !== undefined ? args.name.trim() : undefined,
        args.content !== undefined ? args.content : undefined
      );

      return {
        id: updated.id,
        projectId: updated.projectId,
        name: updated.name,
        content: updated.content,
        createdAt: updated.createdAt,
        updatedAt: updated.updatedAt
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
