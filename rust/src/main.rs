use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::io::{self, BufRead, Write};
use tracing::{debug, error, info, warn};

/// MCP Protocol Version
const MCP_VERSION: &str = "2024-11-05";

/// JSON-RPC Request
#[derive(Debug, Deserialize)]
struct JsonRpcRequest {
    jsonrpc: String,
    id: Option<Value>,
    method: String,
    params: Option<Value>,
}

/// JSON-RPC Response
#[derive(Debug, Serialize)]
struct JsonRpcResponse {
    jsonrpc: String,
    id: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    result: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<JsonRpcError>,
}

/// JSON-RPC Error
#[derive(Debug, Serialize)]
struct JsonRpcError {
    code: i32,
    message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    data: Option<Value>,
}

/// Tool Definition
#[derive(Debug, Serialize)]
struct Tool {
    name: String,
    description: String,
    #[serde(rename = "inputSchema")]
    input_schema: Value,
}

/// MCP Server Implementation
struct AegisMcpServer {
    name: String,
    version: String,
}

impl AegisMcpServer {
    fn new() -> Self {
        Self {
            name: "aegis-mcp-server".to_string(),
            version: "0.1.0".to_string(),
        }
    }

    /// Initialize the server
    async fn initialize(&self, params: Option<Value>) -> Result<Value> {
        info!("Initializing Aegis MCP Server");
        debug!("Initialize params: {:?}", params);

        Ok(serde_json::json!({
            "protocolVersion": MCP_VERSION,
            "serverInfo": {
                "name": self.name,
                "version": self.version,
            },
            "capabilities": {
                "tools": {},
            }
        }))
    }

    /// List available tools
    async fn list_tools(&self) -> Result<Value> {
        info!("Listing tools");

        let tools = vec![
            Tool {
                name: "hello_world".to_string(),
                description: "Returns a hello world message with the provided name".to_string(),
                input_schema: serde_json::json!({
                    "type": "object",
                    "properties": {
                        "name": {
                            "type": "string",
                            "description": "Name to greet"
                        }
                    },
                    "required": ["name"]
                }),
            },
            Tool {
                name: "check_policy".to_string(),
                description: "AI-powered natural language policy checker. Analyzes access requests against policies written in natural language and returns PERMIT/DENY/INDETERMINATE decisions.".to_string(),
                input_schema: serde_json::json!({
                    "type": "object",
                    "properties": {
                        "policy": {
                            "type": "string",
                            "description": "Natural language policy to evaluate"
                        },
                        "agent": {
                            "type": "string",
                            "description": "Agent/user requesting access"
                        },
                        "action": {
                            "type": "string",
                            "description": "Action being requested (read, write, delete, execute, etc.)"
                        },
                        "resource": {
                            "type": "string",
                            "description": "Resource being accessed (file path, API endpoint, etc.)"
                        },
                        "context": {
                            "type": "object",
                            "description": "Additional context information (time, location, purpose, etc.)",
                            "additionalProperties": true
                        }
                    },
                    "required": ["policy", "action", "resource"]
                }),
            },
        ];

        Ok(serde_json::json!({ "tools": tools }))
    }

    /// Call a tool
    async fn call_tool(&self, params: Option<Value>) -> Result<Value> {
        let params = params.context("Missing parameters for tool call")?;
        let tool_name = params["name"]
            .as_str()
            .context("Missing tool name")?;
        let arguments = params["arguments"].clone();

        info!("Calling tool: {}", tool_name);
        debug!("Arguments: {:?}", arguments);

        match tool_name {
            "hello_world" => self.handle_hello_world(arguments).await,
            "check_policy" => self.handle_check_policy(arguments).await,
            _ => Err(anyhow::anyhow!("Unknown tool: {}", tool_name)),
        }
    }

    /// Handle hello_world tool
    async fn handle_hello_world(&self, args: Value) -> Result<Value> {
        let name = args["name"]
            .as_str()
            .unwrap_or("World");

        info!("Greeting: {}", name);

        Ok(serde_json::json!({
            "content": [{
                "type": "text",
                "text": format!("Hello, {}! 🛡️ Welcome to Aegis MCP Server (Rust Edition)", name)
            }]
        }))
    }

    /// Handle check_policy tool
    /// This tool is designed to be called by Claude Code, which acts as the AI judgment engine
    async fn handle_check_policy(&self, args: Value) -> Result<Value> {
        // Extract parameters
        let policy = args["policy"]
            .as_str()
            .context("Missing policy")?;
        let agent = args["agent"]
            .as_str()
            .unwrap_or("unknown-agent");
        let action = args["action"]
            .as_str()
            .context("Missing action")?;
        let resource = args["resource"]
            .as_str()
            .context("Missing resource")?;
        let context = args.get("context");

        info!("Policy check request:");
        info!("  Agent: {}", agent);
        info!("  Action: {}", action);
        info!("  Resource: {}", resource);
        debug!("  Policy: {}", policy);
        debug!("  Context: {:?}", context);

        // Build a comprehensive request for AI judgment
        let mut prompt = format!(
            "# Policy Evaluation Request\n\n\
            Please analyze this access request against the given policy and return a JSON decision.\n\n\
            ## Policy:\n```\n{}\n```\n\n\
            ## Access Request:\n\
            - **Agent**: {}\n\
            - **Action**: {}\n\
            - **Resource**: `{}`\n",
            policy, agent, action, resource
        );

        if let Some(ctx) = context {
            prompt.push_str(&format!("\n## Additional Context:\n```json\n{}\n```\n",
                serde_json::to_string_pretty(ctx).unwrap_or_default()));
        }

        prompt.push_str(
            "\n## Required Response Format:\n\
            Return a JSON object with the following structure:\n\
            ```json\n\
            {\n  \
              \"decision\": \"PERMIT\" | \"DENY\" | \"INDETERMINATE\",\n  \
              \"reason\": \"Detailed explanation of the decision\",\n  \
              \"confidence\": 0.0-1.0,\n  \
              \"constraints\": [\"optional array of constraints to apply\"],\n  \
              \"obligations\": [\"optional array of obligations to execute\"]\n\
            }\n\
            ```\n\n\
            Please evaluate the request carefully and return your decision."
        );

        // Return the formatted prompt for Claude Code to process
        Ok(serde_json::json!({
            "content": [{
                "type": "text",
                "text": prompt
            }]
        }))
    }

    /// Handle incoming request
    async fn handle_request(&self, request: JsonRpcRequest) -> JsonRpcResponse {
        let id = request.id.clone();

        let result = match request.method.as_str() {
            "initialize" => self.initialize(request.params).await,
            "tools/list" => self.list_tools().await,
            "tools/call" => self.call_tool(request.params).await,
            "notifications/initialized" => {
                // This is a notification, no response needed
                return JsonRpcResponse {
                    jsonrpc: "2.0".to_string(),
                    id: None,
                    result: None,
                    error: None,
                };
            }
            method => {
                warn!("Unknown method: {}", method);
                Err(anyhow::anyhow!("Method not found: {}", method))
            }
        };

        match result {
            Ok(result) => JsonRpcResponse {
                jsonrpc: "2.0".to_string(),
                id,
                result: Some(result),
                error: None,
            },
            Err(err) => {
                error!("Error handling request: {:?}", err);
                JsonRpcResponse {
                    jsonrpc: "2.0".to_string(),
                    id,
                    result: None,
                    error: Some(JsonRpcError {
                        code: -32603,
                        message: err.to_string(),
                        data: None,
                    }),
                }
            }
        }
    }

    /// Run the server
    async fn run(&self) -> Result<()> {
        info!("🛡️ Aegis MCP Server starting...");
        info!("Protocol Version: {}", MCP_VERSION);
        info!("Listening on stdio...");

        let stdin = io::stdin();
        let mut stdout = io::stdout();
        let reader = stdin.lock();

        for line in reader.lines() {
            let line = line.context("Failed to read line from stdin")?;

            // Skip empty lines
            if line.trim().is_empty() {
                continue;
            }

            debug!("Received: {}", line);

            // Parse JSON-RPC request
            let request: JsonRpcRequest = match serde_json::from_str(&line) {
                Ok(req) => req,
                Err(e) => {
                    error!("Failed to parse request: {}", e);
                    continue;
                }
            };

            // Handle request
            let response = self.handle_request(request).await;

            // Send response (only if there's an id or result/error)
            if response.id.is_some() || response.result.is_some() || response.error.is_some() {
                let response_str = serde_json::to_string(&response)
                    .context("Failed to serialize response")?;

                debug!("Sending: {}", response_str);
                writeln!(stdout, "{}", response_str)
                    .context("Failed to write response to stdout")?;
                stdout.flush().context("Failed to flush stdout")?;
            }
        }

        Ok(())
    }
}

#[tokio::main]
async fn main() -> Result<()> {
    // Initialize tracing
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::from_default_env()
                .add_directive("aegis_mcp=debug".parse()?)
        )
        .with_writer(io::stderr) // Write logs to stderr to avoid interfering with stdio protocol
        .init();

    // Create and run server
    let server = AegisMcpServer::new();
    server.run().await?;

    Ok(())
}
