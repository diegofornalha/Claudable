"""WebSocket endpoint para terminal interativo com Claude Code"""
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from app.claudable_terminal.terminal_interactive import InteractiveTerminal
import asyncio
import json
from typing import Dict

router = APIRouter()

# Armazena sessões ativas
active_sessions: Dict[str, InteractiveTerminal] = {}

@router.websocket("/ws/terminal/interactive/{project_id}")
async def terminal_interactive_websocket(websocket: WebSocket, project_id: str):
    """WebSocket para terminal interativo com PTY"""
    await websocket.accept()
    
    # Cria ou recupera a sessão
    if project_id not in active_sessions:
        active_sessions[project_id] = InteractiveTerminal(project_id)
    
    terminal = active_sessions[project_id]
    
    # Task para ler output continuamente
    async def read_output_task():
        """Lê output do terminal e envia ao cliente"""
        while True:
            try:
                result = await terminal.read_output(timeout=0.1)
                if result['success'] and result.get('output'):
                    await websocket.send_json({
                        'type': 'output',
                        'data': result['output']
                    })
                await asyncio.sleep(0.01)  # Pequeno delay para não sobrecarregar
            except Exception:
                break
    
    # Inicia a task de leitura
    output_task = asyncio.create_task(read_output_task())
    
    try:
        while True:
            # Recebe mensagem do cliente
            data = await websocket.receive_json()
            
            if data['type'] == 'start':
                # Inicia sessão com comando específico (ex: 'claude')
                command = data.get('command')
                result = await terminal.start_session(command)
                await websocket.send_json({
                    'type': 'session_started',
                    'success': result['success'],
                    'message': result.get('message', '')
                })
                
            elif data['type'] == 'input':
                # Envia input para o terminal
                input_data = data.get('data', '')
                await terminal.send_input(input_data)
                
            elif data['type'] == 'resize':
                # Redimensiona terminal
                rows = data.get('rows', 24)
                cols = data.get('cols', 80)
                await terminal.resize_terminal(rows, cols)
                
            elif data['type'] == 'close':
                # Fecha a sessão
                await terminal.close_session()
                break
                
    except WebSocketDisconnect:
        pass
    except Exception as e:
        await websocket.send_json({
            'type': 'error',
            'message': str(e)
        })
    finally:
        # Cancela a task de output
        output_task.cancel()
        
        # Remove sessão inativa
        if not terminal.is_alive():
            active_sessions.pop(project_id, None)