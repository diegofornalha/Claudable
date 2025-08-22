/**
 * StructuredOutputProcessor - Processador simplificado de saídas estruturadas
 * Integração com AI SDK v5 para structured outputs
 */

const { z } = require('zod');

class StructuredOutputProcessor {
  constructor(options = {}) {
    this.enableValidation = options.enableValidation !== false;
    this.enableTransformation = options.enableTransformation !== false;
    this.enableCaching = options.enableCaching !== false;
    
    // Cache de schemas compilados
    this.schemaCache = new Map();
    
    // Schemas pré-definidos para casos comuns
    this.predefinedSchemas = new Map();
    
    this.initializePredefinedSchemas();
    
    console.log('🔧 StructuredOutputProcessor initialized with AI SDK v5 support');
  }

  /**
   * Inicializa schemas pré-definidos para casos comuns
   */
  initializePredefinedSchemas() {
    // Schema para análise de complexidade
    this.registerSchema('complexity_analysis', z.object({
      complexity: z.enum(['simple', 'medium', 'complex']),
      score: z.number().min(0).max(1),
      factors: z.array(z.string()),
      estimatedTime: z.number().positive(),
      recommendedStrategy: z.enum(['single_agent', 'orchestrator_worker']),
      requirements: z.array(z.string()).optional(),
      risks: z.array(z.string()).optional()
    }));

    // Schema para decomposição de tarefas
    this.registerSchema('task_decomposition', z.object({
      mainTask: z.string(),
      subtasks: z.array(z.object({
        id: z.string(),
        description: z.string(),
        type: z.string(),
        dependencies: z.array(z.string()),
        priority: z.number().min(1).max(10),
        estimatedDuration: z.number().positive(),
        requiredCapabilities: z.array(z.string()),
        complexity: z.enum(['simple', 'medium', 'complex']).optional()
      })),
      executionPlan: z.object({
        totalEstimatedTime: z.number().positive(),
        parallelizable: z.array(z.string()),
        sequential: z.array(z.string()),
        criticalPath: z.array(z.string()).optional()
      }),
      metadata: z.object({
        totalSubtasks: z.number(),
        parallelizationRatio: z.number().min(0).max(1),
        complexityDistribution: z.record(z.number()).optional()
      }).optional()
    }));

    // Schema para avaliação de qualidade
    this.registerSchema('quality_evaluation', z.object({
      overallScore: z.number().min(0).max(10),
      dimensions: z.object({
        accuracy: z.number().min(0).max(1),
        completeness: z.number().min(0).max(1),
        clarity: z.number().min(0).max(1),
        relevance: z.number().min(0).max(1),
        consistency: z.number().min(0).max(1).optional(),
        originality: z.number().min(0).max(1).optional()
      }),
      strengths: z.array(z.string()),
      weaknesses: z.array(z.string()),
      suggestions: z.array(z.object({
        type: z.string(),
        description: z.string(),
        priority: z.enum(['low', 'medium', 'high', 'critical']),
        estimatedImpact: z.number().min(0).max(1).optional()
      })),
      confidence: z.number().min(0).max(1)
    }));
  }

  /**
   * Registra um novo schema
   */
  registerSchema(name, schema) {
    if (!(schema instanceof z.ZodType)) {
      throw new Error(`Schema ${name} must be a Zod schema`);
    }
    
    this.predefinedSchemas.set(name, schema);
    
    if (this.enableCaching) {
      this.schemaCache.set(name, schema);
    }
    
    console.log(`🔧 Registered schema: ${name}`);
  }

  /**
   * Processa saída estruturada usando schema específico
   */
  async processStructuredOutput(data, schemaName, options = {}) {
    try {
      const schema = this.getSchema(schemaName);
      
      if (!schema) {
        throw new Error(`Schema '${schemaName}' not found`);
      }

      // Validação
      let processedData = data;
      if (this.enableValidation) {
        processedData = this.validateData(data, schema, options);
      }

      // Transformação
      if (this.enableTransformation && options.transform) {
        processedData = await this.transformData(processedData, options.transform);
      }

      return {
        success: true,
        data: processedData,
        schema: schemaName,
        metadata: {
          processingTime: Date.now(),
          validationPassed: true,
          transformationApplied: !!options.transform
        }
      };
      
    } catch (error) {
      console.error(`❌ StructuredOutput processing failed for ${schemaName}:`, error.message);
      
      return {
        success: false,
        error: error.message,
        schema: schemaName,
        originalData: data,
        metadata: {
          processingTime: Date.now(),
          validationPassed: false
        }
      };
    }
  }

  /**
   * Valida dados contra um schema
   */
  validateData(data, schema, options = {}) {
    try {
      // Parse com Zod
      const result = schema.parse(data);
      
      console.log('✅ Data validation passed');
      return result;
      
    } catch (error) {
      if (error instanceof z.ZodError) {
        const detailedErrors = error.errors.map(err => ({
          path: err.path.join('.'),
          message: err.message,
          code: err.code
        }));
        
        console.error('❌ Validation failed:', detailedErrors);
        
        throw new Error(`Validation failed: ${detailedErrors.map(e => e.message).join(', ')}`);
      }
      
      throw error;
    }
  }

  /**
   * Transforma dados usando função personalizada
   */
  async transformData(data, transformFunction) {
    if (typeof transformFunction !== 'function') {
      throw new Error('Transform must be a function');
    }
    
    try {
      const transformed = await transformFunction(data);
      console.log('✅ Data transformation completed');
      return transformed;
      
    } catch (error) {
      console.error('❌ Data transformation failed:', error.message);
      throw new Error(`Transformation failed: ${error.message}`);
    }
  }

  /**
   * Recupera schema por nome
   */
  getSchema(name) {
    if (this.enableCaching && this.schemaCache.has(name)) {
      return this.schemaCache.get(name);
    }
    
    const schema = this.predefinedSchemas.get(name);
    
    if (schema && this.enableCaching) {
      this.schemaCache.set(name, schema);
    }
    
    return schema;
  }

  /**
   * Lista schemas disponíveis
   */
  listAvailableSchemas() {
    return Array.from(this.predefinedSchemas.keys());
  }
}

module.exports = StructuredOutputProcessor;