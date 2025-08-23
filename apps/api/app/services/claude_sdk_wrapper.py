"""
Claude SDK Wrapper for backward compatibility
Provides a compatibility layer between old and new Claude Code SDK implementations
"""

import asyncio
from typing import Optional, AsyncGenerator, Dict, Any, List
from datetime import datetime
import json
import subprocess
import os

try:
    from .claude_code_client import ClaudeSDKClient, ClaudeCodeOptions
    HAS_NEW_CLIENT = True
except ImportError:
    HAS_NEW_CLIENT = False
    print("⚠️ New ClaudeSDKClient not available")


class ClaudeSDKWrapper:
    """
    Wrapper to maintain compatibility with existing code
    while migrating to ClaudeSDKClient
    """
    
    def __init__(self):
        self.client = None
        self.session_id = None
        self.active_sessions = {}
        self.has_new_client = HAS_NEW_CLIENT
        
    async def initialize(self):
        """Initialize the client"""
        if self.has_new_client:
            self.client = ClaudeSDKClient()
            await self.client.__aenter__()
        return self
        
    async def cleanup(self):
        """Cleanup the client"""
        if self.client and self.has_new_client:
            await self.client.__aexit__(None, None, None)
            
    async def query(
        self, 
        prompt: str, 
        options: Optional[Dict[str, Any]] = None
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """
        Query Claude with backward compatibility
        
        Args:
            prompt: The user prompt
            options: Options dict (old format or ClaudeCodeOptions)
            
        Yields:
            Messages in standardized format
        """
        if not self.has_new_client:
            # Fallback to subprocess if new client not available
            async for message in self._query_subprocess(prompt, options):
                yield message
        else:
            # Use new client
            if isinstance(options, dict):
                # Convert dict to ClaudeCodeOptions
                options = self._dict_to_options(options)
            
            async for message in self.client.query(prompt, options):
                yield self._standardize_message(message)
                
    def _dict_to_options(self, options_dict: Dict[str, Any]) -> 'ClaudeCodeOptions':
        """Convert old dict format to ClaudeCodeOptions"""
        if not self.has_new_client:
            return options_dict
            
        return ClaudeCodeOptions(
            cwd=options_dict.get('cwd', os.getcwd()),
            allowed_tools=options_dict.get('allowed_tools', [
                "Read", "Write", "Edit", "MultiEdit", 
                "Bash", "Glob", "Grep", "LS", "WebFetch", "TodoWrite"
            ]),
            permission_mode=options_dict.get('permission_mode', 'acceptEdits'),
            system_prompt=options_dict.get('system_prompt', ''),
            model=options_dict.get('model', 'claude-sonnet-4-20250514'),
            resume=options_dict.get('resume'),
            allow_browser_actions=options_dict.get('allow_browser_actions', False),
            safe_mode=options_dict.get('safe_mode', False)
        )
        
    def _standardize_message(self, message: Any) -> Dict[str, Any]:
        """
        Standardize message format between old and new SDK
        """
        # If it's already a dict, return as is
        if isinstance(message, dict):
            return message
            
        # Convert object-based messages to dict
        if hasattr(message, '__dict__'):
            return message.__dict__
            
        # Default format
        return {
            "type": "unknown",
            "content": str(message)
        }
        
    async def _query_subprocess(
        self, 
        prompt: str, 
        options: Optional[Dict[str, Any]] = None
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """
        Fallback implementation using subprocess
        """
        options = options or {}
        
        # Build command
        cmd = ["claude", "code"]
        
        # Add options
        if options.get('cwd'):
            cmd.extend(['--cwd', options['cwd']])
        
        if options.get('model'):
            cmd.extend(['--model', options['model']])
            
        if options.get('resume'):
            cmd.extend(['--resume', options['resume']])
            
        # Add prompt
        cmd.extend(['--prompt', prompt])
        
        # Run subprocess
        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            cwd=options.get('cwd', os.getcwd())
        )
        
        # Stream output
        while True:
            line = await process.stdout.readline()
            if not line:
                break
                
            try:
                # Try to parse as JSON
                data = json.loads(line.decode('utf-8'))
                yield data
            except:
                # Return as text message
                yield {
                    "type": "text",
                    "content": line.decode('utf-8').strip()
                }
                
        # Wait for process to complete
        await process.wait()
        
        # Return result message
        yield {
            "type": "result",
            "session_id": self.session_id,
            "is_error": process.returncode != 0
        }
        
    async def resume_session(self, session_id: str) -> bool:
        """
        Resume a previous session
        
        Args:
            session_id: The session ID to resume
            
        Returns:
            True if session resumed successfully
        """
        self.session_id = session_id
        return True
        
    async def create_session(self, user_id: str) -> str:
        """
        Create a new session
        
        Args:
            user_id: User identifier
            
        Returns:
            New session ID
        """
        session_id = f"session_{user_id}_{datetime.now().timestamp()}"
        self.active_sessions[session_id] = {
            "user_id": user_id,
            "created_at": datetime.now(),
            "messages": []
        }
        self.session_id = session_id
        return session_id
        
    def get_session_info(self, session_id: str) -> Optional[Dict[str, Any]]:
        """Get information about a session"""
        return self.active_sessions.get(session_id)
        
    async def save_session(self, session_id: str, data: Dict[str, Any]):
        """Save session data"""
        if session_id in self.active_sessions:
            self.active_sessions[session_id].update(data)
            
    async def list_sessions(self) -> List[str]:
        """List all active sessions"""
        return list(self.active_sessions.keys())


# Singleton instance
_wrapper_instance = None


def get_claude_wrapper() -> ClaudeSDKWrapper:
    """Get or create the singleton wrapper instance"""
    global _wrapper_instance
    if _wrapper_instance is None:
        _wrapper_instance = ClaudeSDKWrapper()
    return _wrapper_instance


async def query_with_compatibility(
    prompt: str,
    options: Optional[Dict[str, Any]] = None,
    callback: Optional[Any] = None
) -> AsyncGenerator[Dict[str, Any], None]:
    """
    High-level query function with full compatibility
    
    Args:
        prompt: User prompt
        options: Query options
        callback: Optional callback for messages
        
    Yields:
        Standardized messages
    """
    wrapper = get_claude_wrapper()
    await wrapper.initialize()
    
    try:
        async for message in wrapper.query(prompt, options):
            if callback:
                await callback(message)
            yield message
    finally:
        await wrapper.cleanup()