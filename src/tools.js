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
const MAX_EVENT_TITLE_LENGTH = 200;
const MAX_EVENT_DESCRIPTION_LENGTH = 5000;
const MAX_TASK_TITLE_LENGTH = 200;
const MAX_TASK_DESCRIPTION_LENGTH = 5000;
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
  "instructions:delete": { description: "Eliminar instrucciones." },
  "calendar:read": { description: "Consultar eventos y agenda del calendario." },
  "calendar:write": { description: "Crear o actualizar eventos en el calendario." },
  "calendar:delete": { description: "Eliminar eventos del calendario." },
  "task:read": { description: "Consultar tareas, pendientes y recordatorios." },
  "task:write": { description: "Crear, completar o actualizar tareas y pendientes." },
  "task:delete": { description: "Eliminar tareas o pendientes." }
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
  clear_conversation_instructions: { capability: "instructions:delete", requiresConfirmation: false },
  get_calendar_events: { capability: "calendar:read", requiresConfirmation: false },
  create_calendar_event: { capability: "calendar:write", requiresConfirmation: false },
  update_calendar_event: { capability: "calendar:write", requiresConfirmation: false },
  delete_calendar_event: { capability: "calendar:delete", requiresConfirmation: true },
  get_tasks: { capability: "task:read", requiresConfirmation: false },
  create_task: { capability: "task:write", requiresConfirmation: false },
  update_task: { capability: "task:write", requiresConfirmation: false },
  delete_task: { capability: "task:delete", requiresConfirmation: true }
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
  },
  {
    name: "get_calendar_events",
    description: "Obtiene los eventos agendados en el calendario de Teo. Permite filtrar opcionalmente por fecha de inicio/fin o búsqueda de texto.",
    parameters: {
      type: "object",
      properties: {
        from: { type: "string", description: "Fecha/hora mínima opcional (formato ISO o YYYY-MM-DD)." },
        to: { type: "string", description: "Fecha/hora máxima opcional (formato ISO o YYYY-MM-DD)." },
        query: { type: "string", description: "Texto opcional para filtrar por título, descripción o lugar." }
      },
      required: []
    }
  },
  {
    name: "create_calendar_event",
    description: "Crea un nuevo evento o cita en el calendario de Teo. Úsala cuando Teo pida agendar una reunión, cita, recordatorio con hora o bloque de tiempo.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "Título del evento o reunión." },
        startTime: { type: "string", description: "Fecha y hora de inicio (ej. '2026-10-25T15:00' o '2026-10-25 15:00')." },
        endTime: { type: "string", description: "Fecha y hora de finalización opcional." },
        description: { type: "string", description: "Notas o detalles del evento." },
        location: { type: "string", description: "Lugar físico, enlace o sala virtual." },
        category: { type: "string", description: "Categoría opcional (ej. 'work', 'personal', 'study', 'health')." }
      },
      required: ["title", "startTime"]
    }
  },
  {
    name: "update_calendar_event",
    description: "Actualiza un evento existente del calendario de Teo por su ID o por su título exacto.",
    parameters: {
      type: "object",
      properties: {
        eventId: { type: "string", description: "ID del evento o título exacto del evento a modificar." },
        title: { type: "string", description: "Nuevo título del evento, si cambia." },
        startTime: { type: "string", description: "Nueva fecha y hora de inicio, si cambia." },
        endTime: { type: "string", description: "Nueva fecha y hora de fin, si cambia." },
        description: { type: "string", description: "Nueva descripción, si cambia." },
        location: { type: "string", description: "Nueva ubicación, si cambia." },
        category: { type: "string", description: "Nueva categoría, si cambia." }
      },
      required: ["eventId"]
    }
  },
  {
    name: "delete_calendar_event",
    description: "Elimina un evento del calendario de Teo. Requiere confirmación explícita antes de ejecutarse.",
    parameters: {
      type: "object",
      properties: {
        eventId: { type: "string", description: "ID del evento o título exacto del evento que se desea eliminar." }
      },
      required: ["eventId"]
    }
  },
  {
    name: "get_tasks",
    description: "Obtiene la lista de tareas y pendientes de Teo. Permite filtrar opcionalmente por estado ('pending', 'in_progress', 'completed'), prioridad ('low', 'medium', 'high', 'urgent') o proyecto.",
    parameters: {
      type: "object",
      properties: {
        status: { type: "string", description: "Estado opcional para filtrar: 'pending', 'in_progress' o 'completed'." },
        priority: { type: "string", description: "Prioridad opcional para filtrar: 'low', 'medium', 'high' o 'urgent'." },
        projectId: { type: "string", description: "ID o nombre del proyecto opcional para filtrar sus tareas." }
      },
      required: []
    }
  },
  {
    name: "create_task",
    description: "Crea una nueva tarea o pendiente para Teo.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "Título claro y accionable de la tarea." },
        description: { type: "string", description: "Detalles adicionales o pasos de la tarea." },
        dueDate: { type: "string", description: "Fecha límite opcional (ej. '2026-10-26' o '2026-10-26T18:00')." },
        priority: { type: "string", description: "Prioridad de la tarea: 'low', 'medium', 'high' o 'urgent' (por defecto 'medium')." },
        projectId: { type: "string", description: "ID o nombre del proyecto al que pertenece la tarea (opcional)." }
      },
      required: ["title"]
    }
  },
  {
    name: "update_task",
    description: "Actualiza una tarea existente (por ejemplo para marcarla como 'completed' o 'in_progress', cambiar su fecha límite, prioridad o título).",
    parameters: {
      type: "object",
      properties: {
        taskId: { type: "string", description: "ID de la tarea o título exacto de la tarea que se desea actualizar." },
        title: { type: "string", description: "Nuevo título de la tarea, si cambia." },
        description: { type: "string", description: "Nueva descripción, si cambia." },
        dueDate: { type: "string", description: "Nueva fecha límite, si cambia." },
        priority: { type: "string", description: "Nueva prioridad ('low', 'medium', 'high', 'urgent'), si cambia." },
        status: { type: "string", description: "Nuevo estado ('pending', 'in_progress', 'completed'), si cambia." }
      },
      required: ["taskId"]
    }
  },
  {
    name: "delete_task",
    description: "Elimina una tarea o pendiente de Teo. Requiere confirmación explícita antes de ejecutarse.",
    parameters: {
      type: "object",
      properties: {
        taskId: { type: "string", description: "ID de la tarea o título exacto de la tarea que se desea eliminar." }
      },
      required: ["taskId"]
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

      if ((tool.name === "create_calendar_event" || tool.name === "update_calendar_event") && key === "title") {
        maxLength = MAX_EVENT_TITLE_LENGTH;
      }

      if ((tool.name === "create_calendar_event" || tool.name === "update_calendar_event") && key === "description") {
        maxLength = MAX_EVENT_DESCRIPTION_LENGTH;
      }

      if ((tool.name === "create_task" || tool.name === "update_task") && key === "title") {
        maxLength = MAX_TASK_TITLE_LENGTH;
      }

      if ((tool.name === "create_task" || tool.name === "update_task") && key === "description") {
        maxLength = MAX_TASK_DESCRIPTION_LENGTH;
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

async function resolveCalendarEvent(userStub, eventRef) {
  const byId = await userStub.getCalendarEvent(eventRef);
  if (byId) return byId;

  const events = await userStub.getCalendarEvents();
  const normalizedRef = eventRef.trim().toLowerCase();

  return (
    events.find(
      (item) =>
        typeof item.title === "string" &&
        item.title.trim().toLowerCase() === normalizedRef
    ) || null
  );
}

async function resolveTask(userStub, taskRef) {
  const byId = await userStub.getTask(taskRef);
  if (byId) return byId;

  const tasks = await userStub.getTasks();
  const normalizedRef = taskRef.trim().toLowerCase();

  return (
    tasks.find(
      (item) =>
        typeof item.title === "string" &&
        item.title.trim().toLowerCase() === normalizedRef
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
    case "delete_calendar_event":
      return `Eliminar el evento de calendario "${args.eventId}".`;
    case "delete_task":
      return `Eliminar la tarea "${args.taskId}".`;
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

    case "get_calendar_events": {
      return await userStub.getCalendarEvents({
        from: args.from ? args.from.trim() : null,
        to: args.to ? args.to.trim() : null,
        query: args.query ? args.query.trim() : null
      });
    }

    case "create_calendar_event": {
      const event = await userStub.saveCalendarEvent({
        title: args.title.trim(),
        startTime: args.startTime.trim(),
        endTime: typeof args.endTime === "string" ? args.endTime.trim() : "",
        description: typeof args.description === "string" ? args.description.trim() : "",
        location: typeof args.location === "string" ? args.location.trim() : "",
        category: typeof args.category === "string" && args.category.trim() ? args.category.trim() : "general"
      });
      return event;
    }

    case "update_calendar_event": {
      if (
        args.title === undefined &&
        args.startTime === undefined &&
        args.endTime === undefined &&
        args.description === undefined &&
        args.location === undefined &&
        args.category === undefined
      ) {
        throw new Error("Debes indicar al menos un campo del evento para actualizar.");
      }

      const existing = await resolveCalendarEvent(userStub, args.eventId);
      if (!existing) {
        throw new Error("El evento de calendario solicitado no existe.");
      }

      const updated = await userStub.updateCalendarEvent(existing.id, {
        title: args.title !== undefined ? args.title.trim() : undefined,
        startTime: args.startTime !== undefined ? args.startTime.trim() : undefined,
        endTime: args.endTime !== undefined ? args.endTime.trim() : undefined,
        description: args.description !== undefined ? args.description.trim() : undefined,
        location: args.location !== undefined ? args.location.trim() : undefined,
        category: args.category !== undefined ? args.category.trim() : undefined
      });

      return updated;
    }

    case "delete_calendar_event": {
      const existing = await resolveCalendarEvent(userStub, args.eventId);
      if (!existing) {
        throw new Error("El evento de calendario solicitado no existe.");
      }

      const deleted = await userStub.deleteCalendarEvent(existing.id);
      if (!deleted) {
        throw new Error("No se pudo eliminar el evento de calendario.");
      }

      return { deleted: true, event: deleted };
    }

    case "get_tasks": {
      let resolvedProjectId = null;
      if (args.projectId && args.projectId.trim()) {
        const project = await resolveProject(userStub, args.projectId);
        resolvedProjectId = project ? project.id : args.projectId.trim();
      }

      return await userStub.getTasks({
        status: args.status ? args.status.trim() : null,
        priority: args.priority ? args.priority.trim() : null,
        projectId: resolvedProjectId
      });
    }

    case "create_task": {
      let resolvedProjectId = null;
      if (args.projectId && args.projectId.trim()) {
        const project = await resolveProject(userStub, args.projectId);
        resolvedProjectId = project ? project.id : null;
      }

      const task = await userStub.saveTask({
        title: args.title.trim(),
        description: typeof args.description === "string" ? args.description.trim() : "",
        dueDate: typeof args.dueDate === "string" ? args.dueDate.trim() : "",
        priority: typeof args.priority === "string" && args.priority.trim() ? args.priority.trim().toLowerCase() : "medium",
        projectId: resolvedProjectId
      });

      return task;
    }

    case "update_task": {
      if (
        args.title === undefined &&
        args.description === undefined &&
        args.dueDate === undefined &&
        args.priority === undefined &&
        args.status === undefined
      ) {
        throw new Error("Debes indicar al menos un campo de la tarea para actualizar.");
      }

      const existing = await resolveTask(userStub, args.taskId);
      if (!existing) {
        throw new Error("La tarea solicitada no existe.");
      }

      const updated = await userStub.updateTask(existing.id, {
        title: args.title !== undefined ? args.title.trim() : undefined,
        description: args.description !== undefined ? args.description.trim() : undefined,
        dueDate: args.dueDate !== undefined ? args.dueDate.trim() : undefined,
        priority: args.priority !== undefined ? args.priority.trim().toLowerCase() : undefined,
        status: args.status !== undefined ? args.status.trim().toLowerCase() : undefined
      });

      return updated;
    }

    case "delete_task": {
      const existing = await resolveTask(userStub, args.taskId);
      if (!existing) {
        throw new Error("La tarea solicitada no existe.");
      }

      const deleted = await userStub.deleteTask(existing.id);
      if (!deleted) {
        throw new Error("No se pudo eliminar la tarea.");
      }

      return { deleted: true, task: deleted };
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
