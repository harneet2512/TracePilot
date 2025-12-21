import type { UserConnectorScope, Source, Chunk } from "@shared/schema";

export type SyncMode = "metadata_first" | "full" | "smart" | "on_demand";
export type ContentStrategy = "smart" | "full" | "on_demand";

export interface SyncContext {
  userId: string;
  accountId: string;
  scope: UserConnectorScope;
  accessToken: string;
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
