"""Terminal simples para Claude CLI - MVP"""
import asyncio
import json
from typing import Dict, Optional
from pathlib import Path
from datetime import datetime

class ClaudableTerminal:
    """Terminal básico para comandos Claude"""
    
    # Só comandos essenciais
    ALLOWED_COMMANDS = [
        'claude login',
        'claude logout', 
        'claude auth status',
        'claude auth whoami',
        'claude --version',
        'claude --help',
        'which claude',
        'npm install -g @anthropic-ai/claude-code'
    ]
    
    def __init__(self, project_id: str):
        self.project_id = project_id
        self.authenticated = False
        self.auth_file = Path.home() / '.claudable' / f'{project_id}_auth.json'
        self.auth_file.parent.mkdir(parents=True, exist_ok=True)
        # Verifica autenticação prévia
        self.authenticated = self.check_auth()
        
    async def execute(self, command: str) -> Dict:
        """Executa comando se permitido"""
        
        # Remove espaços extras
        command = command.strip()
        
        # Validação básica
        if not any(command.startswith(cmd.split()[0]) for cmd in self.ALLOWED_COMMANDS):
            return {
                'success': False,
                'output': '❌ Comando não permitido. Use apenas comandos Claude:\n' + 
                         '  • claude login\n' +
                         '  • claude logout\n' +
                         '  • claude auth status\n' +
                         '  • claude --version\n' +
                         '  • npm install -g @anthropic-ai/claude-code',
                'authenticated': self.authenticated
            }
        
        try:
            # Executa comando
            process = await asyncio.create_subprocess_shell(
                command,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                shell=True
            )
            
            stdout, stderr = await process.communicate()
            
            # Decodifica output
            stdout_text = stdout.decode('utf-8', errors='ignore')
            stderr_text = stderr.decode('utf-8', errors='ignore')
            output = stdout_text + stderr_text
            
            # Detecta autenticação bem-sucedida
            auth_indicators = [
                'Successfully authenticated',
                'Logged in as',
                'Authentication successful',
                'Already logged in'
            ]
            
            if any(indicator in output for indicator in auth_indicators):
                self.authenticated = True
                self._save_auth_status()
                output += '\n\n✅ Autenticação detectada e salva!'
            
            # Detecta logout
            if 'logged out' in output.lower() or 'logout successful' in output.lower():
                self.authenticated = False
                self._clear_auth_status()
                output += '\n\n✅ Logout realizado!'
            
            return {
                'success': process.returncode == 0,
                'output': output if output else '✓ Comando executado',
                'authenticated': self.authenticated
            }
            
        except FileNotFoundError:
            return {
                'success': False,
                'output': '❌ Claude CLI não encontrado. Execute:\nnpm install -g @anthropic-ai/claude-code',
                'authenticated': False
            }
        except Exception as e:
            return {
                'success': False,
                'output': f'❌ Erro: {str(e)}',
                'authenticated': self.authenticated
            }
    
    def _save_auth_status(self):
        """Salva status de auth em arquivo"""
        try:
            auth_data = {
                'project_id': self.project_id,
                'authenticated': True,
                'timestamp': datetime.now().isoformat(),
                'method': 'claude_cli'
            }
            self.auth_file.write_text(json.dumps(auth_data, indent=2))
            print(f"✅ Auth status salvo para projeto {self.project_id}")
        except Exception as e:
            print(f"⚠️ Erro ao salvar auth: {e}")
    
    def _clear_auth_status(self):
        """Limpa status de autenticação"""
        try:
            if self.auth_file.exists():
                self.auth_file.unlink()
                print(f"✅ Auth status limpo para projeto {self.project_id}")
        except Exception as e:
            print(f"⚠️ Erro ao limpar auth: {e}")
    
    def check_auth(self) -> bool:
        """Verifica se está autenticado"""
        if self.auth_file.exists():
            try:
                data = json.loads(self.auth_file.read_text())
                # Verifica se não é muito antigo (7 dias)
                saved_time = datetime.fromisoformat(data['timestamp'])
                age_days = (datetime.now() - saved_time).days
                if age_days > 7:
                    print(f"⚠️ Auth expirado ({age_days} dias)")
                    return False
                return data.get('authenticated', False)
            except Exception as e:
                print(f"⚠️ Erro ao ler auth: {e}")
        return False
    
    async def check_claude_installed(self) -> Dict:
        """Verifica se Claude CLI está instalado"""
        try:
            process = await asyncio.create_subprocess_shell(
                'which claude',
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                shell=True
            )
            
            stdout, _ = await process.communicate()
            
            if process.returncode == 0 and stdout:
                path = stdout.decode().strip()
                return {
                    'installed': True,
                    'path': path,
                    'message': f'✅ Claude CLI encontrado em: {path}'
                }
            else:
                return {
                    'installed': False,
                    'path': None,
                    'message': '❌ Claude CLI não instalado. Execute: npm install -g @anthropic-ai/claude-code'
                }
        except Exception as e:
            return {
                'installed': False,
                'path': None,
                'message': f'❌ Erro ao verificar: {str(e)}'
            }