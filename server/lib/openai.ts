import OpenAI from "openai";
import { enforceStrictSchema } from "./rag/schemaUtils";

const apiKey = process.env.OPENAI_API_KEY;

// Allow missing key if we are in fixture/proof mode or if we haven't initialized the client yet
if (!apiKey) {
  if (process.env.DEV_CONNECTOR_FIXTURES === "1" || process.env.PROOF_MODE === "1") {
    console.warn("[openai] No API key found, but running in fixture/proof mode - embeddings will be mocked.");
  } else if (process.env.NODE_ENV === "test" || process.env.CI === "true") {
    // Allow tests to run without key (mocking expected)
  } else {
    console.warn("[openai] Warning: OPENAI_API_KEY is not set. Real embeddings and chat will fail.");
    // We don't throw here to allow app to start for other purposes (like running scripts that don't need AI)
  }
}

export const openai = new OpenAI({
  apiKey: apiKey || "dummy-key-for-initialization",
  maxRetries: process.env.NODE_ENV === "development" ? 1 : 2,
});

export const OPENAI_CHAT_MODEL = process.env.OPENAI_CHAT_MODEL || "gpt-4o-mini";

// text-embedding-3-small has a 8192-token limit per input; ~4 chars/token is a safe approximation
const EMBEDDING_MAX_TOKENS = 8192;
const CHARS_PER_TOKEN = 4;
const EMBEDDING_MAX_CHARS = Math.floor(EMBEDDING_MAX_TOKENS * CHARS_PER_TOKEN);

function truncateForEmbedding(text: string): string {
  if (text.length <= EMBEDDING_MAX_CHARS) return text;
  return text.slice(0, EMBEDDING_MAX_CHARS);
}

// Deterministic mock for Proof Mode - keyword-based for meaningful similarity
function getMockEmbedding(text: string): number[] {
  // Use keyword hashing to create meaningful vector dimensions
  // This ensures texts with similar keywords get higher cosine similarity
  const vec = new Array(1536).fill(0);
  const lower = text.toLowerCase();
  const words = lower.split(/\W+/).filter(w => w.length > 3);
  for (const word of words) {
    // Hash each word to a dimension index (deterministic)
    let hash = 0;
    for (let i = 0; i < word.length; i++) {
      hash = ((hash << 5) - hash + word.charCodeAt(i)) | 0;
    }
    const idx = Math.abs(hash) % 1536;
    vec[idx] += 1;
  }
  // Normalize
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
  return vec.map(v => v / norm);
}

export async function createEmbedding(text: string): Promise<number[]> {
  if (process.env.PROOF_MODE === "1" || process.env.DEV_CONNECTOR_FIXTURES === "1") {
    return getMockEmbedding(text);
  }
  const input = truncateForEmbedding(text);
  const response = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input,
  });
  return response.data[0].embedding;
}

export async function createEmbeddings(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  if (process.env.PROOF_MODE === "1" || process.env.DEV_CONNECTOR_FIXTURES === "1") {
    return texts.map(getMockEmbedding);
  }

  const truncated = texts.map(truncateForEmbedding);
  const response = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: truncated,
  });

  return response.data.map(d => d.embedding);
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatCompletionOptions {
  temperature?: number;
  jsonSchema?: Record<string, unknown>;
  maxOutputTokens?: number;
}

export async function chatCompletion(
  messages: ChatMessage[],
  options?: ChatCompletionOptions | Record<string, unknown>
): Promise<string> {
  if (options) console.log("[OpenAI Debug] chatCompletion called with keys:", Object.keys(options).join(", "));
  let temperature = 0.7;
  let jsonSchema: Record<string, unknown> | undefined;
  let maxOutputTokens: number | undefined;

  if (options) {
    // Check if it's the new options object
    if ('temperature' in options || 'jsonSchema' in options || 'maxOutputTokens' in options) {
      const opts = options as ChatCompletionOptions;
      if (opts.temperature !== undefined) temperature = opts.temperature;
      if (opts.jsonSchema) jsonSchema = opts.jsonSchema;
      if (opts.maxOutputTokens !== undefined) maxOutputTokens = opts.maxOutputTokens;
    } else {
      // Legacy behavior: treat as jsonSchema
      jsonSchema = options as Record<string, unknown>;
    }
  }

  if (process.env.PROOF_MODE === "1") {
    const lastUserMessage = messages.slice().reverse().find(m => m.role === "user")?.content || "";
    const systemContent = messages.find(m => m.role === "system")?.content || "";

    // Extract chunk/source IDs from the system prompt context for realistic citations
    const chunkSourcePairs: Array<{ chunkId: string; sourceId: string }> = [];
    const chunkRegex = /chunk ([a-f0-9-]+) from source ([a-f0-9-]+)/g;
    let match;
    while ((match = chunkRegex.exec(systemContent)) !== null) {
      chunkSourcePairs.push({ chunkId: match[1], sourceId: match[2] });
    }

    // Structured extractor calls (have jsonSchema with items property)
    if (jsonSchema && jsonSchema.properties && (jsonSchema.properties as any).items) {
      // Extract chunk IDs and text from context in user message
      const allContent = messages.map(m => m.content).join("\n");
      const chunkParts: Array<{ id: string; text: string }> = [];
      const chunkSplitRegex = /--- Chunk: ([^\s]+) ---\n([\s\S]*?)(?=--- Chunk:|$)/g;
      let cm;
      while ((cm = chunkSplitRegex.exec(allContent)) !== null) {
        chunkParts.push({ id: cm[1], text: cm[2].trim() });
      }
      // Fallback: try system prompt chunk format
      if (chunkParts.length === 0) {
        const sysChunkRegex = /chunk ([a-f0-9-]+) from source ([a-f0-9-]+)/g;
        let sm;
        while ((sm = sysChunkRegex.exec(allContent)) !== null) {
          chunkParts.push({ id: sm[1], text: "" });
        }
      }

      // Build items from chunk content for realistic mock
      const items: any[] = [];
      for (const cp of chunkParts.slice(0, 5)) {
        // Extract first meaningful line as objective/blocker
        const lines = cp.text.split("\n").filter(l => l.trim().length > 10);
        if (lines.length === 0) continue;
        const firstLine = lines[0].replace(/^[#*\->\s]+/, "").trim();
        const quote = firstLine.slice(0, 80);

        const item: any = {
          citations: [{ chunkId: cp.id, quote }],
        };

        // Adapt shape based on schema
        const props = (jsonSchema.properties as any).items?.items?.properties || {};
        if (props.objective) {
          item.objective = firstLine;
          item.owner = null;
          item.timeframe = null;
          item.keyResults = lines.slice(1, 4).map((l: string) => ({
            result: l.replace(/^[#*\->\s]+/, "").trim(),
            target: null, current: null, owner: null, status: null, due: null,
            citations: [{ chunkId: cp.id, quote: l.trim().slice(0, 60) }],
          }));
        } else if (props.blocker) {
          item.blocker = firstLine;
          item.impact = lines[1]?.replace(/^[#*\->\s]+/, "").trim() || "Impact not specified";
          item.status = "Open";
          item.owner = "Unassigned";
        } else {
          item.text = firstLine;
        }

        items.push(item);
      }

      // Build summary from chunk text
      const summaryParts = chunkParts.slice(0, 3).map(cp => {
        const firstLine = cp.text.split("\n").find(l => l.trim().length > 10) || "";
        return firstLine.replace(/^[#*\->\s]+/, "").trim().slice(0, 60);
      }).filter(Boolean);

      return JSON.stringify({
        framingContext: "Here are the relevant findings from the knowledge base.",
        summary: summaryParts.join(" • ") || "Key information extracted from connected sources.",
        items: items.length > 0 ? items : [],
      });
    }

    // Decision extraction or chat response (has bullets in schema)
    if (jsonSchema && jsonSchema.properties && (jsonSchema.properties as any).bullets) {
      return JSON.stringify({
        answer: "Here is the decision from the thread.",
        bullets: [
          { claim: "We decided to deploy to production tomorrow.", type: "decision", citations: [{ sourceId: "mock-source-id", text: "I agree, we should decide...", url: "https://slack.com/archives/CPROOF001/p1700000030000300" }] },
          { claim: "Owners are @alice_proof and @bob_proof", type: "action_item", citations: [] }
        ]
      });
    }

    // Main chat completion from agentCore (system prompt contains "Respond in JSON format")
    if (systemContent.includes("Respond in JSON format")) {
      // Extract chunk content from system prompt for realistic answer
      const contextChunks: Array<{ chunkId: string; sourceId: string; text: string }> = [];
      const ctxRegex = /\[Source \d+: chunk ([^\s]+) from source ([^\]]+)\]\n(?:<UNTRUSTED_CONTEXT[^>]*>\n)?([\s\S]*?)(?:\n<\/UNTRUSTED_CONTEXT>)?(?=\n\n---|$)/g;
      let ctxMatch;
      while ((ctxMatch = ctxRegex.exec(systemContent)) !== null) {
        contextChunks.push({ chunkId: ctxMatch[1], sourceId: ctxMatch[2], text: ctxMatch[3].trim() });
      }

      // Build answer from first few chunks' content
      const answerLines = contextChunks.slice(0, 4).map(c => {
        const firstLine = c.text.split("\n").find(l => l.trim().length > 15) || c.text.slice(0, 100);
        return firstLine.replace(/^[#*\->\s]+/, "").trim();
      }).filter(Boolean);

      const topCitations = chunkSourcePairs.slice(0, 3).map(p => ({
        sourceId: p.sourceId,
        chunkId: p.chunkId,
      }));

      const answer = answerLines.length > 0
        ? answerLines.join("\n\n")
        : "Based on the available information, the knowledge base contains relevant documents.";

      return JSON.stringify({
        answer,
        bullets: topCitations.length > 0 ? [{
          claim: answerLines[0] || "Relevant information found.",
          citations: topCitations,
        }] : [],
        action: null,
        needsClarification: false,
        clarifyingQuestions: [],
      });
    }

    return "Mock PROOF_MODE response: " + lastUserMessage.substring(0, 20);
  }

  const params: OpenAI.ChatCompletionCreateParams = {
    model: OPENAI_CHAT_MODEL,
    messages,
    temperature,
    ...(maxOutputTokens !== undefined && { max_completion_tokens: maxOutputTokens }),
  };
  console.log(`[OpenAI Debug] Using model: ${OPENAI_CHAT_MODEL}`);

  if (jsonSchema) {
    const strictSchema = enforceStrictSchema(jsonSchema);
    params.response_format = {
      type: "json_schema",
      json_schema: {
        name: "response",
        strict: true,
        schema: strictSchema,
      },
    };
  }

  const response = await openai.chat.completions.create(params);
  return response.choices[0]?.message?.content || "";
}

export interface StreamChatOptions {
  temperature?: number;
  maxOutputTokens?: number;
}

/**
 * Stream chat completion tokens.
 * In PROOF_MODE yields a short mock sentence character-by-character.
 * In real mode streams tokens from the OpenAI API.
 */
export async function* streamChatCompletion(
  messages: ChatMessage[],
  options?: StreamChatOptions
): AsyncGenerator<string> {
  const temperature = options?.temperature ?? 0.7;
  const maxOutputTokens = options?.maxOutputTokens;

  if (process.env.PROOF_MODE === "1") {
    // Extract first readable context line from system prompt for a meaningful mock
    const systemContent = messages.find(m => m.role === "system")?.content || "";
    const ctxLine = systemContent
      .split("\n")
      .map(l => l.trim())
      .find(l => l.length > 30 && !l.startsWith("[") && !l.startsWith("<") && !l.startsWith("{"));
    const mockText = ctxLine
      ? `Based on the available information, ${ctxLine.slice(0, 80).toLowerCase()}.`
      : "Based on the available information, here is what I found in your knowledge base.";
    for (const char of mockText) {
      yield char;
      await new Promise(r => setTimeout(r, 5));
    }
    return;
  }

  const stream = await openai.chat.completions.create({
    model: OPENAI_CHAT_MODEL,
    messages,
    temperature,
    stream: true,
    ...(maxOutputTokens !== undefined && { max_completion_tokens: maxOutputTokens }),
  } as any);

  for await (const chunk of (stream as unknown as AsyncIterable<any>)) {
    const token = chunk.choices?.[0]?.delta?.content ?? "";
    if (token) yield token;
  }
}
