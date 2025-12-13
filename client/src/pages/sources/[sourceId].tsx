import { useQuery } from "@tanstack/react-query";
import { useParams, useSearch, Link } from "wouter";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
  FileText,
  Calendar,
  Hash,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
} from "lucide-react";
import { useEffect, useRef } from "react";
import type { Source, Chunk } from "@shared/schema";

interface SourceWithChunks extends Source {
  chunks: Chunk[];
}

export default function SourceViewerPage() {
  const params = useParams<{ sourceId: string }>();
  const searchParams = new URLSearchParams(useSearch());
  const highlightChunkId = searchParams.get("chunk");
  const chunkRef = useRef<HTMLDivElement>(null);

  const { data: source, isLoading } = useQuery<SourceWithChunks>({
    queryKey: ["/api/sources", params.sourceId],
  });

  useEffect(() => {
    if (highlightChunkId && chunkRef.current) {
      chunkRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [highlightChunkId, source]);

  const highlightedChunkIndex = source?.chunks.findIndex(
    (c) => c.id === highlightChunkId
  );

  const prevChunk =
    highlightedChunkIndex !== undefined && highlightedChunkIndex > 0
      ? source?.chunks[highlightedChunkIndex - 1]
      : null;

  const nextChunk =
    highlightedChunkIndex !== undefined &&
    source?.chunks &&
    highlightedChunkIndex < source.chunks.length - 1
      ? source.chunks[highlightedChunkIndex + 1]
      : null;

  if (isLoading) {
    return (
      <Layout title="Source Viewer">
        <div className="p-6 max-w-5xl mx-auto space-y-6">
          <Skeleton className="h-8 w-64" />
          <Card>
            <CardHeader>
              <Skeleton className="h-6 w-48" />
            </CardHeader>
            <CardContent className="space-y-4">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-5/6" />
            </CardContent>
          </Card>
        </div>
      </Layout>
    );
  }

  if (!source) {
    return (
      <Layout title="Source Not Found">
        <div className="p-6 max-w-5xl mx-auto">
          <Card>
            <CardContent className="py-12 text-center">
              <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h2 className="text-lg font-medium mb-2">Source not found</h2>
              <p className="text-sm text-muted-foreground">
                The requested source could not be found.
              </p>
              <Button asChild className="mt-4">
                <Link href="/chat">Back to Chat</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="Source Viewer">
      <div className="p-6 max-w-5xl mx-auto space-y-6">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href="/chat">Chat</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>{source.title}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-1">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Document Info</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-start gap-3">
                  <FileText className="h-4 w-4 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="text-sm font-medium">{source.title}</p>
                    <Badge variant="secondary" className="text-xs mt-1">
                      {source.type}
                    </Badge>
                  </div>
                </div>

                {source.url && (
                  <div className="flex items-start gap-3">
                    <ExternalLink className="h-4 w-4 text-muted-foreground mt-0.5" />
                    <a
                      href={source.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-primary hover:underline truncate"
                    >
                      {source.url}
                    </a>
                  </div>
                )}

                <div className="flex items-start gap-3">
                  <Calendar className="h-4 w-4 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="text-xs text-muted-foreground">Created</p>
                    <p className="text-sm">
                      {new Date(source.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Hash className="h-4 w-4 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="text-xs text-muted-foreground">Chunks</p>
                    <p className="text-sm">{source.chunks.length}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="lg:col-span-2">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-4">
                <CardTitle className="text-base">Content</CardTitle>
                {highlightChunkId && (
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!prevChunk}
                      asChild={!!prevChunk}
                    >
                      {prevChunk ? (
                        <Link
                          href={`/sources/${source.id}?chunk=${prevChunk.id}`}
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </Link>
                      ) : (
                        <span>
                          <ChevronLeft className="h-4 w-4" />
                        </span>
                      )}
                    </Button>
                    <span className="text-xs text-muted-foreground">
                      Chunk {(highlightedChunkIndex ?? 0) + 1} of{" "}
                      {source.chunks.length}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!nextChunk}
                      asChild={!!nextChunk}
                    >
                      {nextChunk ? (
                        <Link
                          href={`/sources/${source.id}?chunk=${nextChunk.id}`}
                        >
                          <ChevronRight className="h-4 w-4" />
                        </Link>
                      ) : (
                        <span>
                          <ChevronRight className="h-4 w-4" />
                        </span>
                      )}
                    </Button>
                  </div>
                )}
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[500px]">
                  <div className="prose prose-sm dark:prose-invert max-w-none leading-relaxed">
                    {source.chunks.map((chunk) => (
                      <div
                        key={chunk.id}
                        ref={chunk.id === highlightChunkId ? chunkRef : null}
                        className={`py-2 px-3 -mx-3 rounded-md transition-colors ${
                          chunk.id === highlightChunkId
                            ? "bg-primary/10 border-l-4 border-primary font-medium"
                            : ""
                        }`}
                        data-testid={`chunk-${chunk.chunkIndex}`}
                      >
                        {chunk.text}
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </Layout>
  );
}
