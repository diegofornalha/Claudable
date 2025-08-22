const QualityController = require('../services/QualityController');

describe('QualityController', () => {
  let qualityController;
  let mockAiSdkProvider;
  let mockFeedbackProcessor;

  beforeEach(() => {
    mockAiSdkProvider = {
      generateObject: jest.fn(),
      generateText: jest.fn()
    };

    mockFeedbackProcessor = {
      processFeedback: jest.fn(),
      generateImprovementSuggestions: jest.fn(),
      updateThresholds: jest.fn()
    };

    qualityController = new QualityController(mockAiSdkProvider, mockFeedbackProcessor);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    test('should initialize with provided dependencies', () => {
      expect(qualityController.aiSdkProvider).toBe(mockAiSdkProvider);
      expect(qualityController.feedbackProcessor).toBe(mockFeedbackProcessor);
    });

    test('should initialize quality thresholds', () => {
      expect(qualityController.thresholds).toBeDefined();
      expect(qualityController.thresholds.minimum).toBe(0.7);
      expect(qualityController.thresholds.target).toBe(0.85);
      expect(qualityController.thresholds.excellent).toBe(0.95);
    });

    test('should initialize quality metrics tracking', () => {
      expect(qualityController.metrics).toBeDefined();
      expect(qualityController.metrics.totalEvaluations).toBe(0);
      expect(qualityController.metrics.averageScore).toBe(0);
      expect(qualityController.metrics.improvementTrend).toBe(0);
    });

    test('should initialize feedback history as empty array', () => {
      expect(qualityController.feedbackHistory).toEqual([]);
    });
  });

  describe('evaluateQuality', () => {
    test('should evaluate text generation quality correctly', async () => {
      const result = {
        type: 'text_generation',
        content: 'This is a well-written, comprehensive response that addresses all aspects of the question.',
        metadata: { tokensUsed: 150, responseTime: 2000 }
      };

      const task = {
        content: 'Generate a helpful response',
        requirements: ['accuracy', 'completeness', 'clarity']
      };

      const expectedEvaluation = {
        overallScore: 0.89,
        dimensions: {
          accuracy: 0.92,
          completeness: 0.88,
          clarity: 0.87,
          relevance: 0.90
        },
        strengths: ['Clear structure', 'Comprehensive coverage'],
        weaknesses: ['Could include more examples'],
        passed: true,
        confidence: 0.85
      };

      mockAiSdkProvider.generateObject.mockResolvedValue(expectedEvaluation);

      const evaluation = await qualityController.evaluateQuality(result, task);

      expect(evaluation.overallScore).toBe(0.89);
      expect(evaluation.passed).toBe(true);
      expect(evaluation.dimensions.accuracy).toBe(0.92);
      expect(evaluation.strengths).toContain('Clear structure');
      expect(mockAiSdkProvider.generateObject).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: expect.stringContaining('Evaluate the quality'),
          schema: expect.any(Object)
        })
      );
    });

    test('should evaluate data analysis quality with specific criteria', async () => {
      const result = {
        type: 'data_analysis',
        content: 'Analysis shows 15% revenue increase with statistical significance p < 0.05',
        data: { charts: ['revenue_trend.png'], metrics: { accuracy: 0.95 } },
        metadata: { tokensUsed: 300, responseTime: 8000 }
      };

      const task = {
        content: 'Analyze quarterly sales data',
        requirements: ['statistical_validity', 'insights_quality', 'visualization']
      };

      const expectedEvaluation = {
        overallScore: 0.93,
        dimensions: {
          statistical_validity: 0.95,
          insights_quality: 0.92,
          visualization: 0.91,
          completeness: 0.94
        },
        strengths: ['Strong statistical foundation', 'Clear insights'],
        weaknesses: ['Limited trend analysis'],
        passed: true,
        confidence: 0.91
      };

      mockAiSdkProvider.generateObject.mockResolvedValue(expectedEvaluation);

      const evaluation = await qualityController.evaluateQuality(result, task);

      expect(evaluation.overallScore).toBe(0.93);
      expect(evaluation.dimensions.statistical_validity).toBe(0.95);
      expect(evaluation.passed).toBe(true);
    });

    test('should fail evaluation when quality is below threshold', async () => {
      const result = {
        type: 'text_generation',
        content: 'Short incomplete response',
        metadata: { tokensUsed: 25, responseTime: 500 }
      };

      const task = {
        content: 'Generate comprehensive analysis',
        requirements: ['completeness', 'depth', 'accuracy']
      };

      const expectedEvaluation = {
        overallScore: 0.45,
        dimensions: {
          completeness: 0.3,
          depth: 0.4,
          accuracy: 0.65,
          relevance: 0.5
        },
        strengths: ['Partially relevant'],
        weaknesses: ['Too brief', 'Lacks depth', 'Incomplete analysis'],
        passed: false,
        confidence: 0.88
      };

      mockAiSdkProvider.generateObject.mockResolvedValue(expectedEvaluation);

      const evaluation = await qualityController.evaluateQuality(result, task);

      expect(evaluation.overallScore).toBe(0.45);
      expect(evaluation.passed).toBe(false);
      expect(evaluation.weaknesses).toContain('Too brief');
    });

    test('should handle evaluation errors gracefully', async () => {
      const result = { type: 'test', content: 'test content' };
      const task = { content: 'test task' };

      mockAiSdkProvider.generateObject.mockRejectedValue(new Error('AI service unavailable'));

      await expect(qualityController.evaluateQuality(result, task))
        .rejects.toThrow('Quality evaluation failed');
    });
  });

  describe('provideFeedback', () => {
    test('should provide constructive feedback for improvements', async () => {
      const evaluation = {
        overallScore: 0.65,
        dimensions: {
          accuracy: 0.8,
          completeness: 0.5,
          clarity: 0.7
        },
        weaknesses: ['Incomplete analysis', 'Missing examples']
      };

      const task = {
        content: 'Analyze market trends',
        type: 'data_analysis'
      };

      const expectedFeedback = {
        improvementAreas: [
          'Expand analysis to cover all market segments',
          'Include specific examples and case studies',
          'Add quantitative metrics to support conclusions'
        ],
        specificSuggestions: [
          'Include trend data for the past 5 years',
          'Add competitor analysis section',
          'Provide actionable recommendations'
        ],
        priority: 'high',
        estimatedImprovementScore: 0.85
      };

      mockFeedbackProcessor.generateImprovementSuggestions.mockResolvedValue(expectedFeedback);

      const feedback = await qualityController.provideFeedback(evaluation, task);

      expect(feedback.improvementAreas).toHaveLength(3);
      expect(feedback.priority).toBe('high');
      expect(feedback.estimatedImprovementScore).toBe(0.85);
      expect(mockFeedbackProcessor.generateImprovementSuggestions).toHaveBeenCalledWith(
        evaluation,
        task
      );
    });

    test('should provide minimal feedback for high-quality results', async () => {
      const evaluation = {
        overallScore: 0.92,
        dimensions: {
          accuracy: 0.95,
          completeness: 0.9,
          clarity: 0.91
        },
        weaknesses: ['Minor formatting issues']
      };

      const task = {
        content: 'Generate summary report',
        type: 'text_generation'
      };

      const expectedFeedback = {
        improvementAreas: ['Improve formatting consistency'],
        specificSuggestions: ['Use consistent heading styles'],
        priority: 'low',
        estimatedImprovementScore: 0.95
      };

      mockFeedbackProcessor.generateImprovementSuggestions.mockResolvedValue(expectedFeedback);

      const feedback = await qualityController.provideFeedback(evaluation, task);

      expect(feedback.improvementAreas).toHaveLength(1);
      expect(feedback.priority).toBe('low');
    });
  });

  describe('shouldRetry', () => {
    test('should recommend retry for low quality with improvement potential', () => {
      const evaluation = {
        overallScore: 0.55,
        confidence: 0.9,
        dimensions: { accuracy: 0.8, completeness: 0.3 }
      };

      const retryCount = 1;
      const maxRetries = 3;

      const shouldRetry = qualityController.shouldRetry(evaluation, retryCount, maxRetries);

      expect(shouldRetry).toBe(true);
    });

    test('should not recommend retry when max retries reached', () => {
      const evaluation = {
        overallScore: 0.55,
        confidence: 0.9
      };

      const retryCount = 3;
      const maxRetries = 3;

      const shouldRetry = qualityController.shouldRetry(evaluation, retryCount, maxRetries);

      expect(shouldRetry).toBe(false);
    });

    test('should not recommend retry for acceptable quality', () => {
      const evaluation = {
        overallScore: 0.75,
        confidence: 0.85
      };

      const retryCount = 1;
      const maxRetries = 3;

      const shouldRetry = qualityController.shouldRetry(evaluation, retryCount, maxRetries);

      expect(shouldRetry).toBe(false);
    });

    test('should not recommend retry for very low confidence evaluations', () => {
      const evaluation = {
        overallScore: 0.55,
        confidence: 0.3
      };

      const retryCount = 1;
      const maxRetries = 3;

      const shouldRetry = qualityController.shouldRetry(evaluation, retryCount, maxRetries);

      expect(shouldRetry).toBe(false);
    });
  });

  describe('updateThresholds', () => {
    test('should adapt thresholds based on performance history', () => {
      const performanceHistory = [
        { score: 0.85, timestamp: Date.now() - 3600000 },
        { score: 0.88, timestamp: Date.now() - 3000000 },
        { score: 0.92, timestamp: Date.now() - 1800000 },
        { score: 0.89, timestamp: Date.now() - 900000 }
      ];

      mockFeedbackProcessor.updateThresholds.mockReturnValue({
        minimum: 0.75,
        target: 0.88,
        excellent: 0.96
      });

      qualityController.updateThresholds(performanceHistory);

      expect(qualityController.thresholds.minimum).toBe(0.75);
      expect(qualityController.thresholds.target).toBe(0.88);
      expect(qualityController.thresholds.excellent).toBe(0.96);
      expect(mockFeedbackProcessor.updateThresholds).toHaveBeenCalledWith(
        performanceHistory,
        expect.objectContaining({
          minimum: 0.7,
          target: 0.85,
          excellent: 0.95
        })
      );
    });

    test('should not lower minimum threshold below safety limit', () => {
      const performanceHistory = [
        { score: 0.5, timestamp: Date.now() - 3600000 },
        { score: 0.45, timestamp: Date.now() - 3000000 }
      ];

      mockFeedbackProcessor.updateThresholds.mockReturnValue({
        minimum: 0.6,  // Should not go below 0.6
        target: 0.75,
        excellent: 0.9
      });

      qualityController.updateThresholds(performanceHistory);

      expect(qualityController.thresholds.minimum).toBeGreaterThanOrEqual(0.6);
    });
  });

  describe('getQualityMetrics', () => {
    test('should return current quality metrics', () => {
      qualityController.metrics = {
        totalEvaluations: 150,
        averageScore: 0.84,
        improvementTrend: 0.05,
        thresholdAdjustments: 3
      };

      const metrics = qualityController.getQualityMetrics();

      expect(metrics.totalEvaluations).toBe(150);
      expect(metrics.averageScore).toBe(0.84);
      expect(metrics.improvementTrend).toBe(0.05);
      expect(metrics.successRate).toBeDefined();
    });
  });

  describe('addFeedbackToHistory', () => {
    test('should add feedback to history with timestamp', () => {
      const feedback = {
        evaluation: { overallScore: 0.8 },
        improvements: ['Add more examples'],
        applied: false
      };

      qualityController.addFeedbackToHistory(feedback);

      expect(qualityController.feedbackHistory).toHaveLength(1);
      expect(qualityController.feedbackHistory[0].timestamp).toBeDefined();
      expect(qualityController.feedbackHistory[0].feedback).toBe(feedback);
    });

    test('should limit feedback history size', () => {
      // Add many feedback entries
      for (let i = 0; i < 200; i++) {
        qualityController.addFeedbackToHistory({ test: i });
      }

      // Should keep only the most recent 100 entries
      expect(qualityController.feedbackHistory.length).toBeLessThanOrEqual(100);
    });
  });

  describe('analyzeImprovementTrends', () => {
    test('should analyze quality improvement trends over time', () => {
      qualityController.feedbackHistory = [
        { 
          timestamp: Date.now() - 7200000, 
          feedback: { evaluation: { overallScore: 0.75 } } 
        },
        { 
          timestamp: Date.now() - 3600000, 
          feedback: { evaluation: { overallScore: 0.82 } } 
        },
        { 
          timestamp: Date.now() - 1800000, 
          feedback: { evaluation: { overallScore: 0.88 } } 
        }
      ];

      const trends = qualityController.analyzeImprovementTrends();

      expect(trends.overallTrend).toBe('improving');
      expect(trends.trendStrength).toBeGreaterThan(0);
      expect(trends.recentAverage).toBeCloseTo(0.85, 1);
    });

    test('should detect declining quality trends', () => {
      qualityController.feedbackHistory = [
        { 
          timestamp: Date.now() - 7200000, 
          feedback: { evaluation: { overallScore: 0.9 } } 
        },
        { 
          timestamp: Date.now() - 3600000, 
          feedback: { evaluation: { overallScore: 0.8 } } 
        },
        { 
          timestamp: Date.now() - 1800000, 
          feedback: { evaluation: { overallScore: 0.7 } } 
        }
      ];

      const trends = qualityController.analyzeImprovementTrends();

      expect(trends.overallTrend).toBe('declining');
      expect(trends.trendStrength).toBeLessThan(0);
    });
  });
});