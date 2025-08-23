'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';

interface ClaudableTerminalInteractiveProps {
  projectId?: string;
  onAuthenticated?: () => void;
}

export default function ClaudableTerminalInteractive({ 
  projectId = 'global',
  onAuthenticated 
}: ClaudableTerminalInteractiveProps) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const terminal = useRef<Terminal | null>(null);
  const fitAddon = useRef<FitAddon | null>(null);
  const ws = useRef<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isSessionStarted, setIsSessionStarted] = useState(false);

  useEffect(() => {
    if (!terminalRef.current) return;

    // Pequeno delay para garantir que o DOM está pronto
    const timer = setTimeout(() => {
      if (!terminalRef.current) return;
      
      // Cria o terminal xterm.js
      terminal.current = new Terminal({
        cursorBlink: true,
        fontSize: 14,
        fontFamily: 'Menlo, Monaco, "Courier New", monospace',
        theme: {
          background: '#000000',
          foreground: '#d4d4d4',
          cursor: '#d4d4d4',
          black: '#000000',
          red: '#cd3131',
          green: '#0dbc79',
          yellow: '#e5e510',
          blue: '#2472c8',
          magenta: '#bc3fbc',
          cyan: '#11a8cd',
          white: '#e5e5e5',
          brightBlack: '#666666',
          brightRed: '#f14c4c',
          brightGreen: '#23d18b',
          brightYellow: '#f5f543',
          brightBlue: '#3b8eea',
          brightMagenta: '#d670d6',
          brightCyan: '#29b8db',
          brightWhite: '#e5e5e5'
        },
        allowProposedApi: true
      });

      // Adiciona addons
      fitAddon.current = new FitAddon();
      terminal.current.loadAddon(fitAddon.current);
      terminal.current.loadAddon(new WebLinksAddon());

      // Abre o terminal no elemento DOM
      terminal.current.open(terminalRef.current);
      
      // Aguarda o próximo frame antes de fazer fit
      requestAnimationFrame(() => {
        if (fitAddon.current) {
          try {
            fitAddon.current.fit();
          } catch (e) {
            console.warn('Erro inicial ao ajustar terminal:', e);
            // Tenta novamente após um pequeno delay
            setTimeout(() => {
              if (fitAddon.current) {
                try {
                  fitAddon.current.fit();
                } catch (e2) {
                  console.warn('Erro ao ajustar terminal (segunda tentativa):', e2);
                }
              }
            }, 100);
          }
        }
      });

      // Conecta ao WebSocket
      connectWebSocket();
    }, 50);

    // Redimensiona o terminal quando a janela muda
    const handleResize = () => {
      if (fitAddon.current && terminal.current) {
        try {
          fitAddon.current.fit();
          if (ws.current && ws.current.readyState === WebSocket.OPEN) {
            const dims = fitAddon.current.proposeDimensions();
            if (dims) {
              ws.current.send(JSON.stringify({
                type: 'resize',
                rows: dims.rows,
                cols: dims.cols
              }));
            }
          }
        } catch (e) {
          console.warn('Erro ao redimensionar terminal:', e);
        }
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', handleResize);
      if (ws.current) {
        ws.current.close();
      }
      if (terminal.current) {
        terminal.current.dispose();
      }
    };
  }, []);

  const connectWebSocket = () => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.hostname}:8080/ws/terminal/interactive/${projectId}`;
    
    ws.current = new WebSocket(wsUrl);

    ws.current.onopen = () => {
      console.log('Terminal interativo conectado');
      setIsConnected(true);
      
      // Inicia sessão com shell padrão
      ws.current?.send(JSON.stringify({
        type: 'start'
        // Sem comando específico, usa o shell padrão
      }));
    };

    ws.current.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        if (data.type === 'output' && terminal.current) {
          // Escreve o output no terminal
          terminal.current.write(data.data);
        } else if (data.type === 'session_started') {
          setIsSessionStarted(data.success);
          // Terminal pronto, sem mensagem adicional
        } else if (data.type === 'error') {
          terminal.current?.writeln(`\\r\\n\\x1b[31mErro: ${data.message}\\x1b[0m`);
        }
      } catch (e) {
        // Se não for JSON, trata como texto puro
        if (terminal.current) {
          terminal.current.write(event.data);
        }
      }
    };

    ws.current.onclose = () => {
      console.log('Terminal desconectado');
      setIsConnected(false);
      setIsSessionStarted(false);
      terminal.current?.writeln('\\r\\n\\x1b[33mDesconectado. Recarregue a página para reconectar.\\x1b[0m');
    };

    ws.current.onerror = (error) => {
      console.error('Erro no WebSocket:', error);
      setIsConnected(false);
    };
  };

  // Captura input do terminal e envia ao backend
  useEffect(() => {
    if (!terminal.current) return;

    const disposable = terminal.current.onData((data) => {
      if (ws.current && ws.current.readyState === WebSocket.OPEN && isSessionStarted) {
        // Envia o input para o backend
        ws.current.send(JSON.stringify({
          type: 'input',
          data: data
        }));
      }
    });

    return () => {
      disposable.dispose();
    };
  }, [isSessionStarted]);

  return (
    <div className="w-full h-full bg-black">
      <div ref={terminalRef} className="w-full h-full" />
    </div>
  );
}