import OpenAI from "openai";

if (!process.env.OPENAI_API_KEY) {
  throw new Error("OPENAI_API_KEY must be set");
}

export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function createEmbedding(text: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: text,
  });
  return response.data[0].embedding;
}

export async function createEmbeddings(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  
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
  jsonSchema?: object
): Promise<string> {
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
