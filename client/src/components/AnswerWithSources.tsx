import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ExternalLink, Edit3, Lock, Loader2, FileText, AlertCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

// ============================================================================
// Types
// ============================================================================

type SourceType = 'drive' | 'confluence' | 'slack' | 'jira' | 'upload';

interface Source {
    id: string;
    title: string;
    url?: string | null;
    type: SourceType;
    chunkCount?: number;
}

interface PermissionResponse {
    canEdit: boolean;
    canView: boolean;
    userRole?: 'owner' | 'writer' | 'reader';
    reason?: string;
    url?: string;
}

interface AnswerWithSourcesProps {
    /** The generated answer text */
    answerText: string;
    /** Array of sources used to generate the answer */
    sources: Source[];
    /** Optional CSS class name */
    className?: string;
    /** Whether the answer is still being generated */
    isStreaming?: boolean;
}

interface SourceItemProps {
    source: Source;
}

// ============================================================================
// Constants
// ============================================================================

const SOURCE_ICONS: Record<SourceType, string> = {
    drive: '📄',
    confluence: '📋',
    slack: '💬',
    jira: '🎫',
    upload: '📁',
};

const SOURCE_LABELS: Record<SourceType, string> = {
    drive: 'Google Drive',
    confluence: 'Confluence',
    slack: 'Slack',
    jira: 'Jira',
    upload: 'Uploaded File',
};

const SOURCE_COLORS: Record<SourceType, string> = {
    drive: 'bg-blue-50 text-blue-700 border-blue-200',
    confluence: 'bg-blue-50 text-blue-700 border-blue-200',
    slack: 'bg-purple-50 text-purple-700 border-purple-200',
    jira: 'bg-blue-50 text-blue-700 border-blue-200',
    upload: 'bg-gray-50 text-gray-700 border-gray-200',
};

// ============================================================================
// Helper Functions
// ============================================================================

function getSourceIcon(type: SourceType): string {
    return SOURCE_ICONS[type] || '📄';
}

function getSourceLabel(type: SourceType): string {
    return SOURCE_LABELS[type] || type;
}

function getSourceColor(type: SourceType): string {
    return SOURCE_COLORS[type] || SOURCE_COLORS.upload;
}

// ============================================================================
// SourceItem Component
// ============================================================================

function SourceItem({ source }: SourceItemProps) {
    const { toast } = useToast();
    const isGoogleDrive = source.type === 'drive';

    // Fetch permissions for Google Drive sources only
    const {
        data: permissions,
        isLoading: permissionsLoading,
        isError: permissionsError,
    } = useQuery<PermissionResponse>({
        queryKey: ['source-permissions', source.id],
        queryFn: async () => {
            const res = await fetch(`/api/sources/${source.id}/permissions`);
            if (!res.ok) {
                throw new Error('Failed to fetch permissions');
            }
            return res.json();
        },
        enabled: isGoogleDrive,
        staleTime: 5 * 60 * 1000, // Cache for 5 minutes
        retry: 1,
    });

    const canEdit = isGoogleDrive && permissions?.canEdit === true;
    const hasUrl = Boolean(source.url);

    const handleView = () => {
        if (!source.url) {
            toast({
                title: 'Cannot open',
                description: 'Source URL not available',
                variant: 'destructive',
            });
            return;
        }
        window.open(source.url, '_blank', 'noopener,noreferrer');
    };

    const handleEdit = () => {
        if (!canEdit) {
            toast({
                title: 'Cannot edit',
                description: "You don't have permission to edit this document.",
                variant: 'destructive',
            });
            return;
        }

        if (!source.url) {
            toast({
                title: 'Cannot open',
                description: 'Source URL not available',
                variant: 'destructive',
            });
            return;
        }

        window.open(source.url, '_blank', 'noopener,noreferrer');
        toast({
            title: 'Opening in Google Drive',
            description: 'Document opened for editing.',
        });
    };

    return (
        <Card className="hover:shadow-md transition-shadow group">
            <CardContent className="p-4">
                <div className="flex items-center justify-between gap-4">
                    {/* Source Info */}
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                        <span
                            className="text-xl sm:text-2xl flex-shrink-0"
                            role="img"
                            aria-label={getSourceLabel(source.type)}
                        >
                            {getSourceIcon(source.type)}
                        </span>

                        <div className="flex-1 min-w-0">
                            <h4
                                className="font-medium text-sm truncate"
                                title={source.title}
                            >
                                {source.title}
                            </h4>

                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                                <Badge
                                    variant="outline"
                                    className={cn('text-xs', getSourceColor(source.type))}
                                >
                                    {getSourceLabel(source.type)}
                                </Badge>

                                {/* Chunk count if available */}
                                {source.chunkCount !== undefined && source.chunkCount > 0 && (
                                    <span className="text-xs text-muted-foreground">
                                        {source.chunkCount} chunks
                                    </span>
                                )}

                                {/* Permission Status - Only for Google Drive */}
                                {isGoogleDrive && (
                                    <>
                                        {permissionsLoading ? (
                                            <span className="text-xs text-gray-400 flex items-center gap-1">
                                                <Loader2 className="h-3 w-3 animate-spin" />
                                                <span className="hidden sm:inline">Checking...</span>
                                            </span>
                                        ) : permissionsError ? (
                                            <Badge variant="secondary" className="text-xs text-amber-600">
                                                <AlertCircle className="h-3 w-3 mr-1" />
                                                <span className="hidden sm:inline">Check failed</span>
                                            </Badge>
                                        ) : canEdit ? (
                                            <Badge
                                                variant="default"
                                                className="text-xs bg-green-600 hover:bg-green-700"
                                            >
                                                ✓ Can edit
                                            </Badge>
                                        ) : (
                                            <Badge variant="secondary" className="text-xs">
                                                View only
                                            </Badge>
                                        )}

                                        {permissions?.userRole && !permissionsError && (
                                            <span className="text-xs text-gray-500 hidden sm:inline">
                                                • {permissions.userRole}
                                            </span>
                                        )}
                                    </>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0 opacity-80 group-hover:opacity-100 transition-opacity">
                        {/* View Button - Always shown if URL exists */}
                        {hasUrl ? (
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={handleView}
                                title={`View ${source.title}`}
                                aria-label={`View ${source.title}`}
                                className="h-8 px-2 sm:px-3"
                            >
                                <ExternalLink className="h-4 w-4" />
                                <span className="ml-1.5 hidden sm:inline">View</span>
                            </Button>
                        ) : (
                            <Button
                                variant="ghost"
                                size="sm"
                                disabled
                                title="Source URL not available"
                                className="h-8 px-2"
                            >
                                <FileText className="h-4 w-4 text-gray-400" />
                            </Button>
                        )}

                        {/* Edit Button - Only for Google Drive */}
                        {isGoogleDrive && (
                            <>
                                {permissionsLoading ? (
                                    <Button variant="ghost" size="sm" disabled className="h-8 px-2">
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                    </Button>
                                ) : canEdit ? (
                                    <Button
                                        variant="default"
                                        size="sm"
                                        onClick={handleEdit}
                                        title={`Edit ${source.title} in Google Drive`}
                                        aria-label={`Edit ${source.title} in Google Drive`}
                                        className="h-8 px-2 sm:px-3 bg-blue-600 hover:bg-blue-700"
                                    >
                                        <Edit3 className="h-4 w-4" />
                                        <span className="ml-1.5 hidden sm:inline">Edit</span>
                                    </Button>
                                ) : (
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        disabled
                                        title="No edit permission for this document"
                                        aria-label="Edit not available"
                                        className="h-8 px-2"
                                    >
                                        <Lock className="h-4 w-4 text-gray-400" />
                                    </Button>
                                )}
                            </>
                        )}
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}

// ============================================================================
// AnswerWithSources Component
// ============================================================================

export function AnswerWithSources({
    answerText,
    sources,
    className,
    isStreaming = false,
}: AnswerWithSourcesProps) {
    // Filter out any invalid sources
    const validSources = sources.filter(
        (s): s is Source => Boolean(s && s.id && s.title)
    );

    // Deduplicate sources by ID
    const uniqueSources = Array.from(
        new Map(validSources.map((s) => [s.id, s])).values()
    );

    return (
        <div className={cn('space-y-4', className)}>
            {/* The Answer */}
            <div className="prose prose-sm max-w-none">
                <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border-l-4 border-blue-500 p-4 rounded-r-lg shadow-sm">
                    <p className="text-gray-800 leading-relaxed whitespace-pre-wrap m-0">
                        {answerText}
                        {isStreaming && (
                            <span className="inline-block w-2 h-4 bg-blue-500 animate-pulse ml-1" />
                        )}
                    </p>
                </div>
            </div>

            {/* Sources Section */}
            {uniqueSources.length > 0 && (
                <div className="space-y-3">
                    <h3 className="font-semibold text-sm text-gray-700 flex items-center gap-2">
                        <span>Sources Used</span>
                        <Badge variant="secondary" className="text-xs font-normal">
                            {uniqueSources.length}
                        </Badge>
                    </h3>

                    <div className="grid gap-3">
                        {uniqueSources.map((source) => (
                            <SourceItem key={source.id} source={source} />
                        ))}
                    </div>
                </div>
            )}

            {/* Empty state when no sources */}
            {uniqueSources.length === 0 && !isStreaming && (
                <div className="text-sm text-muted-foreground italic">
                    No sources available for this answer.
                </div>
            )}
        </div>
    );
}

export type { Source, SourceType, AnswerWithSourcesProps };
