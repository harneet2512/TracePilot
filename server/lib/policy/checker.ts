import { type PolicyYaml } from "@shared/schema";

export interface PolicyCheckResult {
  allowed: boolean;
  requiresApproval: boolean;
  denialReason?: string;
  denialDetails?: {
    userRole: string;
    requestedTool: string;
    allowedTools: string[];
    constraint?: string;
    violatedRule?: string;
  };
}

export interface PolicyCheckInput {
  userRole: string;
  toolName: string;
  toolParams?: Record<string, any>;
}

export function checkPolicy(
  policy: PolicyYaml | null,
  input: PolicyCheckInput
): PolicyCheckResult {
  if (!policy) {
    return {
      allowed: true,
      requiresApproval: false,
    };
  }

  const { userRole, toolName, toolParams } = input;
  
  const roleConfig = policy.roles[userRole];
  const allowedTools = roleConfig?.tools || [];
  
  if (!allowedTools.includes(toolName)) {
    return {
      allowed: false,
      requiresApproval: false,
      denialReason: `Tool '${toolName}' is not allowed for role '${userRole}'`,
      denialDetails: {
        userRole,
        requestedTool: toolName,
        allowedTools,
        violatedRule: "role_tools_whitelist",
      },
    };
  }
  
  const toolConstraints = policy.toolConstraints?.[toolName];
  
  if (toolConstraints) {
    if (toolConstraints.allowedProjects && toolName.startsWith("jira.")) {
      const projectKey = toolParams?.projectKey || toolParams?.project;
      if (projectKey && !toolConstraints.allowedProjects.includes(projectKey)) {
        return {
          allowed: false,
          requiresApproval: false,
          denialReason: `Jira project '${projectKey}' is not in the allowed list`,
          denialDetails: {
            userRole,
            requestedTool: toolName,
            allowedTools,
            constraint: `allowedProjects: ${toolConstraints.allowedProjects.join(", ")}`,
            violatedRule: "allowed_projects",
          },
        };
      }
    }
    
    if (toolConstraints.allowedChannels && toolName === "slack.post_message") {
      const channel = toolParams?.channel;
      if (channel && !toolConstraints.allowedChannels.includes(channel)) {
        return {
          allowed: false,
          requiresApproval: false,
          denialReason: `Slack channel '${channel}' is not in the allowed list`,
          denialDetails: {
            userRole,
            requestedTool: toolName,
            allowedTools,
            constraint: `allowedChannels: ${toolConstraints.allowedChannels.join(", ")}`,
            violatedRule: "allowed_channels",
          },
        };
      }
    }
    
    if (toolConstraints.allowedSpaces && toolName === "confluence.upsert_page") {
      const space = toolParams?.spaceKey;
      if (space && !toolConstraints.allowedSpaces.includes(space)) {
        return {
          allowed: false,
          requiresApproval: false,
          denialReason: `Confluence space '${space}' is not in the allowed list`,
          denialDetails: {
            userRole,
            requestedTool: toolName,
            allowedTools,
            constraint: `allowedSpaces: ${toolConstraints.allowedSpaces.join(", ")}`,
            violatedRule: "allowed_spaces",
          },
        };
      }
    }
    
    if (toolConstraints.requireApproval && userRole !== "admin") {
      return {
        allowed: true,
        requiresApproval: true,
      };
    }
  }
  
  return {
    allowed: true,
    requiresApproval: false,
  };
}

export function formatPolicyDenial(result: PolicyCheckResult): string {
  if (result.allowed) return "";
  
  let message = result.denialReason || "Action denied by policy";
  
  if (result.denialDetails) {
    const details = result.denialDetails;
    message += `\n\nDetails:`;
    message += `\n  Your role: ${details.userRole}`;
    message += `\n  Requested tool: ${details.requestedTool}`;
    
    if (details.allowedTools.length > 0) {
      message += `\n  Allowed tools for your role: ${details.allowedTools.join(", ")}`;
    } else {
      message += `\n  Allowed tools for your role: none`;
    }
    
    if (details.constraint) {
      message += `\n  Constraint violated: ${details.constraint}`;
    }
  }
  
  return message;
}
