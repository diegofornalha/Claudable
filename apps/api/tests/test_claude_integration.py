"""
Integration tests for Claude Code SDK
Tests the complete integration with Claudable project
"""

import pytest
import asyncio
import json
import os
from unittest.mock import AsyncMock, MagicMock, patch
from pathlib import Path
import sys

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.services.claude_code_client import ClaudeSDKClient, ClaudeCodeOptions
from app.services.claude_sdk_wrapper import ClaudeSDKWrapper, get_claude_wrapper
from app.services.claude_tools_config import ClaudeToolsConfig, PermissionMode
from app.services.session_manager import SessionManager, get_session_manager
from app.services.claude_debug_monitor import ClaudeDebugMonitor, get_debug_monitor
from app.core.websocket.claude_streaming import ClaudeStreamingHandler


class TestClaudeSDKClient:
    """Test ClaudeSDKClient"""
    
    @pytest.mark.asyncio
    async def test_client_initialization(self):
        """Test client can be initialized"""
        client = ClaudeSDKClient()
        assert client is not None
        assert client.process is None
        
    @pytest.mark.asyncio
    async def test_client_context_manager(self):
        """Test client works as context manager"""
        async with ClaudeSDKClient() as client:
            assert client is not None
            # Process should be started
            # Note: In tests, we mock the subprocess
            
    @pytest.mark.asyncio
    async def test_options_creation(self):
        """Test ClaudeCodeOptions creation"""
        options = ClaudeCodeOptions(
            cwd="/test/path",
            allowed_tools=["Read", "Write"],
            permission_mode="acceptEdits",
            model="claude-sonnet-4-20250514"
        )
        
        assert options.cwd == "/test/path"
        assert "Read" in options.allowed_tools
        assert options.permission_mode == "acceptEdits"
        
    @pytest.mark.asyncio
    @patch('asyncio.create_subprocess_exec')
    async def test_query_execution(self, mock_subprocess):
        """Test query execution"""
        # Mock subprocess
        mock_process = AsyncMock()
        mock_process.stdout.readline = AsyncMock(side_effect=[
            json.dumps({"type": "text", "content": "Hello"}).encode() + b'\n',
            json.dumps({"type": "result", "session_id": "test_123"}).encode() + b'\n',
            b''  # EOF
        ])
        mock_process.wait = AsyncMock(return_value=0)
        mock_subprocess.return_value = mock_process
        
        async with ClaudeSDKClient() as client:
            messages = []
            async for message in client.query("Test prompt", ClaudeCodeOptions()):
                messages.append(message)
                
            assert len(messages) > 0
            assert any(m.get("type") == "text" for m in messages)


class TestClaudeSDKWrapper:
    """Test ClaudeSDKWrapper"""
    
    @pytest.mark.asyncio
    async def test_wrapper_initialization(self):
        """Test wrapper initialization"""
        wrapper = ClaudeSDKWrapper()
        assert wrapper is not None
        assert wrapper.session_id is None
        
    @pytest.mark.asyncio
    async def test_create_session(self):
        """Test session creation"""
        wrapper = ClaudeSDKWrapper()
        session_id = await wrapper.create_session("user123")
        
        assert session_id is not None
        assert "user123" in session_id
        assert session_id in wrapper.active_sessions
        
    @pytest.mark.asyncio
    async def test_resume_session(self):
        """Test session resumption"""
        wrapper = ClaudeSDKWrapper()
        session_id = await wrapper.create_session("user123")
        
        success = await wrapper.resume_session(session_id)
        assert success is True
        assert wrapper.session_id == session_id
        
    @pytest.mark.asyncio
    @patch('asyncio.create_subprocess_exec')
    async def test_query_fallback(self, mock_subprocess):
        """Test query with subprocess fallback"""
        # Mock subprocess
        mock_process = AsyncMock()
        mock_process.stdout.readline = AsyncMock(side_effect=[
            b'{"type": "text", "content": "Response"}\n',
            b''  # EOF
        ])
        mock_process.wait = AsyncMock(return_value=0)
        mock_subprocess.return_value = mock_process
        
        wrapper = ClaudeSDKWrapper()
        wrapper.has_new_client = False  # Force fallback
        
        messages = []
        async for message in wrapper.query("Test", {}):
            messages.append(message)
            
        assert len(messages) > 0


class TestClaudeToolsConfig:
    """Test Claude tools configuration"""
    
    def test_default_tools_config(self):
        """Test default tools configuration"""
        config = ClaudeToolsConfig()
        
        assert config.permission_mode == PermissionMode.ACCEPT_EDITS
        assert "Read" in config.allowed_tools
        assert "Write" in config.allowed_tools
        assert len(config.blocked_tools) == 0
        
    def test_safe_mode_tools(self):
        """Test safe mode tools"""
        config = ClaudeToolsConfig(PermissionMode.SAFE_MODE)
        
        # Safe mode should only allow read operations
        assert "Read" in config.allowed_tools
        assert "Write" not in config.allowed_tools
        assert "Bash" not in config.allowed_tools
        
    def test_tool_validation(self):
        """Test tool input validation"""
        config = ClaudeToolsConfig()
        
        # Test bash command validation
        valid, error = config.validate_tool_input("Bash", {"command": "ls -la"})
        assert valid is True
        
        # Test blocked command
        valid, error = config.validate_tool_input("Bash", {"command": "sudo rm -rf /"})
        assert valid is False
        assert "blocked" in error.lower()
        
    def test_file_extension_validation(self):
        """Test file extension validation"""
        config = ClaudeToolsConfig()
        
        # Test allowed extension
        valid, error = config.validate_tool_input("Write", {"file_path": "test.py"})
        assert valid is True
        
        # Test blocked extension
        valid, error = config.validate_tool_input("Write", {"file_path": "test.exe"})
        assert valid is False
        
    def test_sensitive_file_protection(self):
        """Test sensitive file protection"""
        config = ClaudeToolsConfig()
        
        # Test sensitive file
        valid, error = config.validate_tool_input("Write", {"file_path": ".env"})
        assert valid is False
        assert "sensitive" in error.lower()
        
    def test_export_import_config(self):
        """Test configuration export/import"""
        config = ClaudeToolsConfig()
        config.add_allowed_tool("CustomTool")
        config.block_tool("Bash")
        
        # Export
        exported = config.export_config()
        assert "CustomTool" in exported["allowed_tools"]
        assert "Bash" in exported["blocked_tools"]
        
        # Import
        new_config = ClaudeToolsConfig()
        new_config.import_config(exported)
        assert "CustomTool" in new_config.allowed_tools
        assert "Bash" in new_config.blocked_tools


class TestSessionManager:
    """Test session management"""
    
    @pytest.mark.asyncio
    async def test_create_session(self, tmp_path):
        """Test session creation"""
        manager = SessionManager(str(tmp_path))
        
        session_id = await manager.create_session("user123", "project456")
        
        assert session_id is not None
        assert "user123" in session_id
        assert "project456" in session_id
        assert session_id in manager.active_sessions
        
    @pytest.mark.asyncio
    async def test_update_session(self, tmp_path):
        """Test session update"""
        manager = SessionManager(str(tmp_path))
        session_id = await manager.create_session("user123", "project456")
        
        await manager.update_session(session_id, {
            "custom_field": "test_value"
        })
        
        session = manager.active_sessions[session_id]
        assert session["custom_field"] == "test_value"
        
    @pytest.mark.asyncio
    async def test_add_tool_usage(self, tmp_path):
        """Test recording tool usage"""
        manager = SessionManager(str(tmp_path))
        session_id = await manager.create_session("user123", "project456")
        
        await manager.add_tool_usage(
            session_id,
            "Read",
            {"file_path": "test.py"},
            "file content",
            100.5
        )
        
        session = manager.active_sessions[session_id]
        assert len(session["tools_used"]) == 1
        assert session["tools_used"][0]["tool_name"] == "Read"
        
    @pytest.mark.asyncio
    async def test_session_persistence(self, tmp_path):
        """Test session persistence to disk"""
        manager = SessionManager(str(tmp_path))
        session_id = await manager.create_session("user123", "project456")
        
        # Update session
        await manager.update_session(session_id, {"test": "data"})
        
        # End session
        await manager.end_session(session_id)
        
        # Try to resume
        resumed = await manager.resume_session(session_id)
        assert resumed is not None
        assert resumed["test"] == "data"
        assert resumed["status"] == "completed"
        
    @pytest.mark.asyncio
    async def test_session_history(self, tmp_path):
        """Test getting session history"""
        manager = SessionManager(str(tmp_path))
        
        # Create multiple sessions
        for i in range(3):
            await manager.create_session(f"user{i}", "project1")
            
        history = await manager.get_session_history(project_id="project1")
        assert len(history) == 3
        
    @pytest.mark.asyncio
    async def test_export_session(self, tmp_path):
        """Test session export"""
        manager = SessionManager(str(tmp_path))
        session_id = await manager.create_session("user123", "project456")
        
        export_path = await manager.export_session(session_id, str(tmp_path / "export.json"))
        
        assert export_path is not None
        assert Path(export_path).exists()
        
        # Verify export content
        with open(export_path, 'r') as f:
            exported = json.load(f)
            assert exported["id"] == session_id


class TestClaudeDebugMonitor:
    """Test debug and monitoring"""
    
    def test_monitor_initialization(self, tmp_path):
        """Test monitor initialization"""
        monitor = ClaudeDebugMonitor(str(tmp_path))
        
        assert monitor is not None
        assert monitor.log_dir.exists()
        
    def test_operation_tracking(self):
        """Test operation tracking"""
        monitor = ClaudeDebugMonitor()
        
        # Start operation
        monitor.start_operation("op1", "test_operation", {"param": "value"})
        assert "op1" in monitor.active_operations
        
        # Add event
        monitor.add_event("op1", "progress", {"step": 1})
        assert len(monitor.active_operations["op1"]["events"]) == 1
        
        # End operation
        monitor.end_operation("op1", success=True, result="done")
        assert "op1" not in monitor.active_operations
        assert len(monitor.operation_history) == 1
        
    def test_performance_metrics(self):
        """Test performance metrics tracking"""
        monitor = ClaudeDebugMonitor()
        
        # Add metrics
        monitor.metrics.add_response_time(100.5)
        monitor.metrics.add_response_time(200.3)
        monitor.metrics.add_tool_duration("Read", 50.2)
        monitor.metrics.add_error("timeout")
        monitor.metrics.add_usage(1000, 0.05)
        
        stats = monitor.metrics.get_stats()
        
        assert stats["total_requests"] == 2
        assert stats["total_tokens"] == 1000
        assert stats["total_cost_usd"] == 0.05
        assert stats["errors_by_type"]["timeout"] == 1
        assert "Read" in stats["tools"]
        
    def test_session_tracking(self):
        """Test session-level tracking"""
        monitor = ClaudeDebugMonitor()
        
        # Record session events
        monitor.record_session_event("session1", "message", {})
        monitor.record_session_event("session1", "tool_use", {"tool_name": "Read"})
        monitor.record_session_event("session1", "cost", {"cost_usd": 0.02})
        
        stats = monitor.get_session_stats("session1")
        
        assert stats["message_count"] == 1
        assert stats["total_tools_used"] == 1
        assert stats["cost_usd"] == 0.02
        
    @pytest.mark.asyncio
    async def test_export_logs(self, tmp_path):
        """Test log export"""
        monitor = ClaudeDebugMonitor(str(tmp_path))
        
        # Add some operations
        monitor.start_operation("op1", "test")
        monitor.end_operation("op1", success=True)
        
        # Export logs
        export_path = await monitor.export_logs()
        
        assert Path(export_path).exists()
        
        # Verify export content
        with open(export_path, 'r') as f:
            exported = json.load(f)
            assert "performance_report" in exported
            assert "operation_history" in exported


class TestClaudeStreaming:
    """Test WebSocket streaming integration"""
    
    @pytest.mark.asyncio
    async def test_streaming_handler(self):
        """Test streaming handler"""
        handler = ClaudeStreamingHandler("project123")
        
        assert handler.project_id == "project123"
        assert handler.message_count == 0
        
        # Test text message handling
        with patch('app.core.websocket.manager.manager.send_message') as mock_send:
            await handler.handle_message({
                "type": "text",
                "content": "Hello"
            })
            
            mock_send.assert_called_once()
            call_args = mock_send.call_args[0]
            assert call_args[0] == "project123"
            assert call_args[1]["type"] == "assistant_message"
            
    @pytest.mark.asyncio
    async def test_tool_tracking(self):
        """Test tool usage tracking in streaming"""
        handler = ClaudeStreamingHandler("project123")
        
        with patch('app.core.websocket.manager.manager.send_message'):
            # Send tool use
            await handler.handle_message({
                "type": "tool_use",
                "id": "tool1",
                "name": "Read",
                "input": {"file_path": "test.py"}
            })
            
            assert "tool1" in handler.pending_tools
            assert handler.pending_tools["tool1"]["name"] == "Read"
            
            # Send tool result
            await handler.handle_message({
                "type": "tool_result",
                "tool_use_id": "tool1",
                "content": "File content"
            })
            
            assert "tool1" not in handler.pending_tools


@pytest.mark.asyncio
async def test_end_to_end_integration():
    """Test complete end-to-end integration"""
    
    # Initialize components
    wrapper = get_claude_wrapper()
    session_manager = get_session_manager()
    debug_monitor = get_debug_monitor()
    tools_config = ClaudeToolsConfig()
    
    # Create session
    session_id = await session_manager.create_session("test_user", "test_project")
    
    # Configure tools
    tools_config.set_permission_mode(PermissionMode.SAFE_MODE)
    
    # Track operation
    operation_id = await debug_monitor.track_claude_query(
        "Test prompt",
        {"model": "claude-sonnet-4-20250514"}
    )
    
    # Simulate query execution (mocked)
    with patch.object(wrapper, 'query', new_callable=AsyncMock) as mock_query:
        mock_query.return_value = AsyncMock()
        mock_query.return_value.__aiter__.return_value = [
            {"type": "text", "content": "Response"},
            {"type": "result", "session_id": session_id}
        ]
        
        messages = []
        async for message in wrapper.query("Test", {}):
            messages.append(message)
            
    # Verify integration
    assert len(messages) > 0
    
    # Update session
    await session_manager.update_session(session_id, {
        "test_complete": True
    })
    
    # End tracking
    debug_monitor.end_operation(operation_id, success=True)
    
    # Get reports
    performance_report = debug_monitor.get_performance_report()
    session_stats = debug_monitor.get_session_stats(session_id)
    
    assert performance_report is not None
    assert session_stats is not None
    
    # Cleanup
    await session_manager.end_session(session_id)
    
    print("✅ End-to-end integration test passed!")


if __name__ == "__main__":
    # Run tests
    pytest.main([__file__, "-v"])