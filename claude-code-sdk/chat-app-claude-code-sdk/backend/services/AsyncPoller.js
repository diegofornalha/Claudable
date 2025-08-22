/**
 * AsyncPoller - Sistema de polling assíncrono inspirado no Mesop
 * Monitora tarefas em andamento e notifica subscribers em tempo real
 */

const EventEmitter = require('events');

class AsyncPoller extends EventEmitter {
  constructor(options = {}) {
    super();
    this.interval = options.interval || 1000; // 1 segundo como no Mesop
    this.maxRetries = options.maxRetries || 3;
    this.tasks = new Map(); // taskId -> taskInfo
    this.subscribers = new Map(); // sessionId -> socket
    this.pollingActive = false;
    this.pollTimer = null;
    
    // Métricas
    this.metrics = {
      tasksProcessed: 0,
      pollCycles: 0,
      errors: 0,
      avgResponseTime: 0
    };
  }

  /**
   * Inicia o polling assíncrono
   */
  start() {
    if (this.pollingActive) {
      console.log('⚠️ AsyncPoller já está ativo');
      return;
    }
    
    this.pollingActive = true;
    console.log('🔄 AsyncPoller iniciado (intervalo: ' + this.interval + 'ms)');
    this.poll();
  }

  /**
   * Para o polling
   */
  stop() {
    this.pollingActive = false;
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
    console.log('⏹️ AsyncPoller parado');
  }

  /**
   * Adiciona uma tarefa para monitoramento
   */
  addTask(taskId, taskInfo) {
    this.tasks.set(taskId, {
      id: taskId,
      status: 'pending',
      createdAt: Date.now(),
      retries: 0,
      ...taskInfo
    });
    
    console.log(`📝 Task adicionada ao polling: ${taskId}`);
    this.emit('task:added', { taskId, taskInfo });
  }

  /**
   * Remove uma tarefa do monitoramento
   */
  removeTask(taskId) {
    if (this.tasks.has(taskId)) {
      this.tasks.delete(taskId);
      console.log(`🗑️ Task removida do polling: ${taskId}`);
      this.emit('task:removed', { taskId });
    }
  }

  /**
   * Adiciona um subscriber (socket) para receber atualizações
   */
  addSubscriber(sessionId, socket) {
    this.subscribers.set(sessionId, socket);
    console.log(`👤 Subscriber adicionado: ${sessionId}`);
  }

  /**
   * Remove um subscriber
   */
  removeSubscriber(sessionId) {
    if (this.subscribers.has(sessionId)) {
      this.subscribers.delete(sessionId);
      console.log(`👤 Subscriber removido: ${sessionId}`);
    }
  }

  /**
   * Ciclo principal de polling
   */
  async poll() {
    if (!this.pollingActive) return;
    
    const startTime = Date.now();
    this.metrics.pollCycles++;
    
    try {
      // Processar todas as tarefas pendentes
      const promises = [];
      
      for (const [taskId, task] of this.tasks.entries()) {
        if (task.status === 'pending' || task.status === 'processing') {
          promises.push(this.checkTaskStatus(taskId, task));
        }
      }
      
      if (promises.length > 0) {
        await Promise.allSettled(promises);
      }
      
      // Atualizar métricas
      const elapsed = Date.now() - startTime;
      this.metrics.avgResponseTime = 
        (this.metrics.avgResponseTime * (this.metrics.pollCycles - 1) + elapsed) / 
        this.metrics.pollCycles;
      
    } catch (error) {
      console.error('❌ Erro no AsyncPoller:', error);
      this.metrics.errors++;
      this.emit('error', error);
    }
    
    // Agendar próximo ciclo
    this.pollTimer = setTimeout(() => this.poll(), this.interval);
  }

  /**
   * Verifica o status de uma tarefa específica
   */
  async checkTaskStatus(taskId, task) {
    try {
      // Aqui você verificaria o status real da tarefa
      // Por exemplo, consultando o agente responsável
      
      // Simular verificação de status (substituir com lógica real)
      const mockStatus = this.getMockTaskStatus(task);
      
      if (mockStatus.status !== task.status) {
        // Status mudou, atualizar e notificar
        task.status = mockStatus.status;
        task.progress = mockStatus.progress;
        task.result = mockStatus.result;
        task.updatedAt = Date.now();
        
        this.notifySubscribers('task:updated', {
          taskId,
          status: task.status,
          progress: task.progress,
          result: task.result
        });
        
        // Se completou ou falhou, remover do polling
        if (task.status === 'completed' || task.status === 'failed') {
          this.metrics.tasksProcessed++;
          setTimeout(() => this.removeTask(taskId), 5000); // Remover após 5s
        }
      }
      
    } catch (error) {
      task.retries++;
      
      if (task.retries >= this.maxRetries) {
        task.status = 'failed';
        task.error = error.message;
        this.notifySubscribers('task:failed', { taskId, error: error.message });
        setTimeout(() => this.removeTask(taskId), 5000);
      }
    }
  }

  /**
   * Notifica todos os subscribers sobre um evento
   */
  notifySubscribers(event, data) {
    for (const [sessionId, socket] of this.subscribers.entries()) {
      if (socket && socket.connected) {
        socket.emit(event, data);
      } else {
        // Remover subscribers desconectados
        this.removeSubscriber(sessionId);
      }
    }
    
    // Também emitir como evento local
    this.emit(event, data);
  }

  /**
   * Mock para simular status de tarefas (substituir com implementação real)
   */
  getMockTaskStatus(task) {
    const elapsed = Date.now() - task.createdAt;
    
    if (elapsed < 2000) {
      return { status: 'processing', progress: 30 };
    } else if (elapsed < 4000) {
      return { status: 'processing', progress: 70 };
    } else {
      return { 
        status: 'completed', 
        progress: 100,
        result: { message: 'Task completed successfully' }
      };
    }
  }

  /**
   * Retorna métricas do poller
   */
  getMetrics() {
    return {
      ...this.metrics,
      activeTasks: this.tasks.size,
      activeSubscribers: this.subscribers.size,
      isActive: this.pollingActive
    };
  }

  /**
   * Retorna status de todas as tarefas
   */
  getAllTasks() {
    return Array.from(this.tasks.values());
  }
}

// Singleton para uso global
let pollerInstance = null;

function getAsyncPoller(options) {
  if (!pollerInstance) {
    pollerInstance = new AsyncPoller(options);
  }
  return pollerInstance;
}

module.exports = {
  AsyncPoller,
  getAsyncPoller
};