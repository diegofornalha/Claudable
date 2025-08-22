/**
 * BaseAgent - Classe base para todos os agentes A2A
 * Inspirado no base_agent.py do Mesop
 */

const axios = require('axios');
const EventEmitter = require('events');

class BaseAgent extends EventEmitter {
  constructor(config) {
    super();
    
    // Configuração básica
    this.name = config.name || 'unnamed-agent';
    this.url = config.url || 'http://localhost:8000';
    this.type = config.type || 'generic';
    this.version = config.version || '1.0.0';
    this.description = config.description || 'A2A compatible agent';
    
    // Capacidades do agente
    this.capabilities = config.capabilities || [];
    
    // Estado e métricas
    this.status = 'disconnected';
    this.lastHealthCheck = null;
    this.metrics = {
      requestsProcessed: 0,
      averageResponseTime: 0,
      errors: 0,
      successRate: 100
    };
    
    // Configurações de retry e timeout
    this.timeout = config.timeout || 30000; // 30 segundos
    this.maxRetries = config.maxRetries || 3;
    this.retryDelay = config.retryDelay || 1000;
    
    // Cache de respostas (opcional)
    this.cacheEnabled = config.cacheEnabled || false;
    this.cache = new Map();
    this.cacheTTL = config.cacheTTL || 300000; // 5 minutos
  }

  /**
   * Inicializa o agente
   */
  async initialize() {
    console.log(`🚀 Inicializando agente: ${this.name}`);
    
    try {
      // Verificar saúde inicial
      const healthy = await this.healthCheck();
      
      if (healthy) {
        this.status = 'ready';
        this.emit('initialized', { agent: this.name });
        console.log(`✅ Agente ${this.name} inicializado com sucesso`);
        
        // Iniciar health checks periódicos
        this.startHealthMonitoring();
        return true;
      } else {
        throw new Error('Health check failed');
      }
    } catch (error) {
      this.status = 'error';
      console.error(`❌ Falha ao inicializar agente ${this.name}:`, error.message);
      this.emit('error', { agent: this.name, error: error.message });
      return false;
    }
  }

  /**
   * Verifica a saúde do agente
   */
  async healthCheck() {
    try {
      const response = await axios.get(`${this.url}/health`, {
        timeout: 5000
      });
      
      this.lastHealthCheck = Date.now();
      this.status = 'healthy';
      
      return response.status === 200;
    } catch (error) {
      this.status = 'unhealthy';
      return false;
    }
  }

  /**
   * Inicia monitoramento periódico de saúde
   */
  startHealthMonitoring(interval = 30000) {
    this.healthInterval = setInterval(async () => {
      const healthy = await this.healthCheck();
      
      if (!healthy && this.status === 'healthy') {
        console.warn(`⚠️ Agente ${this.name} ficou unhealthy`);
        this.emit('unhealthy', { agent: this.name });
      } else if (healthy && this.status === 'unhealthy') {
        console.log(`✅ Agente ${this.name} voltou a ficar healthy`);
        this.emit('healthy', { agent: this.name });
      }
    }, interval);
  }

  /**
   * Para o monitoramento de saúde
   */
  stopHealthMonitoring() {
    if (this.healthInterval) {
      clearInterval(this.healthInterval);
      this.healthInterval = null;
    }
  }

  /**
   * Descobre capacidades do agente
   */
  async discover() {
    try {
      const response = await axios.get(`${this.url}/.well-known/agent.json`, {
        timeout: this.timeout
      });
      
      const agentInfo = response.data;
      
      // Atualizar informações do agente
      this.capabilities = agentInfo.capabilities || [];
      this.version = agentInfo.version || this.version;
      this.description = agentInfo.description || this.description;
      
      console.log(`🔍 Descoberta do agente ${this.name}:`, {
        capabilities: this.capabilities.length,
        version: this.version
      });
      
      return agentInfo;
    } catch (error) {
      console.error(`❌ Falha na descoberta do agente ${this.name}:`, error.message);
      throw error;
    }
  }

  /**
   * Processa uma tarefa (deve ser sobrescrito por subclasses)
   */
  async process(task) {
    const startTime = Date.now();
    
    try {
      // Verificar cache se habilitado
      if (this.cacheEnabled) {
        const cached = this.getCached(task);
        if (cached) {
          console.log(`📦 Resposta do cache para ${this.name}`);
          return cached;
        }
      }
      
      // Processar com retry
      const result = await this.executeWithRetry(async () => {
        return await this.executeTask(task);
      });
      
      // Atualizar métricas
      this.updateMetrics(Date.now() - startTime, true);
      
      // Cachear resultado se habilitado
      if (this.cacheEnabled) {
        this.setCached(task, result);
      }
      
      return result;
      
    } catch (error) {
      this.updateMetrics(Date.now() - startTime, false);
      console.error(`❌ Erro processando tarefa no agente ${this.name}:`, error.message);
      throw error;
    }
  }

  /**
   * Executa a tarefa (implementação específica do agente)
   */
  async executeTask(task) {
    // Implementação padrão - envia para endpoint /process
    const response = await axios.post(`${this.url}/process`, task, {
      timeout: this.timeout,
      headers: {
        'Content-Type': 'application/json',
        'X-Agent-Name': this.name,
        'X-Request-ID': this.generateRequestId()
      }
    });
    
    return response.data;
  }

  /**
   * Executa com retry automático
   */
  async executeWithRetry(fn, retries = this.maxRetries) {
    let lastError;
    
    for (let i = 0; i < retries; i++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        console.log(`⚠️ Tentativa ${i + 1}/${retries} falhou para ${this.name}`);
        
        if (i < retries - 1) {
          await this.delay(this.retryDelay * Math.pow(2, i)); // Backoff exponencial
        }
      }
    }
    
    throw lastError;
  }

  /**
   * Delega tarefa para outro agente
   */
  async delegate(targetAgent, task) {
    console.log(`🔄 Delegando tarefa de ${this.name} para ${targetAgent}`);
    
    const response = await axios.post(`${this.url}/delegate`, {
      target: targetAgent,
      task: task
    }, {
      timeout: this.timeout
    });
    
    return response.data;
  }

  /**
   * Comunica com outro agente
   */
  async communicate(targetAgent, message) {
    const response = await axios.post(`${this.url}/communicate`, {
      target: targetAgent,
      message: message
    }, {
      timeout: this.timeout
    });
    
    return response.data;
  }

  /**
   * Atualiza métricas do agente
   */
  updateMetrics(responseTime, success) {
    this.metrics.requestsProcessed++;
    
    // Atualizar tempo médio de resposta
    const totalTime = this.metrics.averageResponseTime * (this.metrics.requestsProcessed - 1);
    this.metrics.averageResponseTime = (totalTime + responseTime) / this.metrics.requestsProcessed;
    
    // Atualizar taxa de sucesso
    if (!success) {
      this.metrics.errors++;
    }
    this.metrics.successRate = 
      ((this.metrics.requestsProcessed - this.metrics.errors) / this.metrics.requestsProcessed) * 100;
  }

  /**
   * Gerenciamento de cache
   */
  getCached(task) {
    if (!this.cacheEnabled) return null;
    
    const key = this.getCacheKey(task);
    const cached = this.cache.get(key);
    
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.data;
    }
    
    // Cache expirado
    if (cached) {
      this.cache.delete(key);
    }
    
    return null;
  }

  setCached(task, result) {
    if (!this.cacheEnabled) return;
    
    const key = this.getCacheKey(task);
    this.cache.set(key, {
      data: result,
      timestamp: Date.now()
    });
    
    // Limpar cache antigo periodicamente
    if (this.cache.size > 100) {
      this.cleanCache();
    }
  }

  getCacheKey(task) {
    return JSON.stringify(task);
  }

  cleanCache() {
    const now = Date.now();
    for (const [key, value] of this.cache.entries()) {
      if (now - value.timestamp > this.cacheTTL) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Utilitários
   */
  generateRequestId() {
    return `${this.name}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Retorna informações do agente
   */
  getInfo() {
    return {
      name: this.name,
      url: this.url,
      type: this.type,
      version: this.version,
      description: this.description,
      capabilities: this.capabilities,
      status: this.status,
      lastHealthCheck: this.lastHealthCheck,
      metrics: this.metrics
    };
  }

  /**
   * Limpa recursos do agente
   */
  async shutdown() {
    console.log(`🛑 Desligando agente ${this.name}`);
    
    this.stopHealthMonitoring();
    this.cache.clear();
    this.status = 'shutdown';
    this.emit('shutdown', { agent: this.name });
  }
}

module.exports = BaseAgent;