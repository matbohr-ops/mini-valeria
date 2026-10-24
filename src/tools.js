/**
 * Mini Valeria — V1.9-G & V2.0
 * Sistema de herramientas internas de lectura, escritura, borrado controlado
 * y confirmación explícita para acciones críticas.
 *
 * Este módulo NO llama a Gemini y NO decide cuándo usar una herramienta.
 * Solo define:
 * 1. el catálogo de capacidades (CAPABILITY_CATALOG) y metadatos de operación;
 * 2. el catálogo de herramientas que Gemini y los Subagentes pueden conocer;
 * 3. la validación de argumentos y autorización por capabilities + confirmación;
 * 4. la ejecución controlada usando el userId y sessionId del servidor.
 */

const MAX_TOOL_ARGUMENT_LENGTH = 500;
const MAX_MEMORY_LENGTH = 1000;
const MAX_PROJECT_NAME_LENGTH = 100;
const MAX_PROJECT_DESCRIPTION_LENGTH = 5000;
const MAX_DOCUMENT_NAME_LENGTH = 200;
const MAX_DOCUMENT_CONTENT_LENGTH = 100000;
const MAX_CONTEXT_CONTENT_LENGTH = 100000;
const MAX_INSTRUCTIONS_CONTENT_LENGTH = 20000;
const MAX_TOOL_RESULT_LENGTH = 60000;

const CAPABILITY_CATALOG = Object.freeze({
  "memory:read": { description: "Consultar memorias persistentes." },
  "memory:write": { description: "Crear o actualizar memorias persistentes." },
  "memory:delete": { description: "Eliminar memorias persistentes." },
  "project:read": { description: "Consultar proyectos persistentes." },
  "project:write": { description: "Crear o actualizar proyectos persistentes." },
  "project:delete": { description: "Eliminar proyectos persistentes." },
  "document:read": { description: "Consultar documentos persistentes." },
  "document:write": { description: "Crear o actualizar documentos persistentes." },
  "document:delete": { description: "Eliminar documentos persistentes." },
  "conversation:read": { description: "Consultar conversaciones persistentes." },
  "conversation:write": { description: "Crear o actualizar conversaciones persistentes." },
  "conversation:delete": { description: "Eliminar conversaciones persistentes." },
  "context:read": { description: "Consultar contexto temporal de una conversación." },
  "context:write": { description: "Crear o actualizar contexto temporal." },
  "context:delete": { description: "Eliminar contexto temporal." },
  "instructions:read": { description: "Consultar instrucciones de una conversación." },
  "instructions:write": { description: "Crear o actualizar instrucciones." },
  "instructions:delete": { description: "Eliminar instrucciones." }
});

const TOOL_OPERATION_METADATA = Object.freeze({
  get_memories: { capability: "memory:read", requiresConfirmation: false },
  get_projects: { capability: "project:read", requiresConfirmation: false },
  get_project: { capability: "project:read", requiresConfirmation: false },
  get_documents: { capability: "document:read", requiresConfirmation: false },
  get_document: { capability: "document:read", requiresConfirmation: false },
  get_conversation: { capability: "conversation:read", requiresConfirmation: false },
  save_memory: { capability: "memory:write", requiresConfirmation: false },
  create_project: { capability: "project:write", requiresConfirmation: false },
  create_document: { capability: "document:write", requiresConfirmation: false },
  update_memory: { capability: "memory:write", requiresConfirmation: false },
  update_project: { capability: "project:write", requiresConfirmation: false },
  update_document: { capability: "document:write", requiresConfirmation: false },
  delete_memory: { capability: "memory:delete", requiresConfirmation: true },
  delete_document: { capability: "document:delete", requiresConfirmation: true },
  set_conversation_context: { capability: "context:write", requiresConfirmation: false },
  clear_conversation_context: { capability: "context:delete", requiresConfirmation: false },
  set_conversation_instructions: { capability: "instructions:write", requiresConfirmation: false },
  clear_conversation_instructions: { capability: "instructions:delete", requiresConfirmation: false }
});

const DEFAULT_GRANTED_CAPABILITIES = Object.freeze(Object.keys(CAPABILITY_CATALOG));

function authorizeTool(name, grantedCapabilities = DEFAULT_GRANTED_CAPABILITIES, confirmationProvided = false) {
  const metadata = TOOL_OPERATION_METADATA[name];
  if (!metadata) return { allowed: false, reason: "unknown_tool" };
  if (!grantedCapabilities.includes(metadata.capability)) {
    return { allowed: false, reason: "capability_denied", capability: metadata.capability };
  }
  if (metadata.requiresConfirmation && !confirmationProvided) {
    return { allowed: false, reason: "confirmation_required", capability: metadata.capability };
  }
  return { allowed: true };
}

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
        documentId: { type: "string", description: "ID del documento o nombre exacto del documento." }
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
        documentId: { type: "string", description: "ID del documento o nombre exacto del documento que se debe actualizar." },
        name: { type: "string", description: "Nuevo nombre del documento, si se quiere cambiar." },
        content: { type: "string", description: "Nuevo contenido completo del documento, si se quiere cambiar." }
      },
      required: ["projectId", "documentId"]
    }
  },
  {
    name: "delete_memory",
    description: "Elimina una memoria persistente de Teo. Requiere confirmación explícita de Teo antes de ejecutarse.",
    parameters: {
      type: "object",
      properties: {
        memoryId: { type: "string", description: "ID de la memoria que se desea eliminar." }
      },
      required: ["memoryId"]
    }
  },
  {
    name: "delete_document",
    description: "Elimina un documento persistente de un proyecto. Requiere confirmación explícita de Teo antes de ejecutarse.",
    parameters: {
      type: "object",
      properties: {
        projectId: { type: "string", description: "ID del proyecto o nombre exacto del proyecto." },
        documentId: { type: "string", description: "ID del documento o nombre exacto del documento que se desea eliminar." }
      },
      required: ["projectId", "documentId"]
    }
  },
  {
    name: "set_conversation_context",
    description: "Guarda o actualiza el contexto temporal adjunto a la conversación actual.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Nombre descriptivo del contexto temporal." },
        content: { type: "string", description: "Contenido del contexto temporal." }
      },
      required: ["content"]
    }
  },
  {
    name: "clear_conversation_context",
    description: "Quita el contexto temporal adjunto de la conversación actual.",
    parameters: { type: "object", properties: {}, required: [] }
  },
  {
    name: "set_conversation_instructions",
    description: "Guarda o actualiza las instrucciones temporales de trabajo para la conversación actual.",
    parameters: {
      type: "object",
      properties: {
        content: { type: "string", description: "Instrucciones temporales para esta conversación." }
      },
      required: ["content"]
    }
  },
  {
    name: "clear_conversation_instructions",
    description: "Quita las instrucciones temporales de la conversación actual.",
    parameters: { type: "object", properties: {}, required: [] }
  }
];

function getToolDefinitions() {
  return TOOL_DEFINITIONS.map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters
  }));
}

function getToolMetadata(name) {
  return TOOL_OPERATION_METADATA[name] || null;
}

function getCapabilitiesCatalog() {
  return {
    capabilities: CAPABILITY_CATALOG,
    tools: TOOL_OPERATION_METADATA,
    enforcement: "enforced"
  };
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

      if ((tool.name === "save_memory" || tool.name === "update_memory") && key === "text") {
        maxLength = MAX_MEMORY_LENGTH;
      }

      if ((tool.name === "create_project" || tool.name === "update_project") && key === "name") {
        maxLength = MAX_PROJECT_NAME_LENGTH;
      }

      if ((tool.name === "create_project" || tool.name === "update_project") && key === "description") {
        maxLength = MAX_PROJECT_DESCRIPTION_LENGTH;
      }

      if ((tool.name === "create_document" || tool.name === "update_document") && key === "name") {
        maxLength = MAX_DOCUMENT_NAME_LENGTH;
      }

      if ((tool.name === "create_document" || tool.name === "update_document") && key === "content") {
        maxLength = MAX_DOCUMENT_CONTENT_LENGTH;
      }

      if (tool.name === "set_conversation_context" && key === "content") {
        maxLength = MAX_CONTEXT_CONTENT_LENGTH;
      }

      if (tool.name === "set_conversation_instructions" && key === "content") {
        maxLength = MAX_INSTRUCTIONS_CONTENT_LENGTH;
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

async function resolveDocument(userStub, projectId, documentRef) {
  const docById = await userStub.getDocument(documentRef, projectId);
  if (docById) return docById;

  const documents = await userStub.getDocuments(projectId);
  const normalizedRef = documentRef.trim().toLowerCase();

  return (
    documents.find(
      (item) =>
        typeof item.name === "string" &&
        item.name.trim().toLowerCase() === normalizedRef
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

/**
 * Construye una descripción amigable para mostrarle a Teo cuando una
 * herramienta requiere su confirmación explícita antes de ejecutarse.
 */
function buildConfirmationSummary(name, args) {
  switch (name) {
    case "delete_memory":
      return `Eliminar la memoria con ID "${args.memoryId}".`;
    case "delete_document":
      return `Eliminar el documento "${args.documentId}" del proyecto "${args.projectId}".`;
    default:
      return `Ejecutar la acción "${name}".`;
  }
}

async function executeTool(
  name,
  args,
  {
    env,
    userId,
    sessionId = null,
    grantedCapabilities = DEFAULT_GRANTED_CAPABILITIES,
    confirmationProvided = false
  }
) {
  const authorization = authorizeTool(name, grantedCapabilities, confirmationProvided);
  if (!authorization.allowed) {
    if (authorization.reason === "capability_denied") {
      throw new Error(`La herramienta requiere la capability ${authorization.capability}.`);
    }
    if (authorization.reason === "confirmation_required") {
      const err = new Error("Esta herramienta requiere confirmación antes de ejecutarse.");
      err.code = "CONFIRMATION_REQUIRED";
      err.pendingConfirmation = {
        toolName: name,
        args: args || {},
        summary: buildConfirmationSummary(name, args || {})
      };
      throw err;
    }
    throw new Error("Herramienta no autorizada.");
  }

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
      const document = await resolveDocument(userStub, project.id, args.documentId);
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

      const document = await resolveDocument(userStub, project.id, args.documentId);
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

    case "delete_memory": {
      const deleted = await userStub.deleteMemory(args.memoryId);
      if (!deleted) {
        throw new Error("La memoria solicitada no existe.");
      }
      return { deleted: true, memory: deleted };
    }

    case "delete_document": {
      const project = await resolveProject(userStub, args.projectId);
      if (!project) {
        throw new Error("El proyecto solicitado no existe.");
      }

      const document = await resolveDocument(userStub, project.id, args.documentId);
      if (!document) {
        throw new Error("El documento solicitado no existe.");
      }

      const deleted = await userStub.deleteDocument(document.id, project.id);
      if (!deleted) {
        throw new Error("No se pudo eliminar el documento.");
      }

      return {
        deleted: true,
        document: {
          id: deleted.id,
          projectId: deleted.projectId,
          name: deleted.name
        }
      };
    }

    case "set_conversation_context": {
      if (!sessionId) {
        throw new Error("No se recibió un sessionId válido para guardar el contexto.");
      }
      const sessionDoId = env.CONVERSATION_SESSION.idFromName(sessionId);
      const sessionStub = env.CONVERSATION_SESSION.get(sessionDoId);
      return await sessionStub.saveContext(
        args.name ? args.name.trim() : "Información adjunta",
        args.content
      );
    }

    case "clear_conversation_context": {
      if (!sessionId) {
        throw new Error("No se recibió un sessionId válido para quitar el contexto.");
      }
      const sessionDoId = env.CONVERSATION_SESSION.idFromName(sessionId);
      const sessionStub = env.CONVERSATION_SESSION.get(sessionDoId);
      await sessionStub.deleteContext();
      return { cleared: true };
    }

    case "set_conversation_instructions": {
      if (!sessionId) {
        throw new Error("No se recibió un sessionId válido para guardar las instrucciones.");
      }
      const sessionDoId = env.CONVERSATION_SESSION.idFromName(sessionId);
      const sessionStub = env.CONVERSATION_SESSION.get(sessionDoId);
      return await sessionStub.saveInstructions(args.content.trim());
    }

    case "clear_conversation_instructions": {
      if (!sessionId) {
        throw new Error("No se recibió un sessionId válido para quitar las instrucciones.");
      }
      const sessionDoId = env.CONVERSATION_SESSION.idFromName(sessionId);
      const sessionStub = env.CONVERSATION_SESSION.get(sessionDoId);
      await sessionStub.deleteInstructions();
      return { cleared: true };
    }

    default:
      throw new Error("Herramienta no implementada.");
  }
}

export {
  getToolDefinitions,
  getToolByName,
  getToolMetadata,
  getCapabilitiesCatalog,
  authorizeTool,
  executeTool
};
