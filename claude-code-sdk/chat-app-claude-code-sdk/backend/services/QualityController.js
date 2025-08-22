/**
 * QualityController - Controle de Qualidade e Feedback Loops
 * Avalia qualidade, fornece feedback e ajusta thresholds adaptativos
 */
class QualityController {
  constructor(aiSdkProvider, feedbackProcessor) {
    this.aiSdkProvider = aiSdkProvider;
    this.feedbackProcessor = feedbackProcessor;
    
    // Thresholds de qualidade
    this.thresholds = {
      minimum: 0.7,
      target: 0.85,
      excellent: 0.95
    };
    
    // Métricas de qualidade
    this.metrics = {
      totalEvaluations: 0,
      averageScore: 0,
      improvementTrend: 0,
      thresholdAdjustments: 0
    };
    
    // Histórico de feedback
    this.feedbackHistory = [];
    
    // Configurações de avaliação
    this.evaluationConfig = {
      maxFeedbackHistory: 100,
      trendAnalysisWindow: 20,
      confidenceThreshold: 0.6
    };
  }

  /**
   * Avalia a qualidade de um resultado
   * @param {Object} result - Resultado a ser avaliado
   * @param {Object} task - Tarefa original
   * @returns {Object} Avaliação de qualidade
   */
  async evaluateQuality(result, task) {
    try {
      const evaluationPrompt = this._buildEvaluationPrompt(result, task);
      const schema = this._getEvaluationSchema();
      
      const evaluation = await this.aiSdkProvider.generateObject({
        prompt: evaluationPrompt,
        schema
      });
      
      // Determina se passou no threshold
      evaluation.passed = evaluation.overallScore >= this.thresholds.minimum;
      
      // Atualiza métricas
      this._updateMetrics(evaluation);
      
      return evaluation;
    } catch (error) {
      throw new Error(`Quality evaluation failed: ${error.message}`);
    }
  }

  /**
   * Fornece feedback para melhorias
   * @param {Object} evaluation - Avaliação de qualidade
   * @param {Object} task - Tarefa original
   * @returns {Object} Feedback para melhorias
   */
  async provideFeedback(evaluation, task) {
    const feedback = await this.feedbackProcessor.generateImprovementSuggestions(
      evaluation,
      task
    );
    
    // Adiciona ao histórico
    this.addFeedbackToHistory({
      evaluation,
      feedback,
      task,
      timestamp: Date.now()
    });
    
    return feedback;
  }

  /**
   * Determina se deve tentar novamente
   * @param {Object} evaluation - Avaliação de qualidade
   * @param {number} retryCount - Tentativas já realizadas
   * @param {number} maxRetries - Máximo de tentativas
   * @returns {boolean} Se deve tentar novamente
   */
  shouldRetry(evaluation, retryCount, maxRetries) {
    // Não tenta se já esgotou as tentativas
    if (retryCount >= maxRetries) {
      return false;
    }
    
    // Não tenta se a qualidade é aceitável
    if (evaluation.overallScore >= this.thresholds.minimum) {
      return false;
    }
    
    // Não tenta se a confiança da avaliação é muito baixa
    if (evaluation.confidence < this.evaluationConfig.confidenceThreshold) {
      return false;
    }
    
    // Tenta se há potencial de melhoria
    const improvementPotential = this._assessImprovementPotential(evaluation);
    return improvementPotential > 0.1;
  }

  /**
   * Atualiza thresholds baseado no histórico de performance
   * @param {Array} performanceHistory - Histórico de performance
   */
  updateThresholds(performanceHistory) {
    const updatedThresholds = this.feedbackProcessor.updateThresholds(
      performanceHistory,
      this.thresholds
    );
    
    // Aplica limites de segurança
    this.thresholds = {
      minimum: Math.max(0.6, updatedThresholds.minimum),
      target: Math.max(0.75, updatedThresholds.target),
      excellent: Math.max(0.9, updatedThresholds.excellent)
    };
    
    this.metrics.thresholdAdjustments++;
  }

  /**
   * Constrói prompt para avaliação de qualidade
   * @private
   */
  _buildEvaluationPrompt(result, task) {
    const resultContent = typeof result === 'string' ? result : 
                         result.content || result.text || JSON.stringify(result);
    
    return `Evaluate the quality of the following AI-generated result:

Task: ${task.content}
Task Type: ${task.type || 'general'}
Requirements: ${task.requirements ? task.requirements.join(', ') : 'Standard quality'}

Result:
${resultContent}

Please evaluate this result across multiple dimensions:
1. Accuracy - How factually correct and precise is the result?
2. Completeness - Does it fully address the task requirements?
3. Clarity - Is it well-structured and easy to understand?
4. Relevance - How well does it match the task objectives?

For each dimension, provide a score from 0.0 to 1.0, along with an overall score.
Also identify key strengths and areas for improvement.
Indicate your confidence in this evaluation.`;
  }

  /**
   * Schema para avaliação de qualidade
   * @private
   */
  _getEvaluationSchema() {
    return {
      type: 'object',
      properties: {
        overallScore: { type: 'number', minimum: 0, maximum: 1 },
        dimensions: {
          type: 'object',
          properties: {
            accuracy: { type: 'number', minimum: 0, maximum: 1 },
            completeness: { type: 'number', minimum: 0, maximum: 1 },
            clarity: { type: 'number', minimum: 0, maximum: 1 },
            relevance: { type: 'number', minimum: 0, maximum: 1 }
          }
        },
        strengths: { type: 'array', items: { type: 'string' } },
        weaknesses: { type: 'array', items: { type: 'string' } },
        confidence: { type: 'number', minimum: 0, maximum: 1 }
      }
    };
  }

  /**
   * Avalia potencial de melhoria
   * @private
   */
  _assessImprovementPotential(evaluation) {
    const { dimensions } = evaluation;
    
    if (!dimensions) return 0.1;
    
    // Calcula o potencial baseado nas dimensões com menor score
    const scores = Object.values(dimensions);
    const minScore = Math.min(...scores);
    const maxScore = Math.max(...scores);
    
    // Se há muita variação entre dimensões, há potencial de melhoria
    const variation = maxScore - minScore;
    const improvementPotential = (this.thresholds.target - evaluation.overallScore) + variation;
    
    return Math.max(0, improvementPotential);
  }

  /**
   * Atualiza métricas internas
   * @private
   */
  _updateMetrics(evaluation) {
    this.metrics.totalEvaluations++;
    
    // Atualiza score médio
    const currentAvg = this.metrics.averageScore;
    const newAvg = ((currentAvg * (this.metrics.totalEvaluations - 1)) + evaluation.overallScore) / 
                   this.metrics.totalEvaluations;
    this.metrics.averageScore = newAvg;
    
    // Calcula trend de melhoria
    if (this.metrics.totalEvaluations > 1) {
      this.metrics.improvementTrend = newAvg - currentAvg;
    }
  }

  /**
   * Retorna métricas de qualidade atuais
   * @returns {Object} Métricas de qualidade
   */
  getQualityMetrics() {
    const successRate = this.feedbackHistory.length > 0 ?
      this.feedbackHistory.filter(entry => 
        entry.evaluation.overallScore >= this.thresholds.minimum
      ).length / this.feedbackHistory.length : 0;
    
    return {
      ...this.metrics,
      successRate,
      currentThresholds: { ...this.thresholds }
    };
  }

  /**
   * Adiciona feedback ao histórico
   * @param {Object} feedback - Entrada de feedback
   */
  addFeedbackToHistory(feedback) {
    this.feedbackHistory.push({
      timestamp: Date.now(),
      feedback
    });
    
    // Mantém apenas os mais recentes
    if (this.feedbackHistory.length > this.evaluationConfig.maxFeedbackHistory) {
      this.feedbackHistory = this.feedbackHistory.slice(-this.evaluationConfig.maxFeedbackHistory);
    }
  }

  /**
   * Analisa tendências de melhoria
   * @returns {Object} Análise de tendências
   */
  analyzeImprovementTrends() {
    if (this.feedbackHistory.length < 3) {
      return { overallTrend: 'insufficient_data', trendStrength: 0 };
    }
    
    const recentEntries = this.feedbackHistory.slice(-this.evaluationConfig.trendAnalysisWindow);
    const scores = recentEntries.map(entry => entry.feedback.evaluation.overallScore);
    
    // Calcula tendência linear simples
    const trend = this._calculateLinearTrend(scores);
    const recentAverage = scores.reduce((a, b) => a + b, 0) / scores.length;
    
    return {
      overallTrend: trend > 0.01 ? 'improving' : trend < -0.01 ? 'declining' : 'stable',
      trendStrength: trend,
      recentAverage,
      dataPoints: scores.length
    };
  }

  /**
   * Calcula tendência linear
   * @private
   */
  _calculateLinearTrend(values) {
    if (values.length < 2) return 0;
    
    const n = values.length;
    const sumX = (n * (n - 1)) / 2;
    const sumY = values.reduce((a, b) => a + b, 0);
    const sumXY = values.reduce((sum, y, x) => sum + x * y, 0);
    const sumXX = values.reduce((sum, _, x) => sum + x * x, 0);
    
    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    return slope;
  }

  /**
   * Limpa histórico antigo
   * @param {number} olderThanDays - Dias para considerar antigo
   */
  cleanupOldFeedback(olderThanDays = 30) {
    const cutoffTime = Date.now() - (olderThanDays * 24 * 60 * 60 * 1000);
    this.feedbackHistory = this.feedbackHistory.filter(entry => 
      entry.timestamp > cutoffTime
    );
  }
}

module.exports = QualityController;