/**
 * OrchestratorService - Coordenação de Workers e Decomposição de Tarefas
 * Implementa o padrão Orchestrator-Worker para tarefas complexas
 */
class OrchestratorService {
  constructor(aiSdkProvider, workerPool) {
    this.aiSdkProvider = aiSdkProvider;
    this.workerPool = workerPool;
    
    // Tarefas ativas sendo executadas
    this.activeTasks = new Map();
    
    // Configurações de load balancing
    this.loadBalancer = {
      strategy: 'round_robin',
      maxConcurrentTasks: 10,
      workerTimeout: 30000
    };
    
    // Contador para round-robin
    this.roundRobinCounter = 0;
  }

  /**
   * Decompõe uma tarefa complexa em subtarefas
   * @param {Object} task - Tarefa a ser decomposta
   * @returns {Object} Subtarefas e plano de execução
   */
  async decomposeTask(task) {
    try {
      const decompositionPrompt = this._buildDecompositionPrompt(task);
      const schema = this._getDecompositionSchema();
      
      const decomposition = await this.aiSdkProvider.generateObject({
        prompt: decompositionPrompt,
        schema
      });
      
      return decomposition;
    } catch (error) {
      throw new Error(`Task decomposition failed: ${error.message}`);
    }
  }

  /**
   * Coordena a execução de workers para as subtarefas
   * @param {Array} subtasks - Lista de subtarefas
   * @param {Object} executionPlan - Plano de execução
   * @returns {Array} Resultados das subtarefas
   */
  async coordinateWorkers(subtasks, executionPlan) {
    const results = [];
    const completedSubtasks = new Set();
    
    // Executa subtarefas paralelas primeiro
    if (executionPlan.parallelizable && executionPlan.parallelizable.length > 0) {
      const parallelTasks = subtasks.filter(subtask => 
        executionPlan.parallelizable.includes(subtask.id)
      );
      
      const parallelResults = await this._executeParallelTasks(parallelTasks);
      results.push(...parallelResults);
      
      parallelResults.forEach(result => completedSubtasks.add(result.subtaskId));
    }
    
    // Executa subtarefas sequenciais respeitando dependências
    if (executionPlan.sequential && executionPlan.sequential.length > 0) {
      for (const subtaskId of executionPlan.sequential) {
        const subtask = subtasks.find(st => st.id === subtaskId);
        
        if (!subtask) continue;
        
        // Verifica se todas as dependências foram completadas
        if (subtask.dependencies && subtask.dependencies.length > 0) {
          const dependenciesMet = subtask.dependencies.every(depId => 
            completedSubtasks.has(depId)
          );
          
          if (!dependenciesMet) {
            throw new Error(`Dependencies not met for subtask ${subtaskId}`);
          }
        }
        
        const result = await this._executeSubtask(subtask);
        results.push(result);
        completedSubtasks.add(result.subtaskId);
      }
    }
    
    return results;
  }

  /**
   * Executa subtarefas em paralelo
   * @private
   */
  async _executeParallelTasks(parallelTasks) {
    const promises = parallelTasks.map(subtask => this._executeSubtask(subtask));
    return Promise.all(promises);
  }

  /**
   * Executa uma subtarefa individual
   * @private
   */
  async _executeSubtask(subtask) {
    let worker = null;
    let attempts = 0;
    const maxAttempts = 5;
    
    // Tenta encontrar um worker disponível
    while (!worker && attempts < maxAttempts) {
      const availableWorkers = this.workerPool.getAvailableWorkers();
      
      if (availableWorkers.length === 0) {
        // Aguarda um pouco e tenta novamente
        await new Promise(resolve => setTimeout(resolve, 1000));
        attempts++;
        continue;
      }
      
      // Seleciona worker usando estratégia de load balancing
      worker = this._selectWorker(availableWorkers, subtask);
    }
    
    if (!worker) {
      throw new Error(`No available worker found for subtask ${subtask.id}`);
    }
    
    try {
      // Atribui a tarefa ao worker
      const assignment = await this.workerPool.assignTask(subtask, worker.id);
      
      // Aguarda o resultado
      const result = await this.workerPool.getTaskResult(assignment.taskId);
      
      return result;
    } catch (error) {
      throw new Error(`Subtask execution failed: ${error.message}`);
    }
  }

  /**
   * Seleciona worker usando estratégia de load balancing
   * @private
   */
  _selectWorker(availableWorkers, subtask) {
    // Filtra workers que têm as capacidades necessárias
    const suitableWorkers = availableWorkers.filter(worker =>
      subtask.requiredCapabilities.every(capability =>
        worker.capabilities.includes(capability)
      )
    );
    
    if (suitableWorkers.length === 0) {
      return null;
    }
    
    const strategy = this.getLoadBalancingStrategy();
    return strategy.selectWorker(suitableWorkers);
  }

  /**
   * Retorna estratégia de load balancing atual
   * @returns {Object} Estratégia com método selectWorker
   */
  getLoadBalancingStrategy() {
    switch (this.loadBalancer.strategy) {
      case 'round_robin':
        return {
          name: 'round_robin',
          selectWorker: (workers) => {
            const worker = workers[this.roundRobinCounter % workers.length];
            this.roundRobinCounter++;
            return worker;
          }
        };
      
      case 'least_loaded':
        return {
          name: 'least_loaded',
          selectWorker: (workers) => {
            return workers.reduce((least, current) => 
              (current.activeTaskCount || 0) < (least.activeTaskCount || 0) ? current : least
            );
          }
        };
      
      default:
        return this.getLoadBalancingStrategy.call({ loadBalancer: { strategy: 'round_robin' } });
    }
  }

  /**
   * Agrega resultados das subtarefas em resultado final
   * @param {Array} subtaskResults - Resultados das subtarefas
   * @param {Object} originalTask - Tarefa original
   * @returns {Object} Resultado agregado
   */
  async aggregateResults(subtaskResults, originalTask) {
    try {
      const aggregationPrompt = this._buildAggregationPrompt(subtaskResults, originalTask);
      const schema = this._getAggregationSchema();
      
      const aggregation = await this.aiSdkProvider.generateObject({
        prompt: aggregationPrompt,
        schema
      });
      
      return aggregation;
    } catch (error) {
      throw new Error(`Result aggregation failed: ${error.message}`);
    }
  }

  /**
   * Constrói prompt para decomposição de tarefa
   * @private
   */
  _buildDecompositionPrompt(task) {
    return `Decompose the following complex task into manageable subtasks:

Task: ${task.content}
Type: ${task.type || 'general'}
Requirements: ${task.requirements ? task.requirements.join(', ') : 'none specified'}

Please break this down into specific subtasks that can be executed independently or with clear dependencies. For each subtask, specify:
- A unique ID
- Type of operation
- Clear description
- Dependencies on other subtasks
- Estimated execution time
- Required capabilities

Also provide an execution plan indicating which tasks can run in parallel and which must be sequential.`;
  }

  /**
   * Constrói prompt para agregação de resultados
   * @private
   */
  _buildAggregationPrompt(subtaskResults, originalTask) {
    const resultsText = subtaskResults.map(result => 
      `Subtask ${result.subtaskId}: ${result.result}`
    ).join('\n');
    
    return `Aggregate the following subtask results into a coherent final result:

Original Task: ${originalTask.content}

Subtask Results:
${resultsText}

Please combine these results into a comprehensive final output that addresses the original task completely. Include:
- A coherent final result
- A brief summary of what was accomplished
- Metadata about the process (timing, tokens used, etc.)`;
  }

  /**
   * Schema para decomposição de tarefa
   * @private
   */
  _getDecompositionSchema() {
    return {
      type: 'object',
      properties: {
        subtasks: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              type: { type: 'string' },
              description: { type: 'string' },
              dependencies: { type: 'array', items: { type: 'string' } },
              estimatedTime: { type: 'number' },
              requiredCapabilities: { type: 'array', items: { type: 'string' } }
            }
          }
        },
        executionPlan: {
          type: 'object',
          properties: {
            totalEstimatedTime: { type: 'number' },
            parallelizable: { type: 'array', items: { type: 'string' } },
            sequential: { type: 'array', items: { type: 'string' } }
          }
        }
      }
    };
  }

  /**
   * Schema para agregação de resultados
   * @private
   */
  _getAggregationSchema() {
    return {
      type: 'object',
      properties: {
        finalResult: { type: 'string' },
        summary: { type: 'string' },
        metadata: {
          type: 'object',
          properties: {
            totalDuration: { type: 'number' },
            totalTokensUsed: { type: 'number' },
            subtasksCompleted: { type: 'number' },
            success: { type: 'boolean' }
          }
        }
      }
    };
  }

  /**
   * Atualiza status de uma tarefa
   * @param {string} taskId - ID da tarefa
   * @param {string} status - Novo status
   * @param {Object} metadata - Metadados opcionais
   */
  updateTaskStatus(taskId, status, metadata = {}) {
    if (status === 'completed' || status === 'failed') {
      this.activeTasks.delete(taskId);
    } else {
      this.activeTasks.set(taskId, { status, metadata, updatedAt: Date.now() });
    }
  }

  /**
   * Retorna número de tarefas ativas
   * @returns {number} Quantidade de tarefas ativas
   */
  getActiveTasksCount() {
    return this.activeTasks.size;
  }

  /**
   * Cancela uma tarefa ativa
   * @param {string} taskId - ID da tarefa
   * @returns {Object} Resultado da cancelação
   */
  async cancelTask(taskId) {
    const task = this.activeTasks.get(taskId);
    
    if (!task) {
      return { success: false, error: 'Task not found' };
    }
    
    try {
      // Libera worker se estiver associado
      if (task.metadata.workerId) {
        await this.workerPool.releaseWorker(task.metadata.workerId);
      }
      
      this.activeTasks.delete(taskId);
      
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

module.exports = OrchestratorService;