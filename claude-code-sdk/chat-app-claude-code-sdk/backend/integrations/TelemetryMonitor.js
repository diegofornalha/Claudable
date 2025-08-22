/**
 * TelemetryMonitor - Sistema simplificado de telemetria
 * Monitora métricas essenciais do sistema
 */

const { EventEmitter } = require('events');

class TelemetryMonitor extends EventEmitter {
  constructor(options = {}) {
    super();
    
    // Configuration
    this.enabled = options.enabled !== false;
    this.reportingInterval = options.reportingInterval || 60000; // 1 minuto
    this.maxBufferSize = options.maxBufferSize || 1000;
    this.dataRetentionDays = options.dataRetentionDays || 7;
    this.enableDetailed = options.enableDetailed || false;
    
    // Storage
    this.events = [];
    this.errors = [];
    this.performance = new Map();
    this.resources = new Map();
    this.eventBuffer = [];
    
    // Counters
    this.counters = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      totalTokens: 0,
      totalCost: 0,
      activeConnections: 0,
      taskExecutions: 0,
      qualityEvaluations: 0,
      retryAttempts: 0
    };
    
    // Timers
    this.reportingTimer = null;
    this.cleanupTimer = null;
    
    this.initialize();
  }

  initialize() {
    if (!this.enabled) {
      console.log('📊 TelemetryMonitor initialized but disabled');
      return;
    }
    
    console.log('📊 TelemetryMonitor initialized with monitoring');
    
    // Setup periodic reporting
    this.reportingTimer = setInterval(() => {
      this.generateReport();
    }, this.reportingInterval);
    
    // Setup cleanup timer
    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, 3600000); // 1 hora
  }

  /**
   * Registra um evento de telemetria
   */
  trackEvent(category, action, data = {}) {
    if (!this.enabled) return;
    
    const event = {
      id: `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      category,
      action,
      data,
      sessionId: data.sessionId || null,
      userId: data.userId || null
    };
    
    this.events.push(event);
    this.addToBuffer(event);
    
    // Atualiza contadores
    this.updateCounters(category, action, data);
    
    // Emit for real-time monitoring
    this.emit('event', event);
    
    if (this.enableDetailed) {
      console.log('📊 [Telemetry] Event tracked:', {
        category,
        action,
        dataKeys: Object.keys(data),
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Rastreia métricas de performance
   */
  trackPerformance(operation, duration, metadata = {}) {
    if (!this.enabled) return;
    
    const perfKey = `perf_${operation}`;
    
    if (!this.performance.has(perfKey)) {
      this.performance.set(perfKey, {
        operation,
        count: 0,
        totalDuration: 0,
        avgDuration: 0,
        minDuration: Infinity,
        maxDuration: 0,
        p95Duration: 0,
        recentSamples: []
      });
    }
    
    const perf = this.performance.get(perfKey);
    perf.count++;
    perf.totalDuration += duration;
    perf.avgDuration = perf.totalDuration / perf.count;
    perf.minDuration = Math.min(perf.minDuration, duration);
    perf.maxDuration = Math.max(perf.maxDuration, duration);
    
    // Mantém amostras recentes para percentis
    perf.recentSamples.push(duration);
    if (perf.recentSamples.length > 100) {
      perf.recentSamples = perf.recentSamples.slice(-100);
    }
    
    // Calcula P95
    const sorted = [...perf.recentSamples].sort((a, b) => a - b);
    perf.p95Duration = sorted[Math.floor(sorted.length * 0.95)] || duration;
    
    // Track como evento
    this.trackEvent('performance', operation, {
      duration,
      avgDuration: perf.avgDuration,
      count: perf.count,
      ...metadata
    });
  }

  /**
   * Rastreia erros
   */
  trackError(error, context = {}) {
    if (!this.enabled) return;
    
    const errorEvent = {
      id: `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      message: error.message || String(error),
      stack: error.stack,
      context,
      severity: context.severity || 'error'
    };
    
    this.errors.push(errorEvent);
    this.addToBuffer(errorEvent);
    
    // Emit para alertas em tempo real
    this.emit('error', errorEvent);
    
    console.error('📊 [Telemetry] Error tracked:', {
      message: errorEvent.message,
      context: Object.keys(context),
      severity: errorEvent.severity
    });
  }

  /**
   * Rastreia uso de recursos
   */
  trackResourceUsage(resource, usage, metadata = {}) {
    if (!this.enabled) return;
    
    const resourceKey = `res_${resource}`;
    
    if (!this.resources.has(resourceKey)) {
      this.resources.set(resourceKey, {
        resource,
        currentUsage: 0,
        peakUsage: 0,
        samples: [],
        lastUpdated: Date.now()
      });
    }
    
    const res = this.resources.get(resourceKey);
    res.currentUsage = usage;
    res.peakUsage = Math.max(res.peakUsage, usage);
    res.samples.push({ timestamp: Date.now(), usage });
    res.lastUpdated = Date.now();
    
    // Mantém apenas últimas 100 amostras
    if (res.samples.length > 100) {
      res.samples = res.samples.slice(-100);
    }
    
    this.trackEvent('resource', resource, {
      usage,
      peakUsage: res.peakUsage,
      ...metadata
    });
  }

  /**
   * Atualiza contadores baseado nos eventos
   */
  updateCounters(category, action, data) {
    switch (category) {
      case 'request':
        this.counters.totalRequests++;
        if (action === 'success') {
          this.counters.successfulRequests++;
        } else if (action === 'error') {
          this.counters.failedRequests++;
        }
        break;
        
      case 'tokens':
        if (data.count) {
          this.counters.totalTokens += data.count;
        }
        break;
        
      case 'cost':
        if (data.amount) {
          this.counters.totalCost += data.amount;
        }
        break;
        
      case 'connection':
        if (action === 'connect') {
          this.counters.activeConnections++;
        } else if (action === 'disconnect') {
          this.counters.activeConnections = Math.max(0, this.counters.activeConnections - 1);
        }
        break;
        
      case 'task':
        if (action === 'execute') {
          this.counters.taskExecutions++;
        }
        break;
        
      case 'quality':
        if (action === 'evaluate') {
          this.counters.qualityEvaluations++;
        }
        break;
        
      case 'retry':
        this.counters.retryAttempts++;
        break;
    }
  }

  /**
   * Adiciona evento ao buffer de tempo real
   */
  addToBuffer(event) {
    this.eventBuffer.push(event);
    
    // Limita tamanho do buffer
    if (this.eventBuffer.length > this.maxBufferSize) {
      this.eventBuffer = this.eventBuffer.slice(-this.maxBufferSize);
    }
  }

  /**
   * Gera relatório de métricas
   */
  generateReport() {
    if (!this.enabled) return null;
    
    const now = Date.now();
    const report = {
      timestamp: now,
      period: {
        start: now - this.reportingInterval,
        end: now,
        duration: this.reportingInterval
      },
      counters: { ...this.counters },
      performance: this.getPerformanceSummary(),
      resources: this.getResourceSummary(),
      health: this.getHealthMetrics(),
      errors: this.getErrorSummary(),
      quality: this.getQualityMetrics()
    };
    
    // Emit report
    this.emit('report', report);
    
    console.log('📊 [Telemetry] Generated report:', {
      totalRequests: report.counters.totalRequests,
      successRate: report.health.successRate,
      avgResponseTime: report.performance.avgResponseTime,
      errorCount: report.errors.count
    });
    
    return report;
  }

  /**
   * Sumário de performance
   */
  getPerformanceSummary() {
    const summary = {
      operations: {},
      avgResponseTime: 0,
      totalOperations: 0
    };
    
    let totalDuration = 0;
    let totalCount = 0;
    
    for (const [key, perf] of this.performance) {
      summary.operations[perf.operation] = {
        count: perf.count,
        avgDuration: Math.round(perf.avgDuration),
        minDuration: Math.round(perf.minDuration),
        maxDuration: Math.round(perf.maxDuration),
        p95Duration: Math.round(perf.p95Duration)
      };
      
      totalDuration += perf.totalDuration;
      totalCount += perf.count;
    }
    
    summary.avgResponseTime = totalCount > 0 ? Math.round(totalDuration / totalCount) : 0;
    summary.totalOperations = totalCount;
    
    return summary;
  }

  /**
   * Sumário de recursos
   */
  getResourceSummary() {
    const summary = {};
    
    for (const [key, res] of this.resources) {
      summary[res.resource] = {
        current: res.currentUsage,
        peak: res.peakUsage,
        lastUpdated: res.lastUpdated,
        trend: this.calculateTrend(res.samples)
      };
    }
    
    return summary;
  }

  /**
   * Métricas de saúde do sistema
   */
  getHealthMetrics() {
    const successRate = this.counters.totalRequests > 0 ? 
      this.counters.successfulRequests / this.counters.totalRequests : 1;
    
    return {
      successRate: Math.round(successRate * 100) / 100,
      errorRate: Math.round((1 - successRate) * 100) / 100,
      activeConnections: this.counters.activeConnections,
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage().heapUsed / 1024 / 1024, // MB
      status: this.determineHealthStatus(successRate)
    };
  }

  /**
   * Sumário de erros
   */
  getErrorSummary() {
    const recentErrors = this.errors.filter(err => 
      Date.now() - err.timestamp < this.reportingInterval
    );
    
    const errorsByType = {};
    recentErrors.forEach(err => {
      const type = err.context.type || 'unknown';
      errorsByType[type] = (errorsByType[type] || 0) + 1;
    });
    
    return {
      count: recentErrors.length,
      total: this.errors.length,
      byType: errorsByType,
      recent: recentErrors.slice(-5).map(err => ({
        message: err.message,
        timestamp: err.timestamp,
        severity: err.severity
      }))
    };
  }

  /**
   * Métricas de qualidade
   */
  getQualityMetrics() {
    const qualityEvents = this.events.filter(evt => 
      evt.category === 'quality' && 
      Date.now() - evt.timestamp < this.reportingInterval
    );
    
    if (qualityEvents.length === 0) {
      return { evaluations: 0, avgScore: 0, passRate: 0 };
    }
    
    const scores = qualityEvents
      .filter(evt => evt.data.score)
      .map(evt => evt.data.score);
    
    const passes = qualityEvents.filter(evt => evt.data.passed).length;
    
    return {
      evaluations: qualityEvents.length,
      avgScore: scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0,
      passRate: qualityEvents.length > 0 ? passes / qualityEvents.length : 0
    };
  }

  /**
   * Calcula tendência de uma série de amostras
   */
  calculateTrend(samples) {
    if (samples.length < 2) return 0;
    
    const recent = samples.slice(-10);
    if (recent.length < 2) return 0;
    
    const firstHalf = recent.slice(0, Math.floor(recent.length / 2));
    const secondHalf = recent.slice(Math.floor(recent.length / 2));
    
    const firstAvg = firstHalf.reduce((sum, s) => sum + s.usage, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((sum, s) => sum + s.usage, 0) / secondHalf.length;
    
    return secondAvg - firstAvg;
  }

  /**
   * Determina status de saúde
   */
  determineHealthStatus(successRate) {
    if (successRate >= 0.95) return 'healthy';
    if (successRate >= 0.8) return 'warning';
    return 'critical';
  }

  /**
   * Retorna métricas em tempo real
   */
  getRealTimeMetrics() {
    return {
      counters: { ...this.counters },
      recentEvents: this.eventBuffer.slice(-50),
      activeConnections: this.counters.activeConnections,
      health: this.getHealthMetrics(),
      timestamp: Date.now()
    };
  }

  /**
   * Limpeza de dados antigos
   */
  cleanup() {
    const cutoff = Date.now() - (this.dataRetentionDays * 24 * 60 * 60 * 1000);
    
    // Limpar eventos antigos
    this.events = this.events.filter(evt => evt.timestamp > cutoff);
    
    // Limpar erros antigos
    this.errors = this.errors.filter(err => err.timestamp > cutoff);
    
    // Limpar amostras antigas de recursos
    for (const [key, res] of this.resources) {
      res.samples = res.samples.filter(sample => sample.timestamp > cutoff);
    }
    
    console.log('📊 [Telemetry] Cleanup completed - data retention: ' + this.dataRetentionDays + ' days');
  }

  /**
   * Desabilita o monitor
   */
  destroy() {
    if (this.reportingTimer) {
      clearInterval(this.reportingTimer);
    }
    
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
    
    this.removeAllListeners();
    console.log('📊 TelemetryMonitor destroyed');
  }
}

module.exports = TelemetryMonitor;