"""Terminal livre e interativo - Sem restrições"""
import asyncio
import os
from typing import Dict, Optional
from pathlib import Path

class ClaudableTerminal:
    """Terminal totalmente livre para qualquer comando"""
    
    def __init__(self, project_id: str):
        self.project_id = project_id
        # Mantém o diretório atual para cada terminal
        self.current_dir = str(Path.home())
        
    async def execute(self, command: str) -> Dict:
        """Executa QUALQUER comando sem restrições"""
        
        # Remove espaços extras
        command = command.strip()
        
        if not command:
            return {
                'success': True,
                'output': '',
                'authenticated': False
            }
        
        # Trata comando cd especialmente para manter o contexto
        if command.startswith('cd '):
            new_dir = command[3:].strip()
            return await self._handle_cd(new_dir)
        
        # Para o comando 'pwd', retorna o diretório atual
        if command == 'pwd':
            return {
                'success': True,
                'output': self.current_dir,
                'authenticated': False
            }
        
        # Para o comando 'claude' sem argumentos, adiciona --help para evitar erro
        if command == 'claude':
            # Mostra uma mensagem útil em vez do erro
            command = 'claude --help'
        
        try:
            # Executa o comando no diretório atual mantido
            process = await asyncio.create_subprocess_shell(
                command,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                shell=True,
                cwd=self.current_dir,  # Usa o diretório atual mantido
                env={**os.environ, 'TERM': 'xterm-256color'}  # Adiciona variável TERM
            )
            
            # Timeout para comandos que podem travar esperando input
            try:
                stdout, stderr = await asyncio.wait_for(
                    process.communicate(),
                    timeout=5.0  # 5 segundos de timeout
                )
            except asyncio.TimeoutError:
                # Se o comando travou (provavelmente esperando input)
                process.kill()
                return {
                    'success': False,
                    'output': 'Comando interrompido: timeout aguardando input',
                    'authenticated': False
                }
            
            # Decodifica output
            stdout_text = stdout.decode('utf-8', errors='ignore')
            stderr_text = stderr.decode('utf-8', errors='ignore')
            
            # Combina stdout e stderr
            output = stdout_text
            if stderr_text:
                # Para alguns comandos, stderr não é erro (ex: git)
                if process.returncode != 0:
                    output = stderr_text if not output else output + '\n' + stderr_text
                else:
                    # Se returncode é 0, stderr pode ser apenas info
                    if output:
                        output += '\n' + stderr_text
                    else:
                        output = stderr_text
            
            return {
                'success': process.returncode == 0,
                'output': output if output else '✓',
                'authenticated': False
            }
            
        except Exception as e:
            return {
                'success': False,
                'output': f'Erro: {str(e)}',
                'authenticated': False
            }
    
    async def _handle_cd(self, new_dir: str) -> Dict:
        """Trata o comando cd mantendo o contexto do diretório"""
        try:
            # Resolve o caminho
            if new_dir.startswith('~'):
                new_dir = os.path.expanduser(new_dir)
            elif not os.path.isabs(new_dir):
                # Caminho relativo
                new_dir = os.path.join(self.current_dir, new_dir)
            
            # Normaliza o caminho
            new_dir = os.path.normpath(new_dir)
            
            # Verifica se o diretório existe
            if os.path.isdir(new_dir):
                self.current_dir = new_dir
                return {
                    'success': True,
                    'output': f'',  # cd normalmente não retorna output
                    'authenticated': False
                }
            else:
                return {
                    'success': False,
                    'output': f'cd: {new_dir}: No such file or directory',
                    'authenticated': False
                }
        except Exception as e:
            return {
                'success': False,
                'output': f'cd: {str(e)}',
                'authenticated': False
            }
    
    async def check_claude_installed(self) -> Dict:
        """Verifica se Claude está instalado"""
        result = await self.execute('which claude')
        
        if result['success'] and result['output'].strip():
            path = result['output'].strip()
            return {
                'installed': True,
                'path': path,
                'message': f'Claude encontrado: {path}'
            }
        else:
            return {
                'installed': False,
                'path': None,
                'message': 'Claude não encontrado'
            }