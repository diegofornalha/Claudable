const OrchestratorService = require('../services/OrchestratorService');

describe('OrchestratorService', () => {
  let orchestratorService;
  let mockAiSdkProvider;
  let mockWorkerPool;

  beforeEach(() => {
    mockAiSdkProvider = {
      generateObject: jest.fn(),
      generateText: jest.fn()
    };

    mockWorkerPool = {
      getAvailableWorkers: jest.fn(),
      assignTask: jest.fn(),
      getTaskResult: jest.fn(),
      releaseWorker: jest.fn()
    };

    orchestratorService = new OrchestratorService(mockAiSdkProvider, mockWorkerPool);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    test('should initialize with provided dependencies', () => {
      expect(orchestratorService.aiSdkProvider).toBe(mockAiSdkProvider);
      expect(orchestratorService.workerPool).toBe(mockWorkerPool);
    });

    test('should initialize active tasks as empty Map', () => {
      expect(orchestratorService.activeTasks).toBeInstanceOf(Map);
      expect(orchestratorService.activeTasks.size).toBe(0);
    });

    test('should initialize load balancer configuration', () => {
      expect(orchestratorService.loadBalancer).toBeDefined();
      expect(orchestratorService.loadBalancer.strategy).toBe('round_robin');
      expect(orchestratorService.loadBalancer.maxConcurrentTasks).toBe(10);
    });
  });

  describe('decomposeTask', () => {
    test('should decompose complex task into subtasks', async () => {
      const complexTask = {
        id: 'complex-task-1',
        content: 'Analyze sales data and create quarterly report with visualizations',
        type: 'complex_analysis',
        requirements: ['data_analysis', 'report_generation', 'visualization']
      };

      const expectedSubtasks = {
        subtasks: [
          {
            id: 'subtask-1',
            type: 'data_analysis',
            description: 'Analyze sales data for quarterly trends',
            dependencies: [],
            estimatedTime: 5000,
            requiredCapabilities: ['data_analysis']
          },
          {
            id: 'subtask-2',
            type: 'visualization',
            description: 'Create charts and graphs for sales data',
            dependencies: ['subtask-1'],
            estimatedTime: 3000,
            requiredCapabilities: ['visualization']
          },
          {
            id: 'subtask-3',
            type: 'report_generation',
            description: 'Generate quarterly report with analysis and visualizations',
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
      };

      mockAiSdkProvider.generateObject.mockResolvedValue(expectedSubtasks);

      const result = await orchestratorService.decomposeTask(complexTask);

      expect(result.subtasks).toHaveLength(3);
      expect(result.subtasks[0].type).toBe('data_analysis');
      expect(result.subtasks[1].dependencies).toContain('subtask-1');
      expect(result.executionPlan.totalEstimatedTime).toBe(12000);
      expect(mockAiSdkProvider.generateObject).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: expect.stringContaining('Decompose the following complex task'),
          schema: expect.any(Object)
        })
      );
    });

    test('should handle simple tasks by creating single subtask', async () => {
      const simpleTask = {
        id: 'simple-task-1',
        content: 'Generate a greeting message',
        type: 'text_generation'
      };

      const expectedSubtasks = {
        subtasks: [
          {
            id: 'subtask-1',
            type: 'text_generation',
            description: 'Generate a greeting message',
            dependencies: [],
            estimatedTime: 1000,
            requiredCapabilities: ['text_generation']
          }
        ],
        executionPlan: {
          totalEstimatedTime: 1000,
          parallelizable: ['subtask-1'],
          sequential: []
        }
      };

      mockAiSdkProvider.generateObject.mockResolvedValue(expectedSubtasks);

      const result = await orchestratorService.decomposeTask(simpleTask);

      expect(result.subtasks).toHaveLength(1);
      expect(result.subtasks[0].type).toBe('text_generation');
      expect(result.executionPlan.parallelizable).toContain('subtask-1');
    });

    test('should throw error when decomposition fails', async () => {
      const task = { id: 'test-task', content: 'test content' };
      
      mockAiSdkProvider.generateObject.mockRejectedValue(new Error('AI service unavailable'));

      await expect(orchestratorService.decomposeTask(task))
        .rejects.toThrow('Task decomposition failed');
    });
  });

  describe('coordinateWorkers', () => {
    test('should coordinate parallel execution of subtasks', async () => {
      const subtasks = [
        {
          id: 'subtask-1',
          type: 'data_analysis',
          dependencies: [],
          requiredCapabilities: ['data_analysis']
        },
        {
          id: 'subtask-2',
          type: 'text_generation',
          dependencies: [],
          requiredCapabilities: ['text_generation']
        }
      ];

      const executionPlan = {
        parallelizable: ['subtask-1', 'subtask-2'],
        sequential: []
      };

      const availableWorkers = [
        { id: 'worker-1', capabilities: ['data_analysis'], isAvailable: true },
        { id: 'worker-2', capabilities: ['text_generation'], isAvailable: true }
      ];

      mockWorkerPool.getAvailableWorkers.mockReturnValue(availableWorkers);
      
      mockWorkerPool.assignTask
        .mockResolvedValueOnce({ taskId: 'subtask-1', workerId: 'worker-1' })
        .mockResolvedValueOnce({ taskId: 'subtask-2', workerId: 'worker-2' });

      mockWorkerPool.getTaskResult
        .mockResolvedValueOnce({ 
          subtaskId: 'subtask-1', 
          result: 'Analysis complete',
          duration: 3000 
        })
        .mockResolvedValueOnce({ 
          subtaskId: 'subtask-2', 
          result: 'Text generated',
          duration: 1500 
        });

      const results = await orchestratorService.coordinateWorkers(subtasks, executionPlan);

      expect(results).toHaveLength(2);
      expect(results[0].subtaskId).toBe('subtask-1');
      expect(results[1].subtaskId).toBe('subtask-2');
      expect(mockWorkerPool.assignTask).toHaveBeenCalledTimes(2);
      expect(mockWorkerPool.getTaskResult).toHaveBeenCalledTimes(2);
    });

    test('should handle sequential execution with dependencies', async () => {
      const subtasks = [
        {
          id: 'subtask-1',
          type: 'data_analysis',
          dependencies: [],
          requiredCapabilities: ['data_analysis']
        },
        {
          id: 'subtask-2',
          type: 'report_generation',
          dependencies: ['subtask-1'],
          requiredCapabilities: ['report_generation']
        }
      ];

      const executionPlan = {
        parallelizable: ['subtask-1'],
        sequential: ['subtask-2']
      };

      const availableWorkers = [
        { id: 'worker-1', capabilities: ['data_analysis', 'report_generation'], isAvailable: true }
      ];

      mockWorkerPool.getAvailableWorkers.mockReturnValue(availableWorkers);
      
      mockWorkerPool.assignTask.mockResolvedValue({ taskId: 'assigned', workerId: 'worker-1' });

      mockWorkerPool.getTaskResult
        .mockResolvedValueOnce({ 
          subtaskId: 'subtask-1', 
          result: 'Data analyzed',
          duration: 4000 
        })
        .mockResolvedValueOnce({ 
          subtaskId: 'subtask-2', 
          result: 'Report generated',
          duration: 2000 
        });

      const results = await orchestratorService.coordinateWorkers(subtasks, executionPlan);

      expect(results).toHaveLength(2);
      expect(results[0].subtaskId).toBe('subtask-1');
      expect(results[1].subtaskId).toBe('subtask-2');
      
      // Verifica que subtask-2 foi executada após subtask-1
      const calls = mockWorkerPool.assignTask.mock.calls;
      expect(calls[0][0].id).toBe('subtask-1');
    });

    test('should handle worker unavailability with load balancing', async () => {
      const subtasks = [
        {
          id: 'subtask-1',
          type: 'data_analysis',
          dependencies: [],
          requiredCapabilities: ['data_analysis']
        }
      ];

      const executionPlan = {
        parallelizable: ['subtask-1'],
        sequential: []
      };

      // Primeira chamada retorna workers indisponíveis
      mockWorkerPool.getAvailableWorkers
        .mockReturnValueOnce([])
        .mockReturnValueOnce([
          { id: 'worker-1', capabilities: ['data_analysis'], isAvailable: true }
        ]);

      mockWorkerPool.assignTask.mockResolvedValue({ taskId: 'subtask-1', workerId: 'worker-1' });
      mockWorkerPool.getTaskResult.mockResolvedValue({ 
        subtaskId: 'subtask-1', 
        result: 'Analysis complete',
        duration: 3000 
      });

      const results = await orchestratorService.coordinateWorkers(subtasks, executionPlan);

      expect(results).toHaveLength(1);
      expect(mockWorkerPool.getAvailableWorkers).toHaveBeenCalledTimes(2);
    });
  });

  describe('aggregateResults', () => {
    test('should aggregate subtask results into final result', async () => {
      const subtaskResults = [
        {
          subtaskId: 'subtask-1',
          result: 'Sales data analysis: Revenue increased 15% this quarter',
          metadata: { duration: 4000, tokensUsed: 150 }
        },
        {
          subtaskId: 'subtask-2',
          result: 'Visualization data: Charts and graphs generated',
          metadata: { duration: 2000, tokensUsed: 80 }
        },
        {
          subtaskId: 'subtask-3',
          result: 'Final report: Quarterly sales report with analysis and visualizations',
          metadata: { duration: 3000, tokensUsed: 200 }
        }
      ];

      const originalTask = {
        id: 'complex-task-1',
        content: 'Analyze sales data and create quarterly report',
        type: 'complex_analysis'
      };

      const expectedAggregation = {
        finalResult: 'Comprehensive quarterly sales report with 15% revenue increase analysis and supporting visualizations',
        summary: 'Successfully completed complex analysis task with data analysis, visualization, and report generation',
        metadata: {
          totalDuration: 9000,
          totalTokensUsed: 430,
          subtasksCompleted: 3,
          success: true
        }
      };

      mockAiSdkProvider.generateObject.mockResolvedValue(expectedAggregation);

      const result = await orchestratorService.aggregateResults(subtaskResults, originalTask);

      expect(result.finalResult).toContain('Comprehensive quarterly sales report');
      expect(result.metadata.totalDuration).toBe(9000);
      expect(result.metadata.totalTokensUsed).toBe(430);
      expect(result.metadata.subtasksCompleted).toBe(3);
      expect(mockAiSdkProvider.generateObject).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: expect.stringContaining('Aggregate the following subtask results'),
          schema: expect.any(Object)
        })
      );
    });

    test('should handle aggregation failures gracefully', async () => {
      const subtaskResults = [
        { subtaskId: 'subtask-1', result: 'Result 1' }
      ];
      const originalTask = { id: 'task-1', content: 'Test task' };

      mockAiSdkProvider.generateObject.mockRejectedValue(new Error('Aggregation service failed'));

      await expect(orchestratorService.aggregateResults(subtaskResults, originalTask))
        .rejects.toThrow('Result aggregation failed');
    });
  });

  describe('getLoadBalancingStrategy', () => {
    test('should return round robin strategy by default', () => {
      const strategy = orchestratorService.getLoadBalancingStrategy();
      expect(strategy.name).toBe('round_robin');
      expect(typeof strategy.selectWorker).toBe('function');
    });

    test('should switch to least_loaded strategy when workers are busy', () => {
      orchestratorService.loadBalancer.strategy = 'least_loaded';
      
      const strategy = orchestratorService.getLoadBalancingStrategy();
      expect(strategy.name).toBe('least_loaded');
    });
  });

  describe('updateTaskStatus', () => {
    test('should update active task status', () => {
      const taskId = 'task-123';
      const status = 'in_progress';
      const metadata = { startTime: Date.now() };

      orchestratorService.updateTaskStatus(taskId, status, metadata);

      expect(orchestratorService.activeTasks.has(taskId)).toBe(true);
      expect(orchestratorService.activeTasks.get(taskId).status).toBe(status);
      expect(orchestratorService.activeTasks.get(taskId).metadata).toBe(metadata);
    });

    test('should remove completed tasks from active tasks', () => {
      const taskId = 'task-456';
      
      orchestratorService.updateTaskStatus(taskId, 'in_progress');
      expect(orchestratorService.activeTasks.has(taskId)).toBe(true);
      
      orchestratorService.updateTaskStatus(taskId, 'completed');
      expect(orchestratorService.activeTasks.has(taskId)).toBe(false);
    });
  });

  describe('getActiveTasksCount', () => {
    test('should return number of active tasks', () => {
      orchestratorService.updateTaskStatus('task-1', 'in_progress');
      orchestratorService.updateTaskStatus('task-2', 'in_progress');
      
      expect(orchestratorService.getActiveTasksCount()).toBe(2);
    });
  });

  describe('cancelTask', () => {
    test('should cancel active task and cleanup resources', async () => {
      const taskId = 'task-to-cancel';
      
      orchestratorService.updateTaskStatus(taskId, 'in_progress', { workerId: 'worker-1' });
      mockWorkerPool.releaseWorker.mockResolvedValue(true);

      const result = await orchestratorService.cancelTask(taskId);

      expect(result.success).toBe(true);
      expect(orchestratorService.activeTasks.has(taskId)).toBe(false);
      expect(mockWorkerPool.releaseWorker).toHaveBeenCalledWith('worker-1');
    });

    test('should handle cancellation of non-existent task', async () => {
      const result = await orchestratorService.cancelTask('non-existent-task');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Task not found');
    });
  });
});