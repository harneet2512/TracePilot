import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { Conversation, Message } from "@shared/schema";
import { conversationKeys } from "@/lib/query-keys";
import { perfEnd, perfStart } from "@/lib/perf";

export function useConversations() {
    return useQuery<Conversation[]>({
        queryKey: conversationKeys.lists(),
        queryFn: async () => {
            const started = perfStart("render:chat_list_load");
            const res = await apiRequest("GET", "/api/conversations");
            const json = await res.json();
            perfEnd("render", "render:chat_list_load", started, { count: Array.isArray(json) ? json.length : 0 });
            return json;
        },
    });
}

export function useConversation(id: string | null) {
    return useQuery<Conversation>({
        queryKey: conversationKeys.detail(id || ""),
        queryFn: async () => {
            if (!id) throw new Error("Conversation ID is required");
            const res = await apiRequest("GET", `/api/conversations/${id}`);
            return res.json();
        },
        enabled: !!id,
    });
}

export function useMessages(conversationId: string | null) {
    // Ensure we have a valid conversation ID (not null, undefined, or empty string)
    const hasValidId = !!conversationId && conversationId.trim() !== "";

    return useQuery<Message[]>({
        queryKey: conversationKeys.messages(conversationId || ""),
        queryFn: async () => {
            if (!hasValidId) return [];
            const started = perfStart("render:chat_detail_load");
            const res = await apiRequest("GET", `/api/conversations/${conversationId}/messages`);
            const json = await res.json();
            perfEnd("render", "render:chat_detail_load", started, { count: Array.isArray(json) ? json.length : 0 });
            return json;
        },
        enabled: hasValidId,
        // Keep data fresh but don't refetch aggressively
        staleTime: 1000 * 60,
        // Return empty array as placeholder when disabled
        placeholderData: [],
    });
}

export function useCreateConversation() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (title?: string) => {
            const res = await apiRequest("POST", "/api/conversations", { title });
            return res.json() as Promise<Conversation>;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: conversationKeys.lists() });
        },
    });
}

export function useDeleteConversation() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (id: string) => {
            await apiRequest("DELETE", `/api/conversations/${id}`);
        },
        onMutate: async (deletedId) => {
            await queryClient.cancelQueries({ queryKey: conversationKeys.lists() });
            const prev = queryClient.getQueryData<Conversation[]>(conversationKeys.lists());
            queryClient.setQueryData<Conversation[]>(conversationKeys.lists(), (old = []) =>
                old.filter((c) => c.id !== deletedId)
            );
            return { prev };
        },
        onError: (_error, _deletedId, ctx) => {
            if (ctx?.prev) {
                queryClient.setQueryData(conversationKeys.lists(), ctx.prev);
            }
        },
        onSuccess: (_data, deletedId) => {
            // Remove stale queries for the deleted conversation FIRST
            // to prevent 404 refetches before navigation completes
            queryClient.removeQueries({ queryKey: conversationKeys.detail(deletedId) });
            queryClient.removeQueries({ queryKey: conversationKeys.messages(deletedId) });
            // Then refresh only the list
            queryClient.invalidateQueries({ queryKey: conversationKeys.lists() });
        },
    });
}
