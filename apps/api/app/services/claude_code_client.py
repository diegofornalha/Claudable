"""
Claude Code SDK Client for Python
Pure implementation without API key requirement
Uses 'claude login' authentication
"""

import asyncio
import json
import subprocess
from typing import Optional, AsyncGenerator, Dict, Any, List
from dataclasses import dataclass
import uuid
from datetime import datetime


@dataclass
class ClaudeCodeOptions:
    """Options for Claude Code SDK configuration"""
    system_prompt: Optional[str] = None
    max_turns: int = 5
    max_thinking_tokens: Optional[int] = None
    cwd: Optional[str] = None
    permission_mode: str = 'acceptEdits'
    allowed_tools: List[str] = None
    disallowed_tools: List[str] = None
    mcp_servers: Optional[Dict[str, Any]] = None
    resume: Optional[str] = None  # Session ID to resume
    model: Optional[str] = None  # Claude model to use
    verbose: bool = False
    
    def __post_init__(self):
        if self.allowed_tools is None:
            self.allowed_tools = [
                "Read", "Write", "Edit", "MultiEdit", 
                "Bash", "Glob", "Grep", "LS", "WebFetch"
            ]


class ClaudeSDKMessage:
    """Represents a message from Claude Code SDK"""
    def __init__(self, data: Dict[str, Any]):
        self.data = data
        self.type = data.get('type', '')
        self.content = data.get('content', [])
        
        # For ResultMessage
        self.session_id = data.get('session_id')
        self.total_cost_usd = data.get('total_cost_usd', 0)
        self.duration_ms = data.get('duration_ms', 0)
        self.num_turns = data.get('num_turns', 0)
        self.is_error = data.get('is_error', False)
        
    def __repr__(self):
        return f"ClaudeSDKMessage(type={self.type})"


class ContentBlock:
    """Represents a content block in a message"""
    def __init__(self, data: Dict[str, Any]):
        self.data = data
        self.type = data.get('type', '')
        self.text = data.get('text', '')
        self.thinking = data.get('thinking', '')
        self.name = data.get('name', '')  # For tool use
        self.input = data.get('input', {})  # For tool use
        self.id = data.get('id', '')  # For tool use
        
    def __repr__(self):
        return f"ContentBlock(type={self.type})"


class ClaudeSDKClient:
    """
    Claude Code SDK Client for Python
    Implements the same interface as the JavaScript SDK
    No API key needed - uses 'claude login' authentication
    """
    
    def __init__(self, options: Optional[ClaudeCodeOptions] = None):
        self.options = options or ClaudeCodeOptions()
        self.process = None
        self.session_id = self.options.resume or str(uuid.uuid4())
        self.messages_queue = asyncio.Queue()
        self.is_connected = False
        
    async def __aenter__(self):
        """Context manager entry"""
        await self.connect()
        return self
        
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Context manager exit"""
        await self.disconnect()
        
    async def connect(self):
        """Initialize connection to Claude Code SDK"""
        if self.is_connected:
            return
            
        # Build command
        cmd = ["claude"]
        
        # Add options
        if self.options.system_prompt:
            cmd.extend(["--system-prompt", self.options.system_prompt])
        if self.options.max_turns:
            cmd.extend(["--max-turns", str(self.options.max_turns)])
        if self.options.max_thinking_tokens:
            cmd.extend(["--max-thinking-tokens", str(self.options.max_thinking_tokens)])
        if self.options.cwd:
            cmd.extend(["--cwd", self.options.cwd])
        if self.options.permission_mode:
            cmd.extend(["--permission-mode", self.options.permission_mode])
        if self.options.resume:
            cmd.extend(["--resume", self.options.resume])
        if self.options.model:
            cmd.extend(["--model", self.options.model])
            
        # Add allowed/disallowed tools
        for tool in self.options.allowed_tools:
            cmd.extend(["--allowedTools", tool])
        if self.options.disallowed_tools:
            for tool in self.options.disallowed_tools:
                cmd.extend(["--disallowedTools", tool])
                
        # MCP servers
        if self.options.mcp_servers:
            for name, config in self.options.mcp_servers.items():
                mcp_arg = f"{name}:{json.dumps(config)}"
                cmd.extend(["--mcp-server", mcp_arg])
                
        # Output format for parsing
        cmd.extend(["--output-format", "stream-json"])
        
        if self.options.verbose:
            print(f"🚀 Starting Claude Code SDK with command: {' '.join(cmd)}")
            
        # Start process
        self.process = await asyncio.create_subprocess_exec(
            *cmd,
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            cwd=self.options.cwd
        )
        
        self.is_connected = True
        
        # Start background task to read output
        asyncio.create_task(self._read_output())
        
        print("✅ Claude Code SDK client connected (no API key needed)")
        
    async def disconnect(self):
        """Disconnect from Claude Code SDK"""
        if self.process:
            self.process.terminate()
            await self.process.wait()
            self.process = None
        self.is_connected = False
        
    async def query(self, prompt: str):
        """Send a query to Claude"""
        if not self.is_connected:
            await self.connect()
            
        # Format message for Claude
        message = {
            "type": "user",
            "message": {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": prompt
                    }
                ]
            },
            "session_id": self.session_id
        }
        
        # Send to Claude
        message_json = json.dumps(message) + "\n"
        self.process.stdin.write(message_json.encode())
        await self.process.stdin.drain()
        
        if self.options.verbose:
            print(f"📤 Sent query: {prompt[:100]}...")
            
    async def _read_output(self):
        """Background task to read output from Claude"""
        buffer = ""
        
        while self.process and self.process.stdout:
            try:
                # Read chunk
                chunk = await self.process.stdout.read(1024)
                if not chunk:
                    break
                    
                buffer += chunk.decode('utf-8')
                
                # Process complete JSON objects
                while '\n' in buffer:
                    line, buffer = buffer.split('\n', 1)
                    if line.strip():
                        try:
                            data = json.loads(line)
                            await self._process_message(data)
                        except json.JSONDecodeError as e:
                            if self.options.verbose:
                                print(f"⚠️ JSON decode error: {e}")
                                
            except Exception as e:
                if self.options.verbose:
                    print(f"❌ Read error: {e}")
                break
                
    async def _process_message(self, data: Dict[str, Any]):
        """Process a message from Claude"""
        # Create message object
        message = ClaudeSDKMessage(data)
        
        # Convert content blocks if present
        if isinstance(message.content, list):
            message.content = [ContentBlock(block) if isinstance(block, dict) else block 
                             for block in message.content]
                             
        # Extract session ID if present
        if message.session_id:
            self.session_id = message.session_id
            
        # Add to queue
        await self.messages_queue.put(message)
        
    async def receive_response(self) -> AsyncGenerator[ClaudeSDKMessage, None]:
        """
        Receive streaming response from Claude
        Yields messages as they arrive
        """
        while True:
            try:
                # Get message with timeout
                message = await asyncio.wait_for(
                    self.messages_queue.get(), 
                    timeout=60.0
                )
                
                yield message
                
                # Check if this is the final message
                if message.type == "result":
                    break
                    
            except asyncio.TimeoutError:
                print("⏱️ Timeout waiting for response")
                break
            except Exception as e:
                print(f"❌ Error receiving response: {e}")
                break
                
    async def receive_messages(self) -> AsyncGenerator[ClaudeSDKMessage, None]:
        """Alias for receive_response for compatibility"""
        async for message in self.receive_response():
            yield message


# Helper functions for standalone usage
async def query_claude(prompt: str, options: Optional[ClaudeCodeOptions] = None) -> str:
    """
    Simple helper to query Claude and get complete response
    
    Example:
        response = await query_claude("Explain Python asyncio")
        print(response)
    """
    options = options or ClaudeCodeOptions()
    
    async with ClaudeSDKClient(options=options) as client:
        await client.query(prompt)
        
        full_response = []
        metadata = {}
        
        async for message in client.receive_response():
            # Collect text from content blocks
            if hasattr(message, 'content'):
                for block in message.content:
                    if hasattr(block, 'text') and block.text:
                        full_response.append(block.text)
                        
            # Capture final metadata
            if message.type == "result":
                metadata = {
                    'session_id': message.session_id,
                    'cost': message.total_cost_usd,
                    'duration_ms': message.duration_ms,
                    'turns': message.num_turns
                }
                
        response_text = ''.join(full_response)
        
        if options.verbose:
            print(f"\n📊 Metadata: {metadata}")
            
        return response_text


async def stream_claude(prompt: str, options: Optional[ClaudeCodeOptions] = None):
    """
    Stream response from Claude with real-time output
    
    Example:
        await stream_claude("Write a Python function for fibonacci")
    """
    options = options or ClaudeCodeOptions()
    
    async with ClaudeSDKClient(options=options) as client:
        await client.query(prompt)
        
        async for message in client.receive_response():
            if hasattr(message, 'content'):
                for block in message.content:
                    if hasattr(block, 'text') and block.text:
                        print(block.text, end='', flush=True)
                    elif hasattr(block, 'type'):
                        if block.type == 'tool_use':
                            print(f"\n[🔧 Using tool: {block.name}]\n")
                        elif block.type == 'thinking':
                            if options.verbose:
                                print(f"\n[💭 Thinking...]\n")
                                
            if message.type == "result":
                print(f"\n\n✅ Complete. Cost: ${message.total_cost_usd:.4f}")
                break


# Example usage
if __name__ == "__main__":
    async def main():
        # Example 1: Simple query
        print("Example 1: Simple query")
        response = await query_claude("What is 2+2?")
        print(f"Response: {response}")
        
        print("\n" + "="*50 + "\n")
        
        # Example 2: Streaming with options
        print("Example 2: Streaming response")
        options = ClaudeCodeOptions(
            max_turns=3,
            verbose=True,
            allowed_tools=["Read", "Write"]
        )
        await stream_claude("Write a hello world in Python", options)
        
    # Run examples
    asyncio.run(main())