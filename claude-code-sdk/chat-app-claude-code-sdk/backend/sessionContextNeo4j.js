// Sistema de contexto de sessão integrado com Neo4j
class SessionContextNeo4j {
  constructor(mcpClient, fallbackManager = null) {
    this.mcpClient = mcpClient;
    this.fallback = fallbackManager; // SessionContextManager como fallback
    this.localCache = new Map(); // Cache local para performance
  }

  // Adicionar mensagem ao contexto da sessão
  async addToContext(sessionId, role, content) {
    try {
      // Salvar no Neo4j se disponível
      if (this.mcpClient && this.mcpClient.connected) {
        // Criar memória da mensagem no Neo4j
        const memory = await this.mcpClient.createMemory({
          label: 'message',
          properties: {
            sessionId,
            role,
            content,
            timestamp: Date.now()
          }
        });

        // Buscar ou criar memória da sessão
        const sessionSearch = await this.mcpClient.searchMemories({
          query: `sessionId:${sessionId}`,
          label: 'session',
          limit: 1
        });

        let sessionMemory;
        if (sessionSearch && sessionSearch.length > 0) {
          sessionMemory = sessionSearch[0];
          
          // Atualizar último acesso
          await this.mcpClient.updateMemory({
            nodeId: sessionMemory.id,
            properties: {
              lastActivity: Date.now(),
              messageCount: (sessionMemory.properties.messageCount || 0) + 1
            }
          });
        } else {
          // Criar nova sessão
          sessionMemory = await this.mcpClient.createMemory({
            label: 'session',
            properties: {
              sessionId,
              createdAt: Date.now(),
              lastActivity: Date.now(),
              messageCount: 1
            }
          });
        }

        // Conectar mensagem à sessão
        if (memory && sessionMemory) {
          await this.mcpClient.createConnection({
            fromMemoryId: memory.id,
            toMemoryId: sessionMemory.id,
            type: 'BELONGS_TO',
            properties: {
              timestamp: Date.now()
            }
          });
        }

        // Atualizar cache local
        if (!this.localCache.has(sessionId)) {
          this.localCache.set(sessionId, []);
        }
        this.localCache.get(sessionId).push({ role, content, timestamp: Date.now() });

        console.log(`📝 [NEO4J-CONTEXT] Added ${role} message to session ${sessionId.slice(0, 8)}`);
        return true;
      }
    } catch (error) {
      console.error('❌ [NEO4J-CONTEXT] Error saving to Neo4j:', error);
    }

    // Fallback para memória local se Neo4j falhar
    if (this.fallback) {
      this.fallback.addToContext(sessionId, role, content);
      console.log('⚠️ [NEO4J-CONTEXT] Using fallback memory manager');
    }
  }

  // Obter contexto formatado para enviar ao Claude
  async getFormattedContext(sessionId, currentMessage) {
    let contextMessages = [];

    try {
      // Tentar buscar do Neo4j primeiro
      if (this.mcpClient && this.mcpClient.connected) {
        const messages = await this.mcpClient.searchMemories({
          query: `sessionId:${sessionId}`,
          label: 'message',
          limit: 20,
          order_by: 'timestamp DESC'
        });

        if (messages && messages.length > 0) {
          contextMessages = messages
            .map(m => ({
              role: m.properties.role,
              content: m.properties.content,
              timestamp: m.properties.timestamp
            }))
            .reverse(); // Reverter para ordem cronológica

          console.log(`📚 [NEO4J-CONTEXT] Retrieved ${contextMessages.length} messages from Neo4j`);
        }
      }
    } catch (error) {
      console.error('❌ [NEO4J-CONTEXT] Error fetching from Neo4j:', error);
    }

    // Se não conseguiu do Neo4j, tentar cache local ou fallback
    if (contextMessages.length === 0) {
      if (this.localCache.has(sessionId)) {
        contextMessages = this.localCache.get(sessionId);
      } else if (this.fallback) {
        return this.fallback.getFormattedContext(sessionId, currentMessage);
      }
    }

    // Se não há contexto, retornar mensagem original
    if (contextMessages.length === 0) {
      return currentMessage;
    }

    // Construir prompt com contexto
    let contextPrompt = "Contexto da conversa anterior:\n";
    
    // Adicionar últimas mensagens para contexto
    const recentMessages = contextMessages.slice(-10); // Últimas 10 mensagens
    
    recentMessages.forEach(msg => {
      if (msg.role === 'user') {
        contextPrompt += `\nUsuário: ${msg.content}`;
      } else {
        contextPrompt += `\nAssistente: ${msg.content}`;
      }
    });

    // Extrair informações importantes (nome do usuário, etc)
    const userInfo = await this.extractUserInfo(contextMessages);
    if (userInfo) {
      contextPrompt += `\n\nInformações do usuário:`;
      if (userInfo.name) contextPrompt += `\n- Nome: ${userInfo.name}`;
      if (userInfo.preferences) contextPrompt += `\n- Preferências: ${userInfo.preferences}`;
    }

    contextPrompt += `\n\n---\nNova mensagem do usuário: ${currentMessage}`;
    contextPrompt += `\n\nIMPORTANTE: Use o contexto acima para responder de forma coerente e lembrando das informações anteriores da conversa.`;
    
    // Log detalhado do contexto sendo usado
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('📚 CONTEXTO SENDO ENVIADO AO CLAUDE:');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`Session ID: ${sessionId}`);
    console.log(`Mensagens no contexto: ${recentMessages.length}`);
    if (userInfo && userInfo.name) {
      console.log(`👤 Nome do usuário detectado: ${userInfo.name}`);
    }
    console.log('---');
    console.log(contextPrompt.substring(0, 500) + '...');
    console.log('═══════════════════════════════════════════════════════════════');
    
    return contextPrompt;
  }

  // Extrair informações do usuário do contexto
  async extractUserInfo(messages) {
    const userInfo = {};

    for (const msg of messages) {
      if (msg.role === 'user') {
        // Detectar nome
        const nameMatch = msg.content.match(/(?:meu nome é|me chamo|sou o|sou a) (\w+)/i);
        if (nameMatch) {
          userInfo.name = nameMatch[1];
        }

        // Detectar preferências
        const prefMatch = msg.content.match(/(?:prefiro|gosto de|quero) (.+)/i);
        if (prefMatch) {
          userInfo.preferences = prefMatch[1];
        }
      }
    }

    return Object.keys(userInfo).length > 0 ? userInfo : null;
  }

  // Limpar contexto de uma sessão
  async clearContext(sessionId) {
    try {
      if (this.mcpClient && this.mcpClient.connected) {
        // Buscar e deletar todas as mensagens da sessão
        const messages = await this.mcpClient.searchMemories({
          query: `sessionId:${sessionId}`,
          label: 'message'
        });

        for (const msg of messages) {
          await this.mcpClient.deleteMemory({ nodeId: msg.id });
        }

        // Deletar sessão
        const sessions = await this.mcpClient.searchMemories({
          query: `sessionId:${sessionId}`,
          label: 'session'
        });

        for (const session of sessions) {
          await this.mcpClient.deleteMemory({ nodeId: session.id });
        }
      }
    } catch (error) {
      console.error('❌ [NEO4J-CONTEXT] Error clearing context:', error);
    }

    // Limpar cache local
    this.localCache.delete(sessionId);

    // Limpar fallback também
    if (this.fallback) {
      this.fallback.clearContext(sessionId);
    }

    console.log(`🧹 [NEO4J-CONTEXT] Cleared context for session ${sessionId.slice(0, 8)}`);
  }

  // Obter estatísticas
  async getStats() {
    const stats = {
      neo4jConnected: this.mcpClient && this.mcpClient.connected,
      localCacheSessions: this.localCache.size,
      totalMessages: 0
    };

    try {
      if (this.mcpClient && this.mcpClient.connected) {
        const messages = await this.mcpClient.searchMemories({
          label: 'message',
          limit: 1000
        });
        stats.totalMessages = messages.length;
      }
    } catch (error) {
      console.error('Error getting stats:', error);
    }

    return stats;
  }
}

module.exports = SessionContextNeo4j;