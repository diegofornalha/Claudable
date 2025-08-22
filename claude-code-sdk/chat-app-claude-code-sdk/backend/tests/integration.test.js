/**
 * Testes de Integração - Fluxo Completo Orchestrator-Worker Pattern
 * Testa a integração entre EnhancedAgentManager, OrchestratorService e QualityController
 */

const EnhancedAgentManager = require('../services/EnhancedAgentManager');
const OrchestratorService = require('../services/OrchestratorService');
const QualityController = require('../services/QualityController');

describe('Integration Tests - Orchestrator-Worker Pattern', () => {
  let agentManager;
  let orchestratorService;
  let qualityController;
  let mockAiSdkProvider;
  let mockWorkerPool;
  let mockFeedbackProcessor;

  beforeEach(() => {
    // Mock AI SDK Provider com implementações realísticas
    mockAiSdkProvider = {
      analyzeComplexity: jest.fn(),
      generateText: jest.fn(),
      generateObject: jest.fn()
    };

    // Mock Worker Pool
    mockWorkerPool = {
      getAvailableWorkers: jest.fn(),
      assignTask: jest.fn(),
      getTaskResult: jest.fn(),
      releaseWorker: jest.fn()
    };

    // Mock Feedback Processor
    mockFeedbackProcessor = {
      generateImprovementSuggestions: jest.fn(),
      updateThresholds: jest.fn(),
      processFeedback: jest.fn()
    };

    // Inicializar serviços
    orchestratorService = new OrchestratorService(mockAiSdkProvider, mockWorkerPool);
    qualityController = new QualityController(mockAiSdkProvider, mockFeedbackProcessor);
    agentManager = new EnhancedAgentManager(mockAiSdkProvider, orchestratorService, qualityController);

    // Registrar agentes de teste
    agentManager.registerAgent({
      id: 'claude-general',
      type: 'general',
      capabilities: ['text_generation', 'analysis'],
      performance: { avgTime: 2000, successRate: 0.95 }
    });

    agentManager.registerAgent({
      id: 'claude-specialist',
      type: 'specialist',
      capabilities: ['data_analysis', 'visualization', 'report_generation'],
      performance: { avgTime: 5000, successRate: 0.98 }
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Simple Task Flow', () => {
    test('should execute simple task with single agent end-to-end', async () => {
      const task = {
        id: 'simple-task-1',
        content: 'Generate a comprehensive product description for a new smartphone',
        type: 'text_generation',
        priority: 'high'
      };

      // Setup mocks for simple task flow
      mockAiSdkProvider.analyzeComplexity.mockResolvedValue({
        score: 0.25,
        factors: ['text_generation'],
        estimatedTime: 2000
      });

      mockAiSdkProvider.generateText.mockResolvedValue({
        text: 'The new smartphone features cutting-edge technology with advanced camera capabilities, powerful processing, and exceptional battery life. Perfect for professionals and tech enthusiasts.',
        usage: { tokens: 85 }
      });

      mockAiSdkProvider.generateObject.mockResolvedValue({
        overallScore: 0.92,
        dimensions: {
          accuracy: 0.95,
          completeness: 0.90,
          clarity: 0.91,
          relevance: 0.93
        },
        strengths: ['Clear and engaging description', 'Highlights key features'],
        weaknesses: ['Could include more technical specifications'],
        confidence: 0.88
      });

      // Execute task
      const result = await agentManager.executeTask(task);

      // Assertions
      expect(result.success).toBe(true);
      expect(result.strategy).toBe('single_agent');
      expect(result.result.text).toContain('smartphone');
      expect(result.quality.overallScore).toBe(0.92);
      expect(result.quality.passed).toBe(true);
      expect(result.duration).toBeGreaterThanOrEqual(0);

      // Verify AI SDK calls
      expect(mockAiSdkProvider.analyzeComplexity).toHaveBeenCalledWith(task.content);
      expect(mockAiSdkProvider.generateText).toHaveBeenCalled();
      expect(mockAiSdkProvider.generateObject).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: expect.stringContaining('Evaluate the quality')
        })
      );

      // Verify metrics were updated
      const metrics = agentManager.getPerformanceMetrics();
      expect(metrics.totalTasks).toBe(1);
      expect(metrics.successfulTasks).toBe(1);
      expect(metrics.successRate).toBe(1);
    });
  });

  describe('Complex Task Flow', () => {
    test('should execute complex task with orchestrator-worker pattern end-to-end', async () => {
      const complexTask = {
        id: 'complex-task-1',
        content: 'Analyze quarterly sales data, create visualizations, and generate executive summary report',
        type: 'complex_analysis',
        requirements: ['data_analysis', 'visualization', 'report_generation'],
        priority: 'high'
      };

      // Setup mocks for complex task flow
      mockAiSdkProvider.analyzeComplexity.mockResolvedValue({
        score: 0.85,
        factors: ['data_analysis', 'visualization', 'multi_step'],
        estimatedTime: 15000
      });

      // Mock task decomposition
      mockAiSdkProvider.generateObject
        .mockResolvedValueOnce({
          subtasks: [
            {
              id: 'subtask-1',
              type: 'data_analysis',
              description: 'Analyze quarterly sales data for trends',
              dependencies: [],
              estimatedTime: 5000,
              requiredCapabilities: ['data_analysis']
            },
            {
              id: 'subtask-2',
              type: 'visualization',
              description: 'Create charts and graphs',
              dependencies: ['subtask-1'],
              estimatedTime: 3000,
              requiredCapabilities: ['visualization']
            },
            {
              id: 'subtask-3',
              type: 'report_generation',
              description: 'Generate executive summary',
              dependencies: ['subtask-1', 'subtask-2'],
              estimatedTime: 4000,
              requiredCapabilities: ['report_generation']
            }
          ],
          executionPlan: {
            totalEstimatedTime: 12000,
            parallelizable: ['subtask-1'],
            sequential: ['subtask-2', 'subtask-3']
          }
        })
        // Mock result aggregation
        .mockResolvedValueOnce({
          finalResult: 'Comprehensive quarterly analysis showing 15% revenue growth with supporting visualizations and executive recommendations',
          summary: 'Successfully completed complex analysis with data insights, charts, and executive summary',
          metadata: {
            totalDuration: 11500,
            totalTokensUsed: 450,
            subtasksCompleted: 3,
            success: true
          }
        })
        // Mock quality evaluation
        .mockResolvedValueOnce({
          overallScore: 0.94,
          dimensions: {
            accuracy: 0.96,
            completeness: 0.93,
            clarity: 0.94,
            relevance: 0.95
          },
          strengths: ['Comprehensive analysis', 'Clear visualizations', 'Actionable insights'],
          weaknesses: ['Minor formatting improvements possible'],
          confidence: 0.92
        });

      // Mock worker coordination
      mockWorkerPool.getAvailableWorkers.mockReturnValue([
        { id: 'worker-1', capabilities: ['data_analysis'], isAvailable: true },
        { id: 'worker-2', capabilities: ['visualization'], isAvailable: true },
        { id: 'worker-3', capabilities: ['report_generation'], isAvailable: true }
      ]);

      mockWorkerPool.assignTask.mockResolvedValue({ taskId: 'assigned', workerId: 'worker-1' });

      mockWorkerPool.getTaskResult
        .mockResolvedValueOnce({
          subtaskId: 'subtask-1',
          result: 'Sales analysis complete: 15% growth identified',
          duration: 4500
        })
        .mockResolvedValueOnce({
          subtaskId: 'subtask-2',
          result: 'Visualizations created: trend charts and performance graphs',
          duration: 2800
        })
        .mockResolvedValueOnce({
          subtaskId: 'subtask-3',
          result: 'Executive summary generated with key insights and recommendations',
          duration: 3200
        });

      // Execute complex task
      const result = await agentManager.executeTask(complexTask);

      // Assertions
      expect(result.success).toBe(true);
      expect(result.strategy).toBe('orchestrator_worker');
      expect(result.result.finalResult).toContain('quarterly analysis');
      expect(result.result.metadata.subtasksCompleted).toBe(3);
      expect(result.quality.overallScore).toBe(0.94);
      expect(result.quality.passed).toBe(true);

      // Verify orchestration flow
      expect(mockAiSdkProvider.generateObject).toHaveBeenCalledTimes(3); // decomposition + aggregation + quality
      expect(mockWorkerPool.getAvailableWorkers).toHaveBeenCalled();
      expect(mockWorkerPool.assignTask).toHaveBeenCalled();
      expect(mockWorkerPool.getTaskResult).toHaveBeenCalledTimes(3);

      // Verify metrics
      const metrics = agentManager.getPerformanceMetrics();
      expect(metrics.totalTasks).toBe(1);
      expect(metrics.successfulTasks).toBe(1);
    });
  });

  describe('Quality Control Flow', () => {
    test('should retry low quality results and improve through feedback', async () => {
      const task = {
        id: 'quality-test-1',
        content: 'Write a detailed technical article about AI',
        type: 'text_generation'
      };

      // Setup mocks
      mockAiSdkProvider.analyzeComplexity.mockResolvedValue({
        score: 0.3,
        factors: ['text_generation'],
        estimatedTime: 3000
      });

      // First attempt - low quality
      mockAiSdkProvider.generateText
        .mockResolvedValueOnce({
          text: 'AI is technology.',
          usage: { tokens: 15 }
        })
        // Second attempt - improved quality
        .mockResolvedValueOnce({
          text: 'Artificial Intelligence represents a transformative technology that enables machines to simulate human intelligence through advanced algorithms, machine learning, and neural networks. This comprehensive field encompasses various applications from natural language processing to computer vision.',
          usage: { tokens: 120 }
        });

      // Quality evaluations
      mockAiSdkProvider.generateObject
        .mockResolvedValueOnce({
          overallScore: 0.45,
          dimensions: {
            accuracy: 0.7,
            completeness: 0.2,
            clarity: 0.5,
            relevance: 0.4
          },
          strengths: ['Accurate but basic'],
          weaknesses: ['Too brief', 'Lacks detail', 'Not comprehensive'],
          confidence: 0.9
        })
        .mockResolvedValueOnce({
          overallScore: 0.88,
          dimensions: {
            accuracy: 0.92,
            completeness: 0.85,
            clarity: 0.89,
            relevance: 0.86
          },
          strengths: ['Comprehensive coverage', 'Clear explanations', 'Good technical depth'],
          weaknesses: ['Could include more examples'],
          confidence: 0.91
        });

      // Mock feedback
      mockFeedbackProcessor.generateImprovementSuggestions.mockResolvedValue({
        improvementAreas: ['Expand content significantly', 'Add technical details', 'Include real-world applications'],
        specificSuggestions: ['Discuss ML algorithms', 'Add use cases', 'Explain neural networks'],
        priority: 'high',
        estimatedImprovementScore: 0.85
      });

      // Execute task
      const result = await agentManager.executeTask(task);

      // Assertions
      expect(result.success).toBe(true);
      expect(result.retryCount).toBe(1);
      expect(result.result.text).toContain('Artificial Intelligence');
      expect(result.quality.overallScore).toBe(0.88);

      // Verify retry logic was executed
      expect(mockAiSdkProvider.generateText).toHaveBeenCalledTimes(2);
      expect(mockAiSdkProvider.generateObject).toHaveBeenCalledTimes(2);
      expect(mockFeedbackProcessor.generateImprovementSuggestions).toHaveBeenCalled();

      // Verify quality controller feedback history
      expect(qualityController.feedbackHistory.length).toBe(1);
    });

    test('should fail task after maximum retries with poor quality', async () => {
      const task = {
        id: 'fail-test-1',
        content: 'Generate comprehensive analysis',
        type: 'text_generation'
      };

      // Setup mocks for consistent failure
      mockAiSdkProvider.analyzeComplexity.mockResolvedValue({
        score: 0.2,
        factors: ['text_generation'],
        estimatedTime: 1500
      });

      mockAiSdkProvider.generateText.mockResolvedValue({
        text: 'Brief response.',
        usage: { tokens: 10 }
      });

      mockAiSdkProvider.generateObject.mockResolvedValue({
        overallScore: 0.3,
        dimensions: {
          accuracy: 0.4,
          completeness: 0.2,
          clarity: 0.3,
          relevance: 0.3
        },
        strengths: ['Minimal'],
        weaknesses: ['Too brief', 'Lacks depth', 'Incomplete'],
        confidence: 0.85
      });

      mockFeedbackProcessor.generateImprovementSuggestions.mockResolvedValue({
        improvementAreas: ['Expand significantly'],
        specificSuggestions: ['Add more content'],
        priority: 'critical',
        estimatedImprovementScore: 0.6
      });

      // Execute task with limited retries
      const result = await agentManager.executeTask(task, { maxRetries: 2 });

      // Assertions
      expect(result.success).toBe(false);
      expect(result.retryCount).toBe(2);
      expect(result.error).toContain('Maximum retry attempts exceeded');

      // Verify multiple attempts were made (initial + retries, but should stop at maxRetries)
      expect(mockAiSdkProvider.generateText).toHaveBeenCalledTimes(2); // Initial + retries up to max
      expect(mockAiSdkProvider.generateObject).toHaveBeenCalledTimes(2); // Quality evaluations
    });
  });

  describe('Performance and Metrics', () => {
    test('should track comprehensive performance metrics across multiple tasks', async () => {
      const tasks = [
        {
          id: 'perf-task-1',
          content: 'Generate simple greeting',
          type: 'text_generation'
        },
        {
          id: 'perf-task-2',
          content: 'Create detailed analysis',
          type: 'text_generation'
        }
      ];

      // Setup mocks for successful tasks
      mockAiSdkProvider.analyzeComplexity.mockResolvedValue({
        score: 0.2,
        factors: ['text_generation'],
        estimatedTime: 1000
      });

      mockAiSdkProvider.generateText
        .mockResolvedValueOnce({
          text: 'Hello, welcome!',
          usage: { tokens: 25 }
        })
        .mockResolvedValueOnce({
          text: 'Detailed analysis with comprehensive insights and recommendations.',
          usage: { tokens: 75 }
        });

      mockAiSdkProvider.generateObject.mockResolvedValue({
        overallScore: 0.9,
        dimensions: {
          accuracy: 0.92,
          completeness: 0.88,
          clarity: 0.91,
          relevance: 0.89
        },
        strengths: ['High quality'],
        weaknesses: ['Minor improvements'],
        confidence: 0.87
      });

      // Execute tasks
      const results = await Promise.all(
        tasks.map(task => agentManager.executeTask(task))
      );

      // Verify all tasks succeeded
      results.forEach(result => {
        expect(result.success).toBe(true);
        expect(result.quality.passed).toBe(true);
      });

      // Check performance metrics
      const metrics = agentManager.getPerformanceMetrics();
      expect(metrics.totalTasks).toBe(2);
      expect(metrics.successfulTasks).toBe(2);
      expect(metrics.successRate).toBe(1);
      expect(metrics.totalTokensUsed).toBe(100);
      expect(metrics.avgResponseTime).toBeGreaterThanOrEqual(0);

      // Check quality metrics
      const qualityMetrics = qualityController.getQualityMetrics();
      expect(qualityMetrics.totalEvaluations).toBe(2);
      expect(qualityMetrics.averageScore).toBeCloseTo(0.9, 1);
    });
  });

  describe('Error Handling and Recovery', () => {
    test('should handle AI service failures gracefully', async () => {
      const task = {
        id: 'error-task-1',
        content: 'Test error handling',
        type: 'text_generation'
      };

      // Mock AI service failure
      mockAiSdkProvider.analyzeComplexity.mockRejectedValue(new Error('AI service unavailable'));

      // Execute task
      const result = await agentManager.executeTask(task);

      // Assertions
      expect(result.success).toBe(false);
      expect(result.error).toContain('Task complexity analysis failed');
      
      // Verify metrics reflect the failure
      const metrics = agentManager.getPerformanceMetrics();
      expect(metrics.totalTasks).toBe(1);
      expect(metrics.successfulTasks).toBe(0);
      expect(metrics.successRate).toBe(0);
    });

    test('should handle orchestrator service failures in complex tasks', async () => {
      const complexTask = {
        id: 'error-complex-1',
        content: 'Complex task with orchestrator failure',
        type: 'complex_analysis'
      };

      // Setup for complex task
      mockAiSdkProvider.analyzeComplexity.mockResolvedValue({
        score: 0.8,
        factors: ['multi_step'],
        estimatedTime: 10000
      });

      // Mock orchestrator failure
      mockAiSdkProvider.generateObject.mockRejectedValue(new Error('Decomposition service failed'));

      // Execute task
      const result = await agentManager.executeTask(complexTask);

      // Assertions
      expect(result.success).toBe(false);
      expect(result.error).toContain('Task decomposition failed');
    });
  });
});