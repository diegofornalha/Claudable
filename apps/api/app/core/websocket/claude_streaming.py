"""
Claude Code SDK Streaming Integration for WebSocket
Handles real-time streaming from Claude Code SDK to WebSocket clients
"""

import json
from typing import Optional, Dict, Any, Callable
from datetime import datetime
import asyncio

from app.core.terminal_ui import ui
from .manager import manager


class ClaudeStreamingHandler:
    """
    Handles streaming from Claude Code SDK to WebSocket connections
    """
    
    def __init__(self, project_id: str):
        self.project_id = project_id
        self.pending_tools = {}
        self.response_text = ""
        self.start_time = None
        self.message_count = 0
        
    async def handle_message(self, message: Dict[str, Any]):
        """
        Process a message from Claude Code SDK and broadcast to WebSocket
        
        Args:
            message: Message dict from Claude Code SDK
        """
        self.message_count += 1
        message_type = message.get("type", "")
        
        if message_type == "text":
            await self._handle_text(message)
        elif message_type == "ultrathinking" or message_type == "thinking":
            await self._handle_thinking(message)
        elif message_type == "tool_use":
            await self._handle_tool_use(message)
        elif message_type == "tool_result":
            await self._handle_tool_result(message)
        elif message_type == "result":
            await self._handle_result(message)
        elif message_type == "error":
            await self._handle_error(message)
        else:
            # Handle unknown message types
            ui.debug(f"Unknown message type: {message_type}", "ClaudeStreaming")
            
    async def _handle_text(self, message: Dict[str, Any]):
        """Handle text messages"""
        content = message.get("content", "")
        self.response_text += content
        
        await manager.send_message(self.project_id, {
            "type": "assistant_message",
            "content": content,
            "message_type": "text",
            "timestamp": datetime.now().isoformat()
        })
        
    async def _handle_thinking(self, message: Dict[str, Any]):
        """Handle thinking/ultrathinking messages"""
        content = message.get("content", "")
        
        # Truncate long thinking messages for UI
        display_content = content[:200] + "..." if len(content) > 200 else content
        
        await manager.send_message(self.project_id, {
            "type": "assistant_thinking",
            "content": display_content,
            "timestamp": datetime.now().isoformat()
        })
        
    async def _handle_tool_use(self, message: Dict[str, Any]):
        """Handle tool use messages"""
        tool_id = message.get("id", "")
        tool_name = message.get("name", "")
        tool_input = message.get("input", {})
        
        # Store tool info for later
        self.pending_tools[tool_id] = {
            "name": tool_name,
            "input": tool_input,
            "start_time": datetime.now()
        }
        
        # Create tool summary
        summary = self._get_tool_summary(tool_name, tool_input)
        
        await manager.send_message(self.project_id, {
            "type": "tool_use",
            "tool_id": tool_id,
            "tool_name": tool_name,
            "summary": summary,
            "input": tool_input,
            "timestamp": datetime.now().isoformat()
        })
        
    async def _handle_tool_result(self, message: Dict[str, Any]):
        """Handle tool result messages"""
        tool_id = message.get("tool_use_id", "")
        content = message.get("content", "")
        is_error = message.get("is_error", False)
        
        # Get tool info from pending
        tool_info = self.pending_tools.pop(tool_id, {})
        tool_name = tool_info.get("name", "unknown")
        
        # Calculate duration
        duration_ms = None
        if "start_time" in tool_info:
            duration_ms = (datetime.now() - tool_info["start_time"]).total_seconds() * 1000
        
        await manager.send_message(self.project_id, {
            "type": "tool_result",
            "tool_id": tool_id,
            "tool_name": tool_name,
            "content": content[:500] if content else None,  # Truncate long content
            "is_error": is_error,
            "duration_ms": duration_ms,
            "timestamp": datetime.now().isoformat()
        })
        
    async def _handle_result(self, message: Dict[str, Any]):
        """Handle result messages"""
        session_id = message.get("session_id")
        is_error = message.get("is_error", False)
        total_cost_usd = message.get("total_cost_usd")
        num_turns = message.get("num_turns")
        api_duration_ms = message.get("api_duration_ms")
        
        # Calculate total duration
        total_duration_ms = None
        if self.start_time:
            total_duration_ms = (datetime.now() - self.start_time).total_seconds() * 1000
        
        await manager.send_message(self.project_id, {
            "type": "completion",
            "session_id": session_id,
            "is_error": is_error,
            "total_cost_usd": total_cost_usd,
            "num_turns": num_turns,
            "api_duration_ms": api_duration_ms,
            "total_duration_ms": total_duration_ms,
            "message_count": self.message_count,
            "timestamp": datetime.now().isoformat()
        })
        
    async def _handle_error(self, message: Dict[str, Any]):
        """Handle error messages"""
        error_message = message.get("message", "Unknown error")
        
        await manager.send_message(self.project_id, {
            "type": "error",
            "message": error_message,
            "timestamp": datetime.now().isoformat()
        })
        
    def _get_tool_summary(self, tool_name: str, tool_input: Dict[str, Any]) -> str:
        """Generate concise summary for tool usage"""
        if tool_name == "Read":
            return f"📖 Reading: {tool_input.get('file_path', 'unknown')}"
        elif tool_name == "Write":
            return f"✏️ Writing: {tool_input.get('file_path', 'unknown')}"
        elif tool_name == "Edit":
            return f"🔧 Editing: {tool_input.get('file_path', 'unknown')}"
        elif tool_name == "MultiEdit":
            return f"🔧 Multi-editing: {tool_input.get('file_path', 'unknown')}"
        elif tool_name == "Bash":
            cmd = tool_input.get('command', '')
            return f"💻 Running: {cmd[:50]}{'...' if len(cmd) > 50 else ''}"
        elif tool_name == "Glob":
            return f"🔍 Searching: {tool_input.get('pattern', 'unknown')}"
        elif tool_name == "Grep":
            return f"🔎 Grep: {tool_input.get('pattern', 'unknown')}"
        elif tool_name == "LS":
            return f"📁 Listing: {tool_input.get('path', 'current dir')}"
        elif tool_name == "WebFetch":
            return f"🌐 Fetching: {tool_input.get('url', 'unknown')}"
        elif tool_name == "TodoWrite":
            return f"📝 Managing todos"
        else:
            return f"🔧 {tool_name}: {list(tool_input.keys())[:3]}"
            
    def start_tracking(self):
        """Start tracking the streaming session"""
        self.start_time = datetime.now()
        self.message_count = 0
        self.response_text = ""
        self.pending_tools = {}
        
    def get_summary(self) -> Dict[str, Any]:
        """Get summary of the streaming session"""
        return {
            "duration_ms": (datetime.now() - self.start_time).total_seconds() * 1000 if self.start_time else 0,
            "message_count": self.message_count,
            "response_length": len(self.response_text),
            "pending_tools": list(self.pending_tools.keys())
        }


async def create_streaming_callback(project_id: str) -> Callable:
    """
    Create a callback function for Claude Code SDK streaming
    
    Args:
        project_id: Project ID for WebSocket broadcasting
        
    Returns:
        Async callback function
    """
    handler = ClaudeStreamingHandler(project_id)
    handler.start_tracking()
    
    async def callback(message_type: str, data: Dict[str, Any]):
        """Callback for Claude Code SDK messages"""
        # Convert old format to new format if needed
        message = {
            "type": message_type,
            **data
        }
        await handler.handle_message(message)
        
    return callback


async def stream_claude_response(
    project_id: str,
    prompt: str,
    options: Dict[str, Any],
    client: Any
) -> Dict[str, Any]:
    """
    Stream Claude Code SDK response to WebSocket
    
    Args:
        project_id: Project ID for WebSocket broadcasting
        prompt: User prompt
        options: Claude Code options
        client: Claude SDK client instance
        
    Returns:
        Summary of the streaming session
    """
    handler = ClaudeStreamingHandler(project_id)
    handler.start_tracking()
    
    try:
        # Notify start of processing
        await manager.send_message(project_id, {
            "type": "processing_start",
            "prompt": prompt[:200],  # Truncate long prompts
            "timestamp": datetime.now().isoformat()
        })
        
        # Stream messages from Claude
        async for message in client.query(prompt, options):
            await handler.handle_message(message)
            
        # Return summary
        return handler.get_summary()
        
    except Exception as e:
        # Handle errors
        await handler._handle_error({"message": str(e)})
        raise
    finally:
        # Notify end of processing
        await manager.send_message(project_id, {
            "type": "processing_end",
            "timestamp": datetime.now().isoformat()
        })