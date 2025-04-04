#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import {
  BedrockAgentRuntimeClient,
  RetrieveCommand,
  RetrieveCommandInput,
} from "@aws-sdk/client-bedrock-agent-runtime";
import { RestServerTransport } from "@chatmcp/sdk/server/rest.js";
import { getParamValue, getAuthValue } from "@chatmcp/sdk/utils/index.js";

interface RAGSource {
  id: string;
  fileName: string;
  snippet: string;
  score: number;
}

async function retrieveContext(
  bedrockClient: BedrockAgentRuntimeClient,
  query: string,
  knowledgeBaseId: string,
  n: number = 3
): Promise<{
  context: string;
  isRagWorking: boolean;
  ragSources: RAGSource[];
}> {
  try {
    if (!knowledgeBaseId) {
      console.error("knowledgeBaseId is not provided");
      return {
        context: "",
        isRagWorking: false,
        ragSources: [],
      };
    }

    const input: RetrieveCommandInput = {
      knowledgeBaseId: knowledgeBaseId,
      retrievalQuery: { text: query },
      retrievalConfiguration: {
        vectorSearchConfiguration: { numberOfResults: n },
      },
    };

    const command = new RetrieveCommand(input);
    const response = await bedrockClient.send(command);
    const rawResults = response?.retrievalResults || [];
    const ragSources: RAGSource[] = rawResults
      .filter((res) => res?.content?.text)
      .map((result, index) => {
        const uri = result?.location?.s3Location?.uri || "";
        const fileName = uri.split("/").pop() || `Source-${index}.txt`;
        return {
          id:
            (result.metadata?.["x-amz-bedrock-kb-chunk-id"] as string) ||
            `chunk-${index}`,
          fileName: fileName.replace(/_/g, " ").replace(".txt", ""),
          snippet: result.content?.text || "",
          score: (result.score as number) || 0,
        };
      })
      .slice(0, 3);

    const context = rawResults
      .filter(
        (res): res is { content: { text: string } } =>
          res?.content?.text !== undefined
      )
      .map((res) => res.content.text)
      .join("\n\n");

    return {
      context,
      isRagWorking: true,
      ragSources,
    };
  } catch (error) {
    console.error("RAG Error:", error);
    return { context: "", isRagWorking: false, ragSources: [] };
  }
}

// Define the retrieval tool
const RETRIEVAL_TOOL: Tool = {
  name: "retrieve_from_aws_kb",
  description:
    "Performs retrieval from the AWS Knowledge Base using the provided query and Knowledge Base ID.",
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "The query to perform retrieval on",
      },
      knowledgeBaseId: {
        type: "string",
        description: "The ID of the AWS Knowledge Base",
      },
      n: {
        type: "number",
        default: 3,
        description: "Number of results to retrieve",
      },
    },
    required: ["query", "knowledgeBaseId"],
  },
};

// Server setup
const server = new Server(
  {
    name: "aws-kb-retrieval-server",
    version: "0.2.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

const awsRegion = getParamValue("aws_region");
const awsAccessKeyId = getParamValue("aws_access_key_id");
const awsSecretAccessKey = getParamValue("aws_secret_access_key");

const mode = getParamValue("mode") || "stdio";
const port = getParamValue("port") || 9593;
const endpoint = getParamValue("endpoint") || "/rest";

// Request handlers
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [RETRIEVAL_TOOL],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const region = awsRegion || getAuthValue(request, "AWS_REGION");
  const accessKeyId =
    awsAccessKeyId || getAuthValue(request, "AWS_ACCESS_KEY_ID");
  const secretAccessKey =
    awsSecretAccessKey || getAuthValue(request, "AWS_SECRET_ACCESS_KEY");

  // AWS client initialization
  const bedrockClient = new BedrockAgentRuntimeClient({
    region,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });

  const { name, arguments: args } = request.params;

  if (name === "retrieve_from_aws_kb") {
    const { query, knowledgeBaseId, n = 3 } = args as Record<string, any>;
    try {
      const result = await retrieveContext(
        bedrockClient,
        query,
        knowledgeBaseId,
        n
      );
      if (result.isRagWorking) {
        return {
          content: [
            { type: "text", text: `Context: ${result.context}` },
            {
              type: "text",
              text: `RAG Sources: ${JSON.stringify(result.ragSources)}`,
            },
          ],
        };
      } else {
        return {
          content: [
            { type: "text", text: "Retrieval failed or returned no results." },
          ],
        };
      }
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error occurred: ${error}` }],
      };
    }
  } else {
    return {
      content: [{ type: "text", text: `Unknown tool: ${name}` }],
      isError: true,
    };
  }
});

// Server startup
async function runServer() {
  if (mode === "rest") {
    const transport = new RestServerTransport({ port, endpoint });
    await server.connect(transport);
    await transport.startServer();

    return;
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("AWS KB Retrieval Server running on stdio");
}

runServer().catch((error) => {
  console.error("Fatal error running server:", error);
  process.exit(1);
});
