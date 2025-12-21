import type { SyncContext, SyncEngine, SyncableItem, SyncableContent } from "./types";

const GOOGLE_DRIVE_API = "https://www.googleapis.com/drive/v3";
const GOOGLE_DOCS_EXPORT_MIMETYPES: Record<string, string> = {
  "application/vnd.google-apps.document": "text/plain",
  "application/vnd.google-apps.spreadsheet": "text/csv",
  "application/vnd.google-apps.presentation": "text/plain",
};

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
  webViewLink?: string;
  md5Checksum?: string;
}

interface DriveFileList {
  files: DriveFile[];
  nextPageToken?: string;
}

export const googleSyncEngine: SyncEngine = {
  name: "drive",

  async fetchMetadata(ctx: SyncContext): Promise<SyncableItem[]> {
    const items: SyncableItem[] = [];
    const scopeConfig = ctx.scope.scopeConfigJson as { folderId?: string; fileIds?: string[] } | null;

    if (!scopeConfig) {
      return items;
    }

    if (scopeConfig.folderId) {
      const folderItems = await fetchFolderContents(ctx.accessToken, scopeConfig.folderId);
      items.push(...folderItems);
    }

    if (scopeConfig.fileIds && scopeConfig.fileIds.length > 0) {
      for (const fileId of scopeConfig.fileIds) {
        const file = await fetchFileMetadata(ctx.accessToken, fileId);
        if (file) {
          items.push(file);
        }
      }
    }

    return items;
  },

  async fetchContent(ctx: SyncContext, item: SyncableItem): Promise<SyncableContent | null> {
    try {
      const content = await fetchFileContent(ctx.accessToken, item.externalId, item.mimeType);
      if (!content) return null;

      return {
        ...item,
        content,
        metadata: {
          source: "google_drive",
        },
      };
    } catch (error) {
      console.error(`[googleSync] Failed to fetch content for ${item.externalId}:`, error);
      return null;
    }
  },
};

async function fetchFolderContents(
  accessToken: string,
  folderId: string,
  pageToken?: string
): Promise<SyncableItem[]> {
  const items: SyncableItem[] = [];

  const query = `'${folderId}' in parents and trashed = false`;
  const fields = "nextPageToken,files(id,name,mimeType,modifiedTime,webViewLink,md5Checksum)";
  
  let url = `${GOOGLE_DRIVE_API}/files?q=${encodeURIComponent(query)}&fields=${encodeURIComponent(fields)}&pageSize=100`;
  if (pageToken) {
    url += `&pageToken=${pageToken}`;
  }

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Drive API error: ${response.status}`);
  }

  const data: DriveFileList = await response.json();

  for (const file of data.files) {
    if (file.mimeType === "application/vnd.google-apps.folder") {
      const subItems = await fetchFolderContents(accessToken, file.id);
      items.push(...subItems);
    } else if (isTextBasedFile(file.mimeType)) {
      items.push({
        externalId: file.id,
        title: file.name,
        url: file.webViewLink,
        mimeType: file.mimeType,
        contentHash: file.md5Checksum,
        modifiedAt: file.modifiedTime ? new Date(file.modifiedTime) : undefined,
      });
    }
  }

  if (data.nextPageToken) {
    const moreItems = await fetchFolderContents(accessToken, folderId, data.nextPageToken);
    items.push(...moreItems);
  }

  return items;
}

async function fetchFileMetadata(accessToken: string, fileId: string): Promise<SyncableItem | null> {
  const fields = "id,name,mimeType,modifiedTime,webViewLink,md5Checksum";
  const url = `${GOOGLE_DRIVE_API}/files/${fileId}?fields=${encodeURIComponent(fields)}`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    console.error(`[googleSync] Failed to fetch file ${fileId}: ${response.status}`);
    return null;
  }

  const file: DriveFile = await response.json();

  if (!isTextBasedFile(file.mimeType)) {
    return null;
  }

  return {
    externalId: file.id,
    title: file.name,
    url: file.webViewLink,
    mimeType: file.mimeType,
    contentHash: file.md5Checksum,
    modifiedAt: file.modifiedTime ? new Date(file.modifiedTime) : undefined,
  };
}

async function fetchFileContent(
  accessToken: string,
  fileId: string,
  mimeType?: string
): Promise<string | null> {
  let url: string;

  if (mimeType && GOOGLE_DOCS_EXPORT_MIMETYPES[mimeType]) {
    const exportMime = GOOGLE_DOCS_EXPORT_MIMETYPES[mimeType];
    url = `${GOOGLE_DRIVE_API}/files/${fileId}/export?mimeType=${encodeURIComponent(exportMime)}`;
  } else {
    url = `${GOOGLE_DRIVE_API}/files/${fileId}?alt=media`;
  }

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    console.error(`[googleSync] Failed to download file ${fileId}: ${response.status}`);
    return null;
  }

  return response.text();
}

function isTextBasedFile(mimeType: string): boolean {
  const textTypes = [
    "text/",
    "application/json",
    "application/xml",
    "application/javascript",
    "application/vnd.google-apps.document",
    "application/vnd.google-apps.spreadsheet",
    "application/vnd.google-apps.presentation",
  ];

  return textTypes.some(type => mimeType.startsWith(type) || mimeType === type);
}
