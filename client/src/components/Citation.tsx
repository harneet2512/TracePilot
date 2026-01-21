import { ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CitationProps {
    source: {
        id: string;
        title: string;
        url?: string | null;
        type: 'upload' | 'confluence' | 'drive' | 'jira' | 'slack';
    };
    children?: React.ReactNode;
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
    upload: 'Uploaded File',
};

export function Citation({ source, children, className }: CitationProps) {
    const icon = sourceIcons[source.type] || '📄';
    const label = sourceLabels[source.type] || source.type;

    if (!source.url) {
        return (
            <span
                className={cn(
                    "inline-flex items-center gap-1 text-gray-600 font-medium",
                    className
                )}
                title={`${source.title} (${label})`}
            >
                <span className="text-sm">{icon}</span>
                <span>{children || source.title}</span>
            </span>
        );
    }

    return (
        <a
            href={source.url}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
                "inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 hover:underline transition-colors font-medium",
                className
            )}
            title={`Open ${source.title} in ${label}`}
        >
            <span className="text-sm">{icon}</span>
            <span>{children || source.title}</span>
            <ExternalLink className="h-3 w-3 ml-0.5 opacity-60" />
        </a>
    );
}
