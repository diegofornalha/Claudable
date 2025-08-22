const io = require('socket.io-client');

const socket = io('http://localhost:8080');

socket.on('connect', () => {
  console.log('✅ Conectado');
  
  // Enviar comando project_info
  socket.emit('send_message', {
    sessionId: 'test-' + Date.now(),
    message: 'project_info'
  });
});

socket.on('message_complete', (data) => {
  console.log('\n📥 Resposta recebida:');
  console.log('Type:', data.type);
  console.log('Content type:', typeof data.content);
  console.log('Content preview:', data.content?.substring(0, 200));
  console.log('\nFull message object:');
  console.log(JSON.stringify(data, null, 2));
  
  process.exit(0);
});

socket.on('error', (error) => {
  console.error('❌ Erro:', error);
  process.exit(1);
});

setTimeout(() => {
  console.log('⏰ Timeout');
  process.exit(0);
}, 5000);