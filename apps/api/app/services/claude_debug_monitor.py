"""
Claude Code SDK Debug and Monitoring System
Provides comprehensive debugging and monitoring for Claude Code SDK operations
"""

import time
import json
import asyncio
from datetime import datetime, timedelta
from typing import Dict, Any, List, Optional, Callable
from collections import defaultdict, deque
from pathlib import Path
import structlog
import os

from app.core.terminal_ui import ui


# Configure structured logging
logger = structlog.get_logger()


class PerformanceMetrics:
    """Track performance metrics"""
    
    def __init__(self, window_size: int = 100):
        self.window_size = window_size
        self.response_times = deque(maxlen=window_size)
        self.tool_durations = defaultdict(lambda: deque(maxlen=window_size))
        self.error_counts = defaultdict(int)
        self.total_requests = 0
        self.total_tokens = 0
        self.total_cost_usd = 0.0
        
    def add_response_time(self, duration_ms: float):
        """Add a response time measurement"""
        self.response_times.append(duration_ms)
        self.total_requests += 1
        
    def add_tool_duration(self, tool_name: str, duration_ms: float):
        """Add a tool execution duration"""
        self.tool_durations[tool_name].append(duration_ms)
        
    def add_error(self, error_type: str):
        """Record an error"""
        self.error_counts[error_type] += 1
        
    def add_usage(self, tokens: int, cost_usd: float):
        """Add token usage and cost"""
        self.total_tokens += tokens
        self.total_cost_usd += cost_usd
        
    def get_stats(self) -> Dict[str, Any]:
        """Get current statistics"""
        response_times_list = list(self.response_times)
        
        stats = {
            "total_requests": self.total_requests,
            "total_tokens": self.total_tokens,
            "total_cost_usd": round(self.total_cost_usd, 4),
            "error_rate": sum(self.error_counts.values()) / max(self.total_requests, 1),
            "errors_by_type": dict(self.error_counts)
        }
        
        if response_times_list:
            stats.update({
                "avg_response_time_ms": sum(response_times_list) / len(response_times_list),
                "min_response_time_ms": min(response_times_list),
                "max_response_time_ms": max(response_times_list),
                "p50_response_time_ms": self._percentile(response_times_list, 50),
                "p95_response_time_ms": self._percentile(response_times_list, 95),
                "p99_response_time_ms": self._percentile(response_times_list, 99)
            })
            
        # Tool statistics
        tool_stats = {}
        for tool_name, durations in self.tool_durations.items():
            durations_list = list(durations)
            if durations_list:
                tool_stats[tool_name] = {
                    "count": len(durations_list),
                    "avg_duration_ms": sum(durations_list) / len(durations_list),
                    "max_duration_ms": max(durations_list)
                }
        stats["tools"] = tool_stats
        
        return stats
        
    def _percentile(self, values: List[float], p: float) -> float:
        """Calculate percentile"""
        if not values:
            return 0
        sorted_values = sorted(values)
        index = int((p / 100) * len(sorted_values))
        return sorted_values[min(index, len(sorted_values) - 1)]


class ClaudeDebugMonitor:
    """
    Debug and monitoring system for Claude Code SDK
    """
    
    def __init__(self, log_dir: Optional[str] = None):
        """
        Initialize debug monitor
        
        Args:
            log_dir: Directory for log files (defaults to .logs/)
        """
        self.log_dir = Path(log_dir or ".logs")
        self.log_dir.mkdir(parents=True, exist_ok=True)
        
        self.metrics = PerformanceMetrics()
        self.active_operations = {}
        self.operation_history = deque(maxlen=1000)
        self.debug_mode = os.getenv("CLAUDE_DEBUG", "false").lower() == "true"
        self.log_level = os.getenv("CLAUDE_LOG_LEVEL", "INFO")
        
        # Callbacks for real-time monitoring
        self.monitoring_callbacks = []
        
        # Session tracking
        self.session_metrics = defaultdict(lambda: {
            "start_time": None,
            "messages": 0,
            "tools_used": [],
            "errors": [],
            "cost_usd": 0.0
        })
        
    def start_operation(self, operation_id: str, operation_type: str, details: Dict[str, Any] = None):
        """
        Start tracking an operation
        
        Args:
            operation_id: Unique operation identifier
            operation_type: Type of operation (query, tool, etc.)
            details: Additional operation details
        """
        self.active_operations[operation_id] = {
            "id": operation_id,
            "type": operation_type,
            "start_time": time.time(),
            "details": details or {},
            "events": []
        }
        
        if self.debug_mode:
            logger.debug(
                "operation_started",
                operation_id=operation_id,
                operation_type=operation_type,
                details=details
            )
            
    def add_event(self, operation_id: str, event_type: str, data: Dict[str, Any]):
        """
        Add an event to an active operation
        
        Args:
            operation_id: Operation identifier
            event_type: Type of event
            data: Event data
        """
        if operation_id in self.active_operations:
            self.active_operations[operation_id]["events"].append({
                "type": event_type,
                "timestamp": time.time(),
                "data": data
            })
            
        if self.debug_mode:
            logger.debug(
                "operation_event",
                operation_id=operation_id,
                event_type=event_type,
                data=data
            )
            
    def end_operation(self, operation_id: str, success: bool = True, result: Any = None, error: str = None):
        """
        End tracking an operation
        
        Args:
            operation_id: Operation identifier
            success: Whether operation succeeded
            result: Operation result
            error: Error message if failed
        """
        if operation_id not in self.active_operations:
            return
            
        operation = self.active_operations.pop(operation_id)
        end_time = time.time()
        duration_ms = (end_time - operation["start_time"]) * 1000
        
        # Record metrics
        self.metrics.add_response_time(duration_ms)
        
        if not success and error:
            self.metrics.add_error(operation["type"])
            
        # Add to history
        operation_record = {
            **operation,
            "end_time": end_time,
            "duration_ms": duration_ms,
            "success": success,
            "result": result,
            "error": error
        }
        self.operation_history.append(operation_record)
        
        # Log operation completion
        if self.debug_mode or not success:
            log_method = logger.info if success else logger.error
            log_method(
                "operation_completed",
                operation_id=operation_id,
                operation_type=operation["type"],
                duration_ms=duration_ms,
                success=success,
                error=error
            )
            
        # Notify callbacks
        asyncio.create_task(self._notify_callbacks("operation_complete", operation_record))
        
    async def track_claude_query(self, prompt: str, options: Dict[str, Any]) -> str:
        """
        Track a Claude Code SDK query
        
        Args:
            prompt: Query prompt
            options: Query options
            
        Returns:
            Operation ID for tracking
        """
        operation_id = f"query_{int(time.time() * 1000)}"
        
        self.start_operation(operation_id, "claude_query", {
            "prompt_length": len(prompt),
            "model": options.get("model"),
            "tools_allowed": options.get("allowed_tools", [])
        })
        
        return operation_id
        
    async def track_tool_execution(self, tool_name: str, tool_input: Dict[str, Any]) -> str:
        """
        Track tool execution
        
        Args:
            tool_name: Name of the tool
            tool_input: Tool input parameters
            
        Returns:
            Operation ID for tracking
        """
        operation_id = f"tool_{tool_name}_{int(time.time() * 1000)}"
        
        self.start_operation(operation_id, f"tool_{tool_name}", {
            "input": tool_input
        })
        
        return operation_id
        
    def record_tool_result(self, operation_id: str, result: Any, duration_ms: float):
        """
        Record tool execution result
        
        Args:
            operation_id: Operation ID from track_tool_execution
            result: Tool execution result
            duration_ms: Execution duration
        """
        if operation_id and operation_id.startswith("tool_"):
            tool_name = operation_id.split("_")[1]
            self.metrics.add_tool_duration(tool_name, duration_ms)
            
        self.add_event(operation_id, "tool_result", {
            "result_size": len(str(result)) if result else 0,
            "duration_ms": duration_ms
        })
        
        self.end_operation(operation_id, success=True, result=result)
        
    def record_session_event(self, session_id: str, event_type: str, data: Dict[str, Any]):
        """
        Record a session-level event
        
        Args:
            session_id: Session identifier
            event_type: Type of event
            data: Event data
        """
        if session_id not in self.session_metrics:
            self.session_metrics[session_id]["start_time"] = time.time()
            
        session = self.session_metrics[session_id]
        
        if event_type == "message":
            session["messages"] += 1
        elif event_type == "tool_use":
            session["tools_used"].append(data.get("tool_name"))
        elif event_type == "error":
            session["errors"].append(data.get("error"))
        elif event_type == "cost":
            session["cost_usd"] += data.get("cost_usd", 0)
            
        # Log session event
        if self.debug_mode:
            logger.debug(
                "session_event",
                session_id=session_id,
                event_type=event_type,
                data=data
            )
            
    def get_session_stats(self, session_id: str) -> Dict[str, Any]:
        """Get statistics for a session"""
        if session_id not in self.session_metrics:
            return {}
            
        session = self.session_metrics[session_id]
        duration_seconds = time.time() - session["start_time"] if session["start_time"] else 0
        
        return {
            "duration_seconds": duration_seconds,
            "message_count": session["messages"],
            "unique_tools": len(set(session["tools_used"])),
            "total_tools_used": len(session["tools_used"]),
            "error_count": len(session["errors"]),
            "cost_usd": round(session["cost_usd"], 4)
        }
        
    def get_performance_report(self) -> Dict[str, Any]:
        """Get comprehensive performance report"""
        report = {
            "timestamp": datetime.now().isoformat(),
            "metrics": self.metrics.get_stats(),
            "active_operations": len(self.active_operations),
            "active_sessions": len(self.session_metrics),
            "recent_errors": self._get_recent_errors()
        }
        
        # Add session summaries
        session_summaries = []
        for session_id, _ in self.session_metrics.items():
            session_summaries.append({
                "id": session_id,
                **self.get_session_stats(session_id)
            })
        report["sessions"] = session_summaries
        
        return report
        
    def _get_recent_errors(self, limit: int = 10) -> List[Dict[str, Any]]:
        """Get recent errors from operation history"""
        errors = []
        for operation in reversed(self.operation_history):
            if not operation.get("success") and operation.get("error"):
                errors.append({
                    "timestamp": operation.get("end_time"),
                    "operation_type": operation.get("type"),
                    "error": operation.get("error"),
                    "duration_ms": operation.get("duration_ms")
                })
                if len(errors) >= limit:
                    break
        return errors
        
    async def export_logs(self, session_id: Optional[str] = None) -> str:
        """
        Export logs to file
        
        Args:
            session_id: Optional session ID to filter logs
            
        Returns:
            Path to exported log file
        """
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"claude_debug_{session_id or 'all'}_{timestamp}.json"
        filepath = self.log_dir / filename
        
        # Prepare export data
        export_data = {
            "exported_at": datetime.now().isoformat(),
            "session_id": session_id,
            "performance_report": self.get_performance_report(),
            "operation_history": list(self.operation_history)
        }
        
        if session_id:
            export_data["session_stats"] = self.get_session_stats(session_id)
            
        # Write to file
        with open(filepath, 'w') as f:
            json.dump(export_data, f, indent=2, default=str)
            
        ui.success(f"Logs exported to: {filepath}", "DebugMonitor")
        return str(filepath)
        
    def register_callback(self, callback: Callable):
        """Register a monitoring callback"""
        self.monitoring_callbacks.append(callback)
        
    async def _notify_callbacks(self, event_type: str, data: Dict[str, Any]):
        """Notify all registered callbacks"""
        for callback in self.monitoring_callbacks:
            try:
                if asyncio.iscoroutinefunction(callback):
                    await callback(event_type, data)
                else:
                    callback(event_type, data)
            except Exception as e:
                logger.error(f"Callback error: {e}")
                
    def enable_debug_mode(self):
        """Enable debug mode"""
        self.debug_mode = True
        logger.info("Debug mode enabled")
        
    def disable_debug_mode(self):
        """Disable debug mode"""
        self.debug_mode = False
        logger.info("Debug mode disabled")
        
    def clear_history(self):
        """Clear operation history"""
        self.operation_history.clear()
        self.metrics = PerformanceMetrics()
        ui.info("History cleared", "DebugMonitor")


# Global instance
_debug_monitor = None


def get_debug_monitor() -> ClaudeDebugMonitor:
    """Get or create the global debug monitor"""
    global _debug_monitor
    if _debug_monitor is None:
        _debug_monitor = ClaudeDebugMonitor()
    return _debug_monitor


async def debug_claude_operation(operation_type: str, operation_func: Callable, *args, **kwargs):
    """
    Wrapper to debug any Claude operation
    
    Args:
        operation_type: Type of operation for logging
        operation_func: Async function to execute
        *args, **kwargs: Arguments for the function
        
    Returns:
        Function result
    """
    monitor = get_debug_monitor()
    operation_id = f"{operation_type}_{int(time.time() * 1000)}"
    
    monitor.start_operation(operation_id, operation_type, {
        "args": str(args)[:100],
        "kwargs": str(kwargs)[:100]
    })
    
    try:
        result = await operation_func(*args, **kwargs)
        monitor.end_operation(operation_id, success=True, result=str(result)[:100])
        return result
    except Exception as e:
        monitor.end_operation(operation_id, success=False, error=str(e))
        raise