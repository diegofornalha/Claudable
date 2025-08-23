"""Terminal interativo com suporte PTY para Claude Code"""
import asyncio
import os
import pty
import select
import subprocess
import termios
import tty
from typing import Dict, Optional
from pathlib import Path
import struct
import fcntl
import signal

class InteractiveTerminal:
    """Terminal com PTY para suporte completo ao Claude Code"""
    
    def __init__(self, project_id: str):
        self.project_id = project_id
        self.current_dir = str(Path.home())
        self.process = None
        self.master_fd = None
        self.slave_fd = None
        
    async def start_session(self, command: str = None) -> Dict:
        """Inicia uma sessão interativa com PTY"""
        try:
            # Cria um pseudo-terminal
            self.master_fd, self.slave_fd = pty.openpty()
            
            # Configura o terminal
            self._setup_terminal()
            
            # Comando padrão é o shell
            if not command:
                command = os.environ.get('SHELL', '/bin/bash')
            
            # Inicia o processo com PTY
            self.process = subprocess.Popen(
                command,
                stdin=self.slave_fd,
                stdout=self.slave_fd,
                stderr=self.slave_fd,
                shell=True,
                cwd=self.current_dir,
                env={
                    **os.environ,
                    'TERM': 'xterm-256color',
                    'COLUMNS': '80',
                    'LINES': '24'
                },
                preexec_fn=os.setsid
            )
            
            # Torna o master_fd não bloqueante
            flags = fcntl.fcntl(self.master_fd, fcntl.F_GETFL)
            fcntl.fcntl(self.master_fd, fcntl.F_SETFL, flags | os.O_NONBLOCK)
            
            return {
                'success': True,
                'session_id': self.project_id,
                'message': 'Sessão interativa iniciada'
            }
            
        except Exception as e:
            return {
                'success': False,
                'error': str(e)
            }
    
    def _setup_terminal(self):
        """Configura o terminal para modo raw"""
        if self.master_fd:
            # Define o tamanho da janela do terminal
            winsize = struct.pack('HHHH', 24, 80, 0, 0)
            fcntl.ioctl(self.master_fd, termios.TIOCSWINSZ, winsize)
    
    async def send_input(self, data: str) -> Dict:
        """Envia input para o processo"""
        try:
            if not self.master_fd or not self.process:
                return {
                    'success': False,
                    'error': 'Sessão não iniciada'
                }
            
            # Escreve no master_fd
            os.write(self.master_fd, data.encode())
            
            return {
                'success': True
            }
            
        except Exception as e:
            return {
                'success': False,
                'error': str(e)
            }
    
    async def read_output(self, timeout: float = 0.1) -> Dict:
        """Lê output do processo"""
        try:
            if not self.master_fd or not self.process:
                return {
                    'success': False,
                    'error': 'Sessão não iniciada'
                }
            
            # Usa select para verificar se há dados disponíveis
            readable, _, _ = select.select([self.master_fd], [], [], timeout)
            
            if readable:
                try:
                    # Lê até 4096 bytes
                    output = os.read(self.master_fd, 4096)
                    return {
                        'success': True,
                        'output': output.decode('utf-8', errors='ignore'),
                        'has_more': True
                    }
                except OSError:
                    # Sem dados disponíveis
                    return {
                        'success': True,
                        'output': '',
                        'has_more': False
                    }
            else:
                return {
                    'success': True,
                    'output': '',
                    'has_more': False
                }
                
        except Exception as e:
            return {
                'success': False,
                'error': str(e)
            }
    
    async def resize_terminal(self, rows: int, cols: int) -> Dict:
        """Redimensiona o terminal"""
        try:
            if self.master_fd:
                winsize = struct.pack('HHHH', rows, cols, 0, 0)
                fcntl.ioctl(self.master_fd, termios.TIOCSWINSZ, winsize)
                
                # Envia sinal SIGWINCH para o processo
                if self.process and self.process.poll() is None:
                    os.kill(self.process.pid, signal.SIGWINCH)
                
            return {
                'success': True
            }
        except Exception as e:
            return {
                'success': False,
                'error': str(e)
            }
    
    async def close_session(self) -> Dict:
        """Fecha a sessão interativa"""
        try:
            if self.process:
                self.process.terminate()
                try:
                    self.process.wait(timeout=2)
                except subprocess.TimeoutExpired:
                    self.process.kill()
                
            if self.master_fd:
                os.close(self.master_fd)
            if self.slave_fd:
                os.close(self.slave_fd)
                
            self.process = None
            self.master_fd = None
            self.slave_fd = None
            
            return {
                'success': True,
                'message': 'Sessão encerrada'
            }
            
        except Exception as e:
            return {
                'success': False,
                'error': str(e)
            }
    
    def is_alive(self) -> bool:
        """Verifica se o processo está ativo"""
        return self.process is not None and self.process.poll() is None