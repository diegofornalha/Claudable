/**
 * Context Engine Unificado
 * Integra MCP (Neo4j Memory) com A2A (Agentes) e MemoryMiddleware
 */

class ContextEngine {
  constructor(mcpClient, a2aClient, memoryMiddleware = null) {
    this.mcp = mcpClient;    // Neo4j MCP para memória
    this.a2a = a2aClient;    // A2A Client para agentes
    this.memoryMiddleware = memoryMiddleware; // Middleware de memória unificado
    this.sessions = new Map(); // Cache de sessões
    this.contextCache = new Map(); // Cache de contexto
  }
  
  /**
   * Configurar MemoryMiddleware após inicialização
   */
  setMemoryMiddleware(memoryMiddleware) {
    this.memoryMiddleware = memoryMiddleware;
    console.log('🧠 Context Engine: MemoryMiddleware configured');
  }

  /**
   * Processar mensagem com contexto enriquecido
   */
  async processMessage(message, sessionId, options = {}) {
    const { 
      agentType = 'claude',
      useMemory = true,
      saveToMemory = true,
      maxContextItems = 10,
      userId = 'anonymous'
    } = options;

    try {
      console.log(`🧠 [Context Engine] Processing message with agent: ${agentType}`);
      
      // 1. Se MemoryMiddleware está disponível, usar seu processamento avançado
      let enrichedMessage = { content: message, role: 'user' };
      let context = [];
      let relevantMemories = [];
      
      if (this.memoryMiddleware && useMemory) {
        try {
          // Usar MemoryMiddleware para processamento completo
          const processedMessage = await this.memoryMiddleware.processMessage(
            enrichedMessage,
            userId,
            sessionId
          );
          
          // Extrair contexto do processamento
          if (processedMessage.context) {
            // Converter formato do contexto para compatibilidade
            if (processedMessage.context.session) {
              relevantMemories.push(...processedMessage.context.session);
            }
            if (processedMessage.context.semantic) {
              relevantMemories.push(...processedMessage.context.semantic);
            }
            if (processedMessage.context.domain) {
              context.push(...processedMessage.context.domain);
            }
          }
          
          // Usar mensagem enriquecida
          enrichedMessage = processedMessage;
          
          console.log(`📚 MemoryMiddleware: Found ${relevantMemories.length} memories, intent: ${processedMessage.intent}`);
        } catch (error) {
          console.error('MemoryMiddleware error, fallback to direct MCP:', error);
          // Fallback para busca direta via MCP
          try {
            // Buscar memórias relacionadas
            relevantMemories = await this.mcp.searchMemories({
              query: message,
              limit: maxContextItems,
              depth: 2,
              label: 'message'
            });
            
            // Buscar conhecimento geral
            const knowledge = await this.mcp.searchMemories({
              query: message,
              limit: 5,
              label: 'knowledge'
            });
            
            context = [...relevantMemories, ...knowledge];
            console.log(`📚 Found ${context.length} relevant memories via direct MCP fallback`);
          } catch (fallbackError) {
            console.error('Direct MCP fallback also failed:', fallbackError);
          }
        }
      } else if (useMemory && this.mcp && this.mcp.connected) {
        // Fallback: usar MCP diretamente se MemoryMiddleware não está disponível
        try {
          // Buscar memórias relacionadas
          relevantMemories = await this.mcp.searchMemories({
            query: message,
            limit: maxContextItems,
            depth: 2,
            label: 'message'
          });
          
          // Buscar conhecimento geral
          const knowledge = await this.mcp.searchMemories({
            query: message,
            limit: 5,
            label: 'knowledge'
          });
          
          context = [...relevantMemories, ...knowledge];
          console.log(`📚 Found ${context.length} relevant memories via direct MCP`);
        } catch (error) {
          console.error('Error fetching memories:', error);
        }
      }

      // 2. Enriquecer prompt com contexto
      const messageContent = enrichedMessage.content || enrichedMessage.message || message;
      const enrichedPrompt = this.buildContextualPrompt(messageContent, context, enrichedMessage);
      
      // 3. Escolher agente e processar via A2A
      let response;
      
      if (this.a2a && this.a2a.selectedAgent) {
        // Usar agente A2A selecionado
        console.log(`🤖 Using A2A agent: ${this.a2a.selectedAgent}`);
        
        response = await this.a2a.sendTask(enrichedPrompt, {
          context: {
            sessionId,
            hasMemory: context.length > 0,
            memoryCount: context.length
          },
          streaming: options.streaming || false
        });
        
      } else {
        // Fallback para processamento direto
        console.log('📝 Using direct processing (no A2A agent selected)');
        response = {
          result: `Processed: ${message}`,
          agent: 'direct',
          warning: 'No A2A agent selected'
        };
      }

      // 4. Salvar conversa no Neo4j se habilitado
      if (saveToMemory) {
        // Se MemoryMiddleware já processou, não duplicar
        if (!this.memoryMiddleware && this.mcp && this.mcp.connected) {
          await this.saveConversation(messageContent, response, sessionId, agentType, context);
        }
        // MemoryMiddleware já salvou automaticamente durante processMessage
      }

      // 5. Atualizar cache
      this.updateContextCache(sessionId, messageContent, response);

      return {
        response: response.result || response,
        agent: agentType,
        hasContext: context.length > 0,
        contextUsed: context.length,
        memories: relevantMemories.map(m => ({
          id: m.id,
          type: m.label,
          summary: m.properties?.name || m.properties?.content?.substring(0, 100)
        }))
      };
      
    } catch (error) {
      console.error('❌ [Context Engine] Error:', error);
      throw error;
    }
  }

  /**
   * Construir prompt com contexto
   */
  buildContextualPrompt(message, context, enrichedMessage = null) {
    const sections = [];
    
    // Adicionar informações do processamento se disponível
    if (enrichedMessage) {
      if (enrichedMessage.intent && enrichedMessage.intent !== 'general') {
        sections.push(`🎯 Intenção detectada: ${enrichedMessage.intent}`);
      }
      
      if (enrichedMessage.entities && enrichedMessage.entities.length > 0) {
        const entityTypes = [...new Set(enrichedMessage.entities.map(e => e.type))];
        sections.push(`🔍 Entidades identificadas: ${entityTypes.join(', ')}`);
      }
      
      if (enrichedMessage.userPatterns && enrichedMessage.userPatterns.length > 0) {
        const patterns = enrichedMessage.userPatterns.map(p => p.pattern).slice(0, 3);
        sections.push(`🔄 Padrões do usuário: ${patterns.join(', ')}`);
      }
      
      if (enrichedMessage.previousMessages && enrichedMessage.previousMessages.length > 0) {
        sections.push(`📝 Histórico: ${enrichedMessage.previousMessages.length} mensagens anteriores relevantes`);
      }
    }
    
    if (!context || context.length === 0) {
      if (sections.length > 0) {
        return `${sections.join('\n')}\n\n💬 Mensagem atual do usuário:\n${message}`;
      }
      return message;
    }

    const contextSections = [];
    
    // Agrupar contexto por tipo
    const messageContext = context.filter(c => c.label === 'message');
    const knowledgeContext = context.filter(c => c.label === 'knowledge');
    const otherContext = context.filter(c => !['message', 'knowledge'].includes(c.label));

    // Adicionar contexto de mensagens anteriores
    if (messageContext.length > 0) {
      contextSections.push('📝 Conversas anteriores relevantes:');
      messageContext.forEach(mem => {
        const content = mem.properties?.content || mem.properties?.description || '';
        const timestamp = mem.properties?.timestamp ? new Date(mem.properties.timestamp).toLocaleString() : '';
        contextSections.push(`- [${timestamp}] ${content.substring(0, 200)}`);
      });
    }

    // Adicionar conhecimento relevante
    if (knowledgeContext.length > 0) {
      contextSections.push('\n📚 Conhecimento relevante:');
      knowledgeContext.forEach(mem => {
        const name = mem.properties?.name || 'Unknown';
        const desc = mem.properties?.description || mem.properties?.content || '';
        contextSections.push(`- ${name}: ${desc.substring(0, 200)}`);
      });
    }

    // Adicionar outro contexto
    if (otherContext.length > 0) {
      contextSections.push('\n🔍 Contexto adicional:');
      otherContext.forEach(mem => {
        const label = mem.label || 'unknown';
        const name = mem.properties?.name || mem.properties?.title || '';
        const content = mem.properties?.content || mem.properties?.description || '';
        contextSections.push(`- [${label}] ${name}: ${content.substring(0, 150)}`);
      });
    }

    // Montar prompt final
    return `${contextSections.join('\n')}

💬 Mensagem atual do usuário:
${message}

Por favor, responda considerando o contexto fornecido acima.`;
  }

  /**
   * Salvar conversa no Neo4j
   */
  async saveConversation(userMessage, agentResponse, sessionId, agentType, contextUsed) {
    try {
      // Salvar mensagem do usuário
      const userMsgNode = await this.mcp.createMemory('message', {
        content: userMessage,
        type: 'user',
        session_id: sessionId,
        platform: 'chat_app_sdk',
        timestamp: new Date().toISOString(),
        has_context: contextUsed.length > 0
      });

      // Extrair conteúdo da resposta
      let responseContent = '';
      if (typeof agentResponse === 'string') {
        responseContent = agentResponse;
      } else if (agentResponse.result) {
        responseContent = agentResponse.result;
      } else if (agentResponse.response) {
        responseContent = agentResponse.response;
      } else if (agentResponse.output?.messages?.[0]?.content) {
        responseContent = agentResponse.output.messages[0].content;
      }

      // Salvar resposta do agente
      const agentMsgNode = await this.mcp.createMemory('message', {
        content: responseContent,
        type: 'assistant',
        agent_type: agentType,
        session_id: sessionId,
        platform: 'chat_app_sdk',
        timestamp: new Date().toISOString(),
        has_context: contextUsed.length > 0,
        context_count: contextUsed.length
      });

      // Criar conexão entre mensagens
      if (userMsgNode && agentMsgNode) {
        await this.mcp.createConnection(
          userMsgNode.id,
          agentMsgNode.id,
          'RESPONDED_BY',
          {
            agent: agentType,
            latency_ms: Date.now() - new Date(userMsgNode.properties.timestamp).getTime()
          }
        );
      }

      // Conectar com memórias de contexto usadas
      for (const contextItem of contextUsed) {
        if (contextItem.id && userMsgNode) {
          await this.mcp.createConnection(
            userMsgNode.id,
            contextItem.id,
            'USED_CONTEXT',
            {
              relevance: contextItem.relevance || 0.5
            }
          );
        }
      }

      console.log(`💾 Conversation saved to Neo4j (session: ${sessionId})`);
      
    } catch (error) {
      console.error('Error saving conversation:', error);
      // Não propagar erro - salvar é opcional
    }
  }

  /**
   * Atualizar cache de contexto
   */
  updateContextCache(sessionId, message, response) {
    if (!this.contextCache.has(sessionId)) {
      this.contextCache.set(sessionId, []);
    }
    
    const cache = this.contextCache.get(sessionId);
    cache.push({
      timestamp: Date.now(),
      user: message,
      assistant: response
    });
    
    // Manter apenas últimas 20 interações no cache
    if (cache.length > 20) {
      cache.shift();
    }
  }

  /**
   * Obter resumo da sessão
   */
  async getSessionSummary(sessionId) {
    try {
      // Buscar todas mensagens da sessão
      const messages = await this.mcp.searchMemories({
        query: `session_id:${sessionId}`,
        label: 'message',
        limit: 100
      });

      // Estatísticas
      const userMessages = messages.filter(m => m.properties?.type === 'user');
      const assistantMessages = messages.filter(m => m.properties?.type === 'assistant');
      
      // Agentes usados
      const agentsUsed = new Set(assistantMessages.map(m => m.properties?.agent_type).filter(Boolean));
      
      // Contexto usado
      const contextUsedCount = messages.reduce((sum, m) => 
        sum + (m.properties?.context_count || 0), 0
      );

      return {
        sessionId,
        totalMessages: messages.length,
        userMessages: userMessages.length,
        assistantMessages: assistantMessages.length,
        agentsUsed: Array.from(agentsUsed),
        totalContextUsed: contextUsedCount,
        firstMessage: messages[0]?.properties?.timestamp,
        lastMessage: messages[messages.length - 1]?.properties?.timestamp
      };
      
    } catch (error) {
      console.error('Error getting session summary:', error);
      return null;
    }
  }

  /**
   * Limpar cache de uma sessão
   */
  clearSessionCache(sessionId) {
    this.contextCache.delete(sessionId);
    console.log(`🧹 Cleared context cache for session: ${sessionId}`);
  }

  /**
   * Status do engine
   */
  getStatus() {
    return {
      mcp: {
        connected: this.mcp?.connected || false,
        service: 'Neo4j Memory'
      },
      a2a: {
        connected: this.a2a?.agents?.size > 0 || false,
        selectedAgent: this.a2a?.selectedAgent || null,
        availableAgents: Array.from(this.a2a?.agents?.keys() || [])
      },
      cache: {
        sessions: this.contextCache.size,
        totalCachedInteractions: Array.from(this.contextCache.values())
          .reduce((sum, cache) => sum + cache.length, 0)
      }
    };
  }
}

module.exports = ContextEngine;