#!/usr/bin/env python3
import asyncio
import sys
import os

# Adiciona o diretório do projeto ao path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'apps/api'))

from app.claudable_terminal.terminal_simple import ClaudableTerminal

async def test():
    terminal = ClaudableTerminal('test')
    
    # Testa comando claude
    print('Testando comando claude...')
    result = await terminal.execute('claude')
    print(f'Success: {result["success"]}')
    print(f'Output (primeiros 500 chars):')
    print(result['output'][:500] if result['output'] else 'Sem output')
    print()

if __name__ == "__main__":
    asyncio.run(test())