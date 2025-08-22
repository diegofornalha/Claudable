/**
 * EnhancedAgentManager - Implementação do Orchestrator-Worker Pattern
 * Gerencia análise de complexidade, seleção de agentes e coordenação
 */
class EnhancedAgentManager {
  constructor(aiSdkProvider, orchestratorService, qualityController) {
    this.aiSdkProvider = aiSdkProvider;
    this.orchestratorService = orchestratorService;
    this.qualityController = qualityController;
    
    // Registry de agentes disponíveis
    this.agents = new Map();
    
    // Métricas de performance
    this.metrics = {
      totalTasks: 0,
      successfulTasks: 0,
      avgResponseTime: 0,
      totalTokensUsed: 0
    };
    
    // Configurações de retry
    this.maxRetries = 3;
    this.retryDelay = 1000;
  }

  /**
   * Analisa a complexidade de uma tarefa
   * @param {string} task - Descrição da tarefa
   * @returns {Object} Análise de complexidade
   */
  async analyzeTaskComplexity(task) {
    try {
      const complexityAnalysis = await this.aiSdkProvider.analyzeComplexity(task);
      
      const { score, factors, estimatedTime } = complexityAnalysis;
      
      let complexity;
      let recommendedStrategy;
      
      if (score <= 0.3) {
        complexity = 'simple';
        recommendedStrategy = 'single_agent';
      } else if (score <= 0.7) {
        complexity = 'medium';
        recommendedStrategy = 'single_agent';
      } else {
        complexity = 'complex';
        recommendedStrategy = 'orchestrator_worker';
      }
      
      return {
        complexity,
        score,
        factors,
        estimatedTime,
        recommendedStrategy
      };
    } catch (error) {
      throw new Error(`Task complexity analysis failed: ${error.message}`);
    }
  }

  /**
   * Seleciona o agente ideal para uma tarefa
   * @param {Object} taskAnalysis - Análise da tarefa
   * @returns {Object|null} Agente selecionado ou null
   */
  selectOptimalAgent(taskAnalysis) {
    const { requiredCapabilities, priority, complexity } = taskAnalysis;
    
    let bestAgent = null;
    let bestScore = 0;
    
    for (const [agentId, agent] of this.agents) {
      if (!agent.isAvailable) continue;
      
      // Verifica se o agente tem as capacidades necessárias
      const hasRequiredCapabilities = requiredCapabilities.every(capability =>
        agent.capabilities.includes(capability)
      );
      
      if (!hasRequiredCapabilities) continue;
      
      // Calcula score baseado em performance e adequação
      const performanceScore = agent.performance.successRate * 0.6 + 
                             (1 / agent.performance.avgTime) * 0.4;
      
      const priorityBonus = priority === 'high' ? 1.2 : 
                           priority === 'medium' ? 1.0 : 0.8;
      
      const finalScore = performanceScore * priorityBonus;
      
      if (finalScore > bestScore) {
        bestScore = finalScore;
        bestAgent = agent;
      }
    }
    
    return bestAgent;
  }

  /**
   * Executa uma tarefa usando a estratégia apropriada
   * @param {Object} task - Tarefa a ser executada
   * @param {Object} options - Opções de execução
   * @returns {Object} Resultado da execução
   */
  async executeTask(task, options = {}) {
    const startTime = Date.now();
    const { maxRetries = this.maxRetries } = options;
    
    try {
      // Análise de complexidade
      const complexityAnalysis = await this.analyzeTaskComplexity(task.content);
      
      let result;
      let retryCount = 0;
      
      do {
        if (complexityAnalysis.recommendedStrategy === 'single_agent') {
          result = await this._executeSingleAgent(task, complexityAnalysis);
        } else {
          result = await this._executeOrchestratorWorker(task, complexityAnalysis);
        }
        
        // Avaliação de qualidade
        const qualityEvaluation = await this.qualityController.evaluateQuality(result, task);
        
        if (qualityEvaluation.passed) {
          const duration = Date.now() - startTime;
          this.updateMetrics({ 
            success: true, 
            duration, 
            tokensUsed: result.usage?.tokens || 0 
          });
          
          return {
            success: true,
            result,
            strategy: complexityAnalysis.recommendedStrategy,
            quality: qualityEvaluation,
            retryCount,
            duration
          };
        }
        
        // Se a qualidade não passou, verifica se deve tentar novamente
        if (this.qualityController.shouldRetry(qualityEvaluation, retryCount, maxRetries)) {
          retryCount++;
          const feedback = await this.qualityController.provideFeedback(qualityEvaluation, task);
          
          // Aguarda antes de tentar novamente
          await new Promise(resolve => setTimeout(resolve, this.retryDelay));
        } else {
          break;
        }
      } while (retryCount < maxRetries);
      
      // Se chegou até aqui, a tarefa falhou ou esgotou tentativas
      const duration = Date.now() - startTime;
      this.updateMetrics({ success: false, duration });
      
      return {
        success: false,
        error: 'Maximum retry attempts exceeded or quality threshold not met',
        retryCount,
        duration
      };
      
    } catch (error) {
      const duration = Date.now() - startTime;
      this.updateMetrics({ success: false, duration });
      
      return {
        success: false,
        error: error.message,
        duration
      };
    }
  }

  /**
   * Executa tarefa com agente único
   * @private
   */
  async _executeSingleAgent(task, complexityAnalysis) {
    const taskAnalysis = {
      complexity: complexityAnalysis.complexity,
      requiredCapabilities: this._extractRequiredCapabilities(task),
      priority: task.priority || 'normal'
    };
    
    const selectedAgent = this.selectOptimalAgent(taskAnalysis);
    
    if (!selectedAgent) {
      throw new Error('No suitable agent available for task');
    }
    
    // Executa a tarefa usando AI SDK Provider
    const result = await this.aiSdkProvider.generateText({
      prompt: task.content,
      model: selectedAgent.id,
      maxTokens: task.maxTokens || 1000
    });
    
    return result;
  }

  /**
   * Executa tarefa com padrão Orchestrator-Worker
   * @private
   */
  async _executeOrchestratorWorker(task, complexityAnalysis) {
    // Decomposição da tarefa
    const decomposition = await this.orchestratorService.decomposeTask(task);
    
    // Coordenação dos workers
    const subtaskResults = await this.orchestratorService.coordinateWorkers(
      decomposition.subtasks,
      decomposition.executionPlan
    );
    
    // Agregação dos resultados
    const finalResult = await this.orchestratorService.aggregateResults(
      subtaskResults,
      task
    );
    
    return finalResult;
  }

  /**
   * Extrai capacidades necessárias da tarefa
   * @private
   */
  _extractRequiredCapabilities(task) {
    const capabilityMap = {
      'text_generation': ['text_generation'],
      'data_analysis': ['data_analysis'],
      'complex_analysis': ['data_analysis', 'visualization', 'report_generation'],
      'code_generation': ['code_generation'],
      'translation': ['translation']
    };
    
    return capabilityMap[task.type] || ['text_generation'];
  }

  /**
   * Atualiza métricas de performance
   * @param {Object} executionData - Dados da execução
   */
  updateMetrics(executionData) {
    this.metrics.totalTasks++;
    
    if (executionData.success) {
      this.metrics.successfulTasks++;
    }
    
    if (executionData.tokensUsed) {
      this.metrics.totalTokensUsed += executionData.tokensUsed;
    }
    
    // Atualiza tempo médio de resposta
    const currentAvg = this.metrics.avgResponseTime;
    const newAvg = ((currentAvg * (this.metrics.totalTasks - 1)) + executionData.duration) / this.metrics.totalTasks;
    this.metrics.avgResponseTime = Math.round(newAvg);
  }

  /**
   * Retorna métricas de performance
   * @returns {Object} Métricas atuais
   */
  getPerformanceMetrics() {
    return {
      ...this.metrics,
      successRate: this.metrics.totalTasks > 0 ? 
        this.metrics.successfulTasks / this.metrics.totalTasks : 0
    };
  }

  /**
   * Registra um novo agente
   * @param {Object} agentConfig - Configuração do agente
   */
  registerAgent(agentConfig) {
    if (this.agents.has(agentConfig.id)) {
      throw new Error(`Agent with ID ${agentConfig.id} already exists`);
    }
    
    const agent = {
      ...agentConfig,
      isAvailable: true,
      performance: agentConfig.performance || { avgTime: 2000, successRate: 0.9 }
    };
    
    this.agents.set(agentConfig.id, agent);
  }

  /**
   * Remove um agente
   * @param {string} agentId - ID do agente
   */
  unregisterAgent(agentId) {
    return this.agents.delete(agentId);
  }

  /**
   * Lista agentes disponíveis
   * @returns {Array} Lista de agentes
   */
  listAvailableAgents() {
    return Array.from(this.agents.values()).filter(agent => agent.isAvailable);
  }
}

module.exports = EnhancedAgentManager;