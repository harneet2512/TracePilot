import { Link, useLocation } from "wouter";
import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
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
import {
  MessageSquare,
  Plug,
  FileUp,
  ShieldCheck,
  ClipboardList,
  BarChart3,
  LogOut,
  Shield,
  Link2,
  Activity,
  Plus,
  Trash2,
} from "lucide-react";
import {
  getConversations,
  createConversation,
  deleteConversation,
  type Conversation,
} from "@/lib/conversations";
import { cn } from "@/lib/utils";

const memberItems = [
  { title: "Chat", url: "/chat", icon: MessageSquare },
  { title: "Connect", url: "/connect", icon: Link2 },
];

const adminItems = [
  { title: "Connectors", url: "/admin/connectors", icon: Plug },
  { title: "Ingestion", url: "/admin/ingest", icon: FileUp },
  { title: "Policies", url: "/admin/policies", icon: ShieldCheck },
  { title: "Audit Logs", url: "/admin/audit", icon: ClipboardList },
  { title: "Evaluations", url: "/admin/evals", icon: BarChart3 },
  { title: "Observability", url: "/admin/observability", icon: Activity },
];

// ChatList component for conversation management
function ChatList({ currentPath }: { currentPath: string }) {
  const [, navigate] = useLocation();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // Extract current conversationId from path
  const currentConversationId = currentPath.startsWith("/chat/")
    ? currentPath.replace("/chat/", "")
    : null;

  useEffect(() => {
    setConversations(getConversations());
  }, [currentPath]);

  const handleNewChat = () => {
    const conv = createConversation();
    setConversations(getConversations());
    navigate(`/chat/${conv.id}`);
  };

  const handleDeleteChat = (id: string) => {
    deleteConversation(id);
    setConversations(getConversations());
    setDeleteConfirmId(null);

    if (id === currentConversationId) {
      const remaining = getConversations();
      if (remaining.length > 0) {
        navigate(`/chat/${remaining[0].id}`);
      } else {
        const newConv = createConversation();
        navigate(`/chat/${newConv.id}`);
      }
    }
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
    <>
      <div className="px-2 pb-2">
        <Button
          onClick={handleNewChat}
          className="w-full justify-start gap-2"
          variant="outline"
          size="sm"
        >
          <Plus className="h-4 w-4" />
          New Chat
        </Button>
      </div>

      <ScrollArea className="max-h-48">
        <div className="px-2 space-y-1">
          {conversations.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-2">
              No conversations yet
            </p>
          ) : (
            conversations.map((conv) => (
              <div
                key={conv.id}
                className={cn(
                  "group flex items-center gap-2 rounded-md px-2 py-1.5 cursor-pointer hover:bg-accent transition-colors text-sm",
                  currentConversationId === conv.id && "bg-accent"
                )}
                onClick={() => navigate(`/chat/${conv.id}`)}
              >
                <MessageSquare className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate">{conv.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(conv.updatedAt)}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity"
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
    </>
  );
}

export function AppSidebar() {
  const { user, logout } = useAuth();
  const [location] = useLocation();
  const isAdmin = user?.role === "admin";

  const handleLogout = async () => {
    await logout();
  };

  const getInitials = (email: string) => {
    return email.slice(0, 2).toUpperCase();
  };

  return (
    <Sidebar>
      <SidebarHeader className="border-b border-sidebar-border px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-md bg-primary flex items-center justify-center flex-shrink-0">
            <Shield className="h-4 w-4 text-primary-foreground" />
          </div>
          <div className="flex flex-col min-w-0">
            <span className="font-semibold text-sm truncate">FieldCopilot</span>
            <span className="text-xs text-muted-foreground">Enterprise AI</span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="text-xs uppercase tracking-wider text-muted-foreground px-2">
            Main
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {memberItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={location === item.url || (item.url === "/chat" && location.startsWith("/chat"))}
                    data-testid={`nav-${item.title.toLowerCase()}`}
                  >
                    <Link href={item.url}>
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Conversations List - shown when on chat pages */}
        {location.startsWith("/chat") && (
          <SidebarGroup>
            <SidebarGroupLabel className="text-xs uppercase tracking-wider text-muted-foreground px-2">
              Conversations
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <ChatList currentPath={location} />
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {isAdmin && (
          <SidebarGroup>
            <SidebarGroupLabel className="text-xs uppercase tracking-wider text-muted-foreground px-2">
              Admin
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {adminItems.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      isActive={location.startsWith(item.url)}
                      data-testid={`nav-${item.title.toLowerCase().replace(' ', '-')}`}
                    >
                      <Link href={item.url}>
                        <item.icon className="h-4 w-4" />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-3">
        <div className="flex items-center gap-3">
          <Avatar className="h-8 w-8">
            <AvatarFallback className="text-xs bg-muted">
              {user?.email ? getInitials(user.email) : "??"}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{user?.email}</p>
            <Badge variant="secondary" className="text-xs mt-0.5">
              {user?.role}
            </Badge>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleLogout}
            data-testid="button-logout"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
