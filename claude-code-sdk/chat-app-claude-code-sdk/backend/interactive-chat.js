#!/usr/bin/env node

/**
 * Chat Interativo - Permite conversar em tempo real via terminal
 */

const io = require('socket.io-client');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const socket = io('http://localhost:8080', {
  transports: ['websocket']
});

let currentSessionId = 'validation-' + Date.now();
let selectedAgent = 'claude';

console.log('💬 CHAT INTERATIVO - Claude + CrewAI');
console.log('='.repeat(50));
console.log('Comandos especiais:');
console.log('  /claude  - Mudar para Claude direto');
console.log('  /crew    - Mudar para CrewAI');
console.log('  /exit    - Sair');
console.log('='.repeat(50));

socket.on('connect', () => {
  console.log('✅ Conectado ao servidor');
  console.log(`📍 Sessão: ${currentSessionId}`);
  console.log(`🤖 Agente atual: ${selectedAgent}\n`);
  promptUser();
});

function promptUser() {
  rl.question('Você: ', (message) => {
    if (message === '/exit') {
      console.log('👋 Até logo!');
      process.exit(0);
    } else if (message === '/claude') {
      selectedAgent = 'claude';
      console.log('🔄 Mudou para Claude direto\n');
      promptUser();
    } else if (message === '/crew') {
      selectedAgent = 'crew-ai';
      socket.emit('a2a:select_agent', { agent: 'crew-ai' });
      console.log('🔄 Mudando para CrewAI...');
    } else if (message.trim()) {
      sendMessage(message);
    } else {
      promptUser();
    }
  });
}

function sendMessage(message) {
  console.log('\nAssistente: ');
  
  if (selectedAgent === 'claude') {
    // Claude direto
    socket.emit('send_message', {
      message: message,
      sessionId: currentSessionId
    });
  } else {
    // CrewAI via A2A
    socket.emit('a2a:send_message', {
      message: message,
      sessionId: currentSessionId,
      useAgent: true
    });
  }
}

// Handlers para Claude direto
socket.on('message_stream', (data) => {
  if (data.result) {
    process.stdout.write(data.result);
  }
});

socket.on('message_complete', () => {
  console.log('\n');
  promptUser();
});

// Handlers para A2A/CrewAI
socket.on('a2a:agent_selected', (data) => {
  console.log(`✅ Agente selecionado: ${data.agent?.name || 'crew-ai'}\n`);
  promptUser();
});

socket.on('stream', (data) => {
  if (data.chunk) {
    process.stdout.write(data.chunk);
  }
});

socket.on('stream_complete', () => {
  console.log('\n');
  promptUser();
});

// Handlers de erro
socket.on('error', (error) => {
  console.error('\n❌ Erro:', error);
  promptUser();
});

socket.on('disconnect', () => {
  console.log('\n🔌 Desconectado do servidor');
  process.exit(1);
});

// Tratamento de Ctrl+C
process.on('SIGINT', () => {
  console.log('\n\n👋 Até logo!');
  process.exit(0);
});