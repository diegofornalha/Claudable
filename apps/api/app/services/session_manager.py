"""
Session Manager for Claude Code SDK
Manages persistent sessions with Neo4j integration
"""

import asyncio
import json
import uuid
from datetime import datetime, timedelta
from typing import Optional, Dict, Any, List
from pathlib import Path
import aiofiles
import os

from app.core.terminal_ui import ui


class SessionManager:
    """
    Manages Claude Code SDK sessions with persistence
    """
    
    def __init__(self, storage_path: Optional[str] = None):
        """
        Initialize session manager
        
        Args:
            storage_path: Path to store session data (defaults to .sessions/)
        """
        self.storage_path = Path(storage_path or ".sessions")
        self.storage_path.mkdir(parents=True, exist_ok=True)
        
        self.active_sessions = {}
        self.session_metadata = {}
        self.neo4j_client = None  # Will be injected if available
        
    def set_neo4j_client(self, client):
        """Set Neo4j client for memory integration"""
        self.neo4j_client = client
        
    async def create_session(
        self,
        user_id: str,
        project_id: str,
        context: Optional[Dict[str, Any]] = None
    ) -> str:
        """
        Create a new Claude Code session
        
        Args:
            user_id: User identifier
            project_id: Project identifier
            context: Optional initial context
            
        Returns:
            New session ID
        """
        session_id = f"claude_{user_id}_{project_id}_{uuid.uuid4().hex[:8]}"
        
        session_data = {
            "id": session_id,
            "user_id": user_id,
            "project_id": project_id,
            "created_at": datetime.now().isoformat(),
            "updated_at": datetime.now().isoformat(),
            "context": context or {},
            "messages": [],
            "tools_used": [],
            "total_cost_usd": 0.0,
            "total_tokens": 0,
            "status": "active"
        }
        
        self.active_sessions[session_id] = session_data
        self.session_metadata[session_id] = {
            "last_activity": datetime.now(),
            "message_count": 0,
            "error_count": 0
        }
        
        # Save to disk
        await self._save_session(session_id, session_data)
        
        # Save to Neo4j if available
        if self.neo4j_client:
            await self._save_to_neo4j(session_id, session_data, "created")
            
        ui.success(f"Created session: {session_id}", "SessionManager")
        return session_id
        
    async def resume_session(self, session_id: str) -> Optional[Dict[str, Any]]:
        """
        Resume an existing session
        
        Args:
            session_id: Session ID to resume
            
        Returns:
            Session data if found, None otherwise
        """
        # Check active sessions first
        if session_id in self.active_sessions:
            ui.info(f"Resuming active session: {session_id}", "SessionManager")
            return self.active_sessions[session_id]
            
        # Try to load from disk
        session_data = await self._load_session(session_id)
        if session_data:
            self.active_sessions[session_id] = session_data
            self.session_metadata[session_id] = {
                "last_activity": datetime.now(),
                "message_count": len(session_data.get("messages", [])),
                "error_count": 0
            }
            ui.success(f"Resumed session from disk: {session_id}", "SessionManager")
            return session_data
            
        # Try to load from Neo4j
        if self.neo4j_client:
            session_data = await self._load_from_neo4j(session_id)
            if session_data:
                self.active_sessions[session_id] = session_data
                ui.success(f"Resumed session from Neo4j: {session_id}", "SessionManager")
                return session_data
                
        ui.warning(f"Session not found: {session_id}", "SessionManager")
        return None
        
    async def update_session(
        self,
        session_id: str,
        updates: Dict[str, Any],
        append_message: Optional[Dict[str, Any]] = None
    ):
        """
        Update session data
        
        Args:
            session_id: Session ID to update
            updates: Data to update
            append_message: Optional message to append
        """
        if session_id not in self.active_sessions:
            ui.warning(f"Session not found for update: {session_id}", "SessionManager")
            return
            
        session_data = self.active_sessions[session_id]
        
        # Update fields
        session_data.update(updates)
        session_data["updated_at"] = datetime.now().isoformat()
        
        # Append message if provided
        if append_message:
            if "messages" not in session_data:
                session_data["messages"] = []
            session_data["messages"].append({
                **append_message,
                "timestamp": datetime.now().isoformat()
            })
            
        # Update metadata
        if session_id in self.session_metadata:
            self.session_metadata[session_id]["last_activity"] = datetime.now()
            if append_message:
                self.session_metadata[session_id]["message_count"] += 1
                
        # Save to disk
        await self._save_session(session_id, session_data)
        
        # Save to Neo4j
        if self.neo4j_client:
            await self._save_to_neo4j(session_id, session_data, "updated")
            
    async def add_tool_usage(
        self,
        session_id: str,
        tool_name: str,
        tool_input: Dict[str, Any],
        tool_result: Optional[Any] = None,
        duration_ms: Optional[float] = None
    ):
        """
        Record tool usage in session
        
        Args:
            session_id: Session ID
            tool_name: Name of the tool used
            tool_input: Tool input parameters
            tool_result: Tool execution result
            duration_ms: Execution duration in milliseconds
        """
        if session_id not in self.active_sessions:
            return
            
        tool_record = {
            "tool_name": tool_name,
            "input": tool_input,
            "result": tool_result,
            "duration_ms": duration_ms,
            "timestamp": datetime.now().isoformat()
        }
        
        if "tools_used" not in self.active_sessions[session_id]:
            self.active_sessions[session_id]["tools_used"] = []
            
        self.active_sessions[session_id]["tools_used"].append(tool_record)
        
        # Update session
        await self.update_session(session_id, {})
        
    async def end_session(self, session_id: str, summary: Optional[str] = None):
        """
        End a session and save final state
        
        Args:
            session_id: Session ID to end
            summary: Optional session summary
        """
        if session_id not in self.active_sessions:
            return
            
        session_data = self.active_sessions[session_id]
        session_data["status"] = "completed"
        session_data["ended_at"] = datetime.now().isoformat()
        
        if summary:
            session_data["summary"] = summary
            
        # Calculate session duration
        created_at = datetime.fromisoformat(session_data["created_at"])
        duration_seconds = (datetime.now() - created_at).total_seconds()
        session_data["duration_seconds"] = duration_seconds
        
        # Save final state
        await self._save_session(session_id, session_data)
        
        # Save to Neo4j
        if self.neo4j_client:
            await self._save_to_neo4j(session_id, session_data, "completed")
            
        # Remove from active sessions
        del self.active_sessions[session_id]
        if session_id in self.session_metadata:
            del self.session_metadata[session_id]
            
        ui.info(f"Session ended: {session_id} (duration: {duration_seconds:.1f}s)", "SessionManager")
        
    async def get_session_history(
        self,
        user_id: Optional[str] = None,
        project_id: Optional[str] = None,
        limit: int = 10
    ) -> List[Dict[str, Any]]:
        """
        Get session history
        
        Args:
            user_id: Filter by user ID
            project_id: Filter by project ID
            limit: Maximum number of sessions to return
            
        Returns:
            List of session summaries
        """
        sessions = []
        
        # Load sessions from disk
        session_files = sorted(
            self.storage_path.glob("*.json"),
            key=lambda p: p.stat().st_mtime,
            reverse=True
        )
        
        for session_file in session_files[:limit * 2]:  # Load extra for filtering
            try:
                async with aiofiles.open(session_file, 'r') as f:
                    content = await f.read()
                    session_data = json.loads(content)
                    
                # Apply filters
                if user_id and session_data.get("user_id") != user_id:
                    continue
                if project_id and session_data.get("project_id") != project_id:
                    continue
                    
                # Create summary
                sessions.append({
                    "id": session_data["id"],
                    "user_id": session_data.get("user_id"),
                    "project_id": session_data.get("project_id"),
                    "created_at": session_data.get("created_at"),
                    "updated_at": session_data.get("updated_at"),
                    "status": session_data.get("status"),
                    "message_count": len(session_data.get("messages", [])),
                    "tools_used_count": len(session_data.get("tools_used", [])),
                    "total_cost_usd": session_data.get("total_cost_usd", 0)
                })
                
                if len(sessions) >= limit:
                    break
                    
            except Exception as e:
                ui.debug(f"Error loading session file {session_file}: {e}", "SessionManager")
                continue
                
        return sessions
        
    async def cleanup_old_sessions(self, days: int = 7):
        """
        Clean up old sessions
        
        Args:
            days: Remove sessions older than this many days
        """
        cutoff_date = datetime.now() - timedelta(days=days)
        removed_count = 0
        
        for session_file in self.storage_path.glob("*.json"):
            try:
                # Check file modification time
                mtime = datetime.fromtimestamp(session_file.stat().st_mtime)
                if mtime < cutoff_date:
                    session_file.unlink()
                    removed_count += 1
            except Exception as e:
                ui.debug(f"Error cleaning up {session_file}: {e}", "SessionManager")
                
        if removed_count > 0:
            ui.info(f"Cleaned up {removed_count} old sessions", "SessionManager")
            
    async def export_session(self, session_id: str, export_path: Optional[str] = None) -> Optional[str]:
        """
        Export session data
        
        Args:
            session_id: Session ID to export
            export_path: Optional export path
            
        Returns:
            Export file path if successful
        """
        session_data = None
        
        # Get session data
        if session_id in self.active_sessions:
            session_data = self.active_sessions[session_id]
        else:
            session_data = await self._load_session(session_id)
            
        if not session_data:
            ui.error(f"Session not found for export: {session_id}", "SessionManager")
            return None
            
        # Determine export path
        if not export_path:
            export_path = f"session_export_{session_id}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
            
        # Write export file
        try:
            async with aiofiles.open(export_path, 'w') as f:
                await f.write(json.dumps(session_data, indent=2))
            ui.success(f"Session exported to: {export_path}", "SessionManager")
            return export_path
        except Exception as e:
            ui.error(f"Failed to export session: {e}", "SessionManager")
            return None
            
    async def _save_session(self, session_id: str, session_data: Dict[str, Any]):
        """Save session to disk"""
        session_file = self.storage_path / f"{session_id}.json"
        try:
            async with aiofiles.open(session_file, 'w') as f:
                await f.write(json.dumps(session_data, indent=2))
        except Exception as e:
            ui.error(f"Failed to save session {session_id}: {e}", "SessionManager")
            
    async def _load_session(self, session_id: str) -> Optional[Dict[str, Any]]:
        """Load session from disk"""
        session_file = self.storage_path / f"{session_id}.json"
        if not session_file.exists():
            return None
            
        try:
            async with aiofiles.open(session_file, 'r') as f:
                content = await f.read()
                return json.loads(content)
        except Exception as e:
            ui.error(f"Failed to load session {session_id}: {e}", "SessionManager")
            return None
            
    async def _save_to_neo4j(self, session_id: str, session_data: Dict[str, Any], action: str):
        """Save session to Neo4j"""
        if not self.neo4j_client:
            return
            
        try:
            # This would integrate with the Neo4j MCP tool
            # For now, we'll just log the action
            ui.debug(f"Neo4j save: {session_id} ({action})", "SessionManager")
        except Exception as e:
            ui.error(f"Failed to save to Neo4j: {e}", "SessionManager")
            
    async def _load_from_neo4j(self, session_id: str) -> Optional[Dict[str, Any]]:
        """Load session from Neo4j"""
        if not self.neo4j_client:
            return None
            
        try:
            # This would integrate with the Neo4j MCP tool
            # For now, return None
            ui.debug(f"Neo4j load attempt: {session_id}", "SessionManager")
            return None
        except Exception as e:
            ui.error(f"Failed to load from Neo4j: {e}", "SessionManager")
            return None
            
    def get_active_session_ids(self) -> List[str]:
        """Get list of active session IDs"""
        return list(self.active_sessions.keys())
        
    def get_session_metadata(self, session_id: str) -> Optional[Dict[str, Any]]:
        """Get session metadata"""
        return self.session_metadata.get(session_id)


# Global instance
_session_manager = None


def get_session_manager() -> SessionManager:
    """Get or create the global session manager"""
    global _session_manager
    if _session_manager is None:
        _session_manager = SessionManager()
    return _session_manager