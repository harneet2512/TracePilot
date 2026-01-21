
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { UserConnectorScope } from "@shared/schema";

/**
 * Normalizes the response from /api/user-connector-scopes
 * which might be a single object (legacy) or an array (correct).
 * Returns the most recent scope or null if none found.
 */
export function normalizeScopes(data: UserConnectorScope | UserConnectorScope[] | undefined | null): UserConnectorScope | null {
    if (!data) return null;

    if (Array.isArray(data)) {
        if (data.length === 0) return null;
        // Sort by createdAt desc if available, otherwise just take the first one
        return data.sort((a, b) => {
            const timeA = new Date(a.createdAt || 0).getTime();
            const timeB = new Date(b.createdAt || 0).getTime();
            return timeB - timeA;
        })[0];
    }

    return data;
}

/**
 * Validates if a string is a valid UUID
 */
export function isValidUuid(id: string | undefined | null): boolean {
    if (!id) return false;
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(id);
}

interface SaveScopeParams {
    existingScopeId?: string;
    data: Partial<UserConnectorScope> & {
        accountId: string;
        type: string;
        userId?: string; // Optional depending on schema strictness, usually handled by backend but passed for completeness
    };
}

/**
 * Safe function to save (create or update) a scope.
 * automatically handles the switch between POST and PATCH.
 * Throws error if PATCH is attempted without a valid UUID.
 */
export async function saveScope({ existingScopeId, data }: SaveScopeParams): Promise<UserConnectorScope> {
    if (existingScopeId) {
        if (!isValidUuid(existingScopeId)) {
            console.error(`[ScopeGuard] Attempted to PATCH with invalid ID: ${existingScopeId}`);
            throw new Error("Critical: Cannot update scope because Scope ID is missing or invalid.");
        }

        console.log(`[ScopeGuard] Updating scope ${existingScopeId}`);
        const res = await apiRequest("PATCH", `/api/user-connector-scopes/${existingScopeId}`, data);
        return res.json();
    } else {
        console.log(`[ScopeGuard] Creating new scope`);
        const res = await apiRequest("POST", "/api/user-connector-scopes", data);
        return res.json();
    }
}
