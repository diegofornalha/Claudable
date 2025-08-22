class MetricsAggregator {
  constructor() {
    this.metrics = {
      totalMessages: 0,
      totalTokensUsed: 0,
      totalCost: 0,
      sessions: new Map(),
      hourlyMetrics: new Map(),
      startTime: Date.now()
    };
    
    // Inicializar métricas por hora das últimas 24h
    this.initializeHourlyMetrics();
  }
  
  initializeHourlyMetrics() {
    const now = new Date();
    for (let i = 23; i >= 0; i--) {
      const hour = new Date(now);
      hour.setHours(hour.getHours() - i);
      const hourKey = `${hour.getHours()}:00`;
      
      this.metrics.hourlyMetrics.set(hourKey, {
        hour: hourKey,
        messages: 0,
        tokens: 0,
        cost: 0
      });
    }
  }
  
  addMessage(sessionId, messageData) {
    // Atualizar métricas globais
    this.metrics.totalMessages++;
    
    const tokens = messageData.tokens || 0;
    const cost = this.calculateCost(tokens);
    
    this.metrics.totalTokensUsed += tokens;
    this.metrics.totalCost += cost;
    
    // Atualizar métricas da sessão
    if (!this.metrics.sessions.has(sessionId)) {
      this.metrics.sessions.set(sessionId, {
        sessionId,
        messageCount: 0,
        totalTokens: 0,
        totalCost: 0,
        startTime: Date.now(),
        lastActivity: Date.now()
      });
    }
    
    const session = this.metrics.sessions.get(sessionId);
    session.messageCount++;
    session.totalTokens += tokens;
    session.totalCost += cost;
    session.lastActivity = Date.now();
    
    // Atualizar métricas por hora
    const now = new Date();
    const hourKey = `${now.getHours()}:00`;
    
    if (this.metrics.hourlyMetrics.has(hourKey)) {
      const hourMetric = this.metrics.hourlyMetrics.get(hourKey);
      hourMetric.messages++;
      hourMetric.tokens += tokens;
      hourMetric.cost += cost;
    }
    
    return {
      sessionMetrics: session,
      globalMetrics: this.getGlobalMetrics()
    };
  }
  
  calculateCost(tokens) {
    // Preços aproximados do Claude 3.5 Sonnet
    // Input: $3 per million tokens
    // Output: $15 per million tokens
    // Usando média de $9 per million tokens
    const costPerToken = 9 / 1000000;
    return tokens * costPerToken;
  }
  
  getGlobalMetrics() {
    const activeSessions = Array.from(this.metrics.sessions.values())
      .filter(s => Date.now() - s.lastActivity < 300000) // 5 minutos de inatividade
      .length;
    
    return {
      totalMessages: this.metrics.totalMessages,
      totalTokensUsed: this.metrics.totalTokensUsed,
      totalCost: this.metrics.totalCost,
      activeSessions,
      uptime: Math.floor((Date.now() - this.metrics.startTime) / 1000)
    };
  }
  
  getSessionMetrics(sessionId) {
    return this.metrics.sessions.get(sessionId) || null;
  }
  
  getTopSessions(limit = 5) {
    const sessions = Array.from(this.metrics.sessions.values());
    
    return sessions
      .sort((a, b) => b.totalCost - a.totalCost)
      .slice(0, limit)
      .map(s => ({
        sessionId: s.sessionId,
        messages: s.messageCount,
        cost: s.totalCost
      }));
  }
  
  getHourlyMetrics() {
    return Array.from(this.metrics.hourlyMetrics.values());
  }
  
  getFullMetrics(activeConnections = 0) {
    const activeSessions = Array.from(this.metrics.sessions.values())
      .filter(s => Date.now() - s.lastActivity < 300000)
      .length;
    
    // Calcular tempo médio de resposta (simulado por enquanto)
    const avgResponseTime = this.metrics.totalMessages > 0 
      ? Math.random() * 500 + 500 // Entre 500-1000ms
      : 0;
    
    return {
      totalMessages: this.metrics.totalMessages,
      totalTokensUsed: this.metrics.totalTokensUsed,
      totalCost: this.metrics.totalCost,
      activeConnections,
      activeSessions,
      sessions: Array.from(this.metrics.sessions.values()),
      uptime: Math.floor((Date.now() - this.metrics.startTime) / 1000),
      avgResponseTime,
      hourlyMetrics: this.getHourlyMetrics(),
      topSessions: this.getTopSessions()
    };
  }
  
  // Método para limpar sessões antigas (pode ser chamado periodicamente)
  cleanOldSessions() {
    const oneHourAgo = Date.now() - 3600000;
    
    for (const [sessionId, session] of this.metrics.sessions) {
      if (session.lastActivity < oneHourAgo) {
        this.metrics.sessions.delete(sessionId);
      }
    }
  }
  
  // Método para exportar métricas
  exportMetrics() {
    return {
      exportedAt: new Date().toISOString(),
      metrics: {
        global: this.getGlobalMetrics(),
        sessions: Array.from(this.metrics.sessions.values()),
        hourly: this.getHourlyMetrics(),
        topSessions: this.getTopSessions(10)
      }
    };
  }
  
  // Método para resetar métricas (use com cuidado!)
  resetMetrics() {
    this.metrics = {
      totalMessages: 0,
      totalTokensUsed: 0,
      totalCost: 0,
      sessions: new Map(),
      hourlyMetrics: new Map(),
      startTime: Date.now()
    };
    
    this.initializeHourlyMetrics();
  }
}

module.exports = MetricsAggregator;