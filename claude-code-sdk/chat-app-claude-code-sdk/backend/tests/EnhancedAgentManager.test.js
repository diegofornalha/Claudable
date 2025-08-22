const EnhancedAgentManager = require('../services/EnhancedAgentManager');

describe('EnhancedAgentManager', () => {
  let agentManager;
  let mockAiSdkProvider;
  let mockOrchestratorService;
  let mockQualityController;

  beforeEach(() => {
    // Mocks para dependências
    mockAiSdkProvider = {
      generateText: jest.fn(),
      generateObject: jest.fn(),
      analyzeComplexity: jest.fn()
    };

    mockOrchestratorService = {
      decomposeTask: jest.fn(),
      coordinateWorkers: jest.fn(),
      aggregateResults: jest.fn()
    };

    mockQualityController = {
      evaluateQuality: jest.fn(),
      provideFeedback: jest.fn(),
      shouldRetry: jest.fn()
    };

    agentManager = new EnhancedAgentManager(
      mockAiSdkProvider,
      mockOrchestratorService,
      mockQualityController
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    test('should initialize with provided dependencies', () => {
      expect(agentManager.aiSdkProvider).toBe(mockAiSdkProvider);
      expect(agentManager.orchestratorService).toBe(mockOrchestratorService);
      expect(agentManager.qualityController).toBe(mockQualityController);
    });

    test('should initialize agents registry as empty Map', () => {
      expect(agentManager.agents).toBeInstanceOf(Map);
      expect(agentManager.agents.size).toBe(0);
    });

    test('should initialize performance metrics', () => {
      expect(agentManager.metrics).toBeDefined();
      expect(agentManager.metrics.totalTasks).toBe(0);
      expect(agentManager.metrics.successfulTasks).toBe(0);
      expect(agentManager.metrics.avgResponseTime).toBe(0);
    });
  });

  describe('analyzeTaskComplexity', () => {
    test('should analyze simple task complexity correctly', async () => {
      const simpleTask = 'Generate a greeting message';
      mockAiSdkProvider.analyzeComplexity.mockResolvedValue({
        score: 0.2,
        factors: ['simple_text_generation'],
        estimatedTime: 1000
      });

      const result = await agentManager.analyzeTaskComplexity(simpleTask);

      expect(result.complexity).toBe('simple');
      expect(result.score).toBe(0.2);
      expect(result.recommendedStrategy).toBe('single_agent');
      expect(mockAiSdkProvider.analyzeComplexity).toHaveBeenCalledWith(simpleTask);
    });

    test('should analyze complex task complexity correctly', async () => {
      const complexTask = 'Analyze large dataset, generate report with visualizations, and create presentation';
      mockAiSdkProvider.analyzeComplexity.mockResolvedValue({
        score: 0.8,
        factors: ['data_analysis', 'visualization', 'multi_step'],
        estimatedTime: 30000
      });

      const result = await agentManager.analyzeTaskComplexity(complexTask);

      expect(result.complexity).toBe('complex');
      expect(result.score).toBe(0.8);
      expect(result.recommendedStrategy).toBe('orchestrator_worker');
      expect(result.factors).toContain('data_analysis');
    });

    test('should handle analysis errors gracefully', async () => {
      mockAiSdkProvider.analyzeComplexity.mockRejectedValue(new Error('Analysis failed'));

      await expect(agentManager.analyzeTaskComplexity('test task'))
        .rejects.toThrow('Task complexity analysis failed');
    });
  });

  describe('selectOptimalAgent', () => {
    beforeEach(() => {
      // Registrar alguns agentes mock
      agentManager.agents.set('claude-general', {
        id: 'claude-general',
        type: 'general',
        capabilities: ['text_generation', 'analysis'],
        performance: { avgTime: 2000, successRate: 0.95 },
        isAvailable: true
      });

      agentManager.agents.set('claude-specialist', {
        id: 'claude-specialist',
        type: 'specialist',
        capabilities: ['data_analysis', 'visualization'],
        performance: { avgTime: 5000, successRate: 0.98 },
        isAvailable: true
      });
    });

    test('should select best agent for simple text generation task', () => {
      const taskAnalysis = {
        complexity: 'simple',
        requiredCapabilities: ['text_generation'],
        priority: 'normal'
      };

      const selectedAgent = agentManager.selectOptimalAgent(taskAnalysis);

      expect(selectedAgent.id).toBe('claude-general');
      expect(selectedAgent.capabilities).toContain('text_generation');
    });

    test('should select specialist agent for data analysis task', () => {
      const taskAnalysis = {
        complexity: 'medium',
        requiredCapabilities: ['data_analysis'],
        priority: 'high'
      };

      const selectedAgent = agentManager.selectOptimalAgent(taskAnalysis);

      expect(selectedAgent.id).toBe('claude-specialist');
      expect(selectedAgent.capabilities).toContain('data_analysis');
    });

    test('should return null when no suitable agent is available', () => {
      const taskAnalysis = {
        complexity: 'simple',
        requiredCapabilities: ['unsupported_capability'],
        priority: 'normal'
      };

      const selectedAgent = agentManager.selectOptimalAgent(taskAnalysis);

      expect(selectedAgent).toBeNull();
    });

    test('should prioritize available agents only', () => {
      // Marcar o agente geral como indisponível
      agentManager.agents.get('claude-general').isAvailable = false;

      const taskAnalysis = {
        complexity: 'simple',
        requiredCapabilities: ['text_generation'],
        priority: 'normal'
      };

      const selectedAgent = agentManager.selectOptimalAgent(taskAnalysis);

      expect(selectedAgent).toBeNull();
    });
  });

  describe('executeTask', () => {
    beforeEach(() => {
      // Registrar agente para testes de execução
      agentManager.registerAgent({
        id: 'claude-general',
        type: 'general',
        capabilities: ['text_generation', 'analysis'],
        performance: { avgTime: 2000, successRate: 0.95 }
      });
    });

    test('should execute simple task with single agent', async () => {
      const task = {
        id: 'task-1',
        content: 'Generate a greeting',
        type: 'text_generation'
      };

      mockAiSdkProvider.analyzeComplexity.mockResolvedValue({
        score: 0.2,
        factors: ['simple_text_generation'],
        estimatedTime: 1000
      });

      mockAiSdkProvider.generateText.mockResolvedValue({
        text: 'Hello, how can I help you today?',
        usage: { tokens: 50 }
      });

      mockQualityController.evaluateQuality.mockResolvedValue({
        score: 0.95,
        passed: true
      });

      const result = await agentManager.executeTask(task);

      expect(result.success).toBe(true);
      expect(result.result.text).toBe('Hello, how can I help you today?');
      expect(result.strategy).toBe('single_agent');
      expect(mockQualityController.evaluateQuality).toHaveBeenCalled();
    });

    test('should execute complex task with orchestrator-worker pattern', async () => {
      const complexTask = {
        id: 'task-2',
        content: 'Analyze data and create report',
        type: 'complex_analysis'
      };

      mockAiSdkProvider.analyzeComplexity.mockResolvedValue({
        score: 0.8,
        factors: ['data_analysis', 'report_generation'],
        estimatedTime: 15000
      });

      mockOrchestratorService.decomposeTask.mockResolvedValue([
        { id: 'subtask-1', type: 'data_analysis' },
        { id: 'subtask-2', type: 'report_generation' }
      ]);

      mockOrchestratorService.coordinateWorkers.mockResolvedValue([
        { id: 'subtask-1', result: 'analyzed data' },
        { id: 'subtask-2', result: 'generated report' }
      ]);

      mockOrchestratorService.aggregateResults.mockResolvedValue({
        finalResult: 'Complete analysis report',
        metadata: { processingTime: 12000 }
      });

      mockQualityController.evaluateQuality.mockResolvedValue({
        score: 0.92,
        passed: true
      });

      const result = await agentManager.executeTask(complexTask);

      expect(result.success).toBe(true);
      expect(result.strategy).toBe('orchestrator_worker');
      expect(result.result.finalResult).toBe('Complete analysis report');
      expect(mockOrchestratorService.decomposeTask).toHaveBeenCalledWith(complexTask);
    });

    test('should retry task when quality evaluation fails', async () => {
      const task = {
        id: 'task-3',
        content: 'Generate content',
        type: 'text_generation'
      };

      mockAiSdkProvider.analyzeComplexity.mockResolvedValue({
        score: 0.3,
        factors: ['text_generation'],
        estimatedTime: 2000
      });

      mockAiSdkProvider.generateText
        .mockResolvedValueOnce({
          text: 'Poor quality response',
          usage: { tokens: 20 }
        })
        .mockResolvedValueOnce({
          text: 'High quality response',
          usage: { tokens: 45 }
        });

      mockQualityController.evaluateQuality
        .mockResolvedValueOnce({
          score: 0.4,
          passed: false
        })
        .mockResolvedValueOnce({
          score: 0.9,
          passed: true
        });

      mockQualityController.shouldRetry.mockReturnValue(true);
      mockQualityController.provideFeedback.mockReturnValue('Improve response quality');

      const result = await agentManager.executeTask(task);

      expect(result.success).toBe(true);
      expect(result.result.text).toBe('High quality response');
      expect(result.retryCount).toBe(1);
      expect(mockAiSdkProvider.generateText).toHaveBeenCalledTimes(2);
    });

    test('should fail after maximum retry attempts', async () => {
      const task = {
        id: 'task-4',
        content: 'Generate content',
        type: 'text_generation'
      };

      mockAiSdkProvider.analyzeComplexity.mockResolvedValue({
        score: 0.3,
        factors: ['text_generation'],
        estimatedTime: 2000
      });

      mockAiSdkProvider.generateText.mockResolvedValue({
        text: 'Poor quality response',
        usage: { tokens: 20 }
      });

      mockQualityController.evaluateQuality.mockResolvedValue({
        score: 0.3,
        passed: false
      });

      mockQualityController.shouldRetry.mockReturnValue(true);

      const result = await agentManager.executeTask(task, { maxRetries: 2 });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Maximum retry attempts exceeded');
      expect(result.retryCount).toBe(2);
    });
  });

  describe('updateMetrics', () => {
    test('should update performance metrics correctly', () => {
      const executionData = {
        success: true,
        duration: 5000,
        tokensUsed: 100
      };

      agentManager.updateMetrics(executionData);

      expect(agentManager.metrics.totalTasks).toBe(1);
      expect(agentManager.metrics.successfulTasks).toBe(1);
      expect(agentManager.metrics.avgResponseTime).toBe(5000);
    });

    test('should calculate average response time correctly', () => {
      agentManager.updateMetrics({ success: true, duration: 2000 });
      agentManager.updateMetrics({ success: true, duration: 4000 });
      agentManager.updateMetrics({ success: false, duration: 6000 });

      expect(agentManager.metrics.totalTasks).toBe(3);
      expect(agentManager.metrics.successfulTasks).toBe(2);
      expect(agentManager.metrics.avgResponseTime).toBe(4000);
    });
  });

  describe('getPerformanceMetrics', () => {
    test('should return current performance metrics', () => {
      agentManager.metrics = {
        totalTasks: 10,
        successfulTasks: 8,
        avgResponseTime: 3500,
        totalTokensUsed: 1500
      };

      const metrics = agentManager.getPerformanceMetrics();

      expect(metrics.totalTasks).toBe(10);
      expect(metrics.successRate).toBe(0.8);
      expect(metrics.avgResponseTime).toBe(3500);
      expect(metrics.totalTokensUsed).toBe(1500);
    });
  });

  describe('registerAgent', () => {
    test('should register new agent successfully', () => {
      const agentConfig = {
        id: 'new-agent',
        type: 'specialist',
        capabilities: ['custom_capability'],
        performance: { avgTime: 3000, successRate: 0.9 }
      };

      agentManager.registerAgent(agentConfig);

      expect(agentManager.agents.has('new-agent')).toBe(true);
      expect(agentManager.agents.get('new-agent').isAvailable).toBe(true);
    });

    test('should throw error when registering agent with duplicate ID', () => {
      const agentConfig = {
        id: 'duplicate-agent',
        type: 'general',
        capabilities: ['text_generation']
      };

      agentManager.registerAgent(agentConfig);

      expect(() => {
        agentManager.registerAgent(agentConfig);
      }).toThrow('Agent with ID duplicate-agent already exists');
    });
  });
});