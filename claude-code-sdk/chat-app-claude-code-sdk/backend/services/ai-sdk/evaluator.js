/**
 * AI SDK Evaluator Service
 * Implementa quality control loops com avaliação e re-processamento
 */

const { generateObject, generateText } = require('ai');
const { z } = require('zod');
const { claudeCode } = require('../../providers/ai-sdk-provider');

// Schema para quality evaluation
const QualityEvaluationSchema = z.object({
  score: z.number().min(0).max(10),
  passed: z.boolean(),
  issues: z.array(z.object({
    type: z.enum(['accuracy', 'completeness', 'relevance', 'format', 'safety']),
    severity: z.enum(['low', 'medium', 'high', 'critical']),
    description: z.string(),
    suggestion: z.string()
  })),
  strengths: z.array(z.string()),
  improvements: z.array(z.string()),
  requiresReprocessing: z.boolean(),
  reprocessingStrategy: z.enum(['retry', 'enhance', 'alternative', 'none']).optional()
});

// Schema para improvement suggestions
const ImprovementSchema = z.object({
  originalResponse: z.string(),
  improvedResponse: z.string(),
  changes: z.array(z.object({
    type: z.string(),
    description: z.string(),
    impact: z.enum(['minor', 'moderate', 'major'])
  })),
  confidence: z.number().min(0).max(1)
});

class Evaluator {
  constructor() {
    this.model = claudeCode('opus');
    this.evaluationHistory = [];
    this.qualityThreshold = 7; // Minimum quality score
    this.maxRetries = 3;
  }

  /**
   * Avalia a qualidade de uma resposta
   */
  async evaluateResponse(response, originalRequest, criteria = {}) {
    console.log('[Evaluator] Evaluating response quality...');
    
    try {
      const evaluation = await generateObject({
        model: this.model,
        schema: QualityEvaluationSchema,
        prompt: `
          Evaluate the quality of this AI response:
          
          Original Request: "${originalRequest}"
          
          Response: "${response}"
          
          Evaluation Criteria:
          - Accuracy: Is the information correct?
          - Completeness: Does it fully address the request?
          - Relevance: Is it on-topic and focused?
          - Format: Is it well-structured and readable?
          - Safety: Is it safe and appropriate?
          
          Custom Criteria:
          ${JSON.stringify(criteria, null, 2)}
          
          Provide a comprehensive quality evaluation with score (0-10).
          Score >= ${this.qualityThreshold} passes quality check.
        `,
        experimental_telemetry: {
          functionId: 'evaluator-evaluate',
          metadata: { 
            response_length: response.length,
            has_custom_criteria: Object.keys(criteria).length > 0
          }
        }
      });

      // Store evaluation history
      this._storeEvaluation(evaluation.object, originalRequest);

      return {
        success: true,
        evaluation: evaluation.object,
        metadata: {
          evaluationTime: evaluation.usage?.totalDuration,
          tokens: evaluation.usage?.totalTokens
        }
      };
    } catch (error) {
      console.error('[Evaluator] Evaluation error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Loop de quality control com re-processamento
   */
  async qualityControlLoop(generateFn, request, options = {}) {
    console.log('[Evaluator] Starting quality control loop...');
    
    const { 
      maxAttempts = this.maxRetries,
      targetScore = this.qualityThreshold,
      improveOnFail = true,
      stopWhen = null
    } = options;

    let attempts = 0;
    let bestResponse = null;
    let bestScore = 0;
    const history = [];

    while (attempts < maxAttempts) {
      attempts++;
      console.log(`[Evaluator] Attempt ${attempts}/${maxAttempts}`);

      try {
        // Generate response
        const response = await generateFn(request, {
          previousAttempts: history,
          attemptNumber: attempts
        });

        // Evaluate quality
        const evalResult = await this.evaluateResponse(
          response,
          request,
          options.criteria
        );

        if (!evalResult.success) {
          throw new Error(evalResult.error);
        }

        const evaluation = evalResult.evaluation;
        history.push({ response, evaluation, attempt: attempts });

        // Track best response
        if (evaluation.score > bestScore) {
          bestResponse = response;
          bestScore = evaluation.score;
        }

        // Check if quality threshold met
        if (evaluation.score >= targetScore) {
          console.log(`[Evaluator] Quality threshold met (${evaluation.score}/${targetScore})`);
          return {
            success: true,
            response: response,
            evaluation,
            attempts,
            history
          };
        }

        // Check custom stop condition
        if (stopWhen && stopWhen(evaluation, attempts)) {
          console.log('[Evaluator] Custom stop condition met');
          return {
            success: true,
            response: bestResponse,
            evaluation,
            attempts,
            history
          };
        }

        // Improve response if needed
        if (improveOnFail && evaluation.requiresReprocessing) {
          const improved = await this.improveResponse(
            response,
            request,
            evaluation
          );
          
          if (improved.success) {
            // Re-evaluate improved response
            const improvedEval = await this.evaluateResponse(
              improved.response,
              request,
              options.criteria
            );

            if (improvedEval.success && improvedEval.evaluation.score >= targetScore) {
              console.log(`[Evaluator] Improved response meets quality (${improvedEval.evaluation.score}/${targetScore})`);
              return {
                success: true,
                response: improved.response,
                evaluation: improvedEval.evaluation,
                attempts,
                history,
                improved: true
              };
            }
          }
        }

      } catch (error) {
        console.error(`[Evaluator] Attempt ${attempts} failed:`, error);
        history.push({ error: error.message, attempt: attempts });
      }
    }

    // Return best response if no success
    console.log(`[Evaluator] Max attempts reached. Best score: ${bestScore}`);
    return {
      success: false,
      response: bestResponse,
      bestScore,
      attempts,
      history,
      reason: 'max_attempts_reached'
    };
  }

  /**
   * Melhora uma resposta baseada na avaliação
   */
  async improveResponse(originalResponse, request, evaluation) {
    console.log('[Evaluator] Attempting to improve response...');
    
    try {
      const improvement = await generateObject({
        model: this.model,
        schema: ImprovementSchema,
        prompt: `
          Improve this response based on the quality evaluation:
          
          Original Request: "${request}"
          
          Current Response: "${originalResponse}"
          
          Quality Issues:
          ${JSON.stringify(evaluation.issues, null, 2)}
          
          Improvements Needed:
          ${JSON.stringify(evaluation.improvements, null, 2)}
          
          Generate an improved response that addresses all issues.
          Focus on: ${evaluation.issues.map(i => i.type).join(', ')}
        `,
        experimental_telemetry: {
          functionId: 'evaluator-improve',
          metadata: { 
            issue_count: evaluation.issues.length,
            original_score: evaluation.score
          }
        }
      });

      return {
        success: true,
        response: improvement.object.improvedResponse,
        changes: improvement.object.changes,
        confidence: improvement.object.confidence
      };
    } catch (error) {
      console.error('[Evaluator] Improvement error:', error);
      return {
        success: false,
        error: error.message,
        response: originalResponse // Return original if improvement fails
      };
    }
  }

  /**
   * Compara múltiplas respostas e seleciona a melhor
   */
  async selectBestResponse(responses, request, criteria = {}) {
    console.log(`[Evaluator] Comparing ${responses.length} responses...`);
    
    const evaluations = [];
    
    // Evaluate all responses
    for (const response of responses) {
      const evalResult = await this.evaluateResponse(response, request, criteria);
      evaluations.push({
        response,
        evaluation: evalResult.success ? evalResult.evaluation : null,
        score: evalResult.success ? evalResult.evaluation.score : 0
      });
    }

    // Sort by score
    evaluations.sort((a, b) => b.score - a.score);
    
    const best = evaluations[0];
    
    // Generate comparison summary
    const summary = await generateText({
      model: this.model,
      prompt: `
        Summarize the comparison of ${responses.length} responses:
        
        Best Score: ${best.score}
        Score Range: ${evaluations[evaluations.length - 1].score} - ${best.score}
        
        Best Response Strengths:
        ${JSON.stringify(best.evaluation?.strengths, null, 2)}
        
        Provide a brief summary of why this response was selected.
      `,
      maxTokens: 200
    });

    return {
      success: true,
      bestResponse: best.response,
      bestScore: best.score,
      evaluation: best.evaluation,
      allEvaluations: evaluations,
      summary: summary.text
    };
  }

  /**
   * Valida resposta contra schema específico
   */
  async validateStructuredOutput(response, schema, request) {
    console.log('[Evaluator] Validating structured output...');
    
    try {
      // Parse and validate with Zod
      const parsed = schema.parse(response);
      
      // Additional semantic validation
      const semanticValidation = await generateObject({
        model: this.model,
        schema: z.object({
          valid: z.boolean(),
          errors: z.array(z.string()),
          warnings: z.array(z.string()),
          suggestions: z.array(z.string())
        }),
        prompt: `
          Validate this structured output semantically:
          
          Request: "${request}"
          
          Output:
          ${JSON.stringify(parsed, null, 2)}
          
          Check for:
          - Logical consistency
          - Data completeness
          - Semantic correctness
          - Business rule compliance
        `
      });

      return {
        success: semanticValidation.object.valid,
        parsed,
        validation: semanticValidation.object,
        schemaValid: true
      };
    } catch (error) {
      console.error('[Evaluator] Validation error:', error);
      return {
        success: false,
        error: error.message,
        schemaValid: false
      };
    }
  }

  /**
   * Gera métricas de qualidade agregadas
   */
  getQualityMetrics() {
    if (this.evaluationHistory.length === 0) {
      return null;
    }

    const scores = this.evaluationHistory.map(e => e.evaluation.score);
    const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
    
    const issueTypes = {};
    this.evaluationHistory.forEach(e => {
      e.evaluation.issues.forEach(issue => {
        issueTypes[issue.type] = (issueTypes[issue.type] || 0) + 1;
      });
    });

    return {
      totalEvaluations: this.evaluationHistory.length,
      averageScore: avgScore,
      minScore: Math.min(...scores),
      maxScore: Math.max(...scores),
      passRate: scores.filter(s => s >= this.qualityThreshold).length / scores.length,
      commonIssues: issueTypes,
      recentTrend: this._calculateTrend(scores.slice(-10))
    };
  }

  // Private helper methods
  _storeEvaluation(evaluation, request) {
    this.evaluationHistory.push({
      evaluation,
      request: request.substring(0, 100),
      timestamp: new Date().toISOString()
    });

    // Keep only last 1000 evaluations
    if (this.evaluationHistory.length > 1000) {
      this.evaluationHistory = this.evaluationHistory.slice(-1000);
    }
  }

  _calculateTrend(scores) {
    if (scores.length < 2) return 'stable';
    
    const firstHalf = scores.slice(0, Math.floor(scores.length / 2));
    const secondHalf = scores.slice(Math.floor(scores.length / 2));
    
    const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
    
    if (secondAvg > firstAvg + 0.5) return 'improving';
    if (secondAvg < firstAvg - 0.5) return 'declining';
    return 'stable';
  }
}

module.exports = Evaluator;