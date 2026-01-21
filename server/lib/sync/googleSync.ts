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
    // HARD GUARD: Must have access token
    if (!ctx.accessToken || ctx.accessToken.length === 0) {
      console.error(`[googleSync] NO ACCESS TOKEN for accountId=${ctx.accountId}. User must reconnect Google.`);
      throw new Error(`No Google OAuth token for accountId=${ctx.accountId}; reconnect required`);
    }

    console.log(`[googleSync] Starting fetchMetadata, accountId=${ctx.accountId}, hasToken=${!!ctx.accessToken}, tokenLen=${ctx.accessToken.length}`);

    if (process.env.DEV_CONNECTOR_FIXTURES === "1" || (process.env.NODE_ENV === "development" && !ctx.accessToken)) {
      console.log("[googleSync] Returning fixture metadata");
      return [
        {
          externalId: "fixture-doc-1",
          title: "Project Plan (Fixture)",
          url: "https://docs.google.com/document/d/fixture1",
          mimeType: "text/plain",
          contentHash: "fixture-hash-1",
          modifiedAt: new Date(),
        },
        {
          externalId: "fixture-doc-2",
          title: "Meeting Notes (Fixture)",
          url: "https://docs.google.com/document/d/fixture2",
          mimeType: "text/plain",
          contentHash: "fixture-hash-2",
          modifiedAt: new Date(),
        }
      ];
    }

    const items: SyncableItem[] = [];
    const scopeConfig = ctx.scope.scopeConfigJson as { folderId?: string; fileIds?: string[] } | null;

    // If scopeConfig specifies folderId, use it; otherwise list from root
    if (scopeConfig?.folderId) {
      console.log(`[googleSync] Listing folder: ${scopeConfig.folderId}`);
      const folderItems = await fetchFolderContents(ctx.accessToken, scopeConfig.folderId);
      items.push(...folderItems);
    } else if (scopeConfig?.fileIds && scopeConfig.fileIds.length > 0) {
      console.log(`[googleSync] Fetching ${scopeConfig.fileIds.length} specific files`);
      for (const fileId of scopeConfig.fileIds) {
        const file = await fetchFileMetadata(ctx.accessToken, fileId);
        if (file) {
          items.push(file);
        }
      }
    } else {
      // FALLBACK: List all files from root (user's My Drive root)
      console.log(`[googleSync] No folder/files configured, listing from root`);
      const rootItems = await fetchFolderContents(ctx.accessToken, "root");
      items.push(...rootItems);
    }

    // Log Drive discovery results for debugging
    console.log(`[googleSync] Drive discovery: ${items.length} files found`);
    if (items.length > 0) {
      const sampleNames = items.slice(0, 10).map(f => f.title);
      console.log(`[googleSync] Sample files (first 10): ${sampleNames.join(", ")}`);
    } else {
      console.warn(`[googleSync] WARNING: No Drive files discovered! Check OAuth scopes and permissions.`);
    }

    return items;
  },

  async fetchContent(ctx: SyncContext, item: SyncableItem): Promise<SyncableContent | null> {
    if (process.env.DEV_CONNECTOR_FIXTURES === "1" || (process.env.NODE_ENV === "development" && !ctx.accessToken)) {
      console.log(`[googleSync] Returning fixture content for ${item.externalId}`);
      return {
        ...item,
        content: `This is a fixture content for ${item.title}. `.repeat(200) + "\n\nEnd of fixture content.",
        metadata: {
          source: "google_drive",
        },
      };
    }

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

  // D) Add supportsAllDrives + includeItemsFromAllDrives for full file discovery
  let url = `${GOOGLE_DRIVE_API}/files?q=${encodeURIComponent(query)}&fields=${encodeURIComponent(fields)}&pageSize=100&supportsAllDrives=true&includeItemsFromAllDrives=true`;
  if (pageToken) {
    url += `&pageToken=${pageToken}`;
  }

  console.log(`[gdrive:list] Fetching folder=${folderId}, pageToken=${pageToken || 'first_page'}`);

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error(`[gdrive:list] Drive API FAILED: status=${response.status} body=${errorBody.substring(0, 500)}`);
    throw new Error(`Drive API error: ${response.status} - ${errorBody.substring(0, 200)}`);
  }

  const data: DriveFileList = await response.json();

  // C) Log each file with PROCESS/SKIP reason
  for (const file of data.files) {
    if (file.mimeType === "application/vnd.google-apps.folder") {
      console.log(`[gdrive:list] FOLDER file=${file.name} (id=${file.id})`);
      const subItems = await fetchFolderContents(accessToken, file.id);
      items.push(...subItems);
    } else if (isTextBasedFile(file.mimeType)) {
      console.log(`[gdrive:list] PROCESS file=${file.name} (id=${file.id}, mime=${file.mimeType})`);
      items.push({
        externalId: file.id,
        title: file.name,
        url: file.webViewLink,
        mimeType: file.mimeType,
        contentHash: file.md5Checksum,
        modifiedAt: file.modifiedTime ? new Date(file.modifiedTime) : undefined,
      });
    } else {
      console.log(`[gdrive:list] SKIP file=${file.name} (id=${file.id}) reason=unsupported_mime_type (${file.mimeType})`);
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

  // Handle different file types
  if (mimeType === "application/pdf") {
    // For PDFs, download as buffer and extract text (simplified - just get the raw text)
    try {
      const buffer = await response.arrayBuffer();
      // Simple approach: try to extract text from PDF buffer
      // For now, just return a placeholder indicating PDF content
      console.log(`[googleSync] PDF file ${fileId} downloaded (${buffer.byteLength} bytes) - text extraction pending`);
      // TODO: Add pdf-parse library for proper extraction
      // For now, return metadata about the PDF
      return `[PDF Document - ${buffer.byteLength} bytes]`;
    } catch (e) {
      console.error(`[googleSync] PDF extraction failed for ${fileId}:`, e);
      return null;
    }
  }

  // Handle Word documents
  if (mimeType?.includes("wordprocessingml") || mimeType === "application/msword") {
    try {
      const buffer = await response.arrayBuffer();
      console.log(`[googleSync] Word doc ${fileId} downloaded (${buffer.byteLength} bytes) - text extraction pending`);
      // TODO: Add mammoth library for proper extraction
      return `[Word Document - ${buffer.byteLength} bytes]`;
    } catch (e) {
      console.error(`[googleSync] Word extraction failed for ${fileId}:`, e);
      return null;
    }
  }

  return response.text();
}

function isTextBasedFile(mimeType: string): boolean {
  const textTypes = [
    // Plain text types
    "text/",
    "application/json",
    "application/xml",
    "application/javascript",
    // PDF
    "application/pdf",
    // Google Workspace types
    "application/vnd.google-apps.document",
    "application/vnd.google-apps.spreadsheet",
    "application/vnd.google-apps.presentation",
    // Google Colab notebooks (.ipynb)
    "application/vnd.google.colaboratory",
    // Microsoft Office - Modern (.docx, .xlsx, .pptx)
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    // Microsoft Office - Legacy (.doc, .xls, .ppt)
    "application/msword",
    "application/vnd.ms-excel",
    "application/vnd.ms-powerpoint",
    // Other document types
    "application/rtf",
  ];

  return textTypes.some(type => mimeType.startsWith(type) || mimeType === type);
}
