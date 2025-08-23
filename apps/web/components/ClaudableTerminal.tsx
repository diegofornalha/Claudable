'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

interface ClaudableTerminalProps {
  projectId: string;
  onAuthenticated?: () => void;
}

export default function ClaudableTerminal({ projectId, onAuthenticated }: ClaudableTerminalProps) {
  const [lines, setLines] = useState<string[]>(['$ ']);
  const [input, setInput] = useState('');
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const terminalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Conecta WebSocket
    const wsUrl = process.env.NEXT_PUBLIC_API_BASE 
      ? process.env.NEXT_PUBLIC_API_BASE.replace('http://', 'ws://').replace('https://', 'wss://')
      : 'ws://localhost:8080';
    const websocket = new WebSocket(`${wsUrl}/ws/terminal/${projectId}`);
    
    websocket.onopen = () => {
      console.log('Terminal conectado');
      setIsConnected(true);
      setWs(websocket);
    };
    
    websocket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      
      if (data.type === 'init') {
        // Terminal pronto
        console.log('Terminal inicializado');
      } else if (data.type === 'output') {
        // Adiciona output mantendo linhas vazias para formatação
        const outputLines = data.output.split('\n');
        // Remove a última linha se for vazia (para evitar espaço duplo)
        if (outputLines[outputLines.length - 1] === '') {
          outputLines.pop();
        }
        
        // Se o comando foi bem sucedido e não tem output (como cd), não adiciona linhas vazias
        if (outputLines.length === 0 || (outputLines.length === 1 && outputLines[0] === '✓')) {
          setLines(prev => [
            ...prev.slice(0, -1),
            `$ ${input}`,
            '$ '
          ]);
        } else {
          setLines(prev => [
            ...prev.slice(0, -1),
            `$ ${input}`,
            ...outputLines,
            '$ '
          ]);
        }
        setInput('');
      } else if (data.type === 'error') {
        setLines(prev => [
          ...prev.slice(0, -1),
          `Erro: ${data.message}`,
          '$ '
        ]);
      }
      
      // Scroll para o final
      setTimeout(() => {
        if (terminalRef.current) {
          terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
        }
      }, 10);
    };
    
    websocket.onclose = () => {
      console.log('Terminal desconectado');
      setIsConnected(false);
      // Mantém o terminal limpo, não adiciona mensagem
    };
    
    websocket.onerror = (error) => {
      console.error('Erro no WebSocket:', error);
      // Mantém o terminal limpo, não adiciona mensagem
      setIsConnected(false);
    };
    
    // Ping periódico para manter conexão
    const pingInterval = setInterval(() => {
      if (websocket.readyState === WebSocket.OPEN) {
        websocket.send(JSON.stringify({ type: 'ping' }));
      }
    }, 30000);
    
    return () => {
      clearInterval(pingInterval);
      websocket.close();
    };
  }, [projectId]);

  const handleSubmit = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      if (input.trim()) {
        // Se conectado, envia comando
        if (ws && isConnected) {
          ws.send(JSON.stringify({ 
            type: 'command',
            command: input.trim()
          }));
        } else {
          // Se não conectado, apenas limpa o input
          setInput('');
        }
      } else {
        // Se vazio, apenas adiciona nova linha
        setLines(prev => [...prev, '$ ']);
      }
    }
  }, [input, ws, isConnected]);

  return (
    <div className="bg-gray-900 rounded-lg overflow-hidden shadow-lg border border-gray-800">
      {/* Header minimalista */}
      <div className="bg-gray-800 px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex gap-1.5">
            <div className="w-3 h-3 bg-red-500 rounded-full opacity-80" />
            <div className="w-3 h-3 bg-yellow-500 rounded-full opacity-80" />
            <div className="w-3 h-3 bg-green-500 rounded-full opacity-80" />
          </div>
          <span className="text-gray-400 text-sm font-medium">
            Terminal
          </span>
        </div>
        
        {/* Status de conexão simples */}
        <div className="flex items-center gap-2">
          {isConnected ? (
            <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
          ) : (
            <div className="w-2 h-2 bg-red-400 rounded-full" />
          )}
        </div>
      </div>
      
      {/* Terminal Output */}
      <div
        ref={terminalRef}
        className="bg-black p-4 font-mono text-sm h-96 overflow-y-auto cursor-text"
        onClick={() => inputRef.current?.focus()}
      >
        {lines.map((line, i) => (
          <div key={i} className="whitespace-pre-wrap">
            <span className={
              line.startsWith('Aguardando') ? 'text-yellow-400' :
              line.startsWith('$') ? 'text-gray-400' :
              'text-gray-300'
            }>
              {line}
            </span>
            {i === lines.length - 1 && line.startsWith('$') && (
              <>
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleSubmit}
                  className="bg-transparent outline-none border-none text-green-400 flex-1"
                  style={{ 
                    caretColor: '#4ade80',
                    width: input ? `${input.length}ch` : '1ch',
                    minWidth: '1ch'
                  }}
                  autoFocus
                  spellCheck={false}
                />
                <span className="text-green-400 animate-pulse ml-1">▊</span>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}