"""
Claude Code SDK Tools Configuration
Manages allowed tools and permissions for Claude Code SDK
"""

from typing import List, Dict, Any, Optional
from enum import Enum
import os
import json
from pathlib import Path


class PermissionMode(Enum):
    """Permission modes for Claude Code SDK"""
    ACCEPT_ALL = "acceptAll"
    ACCEPT_EDITS = "acceptEdits"
    SAFE_MODE = "safeMode"
    INTERACTIVE = "interactive"
    DISABLED = "disabled"


class ToolCategory(Enum):
    """Tool categories for organization"""
    FILE_OPERATIONS = "file_operations"
    CODE_EDITING = "code_editing"
    SYSTEM_COMMANDS = "system_commands"
    SEARCH_NAVIGATION = "search_navigation"
    WEB_OPERATIONS = "web_operations"
    PROJECT_MANAGEMENT = "project_management"
    DEBUGGING = "debugging"
    TESTING = "testing"


# Default tool configurations
TOOL_CONFIGS = {
    # File Operations
    "Read": {
        "category": ToolCategory.FILE_OPERATIONS,
        "safe": True,
        "description": "Read file contents",
        "max_file_size": 1024 * 1024 * 5,  # 5MB
    },
    "Write": {
        "category": ToolCategory.FILE_OPERATIONS,
        "safe": False,
        "description": "Write new files",
        "requires_approval": False,
        "allowed_extensions": [".py", ".js", ".ts", ".tsx", ".jsx", ".json", ".md", ".txt", ".yml", ".yaml"],
    },
    "Edit": {
        "category": ToolCategory.CODE_EDITING,
        "safe": False,
        "description": "Edit existing files",
        "requires_approval": False,
    },
    "MultiEdit": {
        "category": ToolCategory.CODE_EDITING,
        "safe": False,
        "description": "Multiple edits in one operation",
        "requires_approval": False,
    },
    
    # System Commands
    "Bash": {
        "category": ToolCategory.SYSTEM_COMMANDS,
        "safe": False,
        "description": "Execute bash commands",
        "requires_approval": True,
        "allowed_commands": ["git", "npm", "yarn", "pip", "python", "node", "ls", "cat", "echo", "pwd"],
        "blocked_commands": ["rm -rf", "sudo", "chmod 777", "curl", "wget"],
    },
    
    # Search and Navigation
    "Glob": {
        "category": ToolCategory.SEARCH_NAVIGATION,
        "safe": True,
        "description": "Search for files by pattern",
    },
    "Grep": {
        "category": ToolCategory.SEARCH_NAVIGATION,
        "safe": True,
        "description": "Search file contents",
    },
    "LS": {
        "category": ToolCategory.SEARCH_NAVIGATION,
        "safe": True,
        "description": "List directory contents",
    },
    
    # Web Operations
    "WebFetch": {
        "category": ToolCategory.WEB_OPERATIONS,
        "safe": True,
        "description": "Fetch web content",
        "requires_approval": False,
        "allowed_domains": [],  # Empty means all domains allowed
        "blocked_domains": ["localhost", "127.0.0.1", "0.0.0.0"],
    },
    "WebSearch": {
        "category": ToolCategory.WEB_OPERATIONS,
        "safe": True,
        "description": "Search the web",
    },
    
    # Project Management
    "TodoWrite": {
        "category": ToolCategory.PROJECT_MANAGEMENT,
        "safe": True,
        "description": "Manage todo lists",
    },
    "NotebookEdit": {
        "category": ToolCategory.CODE_EDITING,
        "safe": False,
        "description": "Edit Jupyter notebooks",
        "requires_approval": False,
    },
    
    # Testing and Debugging
    "RunTests": {
        "category": ToolCategory.TESTING,
        "safe": False,
        "description": "Run test suites",
        "requires_approval": True,
    },
    "Debug": {
        "category": ToolCategory.DEBUGGING,
        "safe": True,
        "description": "Debug code execution",
    },
}


class ClaudeToolsConfig:
    """
    Configuration manager for Claude Code SDK tools
    """
    
    def __init__(self, permission_mode: PermissionMode = PermissionMode.ACCEPT_EDITS):
        self.permission_mode = permission_mode
        self.allowed_tools = self._get_default_allowed_tools()
        self.blocked_tools = []
        self.tool_configs = TOOL_CONFIGS.copy()
        self.custom_validators = {}
        
    def _get_default_allowed_tools(self) -> List[str]:
        """Get default allowed tools based on permission mode"""
        if self.permission_mode == PermissionMode.ACCEPT_ALL:
            return list(TOOL_CONFIGS.keys())
        elif self.permission_mode == PermissionMode.ACCEPT_EDITS:
            return [
                "Read", "Write", "Edit", "MultiEdit",
                "Bash", "Glob", "Grep", "LS",
                "WebFetch", "TodoWrite", "NotebookEdit"
            ]
        elif self.permission_mode == PermissionMode.SAFE_MODE:
            return [
                "Read", "Glob", "Grep", "LS",
                "WebFetch", "WebSearch", "TodoWrite", "Debug"
            ]
        else:  # DISABLED or INTERACTIVE
            return []
            
    def set_permission_mode(self, mode: PermissionMode):
        """Update permission mode and refresh allowed tools"""
        self.permission_mode = mode
        self.allowed_tools = self._get_default_allowed_tools()
        
    def add_allowed_tool(self, tool_name: str):
        """Add a tool to the allowed list"""
        if tool_name not in self.allowed_tools:
            self.allowed_tools.append(tool_name)
            
    def remove_allowed_tool(self, tool_name: str):
        """Remove a tool from the allowed list"""
        if tool_name in self.allowed_tools:
            self.allowed_tools.remove(tool_name)
            
    def block_tool(self, tool_name: str):
        """Block a specific tool"""
        if tool_name not in self.blocked_tools:
            self.blocked_tools.append(tool_name)
        self.remove_allowed_tool(tool_name)
        
    def is_tool_allowed(self, tool_name: str) -> bool:
        """Check if a tool is allowed"""
        if tool_name in self.blocked_tools:
            return False
        return tool_name in self.allowed_tools
        
    def validate_tool_input(self, tool_name: str, tool_input: Dict[str, Any]) -> tuple[bool, Optional[str]]:
        """
        Validate tool input based on configuration
        
        Returns:
            Tuple of (is_valid, error_message)
        """
        if not self.is_tool_allowed(tool_name):
            return False, f"Tool '{tool_name}' is not allowed"
            
        config = self.tool_configs.get(tool_name, {})
        
        # Check custom validator
        if tool_name in self.custom_validators:
            return self.custom_validators[tool_name](tool_input)
            
        # Built-in validations
        if tool_name == "Bash":
            return self._validate_bash_command(tool_input, config)
        elif tool_name == "Write":
            return self._validate_write_operation(tool_input, config)
        elif tool_name == "WebFetch":
            return self._validate_web_fetch(tool_input, config)
        elif tool_name == "Read":
            return self._validate_read_operation(tool_input, config)
            
        return True, None
        
    def _validate_bash_command(self, tool_input: Dict[str, Any], config: Dict[str, Any]) -> tuple[bool, Optional[str]]:
        """Validate bash command"""
        command = tool_input.get("command", "")
        
        # Check blocked commands
        blocked = config.get("blocked_commands", [])
        for blocked_cmd in blocked:
            if blocked_cmd in command:
                return False, f"Command contains blocked pattern: {blocked_cmd}"
                
        # Check allowed commands (if specified)
        allowed = config.get("allowed_commands", [])
        if allowed:
            # Check if command starts with any allowed command
            command_parts = command.split()
            if command_parts and not any(command_parts[0].startswith(cmd) for cmd in allowed):
                return False, f"Command '{command_parts[0]}' is not in allowed list"
                
        return True, None
        
    def _validate_write_operation(self, tool_input: Dict[str, Any], config: Dict[str, Any]) -> tuple[bool, Optional[str]]:
        """Validate write operation"""
        file_path = tool_input.get("file_path", "")
        
        # Check file extension
        allowed_extensions = config.get("allowed_extensions", [])
        if allowed_extensions:
            path = Path(file_path)
            if path.suffix not in allowed_extensions:
                return False, f"File extension '{path.suffix}' is not allowed"
                
        # Check for sensitive files
        sensitive_files = [".env", ".env.local", "secrets.json", "credentials.json"]
        if any(sensitive in file_path.lower() for sensitive in sensitive_files):
            return False, f"Cannot write to sensitive file: {file_path}"
            
        return True, None
        
    def _validate_web_fetch(self, tool_input: Dict[str, Any], config: Dict[str, Any]) -> tuple[bool, Optional[str]]:
        """Validate web fetch operation"""
        url = tool_input.get("url", "")
        
        # Check blocked domains
        blocked_domains = config.get("blocked_domains", [])
        for domain in blocked_domains:
            if domain in url:
                return False, f"Domain '{domain}' is blocked"
                
        # Check allowed domains (if specified)
        allowed_domains = config.get("allowed_domains", [])
        if allowed_domains and not any(domain in url for domain in allowed_domains):
            return False, f"URL must be from allowed domains: {allowed_domains}"
            
        return True, None
        
    def _validate_read_operation(self, tool_input: Dict[str, Any], config: Dict[str, Any]) -> tuple[bool, Optional[str]]:
        """Validate read operation"""
        file_path = tool_input.get("file_path", "")
        
        # Check file size limit
        max_size = config.get("max_file_size")
        if max_size and os.path.exists(file_path):
            file_size = os.path.getsize(file_path)
            if file_size > max_size:
                return False, f"File too large: {file_size} bytes (max: {max_size})"
                
        return True, None
        
    def register_custom_validator(self, tool_name: str, validator_func):
        """Register a custom validator for a tool"""
        self.custom_validators[tool_name] = validator_func
        
    def get_tools_by_category(self, category: ToolCategory) -> List[str]:
        """Get all tools in a specific category"""
        return [
            tool for tool, config in self.tool_configs.items()
            if config.get("category") == category
        ]
        
    def get_safe_tools(self) -> List[str]:
        """Get all tools marked as safe"""
        return [
            tool for tool, config in self.tool_configs.items()
            if config.get("safe", False)
        ]
        
    def export_config(self) -> Dict[str, Any]:
        """Export current configuration as dict"""
        return {
            "permission_mode": self.permission_mode.value,
            "allowed_tools": self.allowed_tools,
            "blocked_tools": self.blocked_tools,
            "tool_configs": {
                tool: {
                    "category": config.get("category").value if isinstance(config.get("category"), ToolCategory) else config.get("category"),
                    **{k: v for k, v in config.items() if k != "category"}
                }
                for tool, config in self.tool_configs.items()
            }
        }
        
    def import_config(self, config_dict: Dict[str, Any]):
        """Import configuration from dict"""
        if "permission_mode" in config_dict:
            self.permission_mode = PermissionMode(config_dict["permission_mode"])
        if "allowed_tools" in config_dict:
            self.allowed_tools = config_dict["allowed_tools"]
        if "blocked_tools" in config_dict:
            self.blocked_tools = config_dict["blocked_tools"]
        if "tool_configs" in config_dict:
            # Convert category strings back to enums
            for tool, config in config_dict["tool_configs"].items():
                if "category" in config:
                    try:
                        config["category"] = ToolCategory(config["category"])
                    except:
                        pass
                self.tool_configs[tool] = config
                
    def save_to_file(self, file_path: str):
        """Save configuration to JSON file"""
        with open(file_path, 'w') as f:
            json.dump(self.export_config(), f, indent=2)
            
    def load_from_file(self, file_path: str):
        """Load configuration from JSON file"""
        with open(file_path, 'r') as f:
            self.import_config(json.load(f))


# Global instance
_tools_config = None


def get_tools_config() -> ClaudeToolsConfig:
    """Get or create the global tools configuration"""
    global _tools_config
    if _tools_config is None:
        _tools_config = ClaudeToolsConfig()
    return _tools_config


def configure_tools_for_project(project_type: str) -> ClaudeToolsConfig:
    """
    Get recommended tools configuration for a project type
    
    Args:
        project_type: Type of project (e.g., "web", "api", "data-science", "cli")
        
    Returns:
        Configured ClaudeToolsConfig instance
    """
    config = ClaudeToolsConfig()
    
    if project_type == "web":
        config.set_permission_mode(PermissionMode.ACCEPT_EDITS)
        config.add_allowed_tool("WebFetch")
        config.add_allowed_tool("WebSearch")
        
    elif project_type == "api":
        config.set_permission_mode(PermissionMode.ACCEPT_EDITS)
        config.block_tool("WebFetch")  # APIs shouldn't fetch external content
        
    elif project_type == "data-science":
        config.set_permission_mode(PermissionMode.ACCEPT_EDITS)
        config.add_allowed_tool("NotebookEdit")
        config.add_allowed_tool("RunTests")
        
    elif project_type == "cli":
        config.set_permission_mode(PermissionMode.ACCEPT_ALL)
        
    else:  # Default safe configuration
        config.set_permission_mode(PermissionMode.SAFE_MODE)
        
    return config