/**
 * Location Resolver - Derives locationUrl (folder/channel/space) from source metadata
 *
 * This module provides functions to compute locationUrl for different connector types,
 * enabling "Open in Drive/Slack/Jira" functionality in the UI.
 */

import type { Source } from "@shared/schema";

export interface SourceLocation {
  url: string | null;
  typeLabel: string;
  unavailableReason?: string;
}

/**
 * Resolve locationUrl and sourceTypeLabel for a source
 */
export function resolveSourceLocation(source: Source): SourceLocation {
  const type = source.type;

  switch (type) {
    case "drive":
      return resolveDriveLocation(source);
    case "slack":
      return resolveSlackLocation(source);
    case "jira":
      return resolveJiraLocation(source);
    case "confluence":
      return resolveConfluenceLocation(source);
    case "upload":
      return { url: null, typeLabel: "Upload", unavailableReason: "Uploaded files have no external location" };
    case "voice_call":
      return { url: null, typeLabel: "Voice", unavailableReason: "Voice transcripts have no external location" };
    default:
      return { url: null, typeLabel: "Unknown", unavailableReason: "Unknown source type" };
  }
}

/**
 * Resolve Drive folder URL from parent folder ID
 */
function resolveDriveLocation(source: Source): SourceLocation {
  const metadata = source.metadataJson as Record<string, unknown> | null;

  // Try to get parent folder ID from metadata
  const parents = metadata?.parents as string[] | undefined;
  const parentFolderId = parents?.[0]; // Google Drive files typically have one parent

  if (parentFolderId) {
    // Generate Drive folder URL
    const folderUrl = `https://drive.google.com/drive/folders/${parentFolderId}`;
    return { url: folderUrl, typeLabel: "Drive" };
  }

  // Fallback: if no parent, maybe it's in root "My Drive"
  // We can't generate a specific URL, so return null with reason
  return {
    url: null,
    typeLabel: "Drive",
    unavailableReason: "Parent folder not available in metadata"
  };
}

/**
 * Resolve Slack channel URL
 */
function resolveSlackLocation(source: Source): SourceLocation {
  const metadata = source.metadataJson as Record<string, unknown> | null;

  // Slack metadata should include channel_id and team_id/workspace_id
  const channelId = metadata?.channel_id as string | undefined;
  const teamId = metadata?.team_id as string | undefined;

  if (channelId && teamId) {
    // Slack deep link to channel
    const channelUrl = `https://app.slack.com/client/${teamId}/${channelId}`;
    return { url: channelUrl, typeLabel: "Slack" };
  }

  return {
    url: null,
    typeLabel: "Slack",
    unavailableReason: "Channel information not available"
  };
}

/**
 * Resolve Jira project/issue URL
 */
function resolveJiraLocation(source: Source): SourceLocation {
  const metadata = source.metadataJson as Record<string, unknown> | null;

  // Jira metadata should include project key or issue key
  const projectKey = metadata?.projectKey as string | undefined;
  const issueKey = metadata?.issueKey as string | undefined;
  const siteUrl = metadata?.siteUrl as string | undefined;

  if (siteUrl) {
    if (issueKey) {
      // Link to the specific issue's project
      const projectKeyFromIssue = issueKey.split('-')[0];
      const projectUrl = `${siteUrl}/browse/${projectKeyFromIssue}`;
      return { url: projectUrl, typeLabel: "Jira" };
    } else if (projectKey) {
      const projectUrl = `${siteUrl}/browse/${projectKey}`;
      return { url: projectUrl, typeLabel: "Jira" };
    }
  }

  return {
    url: null,
    typeLabel: "Jira",
    unavailableReason: "Project information not available"
  };
}

/**
 * Resolve Confluence space URL
 */
function resolveConfluenceLocation(source: Source): SourceLocation {
  const metadata = source.metadataJson as Record<string, unknown> | null;

  // Confluence metadata should include space key
  const spaceKey = metadata?.spaceKey as string | undefined;
  const siteUrl = metadata?.siteUrl as string | undefined;

  if (siteUrl && spaceKey) {
    const spaceUrl = `${siteUrl}/wiki/spaces/${spaceKey}`;
    return { url: spaceUrl, typeLabel: "Confluence" };
  }

  return {
    url: null,
    typeLabel: "Confluence",
    unavailableReason: "Space information not available"
  };
}

/**
 * Batch resolve locations for multiple sources
 */
export function resolveSourceLocations(sources: Source[]): Map<string, SourceLocation> {
  const map = new Map<string, SourceLocation>();

  for (const source of sources) {
    map.set(source.id, resolveSourceLocation(source));
  }

  return map;
}
