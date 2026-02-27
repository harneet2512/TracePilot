import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, MessageSquare, Trash2, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useConversations, useCreateConversation, useDeleteConversation } from "@/hooks/use-conversations";
import { perfEnd, perfStart } from "@/lib/perf";

interface ChatSidebarProps {
    activeConversationId?: string;
    onConversationChange?: () => void;
}

export function ChatSidebar({ activeConversationId, onConversationChange }: ChatSidebarProps) {
    const [, navigate] = useLocation();
    const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

    const { data: conversations = [], isLoading } = useConversations();
    const createMutation = useCreateConversation();
    const deleteMutation = useDeleteConversation();

    const handleNewChat = () => {
        createMutation.mutate(undefined, {
            onSuccess: (newConv) => {
                navigate(`/chat/${newConv.id}`);
                onConversationChange?.();
            }
        });
    };

    const handleSelectChat = (id: string) => {
        navigate(`/chat/${id}`);
        onConversationChange?.();
    };

    const handleDeleteChat = (id: string) => {
        const started = perfStart(`render:delete_chat:${id}`);
        setDeleteConfirmId(null);
        // Navigate away FIRST if deleting the active conversation
        // to prevent 404 refetches on the deleted conversation's queries
        if (id === activeConversationId) {
            const remaining = conversations.filter(c => c.id !== id);
            if (remaining.length > 0) {
                navigate(`/chat/${remaining[0].id}`);
            } else {
                handleNewChat();
            }
        }
        // THEN fire the delete
        deleteMutation.mutate(id, {
            onSuccess: () => {
                perfEnd("render", `render:delete_chat:${id}`, started);
                onConversationChange?.();
            },
            onError: () => {
                perfEnd("render", `render:delete_chat:${id}`, started, { error: true });
            }
        });
    };

    const formatDate = (dateStr: string) => {
        const date = new Date(dateStr);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMins / 60);
        const diffDays = Math.floor(diffHours / 24);

        if (diffMins < 1) return "Just now";
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        if (diffDays < 7) return `${diffDays}d ago`;
        return date.toLocaleDateString();
    };

    return (
        <div className="flex flex-col h-full bg-muted/10 border-r">
            <div className="p-3 border-b">
                <Button
                    onClick={handleNewChat}
                    className="w-full justify-start gap-2"
                    variant="default" // Changed to default for prominence matches requirement? R1 says "New chat button"
                    disabled={createMutation.isPending}
                >
                    {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                    New Chat
                </Button>
            </div>

            <ScrollArea className="flex-1">
                <div className="p-2 space-y-1">
                    {isLoading ? (
                        <div className="flex justify-center p-4"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
                    ) : conversations.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-4">
                            No conversations yet
                        </p>
                    ) : (
                        conversations.map((conv) => (
                            <div
                                key={conv.id}
                                className={cn(
                                    "group flex items-center gap-2 rounded-md px-3 py-2 cursor-pointer hover:bg-accent/80 transition-colors relative",
                                    activeConversationId === conv.id && "bg-accent shadow-sm"
                                )}
                                onClick={() => handleSelectChat(conv.id)}
                            >
                                <MessageSquare className={cn("h-4 w-4 flex-shrink-0", activeConversationId === conv.id ? "text-primary" : "text-muted-foreground")} />
                                <div className="flex-1 min-w-0">
                                    <p className={cn("text-sm font-medium truncate", activeConversationId === conv.id ? "text-foreground" : "text-foreground/80")}>
                                        {conv.title}
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                        {formatDate(String(conv.updatedAt))}
                                    </p>
                                </div>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity absolute right-2"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setDeleteConfirmId(conv.id);
                                    }}
                                >
                                    <Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                                </Button>
                            </div>
                        ))
                    )}
                </div>
            </ScrollArea>

            {/* Delete Confirmation Dialog */}
            <AlertDialog open={!!deleteConfirmId} onOpenChange={() => setDeleteConfirmId(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete conversation?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This will permanently delete this conversation and all its messages.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => deleteConfirmId && handleDeleteChat(deleteConfirmId)}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            {deleteMutation.isPending ? "Deleting..." : "Delete"}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}


