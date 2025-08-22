/**
 * WorkerPool - Pool de Workers para execução distribuída
 * Gerencia workers disponíveis e distribuição de tarefas
 */
class WorkerPool {
  constructor(options = {}) {
    this.maxWorkers = options.maxWorkers || 5;
    this.workerTimeout = options.workerTimeout || 30000;
    
    // Pool de workers
    this.workers = new Map();
    this.availableWorkers = new Set();
    this.busyWorkers = new Set();
    
    // Fila de tarefas
    this.taskQueue = [];
    this.activeTasks = new Map();
    
    // Métricas
    this.metrics = {
      totalTasks: 0,
      completedTasks: 0,
      failedTasks: 0,
      avgExecutionTime: 0
    };
    
    this.initializeWorkers();
  }

  /**
   * Inicializa workers disponíveis
   */
  initializeWorkers() {
    for (let i = 0; i < this.maxWorkers; i++) {
      const workerId = `worker-${i}`;
      const worker = {
        id: workerId,
        capabilities: ['text_generation', 'data_analysis', 'code_generation'],
        status: 'available',
        activeTaskCount: 0,
        totalTasks: 0,
        successRate: 1.0,
        lastActivity: Date.now()
      };
      
      this.workers.set(workerId, worker);
      this.availableWorkers.add(workerId);
    }
    
    console.log(`🔧 WorkerPool initialized with ${this.maxWorkers} workers`);
  }

  /**
   * Retorna workers disponíveis
   * @returns {Array} Lista de workers disponíveis
   */
  getAvailableWorkers() {
    return Array.from(this.availableWorkers).map(id => this.workers.get(id));
  }

  /**
   * Atribui uma tarefa a um worker
   * @param {Object} task - Tarefa a ser executada
   * @param {string} workerId - ID do worker
   * @returns {Object} Assignment info
   */
  async assignTask(task, workerId) {
    const worker = this.workers.get(workerId);
    
    if (!worker) {
      throw new Error(`Worker ${workerId} not found`);
    }
    
    if (!this.availableWorkers.has(workerId)) {
      throw new Error(`Worker ${workerId} is not available`);
    }
    
    // Move worker para busy
    this.availableWorkers.delete(workerId);
    this.busyWorkers.add(workerId);
    
    // Atualiza status do worker
    worker.status = 'busy';
    worker.activeTaskCount++;
    worker.lastActivity = Date.now();
    
    const taskId = `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Registra a tarefa ativa
    this.activeTasks.set(taskId, {
      id: taskId,
      workerId,
      task,
      startTime: Date.now(),
      status: 'running'
    });
    
    this.metrics.totalTasks++;
    
    // Simula execução da tarefa
    this._executeTask(taskId, task, worker);
    
    return {
      taskId,
      workerId,
      estimatedCompletion: Date.now() + (task.estimatedTime || 5000)
    };
  }

  /**
   * Simula execução de uma tarefa
   * @private
   */
  async _executeTask(taskId, task, worker) {
    try {
      const startTime = Date.now();
      
      // Simula processamento
      const processingTime = task.estimatedTime || Math.random() * 5000 + 1000;
      await new Promise(resolve => setTimeout(resolve, processingTime));
      
      // Simula resultado
      const result = {
        subtaskId: task.id,
        result: `Completed task: ${task.description}`,
        success: true,
        processingTime: Date.now() - startTime,
        worker: worker.id
      };
      
      // Atualiza tarefa
      const activeTask = this.activeTasks.get(taskId);
      activeTask.status = 'completed';
      activeTask.result = result;
      activeTask.endTime = Date.now();
      
      // Libera worker
      this._releaseWorker(worker.id);
      
      // Atualiza métricas
      this.metrics.completedTasks++;
      this._updateWorkerMetrics(worker, true, Date.now() - startTime);
      
    } catch (error) {
      // Handle erro
      const activeTask = this.activeTasks.get(taskId);
      activeTask.status = 'failed';
      activeTask.error = error.message;
      activeTask.endTime = Date.now();
      
      this._releaseWorker(worker.id);
      this.metrics.failedTasks++;
      this._updateWorkerMetrics(worker, false, 0);
    }
  }

  /**
   * Libera um worker
   * @private
   */
  _releaseWorker(workerId) {
    const worker = this.workers.get(workerId);
    
    if (worker) {
      worker.status = 'available';
      worker.activeTaskCount = Math.max(0, worker.activeTaskCount - 1);
      worker.lastActivity = Date.now();
      
      this.busyWorkers.delete(workerId);
      this.availableWorkers.add(workerId);
    }
  }

  /**
   * Atualiza métricas do worker
   * @private
   */
  _updateWorkerMetrics(worker, success, duration) {
    worker.totalTasks++;
    
    if (success) {
      worker.successRate = (worker.successRate * (worker.totalTasks - 1) + 1) / worker.totalTasks;
    } else {
      worker.successRate = (worker.successRate * (worker.totalTasks - 1)) / worker.totalTasks;
    }
    
    // Atualiza métricas globais
    const currentAvg = this.metrics.avgExecutionTime;
    const newAvg = ((currentAvg * (this.metrics.totalTasks - 1)) + duration) / this.metrics.totalTasks;
    this.metrics.avgExecutionTime = Math.round(newAvg);
  }

  /**
   * Retorna resultado de uma tarefa
   * @param {string} taskId - ID da tarefa
   * @returns {Object} Resultado da tarefa
   */
  async getTaskResult(taskId) {
    const activeTask = this.activeTasks.get(taskId);
    
    if (!activeTask) {
      throw new Error(`Task ${taskId} not found`);
    }
    
    // Aguarda conclusão da tarefa
    while (activeTask.status === 'running') {
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Timeout check
      if (Date.now() - activeTask.startTime > this.workerTimeout) {
        activeTask.status = 'timeout';
        this._releaseWorker(activeTask.workerId);
        throw new Error(`Task ${taskId} timed out`);
      }
    }
    
    if (activeTask.status === 'failed') {
      throw new Error(`Task ${taskId} failed: ${activeTask.error}`);
    }
    
    if (activeTask.status === 'timeout') {
      throw new Error(`Task ${taskId} timed out`);
    }
    
    // Remove da lista de tarefas ativas
    this.activeTasks.delete(taskId);
    
    return activeTask.result;
  }

  /**
   * Libera um worker específico
   * @param {string} workerId - ID do worker
   * @returns {Object} Status da operação
   */
  async releaseWorker(workerId) {
    try {
      this._releaseWorker(workerId);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Retorna status do pool
   * @returns {Object} Status atual
   */
  getStatus() {
    return {
      totalWorkers: this.workers.size,
      availableWorkers: this.availableWorkers.size,
      busyWorkers: this.busyWorkers.size,
      activeTasks: this.activeTasks.size,
      queuedTasks: this.taskQueue.length,
      metrics: this.metrics
    };
  }

  /**
   * Retorna métricas detalhadas
   * @returns {Object} Métricas do pool
   */
  getMetrics() {
    const workers = Array.from(this.workers.values()).map(worker => ({
      id: worker.id,
      status: worker.status,
      activeTaskCount: worker.activeTaskCount,
      totalTasks: worker.totalTasks,
      successRate: worker.successRate,
      lastActivity: worker.lastActivity
    }));
    
    return {
      pool: this.metrics,
      workers,
      utilization: this.busyWorkers.size / this.workers.size,
      timestamp: Date.now()
    };
  }

  /**
   * Limpa tarefas antigas
   * @param {number} maxAge - Idade máxima em ms
   */
  cleanup(maxAge = 3600000) { // 1 hora
    const cutoff = Date.now() - maxAge;
    
    for (const [taskId, task] of this.activeTasks) {
      if (task.startTime < cutoff) {
        this.activeTasks.delete(taskId);
        if (task.status === 'running') {
          this._releaseWorker(task.workerId);
        }
      }
    }
  }
}

module.exports = WorkerPool;