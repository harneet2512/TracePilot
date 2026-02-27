// Utility functions for parsing and processing answers

export interface ParsedSection {
    title: string;
    items: string[];
}

export interface AnswerSource {
    sourceId: string;
    title: string;
    url?: string;
    snippet?: string;
    fileId?: string;
    chunkId?: string;
    score?: number;
}

/**
 * Parse structured answer text into sections
 */
export function parseAnswer(text: string): ParsedSection[] {
    const sections: ParsedSection[] = [];
    const lines = text.split('\n');

    let currentSection: ParsedSection | null = null;

    for (const line of lines) {
        const trimmed = line.trim();

        // Check if line is a section header (matches patterns like "**Header:**" or "### Header")
        if (trimmed.startsWith('**') && trimmed.includes(':**')) {
            // Save previous section if exists
            if (currentSection) {
                sections.push(currentSection);
            }

            // Extract title
            const title = trimmed.replace(/^\*\*/, '').replace(/:\*\*$/, '').trim();
            currentSection = { title, items: [] };
        } else if (trimmed.startsWith('###')) {
            // Save previous section if exists
            if (currentSection) {
                sections.push(currentSection);
            }

            const title = trimmed.replace(/^###\s*/, '').trim();
            currentSection = { title, items: [] };
        } else if (trimmed && currentSection) {
            // Add item to current section
            currentSection.items.push(trimmed);
        }
    }

    // Don't forget the last section
    if (currentSection) {
        sections.push(currentSection);
    }

    return sections;
}

/**
 * Extract citation references from text (e.g., [1], [2])
 */
export function extractCitations(text: string): number[] {
    const citationPattern = /\[(\d+)\]/g;
    const citations: number[] = [];
    let match;

    while ((match = citationPattern.exec(text)) !== null) {
        citations.push(parseInt(match[1], 10));
    }

    return Array.from(new Set(citations)); // Remove duplicates
}

/**
 * Format answer text by replacing citation markers with clickable links
 */
export function formatAnswerWithCitations(
    text: string,
    onCitationClick?: (index: number) => void
): string {
    if (!onCitationClick) return text;

    return text.replace(/\[(\d+)\]/g, (match, num) => {
        return `<a href="#" data-citation="${num}" class="citation-link">${match}</a>`;
    });
}
