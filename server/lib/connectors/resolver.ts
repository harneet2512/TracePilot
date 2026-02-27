
/**
 * Connector Type Normalization
 * 
 * Enforced Canonical Types:
 * - "google" (covers Drive, Gmail, etc.)
 * - "atlassian" (covers Jira, Confluence)
 * - "slack"
 * - "upload" (local files)
 * - "voice" (voice calls)
 * 
 * Mappings:
 * - drive, google-drive, google_drive, gdrive -> google
 * - jira, confluence -> atlassian
 */

export const CANONICAL_CONNECTORS = ["google", "atlassian", "slack", "upload", "voice"] as const;
export type CanonicalConnectorType = typeof CANONICAL_CONNECTORS[number];

const ALIAS_MAP: Record<string, CanonicalConnectorType> = {
    "drive": "google",
    "google-drive": "google",
    "google_drive": "google",
    "gdrive": "google",
    "google": "google",

    "jira": "atlassian",
    "confluence": "atlassian",
    "atlassian": "atlassian",

    "slack": "slack",

    "upload": "upload",

    "voice": "voice"
};

export function normalizeConnectorType(input: string): CanonicalConnectorType {
    if (!input) {
        throw new Error("Connector type cannot be empty");
    }

    const normalized = input.trim().toLowerCase();

    // Direct hit on alias map
    if (ALIAS_MAP[normalized]) {
        return ALIAS_MAP[normalized];
    }

    // Fallback: check if it's one of the canonical types already
    if (CANONICAL_CONNECTORS.includes(normalized as CanonicalConnectorType)) {
        return normalized as CanonicalConnectorType;
    }

    throw new Error(`Unknown connector type: "${input}". Allowed: [${CANONICAL_CONNECTORS.join(", ")}]`);
}

export function isValidConnectorType(input: string): boolean {
    try {
        normalizeConnectorType(input);
        return true;
    } catch (e) {
        return false;
    }
}
