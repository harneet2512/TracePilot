import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import {
    FileText,
    ExternalLink,
    ChevronDown,
    ChevronUp,
    AlertCircle,
} from 'lucide-react';
import {
    parseAnswer,
    extractCitations,
    type ParsedSection,
    type AnswerSource,
} from '@/lib/answer-utils';

interface AnswerRendererProps {
    answer: string;
    sources?: AnswerSource[];
    className?: string;
    onSourceClick?: (source: AnswerSource) => void;
}

export function AnswerRenderer({
    answer,
    sources = [],
    className,
    onSourceClick,
}: AnswerRendererProps) {
    const [expandedSections, setExpandedSections] = React.useState<Set<number>>(
        new Set()
    );
    const [showSources, setShowSources] = React.useState(false);

    const sections = React.useMemo(() => parseAnswer(answer), [answer]);
    const citations = React.useMemo(
        () => extractCitations(answer),
        [answer]
    );

    const toggleSection = (index: number) => {
        const newExpanded = new Set(expandedSections);
        if (newExpanded.has(index)) {
            newExpanded.delete(index);
        } else {
            newExpanded.add(index);
        }
        setExpandedSections(newExpanded);
    };

    const renderSection = (section: ParsedSection, idx: number) => {
        const isExpanded = expandedSections.has(idx);

        return (
            <div key={idx} className="mb-4">
                <div
                    className="flex items-center justify-between cursor-pointer hover:bg-muted/50 p-2 rounded-md transition-colors"
                    onClick={() => toggleSection(idx)}
                >
                    <h3 className="font-semibold text-lg">{section.title}</h3>
                    {isExpanded ? (
                        <ChevronUp className="h-4 w-4 text-muted-foreground" />
                    ) : (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    )}
                </div>

                {isExpanded && (
                    <div className="mt-2 pl-4 space-y-2">
                        {section.items.map((item: string, iIdx: number) => (
                            <div key={iIdx} className="text-sm">
                                {renderTextWithCitations(item)}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        );
    };

    const renderTextWithCitations = (text: string) => {
        // Split text by citation markers [1], [2], etc.
        const parts = text.split(/(\[\d+\])/g);

        return (
            <p className="leading-relaxed">
                {parts.map((part, index) => {
                    const citationMatch = part.match(/\[(\d+)\]/);
                    if (citationMatch) {
                        const citationNum = parseInt(citationMatch[1], 10);
                        const source = sources[citationNum - 1];

                        if (source) {
                            return (
                                <button
                                    key={index}
                                    onClick={() => onSourceClick?.(source)}
                                    className="inline-flex items-center text-xs bg-primary/10 text-primary hover:bg-primary/20 rounded px-1 mx-0.5 transition-colors"
                                    title={source.title}
                                >
                                    {part}
                                </button>
                            );
                        }
                    }
                    return <span key={index}>{part}</span>;
                })}
            </p>
        );
    };

    return (
        <div className={cn('space-y-4', className)}>
            {/* Main Answer Content */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <FileText className="h-5 w-5" />
                        Answer
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {sections.length > 0 ? (
                        <div className="space-y-2">
                            {sections.map((section: ParsedSection, idx: number) =>
                                renderSection(section, idx)
                            )}
                        </div>
                    ) : (
                        <div className="text-sm text-muted-foreground whitespace-pre-wrap">
                            {answer}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Sources Section */}
            {sources.length > 0 && (
                <Card>
                    <CardHeader>
                        <div
                            className="flex items-center justify-between cursor-pointer"
                            onClick={() => setShowSources(!showSources)}
                        >
                            <CardTitle className="flex items-center gap-2">
                                <AlertCircle className="h-5 w-5" />
                                Sources ({sources.length})
                            </CardTitle>
                            {showSources ? (
                                <ChevronUp className="h-4 w-4 text-muted-foreground" />
                            ) : (
                                <ChevronDown className="h-4 w-4 text-muted-foreground" />
                            )}
                        </div>
                    </CardHeader>

                    {showSources && (
                        <CardContent>
                            <div className="space-y-3">
                                {sources.map((source: AnswerSource, idx: number) => (
                                    <div
                                        key={idx}
                                        className="flex items-start gap-3 p-3 border rounded-lg hover:bg-muted/50 transition-colors"
                                    >
                                        <Badge variant="outline" className="mt-0.5">
                                            {idx + 1}
                                        </Badge>
                                        <div className="flex-1 min-w-0">
                                            <div className="font-medium text-sm truncate">
                                                {source.title}
                                            </div>
                                            {source.snippet && (
                                                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                                                    {source.snippet}
                                                </p>
                                            )}
                                            {source.score && (
                                                <div className="text-xs text-muted-foreground mt-1">
                                                    Relevance: {(source.score * 100).toFixed(0)}%
                                                </div>
                                            )}
                                        </div>
                                        {source.url && (
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => onSourceClick?.(source)}
                                                className="shrink-0"
                                            >
                                                <ExternalLink className="h-4 w-4" />
                                            </Button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    )}
                </Card>
            )}
        </div>
    );
}
