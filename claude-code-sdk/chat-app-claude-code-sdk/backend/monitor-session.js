const io = require('socket.io-client');

// Conectar ao backend
const socket = io('http://localhost:8080');

console.log('🔍 Monitor de Sessão A2A Iniciado');
console.log('=' .repeat(50));

socket.on('connect', () => {
  console.log('✅ Conectado ao backend');
  console.log('👂 Escutando eventos...\n');
});

// Monitorar todos os eventos relacionados a A2A
socket.on('a2a:agents', (data) => {
  console.log('🤖 [AGENTES DISPONÍVEIS]:', data.agents.map(a => `${a.name}(${a.status})`).join(', '));
});

socket.on('a2a:agent_selected', (data) => {
  console.log(`✨ [AGENTE SELECIONADO]: ${data.agent}`);
});

socket.on('message', (msg) => {
  const prefix = msg.type === 'user' ? '👤' : '🤖';
  const agent = msg.agent ? ` [${msg.agent}]` : '';
  console.log(`\n${prefix}${agent} ${msg.type.toUpperCase()}:`);
  console.log(`   "${msg.content.substring(0, 100)}${msg.content.length > 100 ? '...' : ''}"`);
  console.log(`   Session: ${msg.sessionId}`);
  console.log(`   Time: ${new Date(msg.timestamp).toLocaleTimeString()}`);
});

socket.on('stream', (data) => {
  process.stdout.write(data.chunk);
});

socket.on('a2a:task_started', (data) => {
  console.log(`\n🚀 [TASK INICIADA]: ${data.taskId}`);
});

socket.on('a2a:task_completed', (data) => {
  console.log(`\n✅ [TASK COMPLETA]: ${data.taskId}`);
});

socket.on('error', (error) => {
  console.error('❌ ERRO:', error);
});

socket.on('disconnect', () => {
  console.log('\n⚠️ Desconectado do backend');
});

// Manter processo rodando
process.on('SIGINT', () => {
  console.log('\n👋 Encerrando monitor...');
  socket.disconnect();
  process.exit(0);
});