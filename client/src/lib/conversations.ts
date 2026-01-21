/**
 * Conversation storage for multi-chat support
 * Uses localStorage with stable schema for future backend migration
 */

export interface Conversation {
    id: string;
    title: string;
    createdAt: string;
    updatedAt: string;
}

export interface Message {
    id: string;
    role: "user" | "assistant";
    content: string;
    response?: any;
    timestamp: string;
}

const STORAGE_KEYS = {
    conversations: "fieldcopilot.conversations",
    activeConversationId: "fieldcopilot.activeConversationId",
    messagesPrefix: "fieldcopilot.messages.",
};

// Generate UUID
function generateId(): string {
    return crypto.randomUUID();
}

// Get all conversations
export function getConversations(): Conversation[] {
    try {
        const data = localStorage.getItem(STORAGE_KEYS.conversations);
        return data ? JSON.parse(data) : [];
    } catch {
        return [];
    }
}

// Save conversations list
function saveConversations(conversations: Conversation[]): void {
    localStorage.setItem(STORAGE_KEYS.conversations, JSON.stringify(conversations));
}

// Get active conversation ID
export function getActiveConversationId(): string | null {
    return localStorage.getItem(STORAGE_KEYS.activeConversationId);
}

// Set active conversation ID
export function setActiveConversationId(id: string): void {
    localStorage.setItem(STORAGE_KEYS.activeConversationId, id);
}

// Create new conversation
export function createConversation(title: string = "New Chat"): Conversation {
    const now = new Date().toISOString();
    const conversation: Conversation = {
        id: generateId(),
        title,
        createdAt: now,
        updatedAt: now,
    };

    const conversations = getConversations();
    conversations.unshift(conversation); // Add to beginning
    saveConversations(conversations);
    setActiveConversationId(conversation.id);

    return conversation;
}

// Update conversation (title, updatedAt)
export function updateConversation(id: string, updates: Partial<Pick<Conversation, "title">>): Conversation | null {
    const conversations = getConversations();
    const idx = conversations.findIndex((c) => c.id === id);
    if (idx === -1) return null;

    conversations[idx] = {
        ...conversations[idx],
        ...updates,
        updatedAt: new Date().toISOString(),
    };
    saveConversations(conversations);
    return conversations[idx];
}

// Delete conversation
export function deleteConversation(id: string): void {
    const conversations = getConversations().filter((c) => c.id !== id);
    saveConversations(conversations);

    // Clear messages for this conversation
    localStorage.removeItem(STORAGE_KEYS.messagesPrefix + id);

    // If active conversation was deleted, switch to first available
    if (getActiveConversationId() === id) {
        if (conversations.length > 0) {
            setActiveConversationId(conversations[0].id);
        } else {
            localStorage.removeItem(STORAGE_KEYS.activeConversationId);
        }
    }
}

// Get messages for a conversation
export function getMessages(conversationId: string): Message[] {
    try {
        const data = localStorage.getItem(STORAGE_KEYS.messagesPrefix + conversationId);
        return data ? JSON.parse(data) : [];
    } catch {
        return [];
    }
}

// Save messages for a conversation
export function saveMessages(conversationId: string, messages: Message[]): void {
    localStorage.setItem(STORAGE_KEYS.messagesPrefix + conversationId, JSON.stringify(messages));

    // Update conversation's updatedAt
    updateConversation(conversationId, {});
}

// Add a message to a conversation
export function addMessage(conversationId: string, message: Omit<Message, "id" | "timestamp">): Message {
    const fullMessage: Message = {
        ...message,
        id: generateId(),
        timestamp: new Date().toISOString(),
    };

    const messages = getMessages(conversationId);
    messages.push(fullMessage);
    saveMessages(conversationId, messages);

    // Auto-title from first user message
    if (message.role === "user") {
        const conversations = getConversations();
        const conv = conversations.find((c) => c.id === conversationId);
        if (conv && conv.title === "New Chat") {
            const words = message.content.split(/\s+/).slice(0, 8).join(" ");
            const title = words.length > 40 ? words.substring(0, 40) + "..." : words;
            updateConversation(conversationId, { title });
        }
    }

    return fullMessage;
}

// Get or create a conversation (for initial load)
export function getOrCreateActiveConversation(): Conversation {
    let activeId = getActiveConversationId();
    let conversations = getConversations();

    // Check if active conversation exists
    if (activeId) {
        const existing = conversations.find((c) => c.id === activeId);
        if (existing) return existing;
    }

    // If no conversations, create one
    if (conversations.length === 0) {
        return createConversation();
    }

    // Default to first conversation
    setActiveConversationId(conversations[0].id);
    return conversations[0];
}
