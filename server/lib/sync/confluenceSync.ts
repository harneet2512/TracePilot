import type { SyncContext, SyncEngine, SyncableItem, SyncableContent } from "./types";
import { sanitizeContent, wrapUntrustedContent } from "../safety/sanitize";
import { detectInjection, stripSuspiciousLines } from "../safety/detector";

interface ConfluencePage {
  id: string;
  title: string;
  status: string;
  _links: {
    webui?: string;
    tinyui?: string;
  };
  version?: {
    number: number;
    when: string;
  };
  body?: {
    storage?: {
      value: string;
    };
    view?: {
      value: string;
    };
  };
  space?: {
    key: string;
    name: string;
  };
}

interface ConfluenceSearchResponse {
  results: ConfluencePage[];
  _links?: {
    next?: string;
  };
}

export const confluenceSyncEngine: SyncEngine = {
  name: "confluence",

  async fetchMetadata(ctx: SyncContext): Promise<SyncableItem[]> {
    if (process.env.DEV_CONNECTOR_FIXTURES === "1" || (process.env.NODE_ENV === "development" && !ctx.accessToken)) {
      console.log("[confluenceSync] Returning fixture metadata");
      return [
        {
          externalId: "fixture-page-1",
          title: "Engineering Onboarding (Fixture)",
          url: "https://confluence.atlassian.com/display/ENG/Onboarding",
          mimeType: "text/html",
          contentHash: "v1",
          modifiedAt: new Date(),
        }
      ];
    }

    const items: SyncableItem[] = [];
    const scopeConfig = ctx.scope.scopeConfigJson as {
      cloudId?: string;
      spaceKeys?: string[];
      pageIds?: string[];
    } | null;

    if (!scopeConfig?.cloudId) {
      console.error("[confluenceSync] No cloudId in scope config");
      return items;
    }

    const baseUrl = `https://api.atlassian.com/ex/confluence/${scopeConfig.cloudId}/wiki/api/v2`;

    if (scopeConfig.spaceKeys && scopeConfig.spaceKeys.length > 0) {
      for (const spaceKey of scopeConfig.spaceKeys) {
        const spaceItems = await fetchSpacePages(ctx.accessToken, baseUrl, spaceKey);
        items.push(...spaceItems);
      }
    }

    if (scopeConfig.pageIds && scopeConfig.pageIds.length > 0) {
      for (const pageId of scopeConfig.pageIds) {
        const page = await fetchPageMetadata(ctx.accessToken, baseUrl, pageId);
        if (page) {
          items.push(page);
        }
      }
    }

    return items;
  },

  async fetchContent(ctx: SyncContext, item: SyncableItem): Promise<SyncableContent | null> {
    if (process.env.DEV_CONNECTOR_FIXTURES === "1" || (process.env.NODE_ENV === "development" && !ctx.accessToken)) {
      console.log(`[confluenceSync] Returning fixture content for ${item.externalId}`);
      return {
        ...item,
        content: `Engineering Onboarding\n\nWelcome to the team! Here is what you need to know.\n\n1. Setup laptop\n2. Clone repo\n3. Run tests\n\nContact: fixture-manager`.repeat(20),
        metadata: {
          source: "confluence",
          spaceKey: "ENG",
          spaceName: "Engineering",
          version: 1,
        },
      };
    }

    const scopeConfig = ctx.scope.scopeConfigJson as { cloudId?: string } | null;
    if (!scopeConfig?.cloudId) return null;

    const baseUrl = `https://api.atlassian.com/ex/confluence/${scopeConfig.cloudId}/wiki/api/v2`;

    try {
      const url = `${baseUrl}/pages/${item.externalId}?body-format=storage`;

      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${ctx.accessToken}`,
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        console.error(`[confluenceSync] Failed to fetch page ${item.externalId}: ${response.status}`);
        return null;
      }

      const page: ConfluencePage = await response.json();

      const htmlContent = page.body?.storage?.value || page.body?.view?.value || "";
      let textContent = stripHtml(htmlContent);

      // Sanitize content to prevent prompt injection
      const detection = detectInjection(textContent);
      const sanitizeResult = sanitizeContent(textContent, {
        maxLength: 10000,
        sourceType: "confluence",
        stripMarkers: true,
      });

      // If highly suspicious, strip suspicious lines
      if (detection.isSuspicious && detection.score >= 20) {
        const stripped = stripSuspiciousLines(sanitizeResult.sanitized, detection);
        textContent = stripped.cleaned;
      } else {
        textContent = sanitizeResult.sanitized;
      }

      let content = formatConfluencePage(page.title, textContent, page);

      // Wrap in untrusted context delimiters
      content = wrapUntrustedContent(content, "confluence", page.id);

      return {
        ...item,
        content,
        metadata: {
          source: "confluence",
          spaceKey: page.space?.key,
          spaceName: page.space?.name,
          version: page.version?.number,
          injectionDetected: detection.isSuspicious,
          injectionScore: detection.score,
        },
      };
    } catch (error) {
      console.error(`[confluenceSync] Error fetching page ${item.externalId}:`, error);
      return null;
    }
  },
};

async function fetchSpacePages(
  accessToken: string,
  baseUrl: string,
  spaceKey: string
): Promise<SyncableItem[]> {
  const items: SyncableItem[] = [];
  let cursor: string | undefined;

  do {
    let url = `${baseUrl}/spaces?keys=${spaceKey}&limit=1`;
    const spaceResponse = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
    });

    if (!spaceResponse.ok) {
      console.error(`[confluenceSync] Failed to fetch space ${spaceKey}: ${spaceResponse.status}`);
      return items;
    }

    const spaceData = await spaceResponse.json();
    if (!spaceData.results || spaceData.results.length === 0) {
      console.error(`[confluenceSync] Space ${spaceKey} not found`);
      return items;
    }

    const spaceId = spaceData.results[0].id;

    url = `${baseUrl}/spaces/${spaceId}/pages?limit=50${cursor ? `&cursor=${cursor}` : ""}`;

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`Confluence API error: ${response.status}`);
    }

    const data: ConfluenceSearchResponse = await response.json();

    for (const page of data.results) {
      if (page.status !== "current") continue;

      items.push({
        externalId: page.id,
        title: page.title,
        url: page._links?.webui,
        modifiedAt: page.version?.when ? new Date(page.version.when) : undefined,
        contentHash: page.version?.number?.toString(),
      });
    }

    if (data._links?.next) {
      const nextUrl = new URL(data._links.next, baseUrl);
      cursor = nextUrl.searchParams.get("cursor") || undefined;
    } else {
      cursor = undefined;
    }
  } while (cursor);

  return items;
}

async function fetchPageMetadata(
  accessToken: string,
  baseUrl: string,
  pageId: string
): Promise<SyncableItem | null> {
  const url = `${baseUrl}/pages/${pageId}`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    console.error(`[confluenceSync] Failed to fetch page ${pageId}: ${response.status}`);
    return null;
  }

  const page: ConfluencePage = await response.json();

  if (page.status !== "current") {
    return null;
  }

  return {
    externalId: page.id,
    title: page.title,
    url: page._links?.webui,
    modifiedAt: page.version?.when ? new Date(page.version.when) : undefined,
    contentHash: page.version?.number?.toString(),
  };
}

function formatConfluencePage(title: string, content: string, page: ConfluencePage): string {
  const parts: string[] = [];

  parts.push(`# ${title}`);
  parts.push("");

  if (page.space) {
    parts.push(`**Space:** ${page.space.name} (${page.space.key})`);
  }
  if (page.version) {
    parts.push(`**Version:** ${page.version.number}`);
    parts.push(`**Last Updated:** ${page.version.when}`);
  }
  parts.push("");

  parts.push(content);

  return parts.join("\n");
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/h[1-6]>/gi, "\n\n")
    .replace(/<li>/gi, "- ")
    .replace(/<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
