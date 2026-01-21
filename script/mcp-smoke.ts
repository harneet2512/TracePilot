/**
 * MCP Smoke Test - Quick test of MCP server functionality
 * 
 * This script tests the MCP server by calling fieldcopilot.chat tool
 * via stdio transport.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { spawn } from "child_process";
import { join } from "path";

async function runMCPSmokeTest() {
  console.log("Starting MCP smoke test...\n");

  // Use tsx from node_modules/.bin or fallback to npx
  const tsxPath = join(process.cwd(), "node_modules", ".bin", "tsx");
  const tsxCommand = process.platform === "win32" ? `${tsxPath}.cmd` : tsxPath;

  // Spawn MCP server process
  const serverProcess = spawn(tsxCommand, ["server/mcp/mcpServer.ts"], {
    stdio: ["pipe", "pipe", "pipe"],
    shell: process.platform === "win32",
  });

  // Create client transport
  // Convert ProcessEnv to Record<string, string> by filtering out undefined values
  const env: Record<string, string> = {};
  for (const key in process.env) {
    const value = process.env[key];
    if (value !== undefined) {
      env[key] = value;
    }
  }
  
  const transport = new StdioClientTransport({
    command: tsxCommand,
    args: ["server/mcp/mcpServer.ts"],
    env,
  });

  const client = new Client(
    {
      name: "mcp-smoke-test",
      version: "1.0.0",
    },
    {
      capabilities: {},
    }
  );

  try {
    await client.connect(transport);
    console.log("✅ Connected to MCP server\n");

    // Test 1: List tools
    console.log("Test 1: List tools");
    const tools = await client.listTools();
    console.log(`Found ${tools.tools.length} tools:`);
    tools.tools.forEach(tool => {
      console.log(`  - ${tool.name}: ${tool.description}`);
    });
    console.log("✅ List tools passed\n");

    // Test 2: Call fieldcopilot.chat
    console.log("Test 2: Call fieldcopilot.chat");
    const chatResult = await client.callTool({
      name: "fieldcopilot.chat",
      arguments: {
        query: "What are the safety procedures for equipment maintenance?",
        topK: 5,
      },
    });

    if (chatResult.content && chatResult.content.length > 0) {
      const contentItem = chatResult.content[0];
      // MCP content has either 'text' or 'blob' property, not 'type'
      const resultText = "text" in contentItem 
        ? contentItem.text 
        : "blob" in contentItem
        ? contentItem.blob
        : JSON.stringify(contentItem);
      const result = JSON.parse(resultText) as {
        answerText?: string;
        citations?: unknown;
        meta?: { channel?: string };
      };
      
      // Type guard for citations array
      const citationsArray = Array.isArray(result.citations) ? result.citations : null;
      const citationsCount = citationsArray ? citationsArray.length : 0;
      
      console.log(`Answer: ${result.answerText?.substring(0, 100) || "N/A"}...`);
      console.log(`Citations: ${citationsCount}`);
      console.log(`Channel: ${result.meta?.channel || "N/A"}`);
      console.log("✅ Chat tool passed\n");
    } else {
      console.log("❌ Chat tool returned no content\n");
      process.exit(1);
    }

    // Test 3: List resources
    console.log("Test 3: List resources");
    const resources = await client.listResources();
    console.log(`Found ${resources.resources.length} resources:`);
    resources.resources.forEach(resource => {
      console.log(`  - ${resource.uri}: ${resource.name}`);
    });
    console.log("✅ List resources passed\n");

    // Test 4: Read status resource
    console.log("Test 4: Read fieldcopilot://status");
    const statusResource = await client.readResource({
      uri: "fieldcopilot://status",
    });

    if (statusResource.contents && statusResource.contents.length > 0) {
      const content = statusResource.contents[0];
      // MCP content has either 'text' or 'blob' property, not 'type'
      if ("text" in content) {
        const statusText = content.text;
        const status = JSON.parse(statusText) as {
          version?: string;
          enabledConnectors?: unknown;
        };
        
        // Type guard for enabledConnectors array
        const connectorsArray = Array.isArray(status.enabledConnectors) ? status.enabledConnectors : null;
        const connectorsCount = connectorsArray ? connectorsArray.length : 0;
        
        console.log(`Version: ${status.version || "N/A"}`);
        console.log(`Enabled connectors: ${connectorsCount}`);
        console.log("✅ Status resource passed\n");
      } else if ("blob" in content) {
        console.log("❌ Status resource content is blob type, expected text\n");
        process.exit(1);
      } else {
        console.log("❌ Status resource content has neither text nor blob property\n");
        process.exit(1);
      }
    } else {
      console.log("❌ Status resource returned no content\n");
      process.exit(1);
    }

    console.log("✅ All MCP smoke tests passed!");
    await client.close();
    process.exit(0);
  } catch (error) {
    console.error("❌ MCP smoke test failed:", error);
    await client.close();
    process.exit(1);
  }
}

runMCPSmokeTest().catch(console.error);
