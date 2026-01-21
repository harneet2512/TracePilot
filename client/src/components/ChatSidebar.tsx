/**
 * Chat Sidebar - Conversation list with create/switch/delete
 */
import { useState, useEffect } from "react";
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
import { Plus, MessageSquare, Trash2 } from "lucide-react";
import {
    getConversations,
    createConversation,
    deleteConversation,
    type Conversation,
} from "@/lib/conversations";
import { cn } from "@/lib/utils";

interface ChatSidebarProps {
    activeConversationId?: string;
    onConversationChange?: () => void;
}

export function ChatSidebar({ activeConversationId, onConversationChange }: ChatSidebarProps) {
    const [, navigate] = useLocation();
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

    // Load conversations on mount and when they change
    useEffect(() => {
        setConversations(getConversations());
    }, [activeConversationId]);

    const handleNewChat = () => {
        const conv = createConversation();
        setConversations(getConversations());
        navigate(`/chat/${conv.id}`);
        onConversationChange?.();
    };

    const handleSelectChat = (id: string) => {
        navigate(`/chat/${id}`);
        onConversationChange?.();
    };

    const handleDeleteChat = (id: string) => {
        deleteConversation(id);
        setConversations(getConversations());
        setDeleteConfirmId(null);

        // If deleted active chat, navigate to first available or create new
        if (id === activeConversationId) {
            const remaining = getConversations();
            if (remaining.length > 0) {
                navigate(`/chat/${remaining[0].id}`);
            } else {
                const newConv = createConversation();
                navigate(`/chat/${newConv.id}`);
            }
        }
        onConversationChange?.();
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
        <div className="flex flex-col h-full">
            <div className="p-3 border-b">
                <Button
                    onClick={handleNewChat}
                    className="w-full justify-start gap-2"
                    variant="outline"
                >
                    <Plus className="h-4 w-4" />
                    New Chat
                </Button>
            </div>

            <ScrollArea className="flex-1">
                <div className="p-2 space-y-1">
                    {conversations.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-4">
                            No conversations yet
                        </p>
                    ) : (
                        conversations.map((conv) => (
                            <div
                                key={conv.id}
                                className={cn(
                                    "group flex items-center gap-2 rounded-md px-3 py-2 cursor-pointer hover:bg-accent transition-colors",
                                    activeConversationId === conv.id && "bg-accent"
                                )}
                                onClick={() => handleSelectChat(conv.id)}
                            >
                                <MessageSquare className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium truncate">{conv.title}</p>
                                    <p className="text-xs text-muted-foreground">
                                        {formatDate(conv.updatedAt)}
                                    </p>
                                </div>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
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
                            Delete
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
