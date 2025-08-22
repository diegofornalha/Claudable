"""
Cache Manager for Claude Code SDK
Implements intelligent caching for responses and optimizations
"""

import hashlib
import json
import time
import asyncio
from typing import Optional, Dict, Any, List, Tuple
from datetime import datetime, timedelta
from pathlib import Path
import aiofiles
import pickle
from collections import OrderedDict
import os

from app.core.terminal_ui import ui


class LRUCache:
    """Least Recently Used cache implementation"""
    
    def __init__(self, max_size: int = 100):
        self.cache = OrderedDict()
        self.max_size = max_size
        self.hits = 0
        self.misses = 0
        
    def get(self, key: str) -> Optional[Any]:
        """Get item from cache"""
        if key in self.cache:
            # Move to end (most recently used)
            self.cache.move_to_end(key)
            self.hits += 1
            return self.cache[key]
        self.misses += 1
        return None
        
    def put(self, key: str, value: Any):
        """Put item in cache"""
        if key in self.cache:
            # Update and move to end
            self.cache.move_to_end(key)
        self.cache[key] = value
        
        # Remove least recently used if over capacity
        if len(self.cache) > self.max_size:
            self.cache.popitem(last=False)
            
    def clear(self):
        """Clear the cache"""
        self.cache.clear()
        self.hits = 0
        self.misses = 0
        
    def get_stats(self) -> Dict[str, Any]:
        """Get cache statistics"""
        total = self.hits + self.misses
        return {
            "size": len(self.cache),
            "max_size": self.max_size,
            "hits": self.hits,
            "misses": self.misses,
            "hit_rate": self.hits / total if total > 0 else 0
        }


class ResponseCache:
    """Cache for Claude Code SDK responses"""
    
    def __init__(self, ttl_seconds: int = 3600):
        """
        Initialize response cache
        
        Args:
            ttl_seconds: Time to live for cache entries
        """
        self.memory_cache = LRUCache(max_size=50)
        self.ttl_seconds = ttl_seconds
        self.cache_metadata = {}
        
    def _generate_key(self, prompt: str, options: Dict[str, Any]) -> str:
        """Generate cache key from prompt and options"""
        # Create a deterministic key
        key_data = {
            "prompt": prompt,
            "model": options.get("model"),
            "allowed_tools": sorted(options.get("allowed_tools", [])),
            "system_prompt": options.get("system_prompt", "")[:100]  # First 100 chars
        }
        
        key_str = json.dumps(key_data, sort_keys=True)
        return hashlib.sha256(key_str.encode()).hexdigest()
        
    def get(self, prompt: str, options: Dict[str, Any]) -> Optional[str]:
        """
        Get cached response
        
        Args:
            prompt: Query prompt
            options: Query options
            
        Returns:
            Cached response if available and valid
        """
        key = self._generate_key(prompt, options)
        
        # Check memory cache
        cached = self.memory_cache.get(key)
        if cached:
            # Check TTL
            metadata = self.cache_metadata.get(key, {})
            if time.time() - metadata.get("timestamp", 0) < self.ttl_seconds:
                ui.debug(f"Cache hit for key: {key[:8]}...", "ResponseCache")
                return cached
            else:
                # Expired
                self._remove(key)
                
        return None
        
    def put(self, prompt: str, options: Dict[str, Any], response: str):
        """
        Cache a response
        
        Args:
            prompt: Query prompt
            options: Query options
            response: Response to cache
        """
        key = self._generate_key(prompt, options)
        
        # Store in memory cache
        self.memory_cache.put(key, response)
        
        # Store metadata
        self.cache_metadata[key] = {
            "timestamp": time.time(),
            "prompt_length": len(prompt),
            "response_length": len(response)
        }
        
        ui.debug(f"Cached response for key: {key[:8]}...", "ResponseCache")
        
    def _remove(self, key: str):
        """Remove entry from cache"""
        if key in self.cache_metadata:
            del self.cache_metadata[key]
            
    def clear(self):
        """Clear all cache entries"""
        self.memory_cache.clear()
        self.cache_metadata.clear()
        
    def get_stats(self) -> Dict[str, Any]:
        """Get cache statistics"""
        stats = self.memory_cache.get_stats()
        stats["metadata_entries"] = len(self.cache_metadata)
        return stats


class ToolResultCache:
    """Cache for tool execution results"""
    
    def __init__(self, cache_dir: Optional[str] = None):
        """
        Initialize tool result cache
        
        Args:
            cache_dir: Directory for persistent cache
        """
        self.cache_dir = Path(cache_dir or ".cache/tools")
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        
        self.memory_cache = {}
        self.cache_config = {
            "Read": {"ttl": 300, "max_size": 1024 * 1024},  # 5 min, 1MB
            "Glob": {"ttl": 600, "max_size": None},  # 10 min
            "Grep": {"ttl": 300, "max_size": None},  # 5 min
            "LS": {"ttl": 300, "max_size": None},  # 5 min
            "WebFetch": {"ttl": 1800, "max_size": None},  # 30 min
        }
        
    def _generate_tool_key(self, tool_name: str, tool_input: Dict[str, Any]) -> str:
        """Generate cache key for tool result"""
        key_str = f"{tool_name}:{json.dumps(tool_input, sort_keys=True)}"
        return hashlib.md5(key_str.encode()).hexdigest()
        
    async def get(self, tool_name: str, tool_input: Dict[str, Any]) -> Optional[Any]:
        """
        Get cached tool result
        
        Args:
            tool_name: Name of the tool
            tool_input: Tool input parameters
            
        Returns:
            Cached result if available
        """
        # Check if tool is cacheable
        if tool_name not in self.cache_config:
            return None
            
        key = self._generate_tool_key(tool_name, tool_input)
        
        # Check memory cache
        if key in self.memory_cache:
            entry = self.memory_cache[key]
            ttl = self.cache_config[tool_name]["ttl"]
            if time.time() - entry["timestamp"] < ttl:
                ui.debug(f"Tool cache hit: {tool_name}", "ToolCache")
                return entry["result"]
            else:
                del self.memory_cache[key]
                
        # Check disk cache
        cache_file = self.cache_dir / f"{key}.pkl"
        if cache_file.exists():
            try:
                async with aiofiles.open(cache_file, 'rb') as f:
                    data = pickle.loads(await f.read())
                    ttl = self.cache_config[tool_name]["ttl"]
                    if time.time() - data["timestamp"] < ttl:
                        # Load to memory cache
                        self.memory_cache[key] = data
                        ui.debug(f"Tool disk cache hit: {tool_name}", "ToolCache")
                        return data["result"]
                    else:
                        # Expired
                        cache_file.unlink()
            except Exception as e:
                ui.debug(f"Cache read error: {e}", "ToolCache")
                
        return None
        
    async def put(self, tool_name: str, tool_input: Dict[str, Any], result: Any):
        """
        Cache tool result
        
        Args:
            tool_name: Name of the tool
            tool_input: Tool input parameters
            result: Tool execution result
        """
        # Check if tool is cacheable
        if tool_name not in self.cache_config:
            return
            
        key = self._generate_tool_key(tool_name, tool_input)
        
        # Check size limit
        max_size = self.cache_config[tool_name].get("max_size")
        if max_size:
            result_size = len(str(result))
            if result_size > max_size:
                ui.debug(f"Tool result too large to cache: {tool_name} ({result_size} bytes)", "ToolCache")
                return
                
        entry = {
            "timestamp": time.time(),
            "tool_name": tool_name,
            "input": tool_input,
            "result": result
        }
        
        # Store in memory
        self.memory_cache[key] = entry
        
        # Store on disk
        cache_file = self.cache_dir / f"{key}.pkl"
        try:
            async with aiofiles.open(cache_file, 'wb') as f:
                await f.write(pickle.dumps(entry))
            ui.debug(f"Cached tool result: {tool_name}", "ToolCache")
        except Exception as e:
            ui.debug(f"Cache write error: {e}", "ToolCache")
            
    async def cleanup(self):
        """Clean up expired cache entries"""
        removed_count = 0
        
        # Clean memory cache
        keys_to_remove = []
        for key, entry in self.memory_cache.items():
            tool_name = entry.get("tool_name")
            if tool_name in self.cache_config:
                ttl = self.cache_config[tool_name]["ttl"]
                if time.time() - entry["timestamp"] > ttl:
                    keys_to_remove.append(key)
                    
        for key in keys_to_remove:
            del self.memory_cache[key]
            removed_count += 1
            
        # Clean disk cache
        for cache_file in self.cache_dir.glob("*.pkl"):
            try:
                async with aiofiles.open(cache_file, 'rb') as f:
                    data = pickle.loads(await f.read())
                    tool_name = data.get("tool_name")
                    if tool_name in self.cache_config:
                        ttl = self.cache_config[tool_name]["ttl"]
                        if time.time() - data["timestamp"] > ttl:
                            cache_file.unlink()
                            removed_count += 1
            except Exception:
                # Remove corrupted files
                cache_file.unlink()
                removed_count += 1
                
        if removed_count > 0:
            ui.info(f"Cleaned up {removed_count} cache entries", "ToolCache")
            
    def get_stats(self) -> Dict[str, Any]:
        """Get cache statistics"""
        disk_files = len(list(self.cache_dir.glob("*.pkl")))
        disk_size = sum(f.stat().st_size for f in self.cache_dir.glob("*.pkl"))
        
        return {
            "memory_entries": len(self.memory_cache),
            "disk_files": disk_files,
            "disk_size_bytes": disk_size,
            "cacheable_tools": list(self.cache_config.keys())
        }


class QueryOptimizer:
    """Optimize Claude Code SDK queries"""
    
    def __init__(self):
        self.pattern_cache = {}
        self.optimization_stats = {
            "total_optimized": 0,
            "tokens_saved": 0,
            "patterns_detected": defaultdict(int)
        }
        
    def optimize_prompt(self, prompt: str, context: Optional[Dict[str, Any]] = None) -> str:
        """
        Optimize a prompt for better performance
        
        Args:
            prompt: Original prompt
            context: Optional context information
            
        Returns:
            Optimized prompt
        """
        optimized = prompt
        
        # Remove redundant whitespace
        optimized = ' '.join(optimized.split())
        
        # Detect and optimize common patterns
        patterns = self._detect_patterns(optimized)
        
        for pattern in patterns:
            if pattern == "file_edit":
                # Optimize file editing prompts
                optimized = self._optimize_file_edit(optimized)
            elif pattern == "code_generation":
                # Optimize code generation prompts
                optimized = self._optimize_code_generation(optimized)
            elif pattern == "search":
                # Optimize search prompts
                optimized = self._optimize_search(optimized)
                
        # Track optimization
        if optimized != prompt:
            self.optimization_stats["total_optimized"] += 1
            self.optimization_stats["tokens_saved"] += len(prompt) - len(optimized)
            for pattern in patterns:
                self.optimization_stats["patterns_detected"][pattern] += 1
                
        return optimized
        
    def _detect_patterns(self, prompt: str) -> List[str]:
        """Detect common patterns in prompt"""
        patterns = []
        
        # File editing pattern
        if any(word in prompt.lower() for word in ["edit", "modify", "change", "update", "fix"]):
            patterns.append("file_edit")
            
        # Code generation pattern
        if any(word in prompt.lower() for word in ["create", "generate", "write", "implement"]):
            patterns.append("code_generation")
            
        # Search pattern
        if any(word in prompt.lower() for word in ["find", "search", "locate", "look for"]):
            patterns.append("search")
            
        return patterns
        
    def _optimize_file_edit(self, prompt: str) -> str:
        """Optimize file editing prompts"""
        # Add specific instructions for efficient editing
        if "be specific" not in prompt.lower():
            prompt += "\n\nBe specific about the changes needed and use minimal edits."
        return prompt
        
    def _optimize_code_generation(self, prompt: str) -> str:
        """Optimize code generation prompts"""
        # Add language hints if not present
        if "python" not in prompt.lower() and "javascript" not in prompt.lower():
            # Try to detect language from context
            pass
        return prompt
        
    def _optimize_search(self, prompt: str) -> str:
        """Optimize search prompts"""
        # Suggest using specific tools
        if "grep" not in prompt.lower() and "glob" not in prompt.lower():
            prompt += "\n\nUse Grep or Glob tools for efficient searching."
        return prompt
        
    def get_stats(self) -> Dict[str, Any]:
        """Get optimization statistics"""
        return dict(self.optimization_stats)


class ClaudeCacheManager:
    """Main cache manager for Claude Code SDK"""
    
    def __init__(self, cache_dir: Optional[str] = None):
        """
        Initialize cache manager
        
        Args:
            cache_dir: Base directory for caches
        """
        self.cache_dir = Path(cache_dir or ".cache")
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        
        self.response_cache = ResponseCache()
        self.tool_cache = ToolResultCache(str(self.cache_dir / "tools"))
        self.query_optimizer = QueryOptimizer()
        
        # Cache configuration
        self.enabled = os.getenv("CLAUDE_CACHE_ENABLED", "true").lower() == "true"
        self.aggressive_mode = os.getenv("CLAUDE_CACHE_AGGRESSIVE", "false").lower() == "true"
        
    async def get_cached_response(self, prompt: str, options: Dict[str, Any]) -> Optional[str]:
        """Get cached response if available"""
        if not self.enabled:
            return None
            
        return self.response_cache.get(prompt, options)
        
    async def cache_response(self, prompt: str, options: Dict[str, Any], response: str):
        """Cache a response"""
        if not self.enabled:
            return
            
        self.response_cache.put(prompt, options, response)
        
    async def get_cached_tool_result(self, tool_name: str, tool_input: Dict[str, Any]) -> Optional[Any]:
        """Get cached tool result if available"""
        if not self.enabled:
            return None
            
        return await self.tool_cache.get(tool_name, tool_input)
        
    async def cache_tool_result(self, tool_name: str, tool_input: Dict[str, Any], result: Any):
        """Cache a tool result"""
        if not self.enabled:
            return
            
        await self.tool_cache.put(tool_name, tool_input, result)
        
    def optimize_prompt(self, prompt: str, context: Optional[Dict[str, Any]] = None) -> str:
        """Optimize a prompt"""
        if not self.aggressive_mode:
            return prompt
            
        return self.query_optimizer.optimize_prompt(prompt, context)
        
    async def cleanup(self):
        """Clean up all caches"""
        await self.tool_cache.cleanup()
        
        # Clean old cache files
        cutoff = time.time() - (7 * 24 * 3600)  # 7 days
        for cache_file in self.cache_dir.rglob("*"):
            if cache_file.is_file() and cache_file.stat().st_mtime < cutoff:
                cache_file.unlink()
                
    def get_stats(self) -> Dict[str, Any]:
        """Get comprehensive cache statistics"""
        return {
            "enabled": self.enabled,
            "aggressive_mode": self.aggressive_mode,
            "response_cache": self.response_cache.get_stats(),
            "tool_cache": self.tool_cache.get_stats(),
            "query_optimizer": self.query_optimizer.get_stats()
        }
        
    def clear_all(self):
        """Clear all caches"""
        self.response_cache.clear()
        self.tool_cache.memory_cache.clear()
        ui.info("All caches cleared", "CacheManager")


# Global instance
_cache_manager = None


def get_cache_manager() -> ClaudeCacheManager:
    """Get or create the global cache manager"""
    global _cache_manager
    if _cache_manager is None:
        _cache_manager = ClaudeCacheManager()
    return _cache_manager