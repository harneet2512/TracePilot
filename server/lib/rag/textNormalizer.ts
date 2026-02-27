
/**
 * Text Normalizer for RAG Pipeline
 * Handles PDF weirdness like "Key\tResults", hyphenated line breaks, and repeated whitespace.
 */
export function normalizeText(text: string): string {
    if (!text) return "";

    let normalized = text;

    // 1. Fix "Key\tResults" or "Key  Results" (common in table extractions)
    normalized = normalized.replace(/Key[\t\s]+Results/gi, "Key Results");

    // 2. Fix hyphenated line breaks (e.g. "communi-\ncation" -> "communication")
    // CAUTION: This might merge words incorrectly if not careful, but for RAG inputs it's usually better to merge.
    normalized = normalized.replace(/([a-z])-\s*\n\s*([a-z])/gi, "$1$2");

    // 3. Replace multiple newlines with a unique marker to preserve paragraph structure slightly if needed, 
    // but for normalized matching we usually want simple spaces. 
    // Let's stick to standardizing whitespace first.
    normalized = normalized.replace(/[\r\n\t\f\v]+/g, " ");

    // 4. Collapse multiple spaces
    normalized = normalized.replace(/\s+/g, " ");

    return normalized.trim();
}

/**
 * Normalizer for substring matching comparisons (more aggressive)
 * Removes case, all punctuation, etc.
 */
export function normalizeForMatch(text: string): string {
    return normalizeText(text)
        .toLowerCase()
        .replace(/[^\w\s]|_/g, "") // Remove punctuation
        .replace(/\s+/g, " ")
        .trim();
}

/**
 * Robust normalizer for grounding validation (Strict Grounding)
 * Preserves alphanumeric content but ignores all formatting differences.
 * Use this when checking if LLM quote exists in Source Chunk.
 */
export function normalizeForGrounding(text: string): string {
    if (!text) return "";
    return text
        .toLowerCase()
        // Replace all non-alphanumeric chars with space
        .replace(/[^a-z0-9]/g, " ")
        // Collapse multiple spaces
        .replace(/\s+/g, " ")
        .trim();
}
