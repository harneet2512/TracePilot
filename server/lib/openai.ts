import OpenAI from "openai";

const apiKey = process.env.OPENAI_API_KEY_NEW || process.env.OPENAI_API_KEY;

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
});

// Deterministic mock for Proof Mode
function getMockEmbedding(text: string): number[] {
  // Simple deterministic vector based on length/content
  const val = (text.length % 100) / 100;
  return new Array(1536).fill(val);
}

export async function createEmbedding(text: string): Promise<number[]> {
  if (process.env.PROOF_MODE === "1" || process.env.DEV_CONNECTOR_FIXTURES === "1") {
    return getMockEmbedding(text);
  }
  const response = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: text,
  });
  return response.data[0].embedding;
}

export async function createEmbeddings(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  if (process.env.PROOF_MODE === "1" || process.env.DEV_CONNECTOR_FIXTURES === "1") {
    return texts.map(getMockEmbedding);
  }

  const response = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: texts,
  });

  return response.data.map(d => d.embedding);
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export async function chatCompletion(
  messages: ChatMessage[],
  jsonSchema?: Record<string, unknown>
): Promise<string> {
  if (process.env.PROOF_MODE === "1") {
    const lastUserMessage = messages.slice().reverse().find(m => m.role === "user")?.content || "";

    // Detect intent for simple mocks
    if (jsonSchema && jsonSchema.properties && (jsonSchema.properties as any).bullets) {
      // This is likely the decision extraction or chat response
      return JSON.stringify({
        answer: "Here is the decision from the thread.",
        bullets: [
          { claim: "We decided to deploy to production tomorrow.", type: "decision", citations: [{ sourceId: "mock-source-id", text: "I agree, we should decide...", url: "https://slack.com/archives/CPROOF001/p1700000030000300" }] },
          { claim: "Owners are @alice_proof and @bob_proof", type: "action_item", citations: [] }
        ]
      });
    }

    return "Mock PROOF_MODE response: " + lastUserMessage.substring(0, 20);
  }

  const params: OpenAI.ChatCompletionCreateParams = {
    model: "gpt-4o",
    messages,
  };

  if (jsonSchema) {
    params.response_format = {
      type: "json_schema",
      json_schema: {
        name: "response",
        strict: true,
        schema: jsonSchema,
      },
    };
  }

  const response = await openai.chat.completions.create(params);
  return response.choices[0]?.message?.content || "";
}
