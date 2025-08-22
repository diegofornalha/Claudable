const io = require('socket.io-client');

console.log('🚀 Testando sistema de métricas...');

const socket = io('http://localhost:8080', {
  transports: ['websocket']
});

socket.on('connect', () => {
  console.log('✅ Conectado ao servidor');
  
  // Solicitar métricas iniciais
  socket.emit('request_metrics');
  
  // Enviar mensagem de teste
  setTimeout(() => {
    console.log('📤 Enviando mensagem de teste...');
    socket.emit('send_message', {
      sessionId: 'metrics-test-' + Date.now(),
      message: 'Teste de métricas: Quanto custa 1000 tokens?'
    });
  }, 1000);
});

socket.on('metrics_update', (metrics) => {
  console.log('\n📊 Métricas Atualizadas:');
  console.log('   Total de Mensagens:', metrics.totalMessages);
  console.log('   Total de Tokens:', metrics.totalTokensUsed);
  console.log('   Custo Total:', `$${metrics.totalCost.toFixed(4)}`);
  console.log('   Sessões Ativas:', metrics.activeSessions);
  console.log('   Uptime:', `${Math.floor(metrics.uptime / 60)}m ${metrics.uptime % 60}s`);
  
  if (metrics.topSessions && metrics.topSessions.length > 0) {
    console.log('\n🏆 Top Sessões:');
    metrics.topSessions.forEach((session, i) => {
      console.log(`   ${i + 1}. ${session.sessionId.slice(0, 8)}... - ${session.messages} msgs - $${session.cost.toFixed(4)}`);
    });
  }
});

socket.on('message_complete', (data) => {
  console.log('\n✅ Mensagem processada!');
  console.log('   ID:', data.messageId);
  console.log('   Tokens:', data.totalTokens || 'N/A');
  
  // Solicitar métricas atualizadas
  setTimeout(() => {
    socket.emit('request_metrics');
    
    // Desconectar após 3 segundos
    setTimeout(() => {
      console.log('\n👋 Encerrando teste...');
      socket.disconnect();
      process.exit(0);
    }, 3000);
  }, 1000);
});

socket.on('error', (error) => {
  console.error('❌ Erro:', error);
});

// Timeout de segurança
setTimeout(() => {
  console.log('\n⏰ Timeout - encerrando...');
  process.exit(0);
}, 30000);