const io = require('socket.io-client');

// Conectar ao servidor
const socket = io('http://localhost:8080');

socket.on('connect', () => {
  console.log('✅ Conectado ao servidor');
  
  // Enviar mensagem de chat real
  const testMessage = {
    sessionId: 'test-session-' + Date.now(),
    message: 'Olá Claude, você está funcionando?'
  };
  
  console.log('📤 Enviando mensagem de chat:', testMessage);
  socket.emit('send_message', testMessage);
});

socket.on('stream', (data) => {
  process.stdout.write(data.text || '');
});

socket.on('message_complete', (data) => {
  console.log('\n✅ Mensagem completa recebida');
  console.log('📊 Tokens usados:', data.totalTokens);
  process.exit(0);
});

socket.on('error', (error) => {
  console.error('❌ Erro:', error);
  process.exit(1);
});

// Timeout de 30 segundos
setTimeout(() => {
  console.log('\n⏰ Timeout - encerrando teste...');
  process.exit(0);
}, 30000);