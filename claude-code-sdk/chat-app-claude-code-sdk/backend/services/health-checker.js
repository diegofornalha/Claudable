/**
 * Health Checker Service
 * Monitora o status de todos os componentes do sistema
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

class HealthChecker {
  constructor() {
    this.checks = new Map();
    this.lastCheckTime = null;
    this.checkInterval = 30000; // 30 segundos
    this.statusCache = null;
  }

  /**
   * Verifica status do Claude Code SDK
   */
  async checkClaudeSDK() {
    try {
      // Verificar se o processo do Claude está rodando
      const { stdout } = await execAsync('ps aux | grep -i claude | grep -v grep | wc -l');
      const processCount = parseInt(stdout.trim());
      
      // Verificar limite da API
      const now = Math.floor(Date.now() / 1000);
      const resetTime = 1755644400; // Timestamp do reset conhecido
      const isLimitReached = now < resetTime;
      
      return {
        name: 'Claude Code SDK',
        status: processCount > 0 && !isLimitReached ? 'healthy' : 'unhealthy',
        processCount,
        isLimitReached,
        resetIn: isLimitReached ? resetTime - now : 0,
        resetTime: isLimitReached ? new Date(resetTime * 1000).toISOString() : null,
        message: isLimitReached ? 'API limit reached, waiting for reset' : 'SDK operational'
      };
    } catch (error) {
      return {
        name: 'Claude Code SDK',
        status: 'error',
        error: error.message
      };
    }
  }

  /**
   * Verifica conexão MCP Neo4j
   */
  async checkMCPNeo4j(mcpClient) {
    try {
      if (!mcpClient) {
        return {
          name: 'MCP Neo4j',
          status: 'unavailable',
          message: 'MCP client not initialized'
        };
      }

      const isConnected = mcpClient.connected || false;
      const connectionAttempts = mcpClient.connectionAttempts || 0;
      
      return {
        name: 'MCP Neo4j',
        status: isConnected ? 'healthy' : 'unhealthy',
        connected: isConnected,
        connectionAttempts,
        maxRetries: 3,
        message: isConnected ? 'Connected to Neo4j' : 'Connection failed after retries'
      };
    } catch (error) {
      return {
        name: 'MCP Neo4j',
        status: 'error',
        error: error.message
      };
    }
  }

  /**
   * Verifica AI SDK v5
   */
  async checkAISDKv5(agentManagerV2) {
    try {
      const isEnabled = process.env.USE_AI_SDK_V5 !== 'false';
      
      if (!isEnabled) {
        return {
          name: 'AI SDK v5',
          status: 'disabled',
          message: 'AI SDK v5 is disabled by configuration'
        };
      }

      if (!agentManagerV2) {
        return {
          name: 'AI SDK v5',
          status: 'error',
          message: 'AgentManagerV2 not initialized - binding error'
        };
      }

      const stats = agentManagerV2.getStats ? agentManagerV2.getStats() : {};
      
      return {
        name: 'AI SDK v5',
        status: agentManagerV2 ? 'healthy' : 'unhealthy',
        enabled: isEnabled,
        stats,
        message: 'AI SDK v5 operational'
      };
    } catch (error) {
      return {
        name: 'AI SDK v5',
        status: 'error',
        error: error.message,
        possibleCause: 'JavaScript binding error in initialization'
      };
    }
  }

  /**
   * Verifica agentes A2A
   */
  async checkA2AAgents(a2aClient) {
    try {
      if (!a2aClient) {
        return {
          name: 'A2A Agents',
          status: 'unavailable',
          message: 'A2A client not initialized'
        };
      }

      const agents = a2aClient.listAgents ? a2aClient.listAgents() : [];
      const selectedAgent = a2aClient.selectedAgent || null;
      
      return {
        name: 'A2A Agents',
        status: agents.length > 0 ? 'healthy' : 'unhealthy',
        availableAgents: agents.length,
        selectedAgent,
        agents: agents.map(a => ({
          id: a.id,
          name: a.name,
          status: a.status || 'unknown'
        })),
        message: agents.length > 0 ? `${agents.length} agents available` : 'No agents discovered'
      };
    } catch (error) {
      return {
        name: 'A2A Agents',
        status: 'error',
        error: error.message
      };
    }
  }

  /**
   * Verifica Socket.IO
   */
  async checkSocketIO(io) {
    try {
      if (!io) {
        return {
          name: 'Socket.IO',
          status: 'unavailable',
          message: 'Socket.IO not initialized'
        };
      }

      const sockets = await io.fetchSockets();
      
      return {
        name: 'Socket.IO',
        status: 'healthy',
        connectedClients: sockets.length,
        message: `${sockets.length} clients connected`
      };
    } catch (error) {
      return {
        name: 'Socket.IO',
        status: 'error',
        error: error.message
      };
    }
  }

  /**
   * Verifica memória do sistema
   */
  async checkSystemMemory() {
    try {
      const memUsage = process.memoryUsage();
      const totalMemory = require('os').totalmem();
      const freeMemory = require('os').freemem();
      
      const usagePercent = ((totalMemory - freeMemory) / totalMemory) * 100;
      
      return {
        name: 'System Memory',
        status: usagePercent < 90 ? 'healthy' : 'warning',
        usage: {
          rss: `${Math.round(memUsage.rss / 1024 / 1024)}MB`,
          heapTotal: `${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`,
          heapUsed: `${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`,
          external: `${Math.round(memUsage.external / 1024 / 1024)}MB`
        },
        system: {
          total: `${Math.round(totalMemory / 1024 / 1024)}MB`,
          free: `${Math.round(freeMemory / 1024 / 1024)}MB`,
          usagePercent: usagePercent.toFixed(2)
        },
        message: usagePercent < 90 ? 'Memory usage normal' : 'High memory usage detected'
      };
    } catch (error) {
      return {
        name: 'System Memory',
        status: 'error',
        error: error.message
      };
    }
  }

  /**
   * Executa todos os health checks
   */
  async performFullCheck(dependencies = {}) {
    const {
      mcpClient,
      agentManagerV2,
      a2aClient,
      io
    } = dependencies;

    const checks = await Promise.all([
      this.checkClaudeSDK(),
      this.checkMCPNeo4j(mcpClient),
      this.checkAISDKv5(agentManagerV2),
      this.checkA2AAgents(a2aClient),
      this.checkSocketIO(io),
      this.checkSystemMemory()
    ]);

    const overallStatus = this.calculateOverallStatus(checks);
    
    const result = {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      checks: checks.reduce((acc, check) => {
        acc[check.name.toLowerCase().replace(/\s+/g, '_')] = check;
        return acc;
      }, {}),
      summary: {
        total: checks.length,
        healthy: checks.filter(c => c.status === 'healthy').length,
        unhealthy: checks.filter(c => c.status === 'unhealthy').length,
        errors: checks.filter(c => c.status === 'error').length,
        warnings: checks.filter(c => c.status === 'warning').length
      }
    };

    this.statusCache = result;
    this.lastCheckTime = Date.now();
    
    return result;
  }

  /**
   * Calcula status geral baseado nos checks individuais
   */
  calculateOverallStatus(checks) {
    const hasErrors = checks.some(c => c.status === 'error');
    const hasUnhealthy = checks.some(c => c.status === 'unhealthy');
    const hasWarnings = checks.some(c => c.status === 'warning');
    
    if (hasErrors || hasUnhealthy) return 'unhealthy';
    if (hasWarnings) return 'degraded';
    return 'healthy';
  }

  /**
   * Retorna status em cache se recente
   */
  getCachedStatus() {
    if (this.statusCache && this.lastCheckTime) {
      const age = Date.now() - this.lastCheckTime;
      if (age < this.checkInterval) {
        return {
          ...this.statusCache,
          cached: true,
          cacheAge: Math.round(age / 1000)
        };
      }
    }
    return null;
  }

  /**
   * Inicia monitoramento automático
   */
  startMonitoring(dependencies, interval = 30000) {
    this.checkInterval = interval;
    
    // Executa primeira verificação
    this.performFullCheck(dependencies);
    
    // Configura verificações periódicas
    setInterval(() => {
      this.performFullCheck(dependencies);
    }, interval);
    
    console.log(`🏥 Health monitoring started (interval: ${interval/1000}s)`);
  }
}

module.exports = HealthChecker;