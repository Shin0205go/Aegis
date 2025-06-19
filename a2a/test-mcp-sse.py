#!/usr/bin/env python3
"""
Test script for AEGIS MCP proxy SSE functionality
"""
import json
import requests
import sseclient
from urllib.parse import urljoin

BASE_URL = "http://localhost:8080"
MCP_ENDPOINT = urljoin(BASE_URL, "/mcp/messages")

def test_mcp_flow():
    # Step 1: Initialize session
    print("=== Testing MCP Streamable HTTP Flow ===\n")
    print("1. Initializing MCP session...")
    
    headers = {
        "Content-Type": "application/json",
        "Accept": "application/json, text/event-stream",
        "X-Agent-ID": "test-agent",
        "X-Agent-Type": "test"
    }
    
    init_request = {
        "jsonrpc": "2.0",
        "method": "initialize",
        "params": {
            "protocolVersion": "2024-11-05",
            "capabilities": {
                "roots": {
                    "listChanged": True
                }
            },
            "clientInfo": {
                "name": "test-client",
                "version": "1.0.0"
            }
        },
        "id": 1
    }
    
    response = requests.post(MCP_ENDPOINT, json=init_request, headers=headers)
    print(f"Status: {response.status_code}")
    print(f"Headers: {dict(response.headers)}")
    print(f"Response: {response.text}\n")
    
    # Extract session ID if present
    session_id = response.headers.get('mcp-session-id')
    if session_id:
        print(f"Session ID: {session_id}\n")
    
    # Step 2: Establish SSE connection
    print("2. Establishing SSE connection...")
    
    sse_headers = {
        "Accept": "text/event-stream",
        "Cache-Control": "no-cache",
        "X-Agent-ID": "test-agent"
    }
    
    if session_id:
        sse_headers["mcp-session-id"] = session_id
    
    # Create SSE client
    try:
        response = requests.get(MCP_ENDPOINT, stream=True, headers=sse_headers)
        print(f"SSE Status: {response.status_code}")
        
        if response.status_code == 200:
            print("SSE connection established. Listening for events...\n")
            
            client = sseclient.SSEClient(response)
            for event in client.events():
                print(f"Event: {event.event}")
                print(f"Data: {event.data}")
                print(f"ID: {event.id}")
                print("-" * 40)
        else:
            print(f"Failed to establish SSE connection: {response.status_code}")
            print(f"Response: {response.text}")
            
    except KeyboardInterrupt:
        print("\nConnection closed by user")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    test_mcp_flow()