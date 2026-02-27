export const conversationKeys = {
    all: ["conversations"] as const,
    lists: () => [...conversationKeys.all, "list"] as const,
    detail: (id: string) => [...conversationKeys.all, "detail", id] as const,
    messages: (id: string) => [...conversationKeys.detail(id), "messages"] as const,
};
