// Sistema de contexto de sessão simples
class SessionContextManager {
  constructor() {
    // Armazena contexto de cada sessão
    this.sessionContexts = new Map();
    
    // Limpar contextos antigos a cada hora
    setInterval(() => this.cleanOldContexts(), 3600000);
  }

  // Adicionar mensagem ao contexto da sessão
  addToContext(sessionId, role, content) {
    if (!this.sessionContexts.has(sessionId)) {
      this.sessionContexts.set(sessionId, {
        messages: [],
        createdAt: Date.now(),
        lastActivity: Date.now()
      });
    }

    const context = this.sessionContexts.get(sessionId);
    
    // Adicionar mensagem ao histórico
    context.messages.push({
      role,
      content,
      timestamp: Date.now()
    });

    // Limitar a 20 mensagens mais recentes para economizar memória
    if (context.messages.length > 20) {
      context.messages = context.messages.slice(-20);
    }

    context.lastActivity = Date.now();
    
    console.log(`📝 [CONTEXT] Added ${role} message to session ${sessionId.slice(0, 8)}. Total messages: ${context.messages.length}`);
  }

  // Obter contexto formatado para enviar ao Claude
  getFormattedContext(sessionId, currentMessage) {
    const context = this.sessionContexts.get(sessionId);
    
    if (!context || context.messages.length === 0) {
      return currentMessage;
    }

    // Construir prompt com contexto
    let contextPrompt = "Contexto da conversa anterior:\n";
    
    // Adicionar últimas mensagens para contexto
    const recentMessages = context.messages.slice(-10); // Últimas 10 mensagens
    
    recentMessages.forEach(msg => {
      if (msg.role === 'user') {
        contextPrompt += `\nUsuário: ${msg.content}`;
      } else {
        contextPrompt += `\nAssistente: ${msg.content}`;
      }
    });

    contextPrompt += `\n\n---\nNova mensagem do usuário: ${currentMessage}`;
    contextPrompt += `\n\nIMPORTANTE: Use o contexto acima para responder de forma coerente e lembrando das informações anteriores da conversa.`;
    
    return contextPrompt;
  }

  // Obter resumo do contexto
  getContextSummary(sessionId) {
    const context = this.sessionContexts.get(sessionId);
    
    if (!context) {
      return null;
    }

    // Extrair informações importantes do contexto
    const summary = {
      messageCount: context.messages.length,
      sessionAge: Date.now() - context.createdAt,
      lastActivity: Date.now() - context.lastActivity
    };

    // Tentar extrair nome do usuário se mencionado
    const userNameMatch = context.messages.find(msg => 
      msg.content.match(/meu nome é (\w+)/i) || 
      msg.content.match(/me chamo (\w+)/i) ||
      msg.content.match(/sou o (\w+)/i) ||
      msg.content.match(/sou a (\w+)/i)
    );

    if (userNameMatch) {
      const match = userNameMatch.content.match(/(?:meu nome é|me chamo|sou o|sou a) (\w+)/i);
      if (match) {
        summary.userName = match[1];
      }
    }

    return summary;
  }

  // Limpar contexto de uma sessão
  clearContext(sessionId) {
    this.sessionContexts.delete(sessionId);
    console.log(`🧹 [CONTEXT] Cleared context for session ${sessionId.slice(0, 8)}`);
  }

  // Limpar contextos antigos (mais de 2 horas sem atividade)
  cleanOldContexts() {
    const twoHoursAgo = Date.now() - 7200000;
    let cleaned = 0;

    for (const [sessionId, context] of this.sessionContexts.entries()) {
      if (context.lastActivity < twoHoursAgo) {
        this.sessionContexts.delete(sessionId);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      console.log(`🧹 [CONTEXT] Cleaned ${cleaned} old session contexts`);
    }
  }

  // Obter estatísticas
  getStats() {
    const stats = {
      totalSessions: this.sessionContexts.size,
      totalMessages: 0,
      averageMessagesPerSession: 0
    };

    for (const context of this.sessionContexts.values()) {
      stats.totalMessages += context.messages.length;
    }

    if (stats.totalSessions > 0) {
      stats.averageMessagesPerSession = Math.round(stats.totalMessages / stats.totalSessions);
    }

    return stats;
  }
}

module.exports = SessionContextManager;