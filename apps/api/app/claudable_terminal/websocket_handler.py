"""WebSocket handler simples para ClaudableTerminal"""
from fastapi import WebSocket, WebSocketDisconnect
from typing import Dict
import json
import asyncio
from .terminal_simple import ClaudableTerminal
from app.core.terminal_ui import ui

class TerminalWebSocket:
    """Gerenciador de WebSocket para terminal"""
    
    def __init__(self):
        self.terminals: Dict[str, ClaudableTerminal] = {}
        self.connections: Dict[str, WebSocket] = {}
    
    async def handle(self, websocket: WebSocket, project_id: str):
        """Gerencia conexão WebSocket para um projeto"""
        await websocket.accept()
        ui.info(f"Terminal WebSocket conectado para projeto: {project_id}", "ClaudableTerminal")
        
        # Cria ou recupera terminal para este projeto
        if project_id not in self.terminals:
            self.terminals[project_id] = ClaudableTerminal(project_id)
        
        terminal = self.terminals[project_id]
        self.connections[project_id] = websocket
        
        try:
            # Envia apenas status inicial simples
            await websocket.send_json({
                'type': 'init',
                'message': 'Terminal pronto'
            })
            
            # Loop principal para receber comandos
            while True:
                try:
                    # Recebe dados do cliente
                    data = await websocket.receive_text()
                    message = json.loads(data)
                    
                    if message.get('type') == 'command':
                        command = message.get('command', '').strip()
                        
                        if not command:
                            continue
                        
                        ui.debug(f"Executando comando: {command}", "ClaudableTerminal")
                        
                        # Envia feedback imediato
                        await websocket.send_json({
                            'type': 'executing',
                            'command': command
                        })
                        
                        # Executa comando
                        result = await terminal.execute(command)
                        
                        # Envia resultado
                        await websocket.send_json({
                            'type': 'output',
                            'output': result['output'],
                            'success': result['success']
                        })
                        
                        # Log do resultado
                        if result['success']:
                            ui.success(f"Comando executado: {command}", "ClaudableTerminal")
                        else:
                            ui.warning(f"Comando falhou: {command}", "ClaudableTerminal")
                    
                    
                    elif message.get('type') == 'ping':
                        # Responde ao ping para manter conexão viva
                        await websocket.send_json({'type': 'pong'})
                        
                except WebSocketDisconnect:
                    ui.info(f"Terminal desconectado: {project_id}", "ClaudableTerminal")
                    break
                except json.JSONDecodeError as e:
                    ui.error(f"Erro ao decodificar JSON: {e}", "ClaudableTerminal")
                    await websocket.send_json({
                        'type': 'error',
                        'message': 'Formato de mensagem inválido'
                    })
                except asyncio.CancelledError:
                    break
                    
        except Exception as e:
            ui.error(f"Erro no WebSocket do terminal: {e}", "ClaudableTerminal")
            try:
                await websocket.send_json({
                    'type': 'error',
                    'message': str(e)
                })
            except:
                pass
        finally:
            # Limpa conexão
            if project_id in self.connections:
                del self.connections[project_id]
            ui.info(f"Terminal WebSocket finalizado para projeto: {project_id}", "ClaudableTerminal")
    
    async def broadcast_to_project(self, project_id: str, message: Dict):
        """Envia mensagem para um projeto específico"""
        if project_id in self.connections:
            try:
                await self.connections[project_id].send_json(message)
            except Exception as e:
                ui.error(f"Erro ao enviar mensagem: {e}", "ClaudableTerminal")
    
    def get_terminal(self, project_id: str) -> ClaudableTerminal:
        """Retorna o terminal de um projeto"""
        return self.terminals.get(project_id)
    

# Instância global
terminal_ws = TerminalWebSocket()