import { z } from "zod";
import { chatCompletion, type ChatMessage } from "../openai";

export interface ValidationResult<T> {
  success: boolean;
  data?: T;
  repaired?: boolean;
  originalError?: string;
  repairAttempts?: number;
}

export async function validateWithRepair<T>(
  rawJson: string,
  schema: z.ZodType<T>,
  maxRetries: number = 2
): Promise<ValidationResult<T>> {
  // First attempt - try to parse and validate directly
  try {
    const parsed = JSON.parse(rawJson);
    const validated = schema.parse(parsed);
    return {
      success: true,
      data: validated,
      repaired: false,
      repairAttempts: 0,
    };
  } catch (firstError) {
    // Initial parse failed, proceed with repair attempts
    let lastError = "";
    if (firstError instanceof SyntaxError) {
      lastError = `JSON syntax error: ${firstError.message}`;
    } else if (firstError instanceof z.ZodError) {
      lastError = firstError.errors.map(e => `${e.path.join(".")}: ${e.message}`).join("; ");
    } else {
      lastError = String(firstError);
    }
    
    const originalError = lastError;
    let currentJson = rawJson;
    let repairAttempts = 0;

    // Repair loop
    for (let i = 0; i < maxRetries; i++) {
      repairAttempts++;
      
      try {
        const repaired = await attemptRepairWithTimeout(currentJson, lastError, schema, 10000);
        if (repaired) {
          currentJson = repaired;
          
          // Try to validate repaired JSON
          const parsed = JSON.parse(currentJson);
          const validated = schema.parse(parsed);
          return {
            success: true,
            data: validated,
            repaired: true,
            originalError,
            repairAttempts,
          };
        }
      } catch (repairError) {
        if (repairError instanceof SyntaxError) {
          lastError = `JSON syntax error: ${repairError.message}`;
        } else if (repairError instanceof z.ZodError) {
          lastError = repairError.errors.map(e => `${e.path.join(".")}: ${e.message}`).join("; ");
        } else {
          lastError = String(repairError);
        }
      }
    }

    return {
      success: false,
      originalError,
      repairAttempts,
    };
  }
}

async function attemptRepairWithTimeout<T>(
  malformedJson: string,
  error: string,
  schema: z.ZodType<T>,
  timeoutMs: number = 10000
): Promise<string | null> {
  const schemaDescription = getSchemaDescription(schema);
  
  const messages: ChatMessage[] = [
    {
      role: "system",
      content: `You are a JSON repair assistant. Fix the malformed or invalid JSON to match the required schema.
Return ONLY the fixed JSON with no explanation.

Required schema:
${schemaDescription}`,
    },
    {
      role: "user",
      content: `Fix this JSON that has the following error: "${error}"

Malformed JSON:
${malformedJson}

Return only the corrected JSON.`,
    },
  ];

  try {
    const timeoutPromise = new Promise<never>((_, reject) => 
      setTimeout(() => reject(new Error("Repair timeout")), timeoutMs)
    );
    
    const response = await Promise.race([
      chatCompletion(messages),
      timeoutPromise,
    ]);
    
    const cleaned = response.trim().replace(/^```json\s*/i, "").replace(/```\s*$/i, "");
    JSON.parse(cleaned); // Validate it's valid JSON
    return cleaned;
  } catch {
    return null;
  }
}

function getSchemaDescription(schema: z.ZodType<any>): string {
  const def = schema._def as any;
  if (def && def.typeName === "ZodObject") {
    const shape = (schema as z.ZodObject<any>).shape;
    const fields = Object.entries(shape).map(([key, value]) => {
      const zodType = value as z.ZodType<any>;
      return `  ${key}: ${getTypeDescription(zodType)}`;
    });
    return `{\n${fields.join(",\n")}\n}`;
  }
  return "object";
}

function getTypeDescription(schema: z.ZodType<any>): string {
  const def = schema._def as any;
  if (!def) return "any";
  
  switch (def.typeName) {
    case "ZodString": return "string";
    case "ZodNumber": return "number";
    case "ZodBoolean": return "boolean";
    case "ZodArray": return `array of ${getTypeDescription(def.type)}`;
    case "ZodObject": return "object";
    case "ZodNullable": return `${getTypeDescription(def.innerType)} | null`;
    case "ZodOptional": return `${getTypeDescription(def.innerType)} (optional)`;
    case "ZodEnum": return `enum: ${def.values.join(" | ")}`;
    default: return "any";
  }
}
