import { createHmac, timingSafeEqual } from "crypto";

export type OAuthProvider = "google" | "atlassian" | "slack";

export interface OAuthStatePayload {
  userId: string;
  workspaceId: string;
  provider: OAuthProvider;
  returnTo: string;
  ts: number;
}

function signBase64Payload(base64Payload: string, secret: string): string {
  return createHmac("sha256", secret).update(base64Payload).digest("base64url");
}

export function createOAuthState(payload: OAuthStatePayload, secret: string): { state: string; signature: string } {
  const base64Payload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = signBase64Payload(base64Payload, secret);
  return {
    state: `${base64Payload}.${signature}`,
    signature,
  };
}

export function verifyOAuthState(
  state: string,
  cookieSignature: string | undefined,
  expectedProvider: OAuthProvider,
  secret: string,
  maxAgeMs = 10 * 60 * 1000,
): OAuthStatePayload | null {
  if (!state || !cookieSignature) return null;

  const [base64Payload, signature] = state.split(".");
  if (!base64Payload || !signature) return null;

  const expectedSignature = signBase64Payload(base64Payload, secret);
  const provided = Buffer.from(signature);
  const expected = Buffer.from(expectedSignature);
  const cookie = Buffer.from(cookieSignature);

  if (provided.length !== expected.length || provided.length !== cookie.length) {
    return null;
  }

  if (!timingSafeEqual(provided, expected) || !timingSafeEqual(provided, cookie)) {
    return null;
  }

  let payload: OAuthStatePayload;
  try {
    payload = JSON.parse(Buffer.from(base64Payload, "base64url").toString("utf8")) as OAuthStatePayload;
  } catch {
    return null;
  }

  if (
    !payload ||
    typeof payload.userId !== "string" ||
    typeof payload.workspaceId !== "string" ||
    typeof payload.returnTo !== "string" ||
    typeof payload.provider !== "string" ||
    typeof payload.ts !== "number"
  ) {
    return null;
  }

  if (payload.provider !== expectedProvider) return null;
  if (Date.now() - payload.ts > maxAgeMs) return null;

  return payload;
}
