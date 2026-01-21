import { ExternalLink, FileText } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface SourceCardProps {
    source: {
        id: string;
        title: string;
        url?: string | null;
        type: 'upload' | 'confluence' | 'drive' | 'jira' | 'slack';
        charCount?: number;
        chunkCount?: number;
        ingestedAt?: string;
    };
    className?: string;
}

const sourceIcons: Record<string, string> = {
    drive: '📄',
    confluence: '📋',
    slack: '💬',
    jira: '🎫',
    upload: '📁',
};

const sourceLabels: Record<string, string> = {
    drive: 'Google Drive',
    confluence: 'Confluence',
    slack: 'Slack',
    jira: 'Jira',
    upload: 'Uploaded',
};

const sourceColors: Record<string, string> = {
    drive: 'bg-blue-50 text-blue-700 border-blue-200',
    confluence: 'bg-blue-50 text-blue-700 border-blue-200',
    slack: 'bg-purple-50 text-purple-700 border-purple-200',
    jira: 'bg-blue-50 text-blue-700 border-blue-200',
    upload: 'bg-gray-50 text-gray-700 border-gray-200',
};

export function SourceCard({ source, className }: SourceCardProps) {
    const icon = sourceIcons[source.type] || '📄';
    const label = sourceLabels[source.type] || source.type;
    const colorClass = sourceColors[source.type] || sourceColors.upload;

    const handleOpen = () => {
        if (source.url) {
            window.open(source.url, '_blank', 'noopener,noreferrer');
        }
    };

    const formatDate = (dateStr: string) => {
        const date = new Date(dateStr);
        return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    };

    return (
        <div
            className={cn(
                "p-4 border rounded-lg hover:shadow-md transition-all bg-white group",
                className
            )}
        >
            <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                    {/* Title and icon */}
                    <div className="flex items-center gap-2 mb-2">
                        <span className="text-lg flex-shrink-0">{icon}</span>
                        <h3 className="font-medium text-sm truncate" title={source.title}>
                            {source.title}
                        </h3>
                    </div>

                    {/* Badge and stats */}
                    <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className={cn("text-xs", colorClass)}>
                            {label}
                        </Badge>
                        {source.chunkCount !== undefined && (
                            <span className="text-xs text-muted-foreground">
                                {source.chunkCount} chunks
                            </span>
                        )}
                        {source.charCount !== undefined && (
                            <span className="text-xs text-muted-foreground">
                                {(source.charCount / 1000).toFixed(1)}k chars
                            </span>
                        )}
                        {source.ingestedAt && (
                            <span className="text-xs text-muted-foreground">
                                {formatDate(source.ingestedAt)}
                            </span>
                        )}
                    </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 flex-shrink-0 opacity-70 group-hover:opacity-100 transition-opacity">
                    {source.url ? (
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={handleOpen}
                            title="Open source document"
                            className="h-8 px-2"
                        >
                            <ExternalLink className="h-4 w-4" />
                            <span className="ml-1.5 hidden sm:inline">Open</span>
                        </Button>
                    ) : (
                        <Button
                            variant="ghost"
                            size="sm"
                            disabled
                            title="No URL available"
                            className="h-8 px-2"
                        >
                            <FileText className="h-4 w-4 text-gray-400" />
                        </Button>
                    )}
                </div>
            </div>
        </div>
    );
}
