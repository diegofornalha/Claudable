"""ClaudableTerminal - Terminal simples para comandos Claude CLI"""

from .terminal_simple import ClaudableTerminal
from .websocket_handler import TerminalWebSocket, terminal_ws

__version__ = "1.0.0"
__all__ = ['ClaudableTerminal', 'TerminalWebSocket', 'terminal_ws']