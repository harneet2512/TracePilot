
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { validateAndAttribute } from '../lib/rag/grounding';
import { renderExtractedData } from '../lib/rag/standardRenderer';

// Mock data
const mockChunk = {
    text: "The Q4 OKR is to launch the AI search project with 95% accuracy.",
    sourceId: "source1",
    chunkId: "chunk1"
};

const mockItem = {
    objective: "Launch AI Search",
    citations: [{ chunkId: "chunk1", quote: "Non-existent quote" }] // Invalid citation
};

const mockData = {
    type: "OKR",
    data: {
        items: [mockItem]
    }
};

describe('Strict Grounding Regression Checks', () => {

    beforeEach(() => {
        delete process.env.EVAL_MODE;
    });

    it('should KEEP items with invalid citations when EVAL_MODE is NOT set (Default Runtime)', () => {
        // 1. Run validation with invalid citation
        // @ts-ignore
        const result = validateAndAttribute(mockData, [mockChunk]);

        // 2. Assert item is preserved
        // @ts-ignore
        assert.strictEqual(result.data.items.length, 1, "Item should be kept in default mode");
        // @ts-ignore
        assert.strictEqual(result.data.items[0].objective, "Launch AI Search");
        // @ts-ignore
        assert.deepStrictEqual(result.data.items[0]._citations, [], "Citations should be empty list (best effort)");
    });

    it('should DROP items with invalid citations when EVAL_MODE IS set to 1 (Strict Mode)', () => {
        process.env.EVAL_MODE = '1';

        // 1. Run validation
        // @ts-ignore
        const result = validateAndAttribute(mockData, [mockChunk]);

        // 2. Assert item is dropped
        // @ts-ignore
        assert.strictEqual(result.data.items.length, 0, "Item should be dropped in strict mode");
    });

    it('should return standard Not Found message when runtime (No Strict Grounding)', () => {
        const emptyData = { type: "OKR", data: { items: [] } };

        // @ts-ignore
        const rendered = renderExtractedData(emptyData);

        assert.strictEqual(rendered.answer, "No OKRs found in the provided sources.");
        assert.ok(!rendered.answer.includes("Strict Grounding applied"));
    });

    it('should return Strict Grounding message when EVAL_MODE=1', () => {
        process.env.EVAL_MODE = '1';
        const emptyData = { type: "OKR", data: { items: [] } };

        // @ts-ignore
        const rendered = renderExtractedData(emptyData);

        assert.strictEqual(rendered.answer, "Not found in provided sources (Strict Grounding applied).");
    });
});
