/**
 * Teste dos métodos implementados no Neo4jRAGService
 */

const Neo4jRAGService = require('../services/neo4j-rag-service');

// Mock do cliente MCP
const mockMCP = {
  connected: true,
  
  async listMemoryLabels() {
    return ['document', 'message', 'session'];
  },
  
  async createMemory(label, properties) {
    return {
      memory: {
        _id: 123,
        label,
        ...properties
      }
    };
  },
  
  async updateMemory(nodeId, properties) {
    return {
      memory: {
        _id: nodeId,
        ...properties
      }
    };
  },
  
  async createConnection(fromMemoryId, toMemoryId, type, properties) {
    return {
      connection: {
        _id: 456,
        type,
        fromMemoryId,
        toMemoryId,
        ...properties
      }
    };
  },
  
  async deleteMemory(nodeId) {
    return { success: true, deleted: 1 };
  },
  
  async searchMemories(params) {
    return [
      {
        memory: {
          _id: 1,
          content: 'Resultado de teste'
        },
        connections: []
      }
    ];
  }
};

async function testNeo4jRAGService() {
  console.log('🧪 Iniciando testes do Neo4jRAGService...\n');
  
  const service = new Neo4jRAGService(mockMCP);
  let testCount = 0;
  let passedTests = 0;
  
  const test = async (name, fn) => {
    testCount++;
    try {
      console.log(`📋 Teste ${testCount}: ${name}`);
      await fn();
      console.log('✅ PASSOU\n');
      passedTests++;
    } catch (error) {
      console.log(`❌ FALHOU: ${error.message}\n`);
    }
  };
  
  // Teste 1: isConnected()
  await test('isConnected() retorna true quando MCP está conectado', async () => {
    const connected = service.isConnected();
    if (!connected) throw new Error('Deveria retornar true');
  });
  
  // Teste 2: listMemoryLabels()
  await test('listMemoryLabels() retorna array de labels', async () => {
    const labels = await service.listMemoryLabels();
    if (!Array.isArray(labels)) throw new Error('Deveria retornar um array');
    if (labels.length === 0) throw new Error('Deveria retornar labels');
  });
  
  // Teste 3: createMemory() com parâmetros separados
  await test('createMemory() cria nova memória (parâmetros separados)', async () => {
    const result = await service.createMemory('test', { name: 'Test Memory' });
    if (!result.memory) throw new Error('Deveria retornar objeto com memory');
    if (!result.memory._id) throw new Error('Memória deveria ter _id');
  });

  // Teste 3b: createMemory() com objeto
  await test('createMemory() cria nova memória (objeto)', async () => {
    const result = await service.createMemory({ label: 'test', properties: { name: 'Test Memory Object' } });
    if (!result.memory) throw new Error('Deveria retornar objeto com memory');
    if (!result.memory._id) throw new Error('Memória deveria ter _id');
  });
  
  // Teste 4: updateMemory() com parâmetros separados
  await test('updateMemory() atualiza memória existente (parâmetros separados)', async () => {
    const result = await service.updateMemory(123, { name: 'Updated Memory' });
    if (!result.memory) throw new Error('Deveria retornar objeto com memory');
    if (result.memory._id !== 123) throw new Error('ID deveria ser preservado');
  });

  // Teste 4b: updateMemory() com objeto
  await test('updateMemory() atualiza memória existente (objeto)', async () => {
    const result = await service.updateMemory({ nodeId: 124, properties: { name: 'Updated Memory Object' } });
    if (!result.memory) throw new Error('Deveria retornar objeto com memory');
    if (result.memory._id !== 124) throw new Error('ID deveria ser preservado');
  });
  
  // Teste 5: createConnection() com parâmetros separados
  await test('createConnection() cria conexão entre memórias (parâmetros separados)', async () => {
    const result = await service.createConnection(1, 2, 'RELATED_TO', { strength: 0.8 });
    if (!result.connection) throw new Error('Deveria retornar objeto com connection');
    if (result.connection.type !== 'RELATED_TO') throw new Error('Tipo deveria ser preservado');
  });

  // Teste 5b: createConnection() com objeto
  await test('createConnection() cria conexão entre memórias (objeto)', async () => {
    const result = await service.createConnection({ fromMemoryId: 3, toMemoryId: 4, type: 'CONNECTS_TO', properties: { weight: 1.0 } });
    if (!result.connection) throw new Error('Deveria retornar objeto com connection');
    if (result.connection.type !== 'CONNECTS_TO') throw new Error('Tipo deveria ser preservado');
  });
  
  // Teste 6: deleteMemory() com parâmetro direto
  await test('deleteMemory() remove memória (parâmetro direto)', async () => {
    const result = await service.deleteMemory(123);
    if (!result.success) throw new Error('Deveria retornar success: true');
  });

  // Teste 6b: deleteMemory() com objeto
  await test('deleteMemory() remove memória (objeto)', async () => {
    const result = await service.deleteMemory({ nodeId: 125 });
    if (!result.success) throw new Error('Deveria retornar success: true');
  });
  
  // Teste 7: searchMemories() com formato correto
  await test('searchMemories() retorna formato { memories: [...] }', async () => {
    const result = await service.searchMemories({ query: 'teste' });
    if (!result.memories) throw new Error('Deveria retornar objeto com propriedade memories');
    if (!Array.isArray(result.memories)) throw new Error('memories deveria ser um array');
  });
  
  // Teste 8: getStatus()
  await test('getStatus() retorna informações do serviço', async () => {
    const status = service.getStatus();
    if (typeof status.mcpConnected !== 'boolean') throw new Error('mcpConnected deveria ser boolean');
    if (typeof status.directConnectionAvailable !== 'boolean') throw new Error('directConnectionAvailable deveria ser boolean');
  });
  
  // Teste 9: Fallback quando MCP não está conectado
  await test('Fallback funciona quando MCP está desconectado', async () => {
    const disconnectedService = new Neo4jRAGService({ connected: false });
    const connected = disconnectedService.isConnected();
    if (connected) throw new Error('Deveria retornar false quando MCP desconectado');
  });
  
  console.log(`🏁 Testes concluídos: ${passedTests}/${testCount} passaram`);
  
  if (passedTests === testCount) {
    console.log('🎉 Todos os testes passaram! O Neo4jRAGService está funcionando corretamente.');
    return true;
  } else {
    console.log('⚠️ Alguns testes falharam. Verifique a implementação.');
    return false;
  }
}

// Executar testes se chamado diretamente
if (require.main === module) {
  testNeo4jRAGService()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('❌ Erro nos testes:', error);
      process.exit(1);
    });
}

module.exports = { testNeo4jRAGService };