"""Teste do ClaudableTerminal WebSocket"""

import asyncio
import json
import websockets

async def test_terminal():
    """Testa conexão e comandos básicos do terminal"""
    project_id = "test-project-123"
    uri = f"ws://localhost:8282/ws/terminal/{project_id}"
    
    print(f"🔌 Conectando ao ClaudableTerminal: {uri}")
    
    try:
        async with websockets.connect(uri) as websocket:
            print("✅ Conectado!")
            
            # 1. Recebe mensagem inicial
            init_msg = await websocket.recv()
            init_data = json.loads(init_msg)
            print(f"📋 Status inicial: {json.dumps(init_data, indent=2)}")
            
            # 2. Testa comando version
            print("\n🔍 Testando comando: claude --version")
            await websocket.send(json.dumps({
                "type": "command",
                "command": "claude --version"
            }))
            
            # Aguarda resposta de execução
            exec_msg = await websocket.recv()
            exec_data = json.loads(exec_msg)
            if exec_data.get("type") == "executing":
                print("⏳ Executando comando...")
            
            # Aguarda output
            output_msg = await websocket.recv()
            output_data = json.loads(output_msg)
            print(f"📤 Output: {output_data.get('output', 'Sem output')}")
            print(f"✓ Sucesso: {output_data.get('success', False)}")
            
            # 3. Testa comando auth status
            print("\n🔐 Testando comando: claude auth status")
            await websocket.send(json.dumps({
                "type": "command",
                "command": "claude auth status"
            }))
            
            # Aguarda resposta
            exec_msg = await websocket.recv()
            if json.loads(exec_msg).get("type") == "executing":
                print("⏳ Executando comando...")
            
            output_msg = await websocket.recv()
            output_data = json.loads(output_msg)
            print(f"📤 Output: {output_data.get('output', 'Sem output')}")
            print(f"🔑 Autenticado: {output_data.get('authenticated', False)}")
            
            # 4. Testa comando inválido
            print("\n❌ Testando comando inválido: ls")
            await websocket.send(json.dumps({
                "type": "command",
                "command": "ls"
            }))
            
            exec_msg = await websocket.recv()
            if json.loads(exec_msg).get("type") == "executing":
                print("⏳ Executando comando...")
            
            output_msg = await websocket.recv()
            output_data = json.loads(output_msg)
            print(f"📤 Output esperado (erro): {output_data.get('output', '')[:100]}...")
            
            # 5. Testa ping/pong
            print("\n🏓 Testando ping/pong...")
            await websocket.send(json.dumps({"type": "ping"}))
            pong_msg = await websocket.recv()
            pong_data = json.loads(pong_msg)
            if pong_data.get("type") == "pong":
                print("✅ Pong recebido!")
            
            print("\n✅ Todos os testes concluídos com sucesso!")
            
    except Exception as e:
        print(f"❌ Erro: {e}")
        return False
    
    return True

if __name__ == "__main__":
    print("🚀 Iniciando teste do ClaudableTerminal\n")
    print("=" * 50)
    
    # Executa teste
    success = asyncio.run(test_terminal())
    
    print("=" * 50)
    if success:
        print("\n🎉 Teste finalizado com sucesso!")
    else:
        print("\n⚠️ Teste falhou!")