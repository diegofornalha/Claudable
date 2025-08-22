/**
 * Neo4j RAG Service com Fallback
 * Serviço de Retrieval-Augmented Generation com fallback direto para Neo4j
 */

const neo4j = require('neo4j-driver');

class Neo4jRAGService {
  constructor(mcpClient) {
    this.mcp = mcpClient;
    this.driver = null;
    this.session = null;
    
    // Configurações do Neo4j para fallback
    this.neo4jConfig = {
      uri: process.env.NEO4J_URI || 'bolt://localhost:7687',
      username: process.env.NEO4J_USERNAME || 'neo4j',
      password: process.env.NEO4J_PASSWORD || 'password'
    };
    
    // Cache para melhorar performance
    this.cache = new Map();
    this.cacheTimeout = 5 * 60 * 1000; // 5 minutos
  }

  /**
   * Inicializar conexão direta com Neo4j (fallback)
   */
  async initDirectConnection() {
    if (!this.driver) {
      console.log('📊 Iniciando conexão direta com Neo4j (fallback)...');
      this.driver = neo4j.driver(
        this.neo4jConfig.uri,
        neo4j.auth.basic(this.neo4jConfig.username, this.neo4jConfig.password)
      );
      
      // Testar conexão
      try {
        await this.driver.verifyConnectivity();
        console.log('✅ Conexão direta com Neo4j estabelecida');
      } catch (error) {
        console.error('❌ Falha na conexão direta com Neo4j:', error);
        throw error;
      }
    }
    
    if (!this.session) {
      this.session = this.driver.session();
    }
  }

  /**
   * Adicionar documento/memória
   */
  async addDocument(doc) {
    console.log('📝 Adicionando documento ao Neo4j...');
    
    // Tentar via MCP primeiro
    if (this.mcp && this.mcp.connected) {
      try {
        const result = await this.mcp.createMemory('document', doc);
        console.log('✅ Documento adicionado via MCP');
        this.clearCache();
        return result;
      } catch (error) {
        console.warn('⚠️ Falha ao adicionar via MCP, usando fallback:', error.message);
      }
    }
    
    // Fallback: conexão direta
    return await this.directNeo4jAdd(doc);
  }

  /**
   * Adicionar documento diretamente no Neo4j
   */
  async directNeo4jAdd(doc) {
    await this.initDirectConnection();
    
    const query = `
      CREATE (d:Document {
        id: $id,
        content: $content,
        timestamp: datetime(),
        metadata: $metadata
      })
      RETURN d
    `;
    
    try {
      const result = await this.session.run(query, {
        id: doc.id || `doc_${Date.now()}`,
        content: doc.content || doc.text || JSON.stringify(doc),
        metadata: JSON.stringify(doc.metadata || {})
      });
      
      console.log('✅ Documento adicionado diretamente ao Neo4j');
      this.clearCache();
      return result.records[0]?.get('d')?.properties;
    } catch (error) {
      console.error('❌ Erro ao adicionar documento diretamente:', error);
      throw error;
    }
  }

  /**
   * Buscar contexto relevante
   */
  async searchContext(query, options = {}) {
    const cacheKey = `search_${query}_${JSON.stringify(options)}`;
    
    // Verificar cache
    if (this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey);
      if (Date.now() - cached.timestamp < this.cacheTimeout) {
        console.log('📦 Retornando resultado do cache');
        return cached.data;
      }
    }
    
    console.log('🔍 Buscando contexto no Neo4j...');
    
    // Tentar via MCP primeiro
    if (this.mcp && this.mcp.connected) {
      try {
        const result = await this.mcp.searchMemories({
          query,
          limit: options.limit || 10,
          depth: options.depth || 1,
          label: options.label
        });
        
        console.log(`✅ Encontrados ${result.length} resultados via MCP`);
        this.cacheResult(cacheKey, result);
        return result;
      } catch (error) {
        console.warn('⚠️ Falha na busca via MCP, usando fallback:', error.message);
      }
    }
    
    // Fallback: busca direta
    return await this.directNeo4jSearch(query, options);
  }

  /**
   * Buscar memórias com formato correto
   */
  async searchMemories(params = {}) {
    console.log('🔍 Buscando memórias...');
    
    // Tentar via MCP primeiro
    if (this.mcp && this.mcp.connected) {
      try {
        const memories = await this.mcp.searchMemories(params);
        console.log(`✅ Encontradas ${memories.length} memórias via MCP`);
        return { memories };
      } catch (error) {
        console.warn('⚠️ Falha na busca via MCP, usando fallback:', error.message);
      }
    }
    
    // Fallback: busca direta
    const directResult = await this.directNeo4jSearch(params.query || '', params);
    return { memories: directResult };
  }

  /**
   * Busca direta no Neo4j
   */
  async directNeo4jSearch(query, options = {}) {
    await this.initDirectConnection();
    
    const cypherQuery = `
      MATCH (n)
      WHERE n.content CONTAINS $query 
        OR n.name CONTAINS $query
        OR n.description CONTAINS $query
      RETURN n
      ORDER BY n.timestamp DESC
      LIMIT $limit
    `;
    
    try {
      const result = await this.session.run(cypherQuery, {
        query,
        limit: neo4j.int(options.limit || 10)
      });
      
      const memories = result.records.map(record => {
        const node = record.get('n');
        return {
          memory: node.properties,
          connections: []
        };
      });
      
      console.log(`✅ Encontrados ${memories.length} resultados diretos`);
      this.cacheResult(cypherQuery, memories);
      return memories;
    } catch (error) {
      console.error('❌ Erro na busca direta:', error);
      return [];
    }
  }

  /**
   * Construir prompt com contexto
   */
  async buildContextualPrompt(userMessage, sessionId) {
    const contexts = [];
    
    // 1. Buscar contexto relevante
    const relevantMemories = await this.searchContext(userMessage, {
      limit: 5,
      depth: 2
    });
    
    if (relevantMemories.length > 0) {
      contexts.push('Contexto relevante:');
      relevantMemories.forEach(mem => {
        if (mem.memory) {
          const content = mem.memory.content || mem.memory.name || JSON.stringify(mem.memory);
          contexts.push(`- ${content}`);
        }
      });
    }
    
    // 2. Buscar histórico da sessão
    if (sessionId) {
      const sessionHistory = await this.getSessionHistory(sessionId, 5);
      if (sessionHistory.length > 0) {
        contexts.push('\nHistórico recente:');
        sessionHistory.forEach(msg => {
          contexts.push(`- ${msg.role}: ${msg.content.substring(0, 100)}...`);
        });
      }
    }
    
    // 3. Construir prompt final
    if (contexts.length > 0) {
      return `${contexts.join('\n')}\n\nMensagem do usuário: ${userMessage}`;
    }
    
    return userMessage;
  }

  /**
   * Obter histórico da sessão
   */
  async getSessionHistory(sessionId, limit = 10) {
    console.log(`📜 Buscando histórico da sessão ${sessionId}...`);
    
    // Tentar via MCP
    if (this.mcp && this.mcp.connected) {
      try {
        const history = await this.mcp.searchMemories({
          query: sessionId,
          label: 'message',
          limit
        });
        
        return history.map(h => ({
          role: h.memory.type || 'user',
          content: h.memory.content || ''
        }));
      } catch (error) {
        console.warn('⚠️ Falha ao buscar histórico via MCP');
      }
    }
    
    // Fallback: busca direta
    return await this.directGetSessionHistory(sessionId, limit);
  }

  /**
   * Buscar histórico direto no Neo4j
   */
  async directGetSessionHistory(sessionId, limit) {
    await this.initDirectConnection();
    
    const query = `
      MATCH (s:Session {id: $sessionId})-[:HAS_MESSAGE]->(m:Message)
      RETURN m
      ORDER BY m.timestamp DESC
      LIMIT $limit
    `;
    
    try {
      const result = await this.session.run(query, {
        sessionId,
        limit: neo4j.int(limit)
      });
      
      return result.records.map(record => {
        const msg = record.get('m').properties;
        return {
          role: msg.type || 'user',
          content: msg.content || ''
        };
      }).reverse();
    } catch (error) {
      console.error('❌ Erro ao buscar histórico direto:', error);
      return [];
    }
  }

  /**
   * Salvar mensagem no histórico
   */
  async saveMessage(sessionId, message) {
    const messageData = {
      sessionId,
      content: message.content,
      type: message.role || 'user',
      timestamp: new Date().toISOString(),
      ...message.metadata
    };
    
    // Tentar via MCP
    if (this.mcp && this.mcp.connected) {
      try {
        await this.mcp.createMemory('message', messageData);
        console.log('✅ Mensagem salva via MCP');
        return;
      } catch (error) {
        console.warn('⚠️ Falha ao salvar via MCP, usando fallback');
      }
    }
    
    // Fallback: salvar direto
    await this.directSaveMessage(sessionId, messageData);
  }

  /**
   * Salvar mensagem diretamente
   */
  async directSaveMessage(sessionId, messageData) {
    await this.initDirectConnection();
    
    const query = `
      MERGE (s:Session {id: $sessionId})
      CREATE (m:Message {
        id: $messageId,
        content: $content,
        type: $type,
        timestamp: datetime($timestamp)
      })
      CREATE (s)-[:HAS_MESSAGE]->(m)
      RETURN m
    `;
    
    try {
      await this.session.run(query, {
        sessionId,
        messageId: `msg_${Date.now()}`,
        content: messageData.content,
        type: messageData.type,
        timestamp: messageData.timestamp
      });
      
      console.log('✅ Mensagem salva diretamente no Neo4j');
    } catch (error) {
      console.error('❌ Erro ao salvar mensagem diretamente:', error);
    }
  }

  /**
   * Cache de resultados
   */
  cacheResult(key, data) {
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
    
    // Limpar cache antigo
    if (this.cache.size > 100) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
  }

  /**
   * Limpar cache
   */
  clearCache() {
    this.cache.clear();
  }

  /**
   * Verificar se está conectado
   */
  isConnected() {
    return this.mcp?.connected || false;
  }

  /**
   * Listar labels de memória
   */
  async listMemoryLabels() {
    console.log('🏷️ Listando labels de memória...');
    
    // Tentar via MCP primeiro
    if (this.mcp && this.mcp.connected) {
      try {
        const labels = await this.mcp.listMemoryLabels();
        console.log(`✅ Encontrados ${labels.length} labels via MCP`);
        return labels;
      } catch (error) {
        console.warn('⚠️ Falha ao listar labels via MCP, usando fallback:', error.message);
      }
    }
    
    // Fallback: busca direta
    return await this.directListMemoryLabels();
  }

  /**
   * Criar nova memória
   * Aceita tanto createMemory(label, properties) quanto createMemory({ label, properties })
   */
  async createMemory(labelOrObject, properties) {
    let label, props;
    
    // Compatibilidade: aceitar tanto objeto quanto parâmetros separados
    if (typeof labelOrObject === 'object' && labelOrObject.label) {
      // Chamada: createMemory({ label, properties })
      label = labelOrObject.label;
      props = labelOrObject.properties || {};
    } else {
      // Chamada: createMemory(label, properties)
      label = labelOrObject;
      props = properties || {};
    }
    
    console.log(`📝 Criando memória com label: ${label}...`);
    
    // Tentar via MCP primeiro
    if (this.mcp && this.mcp.connected) {
      try {
        const result = await this.mcp.createMemory(label, props);
        console.log('✅ Memória criada via MCP');
        this.clearCache();
        return result;
      } catch (error) {
        console.warn('⚠️ Falha ao criar via MCP, usando fallback:', error.message);
      }
    }
    
    // Fallback: criação direta
    return await this.directCreateMemory(label, props);
  }

  /**
   * Atualizar memória existente
   * Aceita tanto updateMemory(nodeId, properties) quanto updateMemory({ nodeId, properties })
   */
  async updateMemory(nodeIdOrObject, properties) {
    let nodeId, props;
    
    // Compatibilidade: aceitar tanto objeto quanto parâmetros separados
    if (typeof nodeIdOrObject === 'object' && nodeIdOrObject.nodeId !== undefined) {
      // Chamada: updateMemory({ nodeId, properties })
      nodeId = nodeIdOrObject.nodeId;
      props = nodeIdOrObject.properties || {};
    } else {
      // Chamada: updateMemory(nodeId, properties)
      nodeId = nodeIdOrObject;
      props = properties || {};
    }
    
    console.log(`📝 Atualizando memória ${nodeId}...`);
    
    // Tentar via MCP primeiro
    if (this.mcp && this.mcp.connected) {
      try {
        const result = await this.mcp.updateMemory(nodeId, props);
        console.log('✅ Memória atualizada via MCP');
        this.clearCache();
        return result;
      } catch (error) {
        console.warn('⚠️ Falha ao atualizar via MCP, usando fallback:', error.message);
      }
    }
    
    // Fallback: atualização direta
    return await this.directUpdateMemory(nodeId, props);
  }

  /**
   * Criar conexão entre memórias
   * Aceita tanto createConnection(fromMemoryId, toMemoryId, type, properties) quanto createConnection({ fromMemoryId, toMemoryId, type, properties })
   */
  async createConnection(fromMemoryIdOrObject, toMemoryId, type, properties = {}) {
    let fromMemoryId, toId, connType, props;
    
    // Compatibilidade: aceitar tanto objeto quanto parâmetros separados
    if (typeof fromMemoryIdOrObject === 'object' && fromMemoryIdOrObject.fromMemoryId !== undefined) {
      // Chamada: createConnection({ fromMemoryId, toMemoryId, type, properties })
      fromMemoryId = fromMemoryIdOrObject.fromMemoryId;
      toId = fromMemoryIdOrObject.toMemoryId;
      connType = fromMemoryIdOrObject.type;
      props = fromMemoryIdOrObject.properties || {};
    } else {
      // Chamada: createConnection(fromMemoryId, toMemoryId, type, properties)
      fromMemoryId = fromMemoryIdOrObject;
      toId = toMemoryId;
      connType = type;
      props = properties;
    }
    
    console.log(`🔗 Criando conexão ${connType}: ${fromMemoryId} -> ${toId}...`);
    
    // Tentar via MCP primeiro
    if (this.mcp && this.mcp.connected) {
      try {
        const result = await this.mcp.createConnection(fromMemoryId, toId, connType, props);
        console.log('✅ Conexão criada via MCP');
        this.clearCache();
        return result;
      } catch (error) {
        console.warn('⚠️ Falha ao criar conexão via MCP, usando fallback:', error.message);
      }
    }
    
    // Fallback: criação direta
    return await this.directCreateConnection(fromMemoryId, toId, connType, props);
  }

  /**
   * Deletar memória
   * Aceita tanto deleteMemory(nodeId) quanto deleteMemory({ nodeId })
   */
  async deleteMemory(nodeIdOrObject) {
    let nodeId;
    
    // Compatibilidade: aceitar tanto objeto quanto parâmetro direto
    if (typeof nodeIdOrObject === 'object' && nodeIdOrObject.nodeId !== undefined) {
      // Chamada: deleteMemory({ nodeId })
      nodeId = nodeIdOrObject.nodeId;
    } else {
      // Chamada: deleteMemory(nodeId)
      nodeId = nodeIdOrObject;
    }
    
    console.log(`🗑️ Deletando memória ${nodeId}...`);
    
    // Tentar via MCP primeiro
    if (this.mcp && this.mcp.connected) {
      try {
        const result = await this.mcp.deleteMemory(nodeId);
        console.log('✅ Memória deletada via MCP');
        this.clearCache();
        return result;
      } catch (error) {
        console.warn('⚠️ Falha ao deletar via MCP, usando fallback:', error.message);
      }
    }
    
    // Fallback: deleção direta
    return await this.directDeleteMemory(nodeId);
  }

  /**
   * Deletar conexão entre memórias
   */
  async deleteConnection(fromMemoryId, toMemoryId, type) {
    console.log(`🗑️ Deletando conexão ${type}: ${fromMemoryId} -> ${toMemoryId}...`);
    
    // Tentar via MCP primeiro (se método existir)
    if (this.mcp && this.mcp.connected && typeof this.mcp.deleteConnection === 'function') {
      try {
        const result = await this.mcp.deleteConnection(fromMemoryId, toMemoryId, type);
        console.log('✅ Conexão deletada via MCP');
        this.clearCache();
        return result;
      } catch (error) {
        console.warn('⚠️ Falha ao deletar conexão via MCP, usando fallback:', error.message);
      }
    }
    
    // Fallback: deleção direta
    return await this.directDeleteConnection(fromMemoryId, toMemoryId, type);
  }

  // === Métodos de fallback direto ===

  /**
   * Listar labels diretamente no Neo4j
   */
  async directListMemoryLabels() {
    await this.initDirectConnection();
    
    const query = `
      CALL db.labels() YIELD label
      RETURN collect(label) as labels
    `;
    
    try {
      const result = await this.session.run(query);
      const labels = result.records[0]?.get('labels') || [];
      console.log(`✅ Encontrados ${labels.length} labels diretos`);
      return labels;
    } catch (error) {
      console.error('❌ Erro ao listar labels diretamente:', error);
      return [];
    }
  }

  /**
   * Criar memória diretamente no Neo4j
   */
  async directCreateMemory(label, properties) {
    await this.initDirectConnection();
    
    const query = `
      CREATE (n:${label} $properties)
      RETURN n, ID(n) as nodeId
    `;
    
    try {
      const result = await this.session.run(query, { properties });
      const record = result.records[0];
      const node = record.get('n');
      const nodeId = record.get('nodeId');
      
      console.log(`✅ Memória criada diretamente com ID ${nodeId}`);
      this.clearCache();
      return {
        memory: {
          _id: nodeId.toNumber(),
          label,
          ...node.properties
        }
      };
    } catch (error) {
      console.error('❌ Erro ao criar memória diretamente:', error);
      throw error;
    }
  }

  /**
   * Atualizar memória diretamente no Neo4j
   */
  async directUpdateMemory(nodeId, properties) {
    await this.initDirectConnection();
    
    const query = `
      MATCH (n) WHERE ID(n) = $nodeId
      SET n += $properties
      RETURN n
    `;
    
    try {
      const result = await this.session.run(query, {
        nodeId: neo4j.int(nodeId),
        properties
      });
      
      if (result.records.length === 0) {
        throw new Error(`Memória com ID ${nodeId} não encontrada`);
      }
      
      const node = result.records[0].get('n');
      console.log(`✅ Memória ${nodeId} atualizada diretamente`);
      this.clearCache();
      return {
        memory: {
          _id: nodeId,
          ...node.properties
        }
      };
    } catch (error) {
      console.error('❌ Erro ao atualizar memória diretamente:', error);
      throw error;
    }
  }

  /**
   * Criar conexão diretamente no Neo4j
   */
  async directCreateConnection(fromMemoryId, toMemoryId, type, properties = {}) {
    await this.initDirectConnection();
    
    const query = `
      MATCH (from) WHERE ID(from) = $fromId
      MATCH (to) WHERE ID(to) = $toId
      CREATE (from)-[r:${type} $properties]->(to)
      RETURN r, ID(r) as relId
    `;
    
    try {
      const result = await this.session.run(query, {
        fromId: neo4j.int(fromMemoryId),
        toId: neo4j.int(toMemoryId),
        properties
      });
      
      if (result.records.length === 0) {
        throw new Error(`Não foi possível criar conexão entre ${fromMemoryId} e ${toMemoryId}`);
      }
      
      const relationship = result.records[0].get('r');
      const relId = result.records[0].get('relId');
      
      console.log(`✅ Conexão ${type} criada diretamente com ID ${relId}`);
      this.clearCache();
      return {
        connection: {
          _id: relId.toNumber(),
          type,
          fromMemoryId,
          toMemoryId,
          ...relationship.properties
        }
      };
    } catch (error) {
      console.error('❌ Erro ao criar conexão diretamente:', error);
      throw error;
    }
  }

  /**
   * Deletar memória diretamente no Neo4j
   */
  async directDeleteMemory(nodeId) {
    await this.initDirectConnection();
    
    const query = `
      MATCH (n) WHERE ID(n) = $nodeId
      DETACH DELETE n
      RETURN count(n) as deleted
    `;
    
    try {
      const result = await this.session.run(query, {
        nodeId: neo4j.int(nodeId)
      });
      
      const deleted = result.records[0]?.get('deleted')?.toNumber() || 0;
      
      if (deleted === 0) {
        throw new Error(`Memória com ID ${nodeId} não encontrada`);
      }
      
      console.log(`✅ Memória ${nodeId} deletada diretamente`);
      this.clearCache();
      return { success: true, deleted };
    } catch (error) {
      console.error('❌ Erro ao deletar memória diretamente:', error);
      throw error;
    }
  }

  /**
   * Deletar conexão diretamente no Neo4j
   */
  async directDeleteConnection(fromMemoryId, toMemoryId, type) {
    await this.initDirectConnection();
    
    const query = `
      MATCH (from)-[r:${type}]->(to)
      WHERE ID(from) = $fromId AND ID(to) = $toId
      DELETE r
      RETURN count(r) as deleted
    `;
    
    try {
      const result = await this.session.run(query, {
        fromId: neo4j.int(fromMemoryId),
        toId: neo4j.int(toMemoryId)
      });
      
      const deleted = result.records[0]?.get('deleted')?.toNumber() || 0;
      
      if (deleted === 0) {
        throw new Error(`Conexão ${type} entre ${fromMemoryId} e ${toMemoryId} não encontrada`);
      }
      
      console.log(`✅ Conexão ${type} deletada diretamente`);
      this.clearCache();
      return { success: true, deleted };
    } catch (error) {
      console.error('❌ Erro ao deletar conexão diretamente:', error);
      throw error;
    }
  }

  /**
   * Status do serviço
   */
  getStatus() {
    return {
      mcpConnected: this.mcp?.connected || false,
      directConnectionAvailable: !!this.driver,
      cacheSize: this.cache.size,
      neo4jUri: this.neo4jConfig.uri
    };
  }

  /**
   * Fechar conexões
   */
  async close() {
    if (this.session) {
      await this.session.close();
      this.session = null;
    }
    
    if (this.driver) {
      await this.driver.close();
      this.driver = null;
    }
    
    this.clearCache();
    console.log('🔌 Neo4j RAG Service fechado');
  }
}

module.exports = Neo4jRAGService;