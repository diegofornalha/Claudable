const io = require('socket.io-client');

// Conectar ao servidor
const socket = io('http://localhost:8080');

socket.on('connect', () => {
  console.log('✅ Conectado ao servidor');
  
  // Enviar mensagem de teste
  const testMessage = {
    content: 'Olá, teste de mensagem!',
    sessionId: 'test-session-' + Date.now()
  };
  
  console.log('📤 Enviando mensagem:', testMessage);
  socket.emit('message', testMessage);
});

socket.on('message', (data) => {
  console.log('📥 Resposta recebida:', data);
});

socket.on('error', (error) => {
  console.error('❌ Erro:', error);
});

socket.on('disconnect', () => {
  console.log('🔌 Desconectado');
});

// Desconectar após 10 segundos
setTimeout(() => {
  console.log('⏰ Encerrando teste...');
  socket.disconnect();
  process.exit(0);
}, 10000);