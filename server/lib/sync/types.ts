import type { UserConnectorScope, Source, Chunk } from "@shared/schema";

export type SyncMode = "metadata_first" | "full" | "smart" | "on_demand";
export type ContentStrategy = "smart" | "full" | "on_demand";

export interface SyncProgress {
  stage: "fetching" | "persisting" | "chunking" | "embedding" | "done" | "error";
  docsDiscovered: number;
  docsFetched: number;
  sourcesUpserted: number;
  versionsCreated: number;
  chunksCreated: number;
  charsProcessed: number;
  throughputCharsPerSec?: number;
  etaSeconds?: number;
}

export interface SyncContext {
  userId: string;
  accountId: string;
  scope: UserConnectorScope;
  accessToken: string;
  onProgress?: (stats: Partial<SyncProgress>) => Promise<void>;
}

export interface SyncResult {
  success: boolean;
  sourcesCreated: number;
  sourcesUpdated: number;
  sourcesDeleted: number;
  chunksCreated: number;
  errors: string[];
  startedAt: Date;
  completedAt: Date;
}

export interface SyncableItem {
  externalId: string;
  title: string;
  url?: string;
  contentHash?: string;
  mimeType?: string;
  modifiedAt?: Date;
  metadata?: Record<string, unknown>; // Added for connector-specific metadata
}

export interface SyncableContent extends SyncableItem {
  content: string;
  metadata?: Record<string, unknown>;
}

export interface SyncEngine {
  name: string;
  fetchMetadata(ctx: SyncContext): Promise<SyncableItem[]>;
  fetchContent(ctx: SyncContext, item: SyncableItem): Promise<SyncableContent | null>;
}
