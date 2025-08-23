"""Simplified UnifiedCLIManager for testing without Claude SDK"""

from enum import Enum
from typing import Dict, Any, Optional, AsyncGenerator
import asyncio
import json
import os

class CLIType(str, Enum):
    CLAUDE = "claude"
    CURSOR = "cursor"

class UnifiedCLIManager:
    """Simplified manager without Claude SDK dependency"""
    
    def __init__(self):
        self.sessions: Dict[str, str] = {}
    
    async def execute_command(
        self,
        instruction: str,
        project_path: str,
        model: str = "claude-sonnet-4",
        cli_type: CLIType = CLIType.CLAUDE,
        system_prompt: Optional[str] = None,
        is_initial_prompt: bool = False,
        project_id: Optional[str] = None
    ) -> AsyncGenerator[str, None]:
        """Execute a command (simplified version)"""
        
        # Just yield a simple message for now
        yield json.dumps({
            "type": "error",
            "content": "Claude SDK not available - terminal commands only",
            "timestamp": str(asyncio.get_event_loop().time())
        })
    
    async def get_session_id(self, project_id: str) -> Optional[str]:
        """Get session ID for a project"""
        return self.sessions.get(project_id)
    
    async def save_session_id(self, project_id: str, session_id: str):
        """Save session ID for a project"""
        self.sessions[project_id] = session_id

# Global instance
unified_cli_manager = UnifiedCLIManager()