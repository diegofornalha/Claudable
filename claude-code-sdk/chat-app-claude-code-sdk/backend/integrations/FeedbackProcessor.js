/**
 * FeedbackProcessor - Processamento de Feedback e Aprendizado Adaptativo
 * Analisa feedback e ajusta thresholds dinamicamente
 */
class FeedbackProcessor {
  constructor(options = {}) {
    this.learningEnabled = options.learningEnabled !== false;
    this.adaptiveThresholds = options.adaptiveThresholds !== false;
    
    // Histórico de aprendizado
    this.learningHistory = [];
    this.adaptationRules = new Map();
    
    // Configurações de aprendizado
    this.learningConfig = {
      windowSize: 50,
      minDataPoints: 10,
      adaptationRate: 0.1,
      stabilityThreshold: 0.05
    };
    
    // Patterns identificados
    this.identifiedPatterns = new Map();
    
    console.log('🧠 FeedbackProcessor initialized with learning capabilities');
  }

  /**
   * Gera sugestões de melhoria baseado na avaliação
   * @param {Object} evaluation - Avaliação de qualidade
   * @param {Object} task - Tarefa original
   * @returns {Object} Sugestões de melhoria
   */
  async generateImprovementSuggestions(evaluation, task) {
    const suggestions = {
      priority: this._determinePriority(evaluation),
      improvements: [],
      specificActions: [],
      estimatedImpact: 0
    };

    // Analisa dimensões com menor score
    if (evaluation.dimensions) {
      const weakDimensions = this._identifyWeakDimensions(evaluation.dimensions);
      
      for (const dimension of weakDimensions) {
        const dimensionSuggestions = this._generateDimensionSuggestions(dimension, task);
        suggestions.improvements.push(...dimensionSuggestions);
      }
    }

    // Ações específicas baseadas no tipo de tarefa
    const taskSpecificActions = this._generateTaskSpecificActions(task, evaluation);
    suggestions.specificActions.push(...taskSpecificActions);

    // Estima impacto das melhorias
    suggestions.estimatedImpact = this._estimateImpact(suggestions, evaluation);

    // Aprende com os padrões
    if (this.learningEnabled) {
      this._learnFromFeedback(evaluation, task, suggestions);
    }

    return suggestions;
  }

  /**
   * Atualiza thresholds baseado no histórico de performance
   * @param {Array} performanceHistory - Histórico de performance
   * @param {Object} currentThresholds - Thresholds atuais
   * @returns {Object} Novos thresholds
   */
  updateThresholds(performanceHistory, currentThresholds) {
    if (!this.adaptiveThresholds || performanceHistory.length < this.learningConfig.minDataPoints) {
      return currentThresholds;
    }

    // Calcula estatísticas do histórico
    const stats = this._calculatePerformanceStats(performanceHistory);
    
    // Determina ajustes necessários
    const adjustments = this._determineThresholdAdjustments(stats, currentThresholds);
    
    // Aplica ajustes graduais
    const newThresholds = {
      minimum: this._adjustThreshold(currentThresholds.minimum, adjustments.minimum),
      target: this._adjustThreshold(currentThresholds.target, adjustments.target),
      excellent: this._adjustThreshold(currentThresholds.excellent, adjustments.excellent)
    };

    // Valida novos thresholds
    return this._validateThresholds(newThresholds, currentThresholds);
  }

  /**
   * Identifica dimensões com performance mais baixa
   * @private
   */
  _identifyWeakDimensions(dimensions) {
    const entries = Object.entries(dimensions);
    const avgScore = entries.reduce((sum, [_, score]) => sum + score, 0) / entries.length;
    
    return entries
      .filter(([_, score]) => score < avgScore - 0.1)
      .map(([dimension, score]) => ({ dimension, score, gap: avgScore - score }))
      .sort((a, b) => b.gap - a.gap);
  }

  /**
   * Gera sugestões específicas para uma dimensão
   * @private
   */
  _generateDimensionSuggestions(dimensionInfo, task) {
    const { dimension, score } = dimensionInfo;
    const suggestions = [];

    switch (dimension) {
      case 'accuracy':
        suggestions.push({
          type: 'accuracy_improvement',
          description: 'Verify facts and data more thoroughly',
          action: 'Add validation steps for factual claims',
          priority: 'high'
        });
        break;
        
      case 'completeness':
        suggestions.push({
          type: 'completeness_improvement',
          description: 'Address all aspects of the task requirements',
          action: 'Create checklist of requirements before finalizing',
          priority: 'high'
        });
        break;
        
      case 'clarity':
        suggestions.push({
          type: 'clarity_improvement',
          description: 'Improve structure and readability',
          action: 'Use clearer headings and bullet points',
          priority: 'medium'
        });
        break;
        
      case 'relevance':
        suggestions.push({
          type: 'relevance_improvement',
          description: 'Focus more closely on task objectives',
          action: 'Review task requirements before proceeding',
          priority: 'high'
        });
        break;
    }

    return suggestions;
  }

  /**
   * Gera ações específicas baseadas no tipo de tarefa
   * @private
   */
  _generateTaskSpecificActions(task, evaluation) {
    const actions = [];
    const taskType = task.type || 'general';

    switch (taskType) {
      case 'data_analysis':
        if (evaluation.dimensions?.accuracy < 0.8) {
          actions.push({
            type: 'data_validation',
            description: 'Implement data quality checks',
            steps: ['Validate data sources', 'Check for outliers', 'Verify calculations']
          });
        }
        break;
        
      case 'code_generation':
        if (evaluation.dimensions?.completeness < 0.8) {
          actions.push({
            type: 'code_completeness',
            description: 'Ensure all functionality is implemented',
            steps: ['Add error handling', 'Include documentation', 'Add test cases']
          });
        }
        break;
        
      case 'report_generation':
        if (evaluation.dimensions?.clarity < 0.8) {
          actions.push({
            type: 'report_structure',
            description: 'Improve report organization',
            steps: ['Add executive summary', 'Use clear sections', 'Include visualizations']
          });
        }
        break;
    }

    return actions;
  }

  /**
   * Estima o impacto das melhorias sugeridas
   * @private
   */
  _estimateImpact(suggestions, evaluation) {
    let totalImpact = 0;
    
    // Impacto baseado no número de melhorias
    totalImpact += suggestions.improvements.length * 0.1;
    
    // Impacto baseado na prioridade
    const highPriorityCount = suggestions.improvements.filter(s => s.priority === 'high').length;
    totalImpact += highPriorityCount * 0.15;
    
    // Impacto baseado na diferença do threshold
    const currentScore = evaluation.overallScore;
    const targetScore = 0.85; // Threshold target
    const potentialImprovement = Math.max(0, targetScore - currentScore);
    totalImpact += potentialImprovement * 0.5;
    
    return Math.min(1.0, totalImpact);
  }

  /**
   * Aprende com feedback para melhorar futuras sugestões
   * @private
   */
  _learnFromFeedback(evaluation, task, suggestions) {
    const learningEntry = {
      timestamp: Date.now(),
      taskType: task.type || 'general',
      evaluation: evaluation,
      suggestions: suggestions,
      outcome: null // Será preenchido quando houver resultado
    };

    this.learningHistory.push(learningEntry);
    
    // Mantém apenas os dados mais recentes
    if (this.learningHistory.length > this.learningConfig.windowSize) {
      this.learningHistory = this.learningHistory.slice(-this.learningConfig.windowSize);
    }

    // Identifica padrões
    this._identifyPatterns();
  }

  /**
   * Identifica padrões no histórico de feedback
   * @private
   */
  _identifyPatterns() {
    if (this.learningHistory.length < this.learningConfig.minDataPoints) {
      return;
    }

    // Padrões por tipo de tarefa
    const taskTypePatterns = new Map();
    
    for (const entry of this.learningHistory) {
      const taskType = entry.taskType;
      
      if (!taskTypePatterns.has(taskType)) {
        taskTypePatterns.set(taskType, {
          count: 0,
          avgScore: 0,
          commonWeaknesses: new Map(),
          successfulSuggestions: []
        });
      }
      
      const pattern = taskTypePatterns.get(taskType);
      pattern.count++;
      pattern.avgScore = (pattern.avgScore * (pattern.count - 1) + entry.evaluation.overallScore) / pattern.count;
      
      // Rastreia fraquezas comuns
      if (entry.evaluation.weaknesses) {
        for (const weakness of entry.evaluation.weaknesses) {
          const current = pattern.commonWeaknesses.get(weakness) || 0;
          pattern.commonWeaknesses.set(weakness, current + 1);
        }
      }
    }

    this.identifiedPatterns = taskTypePatterns;
  }

  /**
   * Calcula estatísticas de performance
   * @private
   */
  _calculatePerformanceStats(history) {
    const scores = history.map(h => h.score || h.overallScore || 0);
    
    return {
      mean: scores.reduce((a, b) => a + b, 0) / scores.length,
      median: this._calculateMedian(scores),
      stdDev: this._calculateStdDev(scores),
      trend: this._calculateTrend(scores),
      recentPerformance: scores.slice(-10).reduce((a, b) => a + b, 0) / Math.min(10, scores.length)
    };
  }

  /**
   * Determina ajustes de threshold necessários
   * @private
   */
  _determineThresholdAdjustments(stats, currentThresholds) {
    const adjustments = { minimum: 0, target: 0, excellent: 0 };
    
    // Se performance recente está consistentemente acima do target, pode aumentar
    if (stats.recentPerformance > currentThresholds.target + 0.1 && stats.stdDev < 0.1) {
      adjustments.minimum = 0.02;
      adjustments.target = 0.02;
      adjustments.excellent = 0.01;
    }
    
    // Se performance está abaixo do mínimo, pode diminuir gradualmente
    if (stats.recentPerformance < currentThresholds.minimum && stats.trend < 0) {
      adjustments.minimum = -0.02;
      adjustments.target = -0.01;
    }
    
    return adjustments;
  }

  /**
   * Ajusta threshold gradualmente
   * @private
   */
  _adjustThreshold(current, adjustment) {
    return current + (adjustment * this.learningConfig.adaptationRate);
  }

  /**
   * Valida novos thresholds
   * @private
   */
  _validateThresholds(newThresholds, currentThresholds) {
    // Limites de segurança
    const limits = { minimum: 0.6, target: 0.75, excellent: 0.9 };
    const maxChange = 0.05;
    
    const validated = {};
    
    for (const [key, value] of Object.entries(newThresholds)) {
      // Aplica limites
      let adjustedValue = Math.max(limits[key], value);
      
      // Limita mudança máxima
      const maxChangeValue = currentThresholds[key] + maxChange;
      const minChangeValue = currentThresholds[key] - maxChange;
      adjustedValue = Math.min(maxChangeValue, Math.max(minChangeValue, adjustedValue));
      
      validated[key] = adjustedValue;
    }
    
    // Garante ordem correta
    if (validated.minimum >= validated.target) {
      validated.minimum = validated.target - 0.05;
    }
    if (validated.target >= validated.excellent) {
      validated.target = validated.excellent - 0.05;
    }
    
    return validated;
  }

  /**
   * Calcula mediana
   * @private
   */
  _calculateMedian(arr) {
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  /**
   * Calcula desvio padrão
   * @private
   */
  _calculateStdDev(arr) {
    const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
    const squaredDiffs = arr.map(value => Math.pow(value - mean, 2));
    const avgSquaredDiff = squaredDiffs.reduce((a, b) => a + b, 0) / arr.length;
    return Math.sqrt(avgSquaredDiff);
  }

  /**
   * Calcula tendência
   * @private
   */
  _calculateTrend(arr) {
    if (arr.length < 2) return 0;
    
    const recent = arr.slice(-Math.min(10, Math.floor(arr.length / 2)));
    const older = arr.slice(0, Math.floor(arr.length / 2));
    
    const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
    const olderAvg = older.reduce((a, b) => a + b, 0) / older.length;
    
    return recentAvg - olderAvg;
  }

  /**
   * Determina prioridade baseada na avaliação
   * @private
   */
  _determinePriority(evaluation) {
    if (evaluation.overallScore < 0.6) return 'critical';
    if (evaluation.overallScore < 0.7) return 'high';
    if (evaluation.overallScore < 0.8) return 'medium';
    return 'low';
  }

  /**
   * Retorna métricas de aprendizado
   * @returns {Object} Métricas de aprendizado
   */
  getLearningMetrics() {
    return {
      totalEntries: this.learningHistory.length,
      learningEnabled: this.learningEnabled,
      adaptiveThresholds: this.adaptiveThresholds,
      identifiedPatterns: this.identifiedPatterns.size,
      recentTrend: this.learningHistory.length > 5 ? 
        this._calculateTrend(this.learningHistory.slice(-10).map(h => h.evaluation.overallScore)) : 0
    };
  }
}

module.exports = FeedbackProcessor;