import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, CheckCircle, AlertTriangle, ExternalLink } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface ApprovalModalProps {
    isOpen: boolean;
    onClose: () => void;
    approvalId: number;
    proposal: {
        title: string;
        description: string;
        projectKey: string;
        issueType: string;
        slackThreadUrl?: string;
    };
}

export function ApprovalModal({ isOpen, onClose, approvalId, proposal }: ApprovalModalProps) {
    const [description, setDescription] = useState(proposal.description);
    const [summary, setSummary] = useState(proposal.title);
    const { toast } = useToast();
    const queryClient = useQueryClient();

    const { mutate: approve, isPending: isApproving, isSuccess: isApproved, data: result } = useMutation({
        mutationFn: async () => {
            const res = await fetch(`/api/approvals/${approvalId}/approve`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ summary, description }), // Allow editing safe fields
            });
            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.message || "Failed to approve");
            }
            return res.json();
        },
        onSuccess: () => {
            toast({
                title: "Approved",
                description: "Decision approved and Jira ticket created.",
            });
            queryClient.invalidateQueries({ queryKey: ["/api/approvals"] });
        },
        onError: (error: Error) => {
            toast({
                title: "Error",
                description: error.message,
                variant: "destructive",
            });
        },
    });

    const { mutate: reject, isPending: isRejecting } = useMutation({
        mutationFn: async () => {
            const res = await fetch(`/api/approvals/${approvalId}/reject`, {
                method: "POST",
            });
            if (!res.ok) throw new Error("Failed to reject");
        },
        onSuccess: () => {
            toast({
                title: "Rejected",
                description: "Decision rejected.",
            });
            onClose();
        },
    });

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[600px]">
                <DialogHeader>
                    <DialogTitle>Approve Jira Ticket Creation</DialogTitle>
                    <DialogDescription>
                        Review the proposed Jira ticket details before creating. Policy requires approval for all external actions.
                    </DialogDescription>
                </DialogHeader>

                {isApproved ? (
                    <div className="flex flex-col items-center justify-center p-6 space-y-4">
                        <CheckCircle className="h-12 w-12 text-green-500" />
                        <h3 className="text-lg font-medium">Ticket Created Successfully</h3>
                        {result?.issueUrl && (
                            <a
                                href={result.issueUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center text-primary hover:underline"
                            >
                                View Ticket {result.issueKey} <ExternalLink className="ml-2 h-4 w-4" />
                            </a>
                        )}
                        <Button onClick={onClose}>Close</Button>
                    </div>
                ) : (
                    <div className="grid gap-4 py-4">
                        <Card className="bg-muted/50">
                            <CardContent className="pt-6">
                                <div className="flex items-start gap-2 text-sm text-yellow-600 dark:text-yellow-400">
                                    <AlertTriangle className="h-4 w-4 mt-0.5" />
                                    <span>This action will create a ticket in project <strong>{proposal.projectKey}</strong> with type <strong>{proposal.issueType}</strong>.</span>
                                </div>
                                {proposal.slackThreadUrl && (
                                    <div className="mt-2 text-sm">
                                        <a href={proposal.slackThreadUrl} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline flex items-center">
                                            Context: Slack Thread <ExternalLink className="ml-1 h-3 w-3" />
                                        </a>
                                    </div>
                                )}
                            </CardContent>
                        </Card>

                        <div className="grid gap-2">
                            <Label htmlFor="summary">Summary</Label>
                            <Input
                                id="summary"
                                value={summary}
                                onChange={(e) => setSummary(e.target.value)}
                            />
                        </div>

                        <div className="grid gap-2">
                            <Label htmlFor="description">Description</Label>
                            <Textarea
                                id="description"
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                className="h-32"
                            />
                        </div>
                    </div>
                )}

                {!isApproved && (
                    <DialogFooter>
                        <Button variant="outline" onClick={() => reject()} disabled={isApproving || isRejecting}>
                            {isRejecting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                            Reject
                        </Button>
                        <Button onClick={() => approve()} disabled={isApproving || isRejecting}>
                            {isApproving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                            Approve & Execute
                        </Button>
                    </DialogFooter>
                )}
            </DialogContent>
        </Dialog>
    );
}
