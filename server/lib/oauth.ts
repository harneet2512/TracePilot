import { encrypt, decrypt } from "./encryption";

export interface OAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes: string[];
}

export interface TokenResponse {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
  tokenType?: string;
  scope?: string;
}

export const OAUTH_CONFIGS = {
  google: {
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    userInfoUrl: "https://www.googleapis.com/oauth2/v2/userinfo",
    scopes: [
      "https://www.googleapis.com/auth/drive.readonly",
      "https://www.googleapis.com/auth/userinfo.email",
      "https://www.googleapis.com/auth/userinfo.profile",
    ],
  },
  atlassian: {
    authUrl: "https://auth.atlassian.com/authorize",
    tokenUrl: "https://auth.atlassian.com/oauth/token",
    accessibleResourcesUrl: "https://api.atlassian.com/oauth/token/accessible-resources",
    scopes: [
      "read:jira-work",
      "read:jira-user",
      "read:confluence-content.all",
      "read:confluence-space.summary",
      "offline_access",
    ],
  },
  slack: {
    authUrl: "https://slack.com/oauth/v2/authorize",
    tokenUrl: "https://slack.com/api/oauth.v2.access",
    userInfoUrl: "https://slack.com/api/users.identity",
    scopes: [
      "channels:history",
      "channels:read",
      "users:read",
      "users:read.email",
    ],
  },
} as const;

export function buildAuthUrl(
  provider: "google" | "atlassian" | "slack",
  clientId: string,
  redirectUri: string,
  state: string
): string {
  const config = OAUTH_CONFIGS[provider];
  const params = new URLSearchParams();

  params.set("client_id", clientId);
  params.set("redirect_uri", redirectUri);
  params.set("response_type", "code");
  params.set("state", state);

  if (provider === "google") {
    params.set("scope", config.scopes.join(" "));
    params.set("access_type", "offline");
    params.set("prompt", "consent");
  } else if (provider === "atlassian") {
    params.set("scope", config.scopes.join(" "));
    params.set("audience", "api.atlassian.com");
    params.set("prompt", "consent");
  } else if (provider === "slack") {
    params.set("scope", config.scopes.join(","));
  }

  return `${config.authUrl}?${params.toString()}`;
}

export async function exchangeCodeForTokens(
  provider: "google" | "atlassian" | "slack",
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string
): Promise<TokenResponse> {
  const config = OAUTH_CONFIGS[provider];
  
  const body = new URLSearchParams();
  body.set("code", code);
  body.set("client_id", clientId);
  body.set("client_secret", clientSecret);
  body.set("redirect_uri", redirectUri);
  body.set("grant_type", "authorization_code");

  const response = await fetch(config.tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Token exchange failed: ${errorText}`);
  }

  const data = await response.json();

  if (provider === "slack") {
    return {
      accessToken: data.access_token || data.authed_user?.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in,
      scope: data.scope,
    };
  }

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
    tokenType: data.token_type,
    scope: data.scope,
  };
}

export async function refreshAccessToken(
  provider: "google" | "atlassian" | "slack",
  refreshToken: string,
  clientId: string,
  clientSecret: string
): Promise<TokenResponse> {
  const config = OAUTH_CONFIGS[provider];

  const body = new URLSearchParams();
  body.set("refresh_token", refreshToken);
  body.set("client_id", clientId);
  body.set("client_secret", clientSecret);
  body.set("grant_type", "refresh_token");

  const response = await fetch(config.tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Token refresh failed: ${errorText}`);
  }

  const data = await response.json();

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || refreshToken,
    expiresIn: data.expires_in,
    tokenType: data.token_type,
    scope: data.scope,
  };
}

export async function getGoogleUserInfo(accessToken: string): Promise<{
  id: string;
  email: string;
  name: string;
  picture?: string;
}> {
  const response = await fetch(OAUTH_CONFIGS.google.userInfoUrl, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error("Failed to get Google user info");
  }

  const data = await response.json();
  return {
    id: data.id,
    email: data.email,
    name: data.name,
    picture: data.picture,
  };
}

export async function getAtlassianResources(accessToken: string): Promise<Array<{
  id: string;
  url: string;
  name: string;
  scopes: string[];
  avatarUrl?: string;
}>> {
  const response = await fetch(OAUTH_CONFIGS.atlassian.accessibleResourcesUrl, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error("Failed to get Atlassian resources");
  }

  return response.json();
}

export async function getSlackUserInfo(accessToken: string): Promise<{
  id: string;
  teamId: string;
  email?: string;
  name: string;
}> {
  const response = await fetch(OAUTH_CONFIGS.slack.userInfoUrl, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error("Failed to get Slack user info");
  }

  const data = await response.json();
  
  if (!data.ok) {
    throw new Error(`Slack API error: ${data.error}`);
  }

  return {
    id: data.user.id,
    teamId: data.team.id,
    email: data.user.email,
    name: data.user.name,
  };
}

export function encryptToken(token: string): string {
  return encrypt(token);
}

export function decryptToken(encryptedToken: string): string {
  return decrypt(encryptedToken);
}
