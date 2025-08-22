const io = require('socket.io-client');

console.log('🚀 Iniciando teste de chat...');

// Conectar ao servidor
const socket = io('http://localhost:8080', {
  transports: ['websocket'],
  reconnection: true
});

let messageReceived = false;

socket.on('connect', () => {
  console.log('✅ Conectado ao servidor com ID:', socket.id);
  
  // Aguardar um momento para garantir conexão estável
  setTimeout(() => {
    // Enviar mensagem de chat real
    const testMessage = {
      sessionId: 'test-session-' + Date.now(),
      message: 'Olá! Você está funcionando corretamente?'
    };
    
    console.log('📤 Enviando mensagem:', testMessage);
    socket.emit('send_message', testMessage);
  }, 500);
});

socket.on('user_message', (data) => {
  console.log('👤 Mensagem do usuário confirmada:', data);
});

socket.on('typing_start', () => {
  console.log('⌨️ Claude está digitando...');
});

socket.on('stream', (data) => {
  if (!messageReceived) {
    console.log('\n📝 Resposta do Claude:');
    messageReceived = true;
  }
  process.stdout.write(data.text || '');
});

socket.on('message_complete', (data) => {
  console.log('\n\n✅ Mensagem completa!');
  console.log('📊 Estatísticas:', {
    messageId: data.messageId,
    sessionId: data.sessionId,
    totalTokens: data.totalTokens,
    timestamp: new Date(data.timestamp).toLocaleString()
  });
  console.log('\n🎉 Teste concluído com sucesso!');
  process.exit(0);
});

socket.on('error', (error) => {
  console.error('\n❌ Erro recebido:', error);
  if (error.content) {
    console.error('Detalhes do erro:', error.content);
  }
  process.exit(1);
});

socket.on('disconnect', () => {
  console.log('🔌 Desconectado do servidor');
});

socket.on('connect_error', (error) => {
  console.error('❌ Erro de conexão:', error.message);
});

// Timeout de 30 segundos
setTimeout(() => {
  console.log('\n⏰ Timeout - teste levou muito tempo');
  console.log('Status: ', messageReceived ? 'Resposta parcial recebida' : 'Nenhuma resposta recebida');
  process.exit(messageReceived ? 0 : 1);
}, 30000);