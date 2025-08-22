/**
 * AI SDK Structured Output Service
 * Garante respostas estruturadas e tipadas com schemas Zod
 */

const { generateObject, generateText } = require('ai');
const { z } = require('zod');
const { claudeCode } = require('../../providers/ai-sdk-provider');

// Common schemas for structured outputs
const CommonSchemas = {
  // Code generation schema
  CodeGeneration: z.object({
    language: z.string(),
    code: z.string(),
    explanation: z.string(),
    dependencies: z.array(z.string()).optional(),
    complexity: z.enum(['simple', 'moderate', 'complex']),
    testCases: z.array(z.object({
      input: z.string(),
      expectedOutput: z.string(),
      description: z.string()
    })).optional()
  }),

  // Analysis result schema
  AnalysisResult: z.object({
    summary: z.string(),
    findings: z.array(z.object({
      category: z.string(),
      description: z.string(),
      severity: z.enum(['info', 'warning', 'error', 'critical']).optional(),
      recommendations: z.array(z.string()).optional()
    })),
    metrics: z.record(z.string(), z.any()).optional(),
    confidence: z.number().min(0).max(1)
  }),

  // Task breakdown schema
  TaskBreakdown: z.object({
    mainGoal: z.string(),
    steps: z.array(z.object({
      order: z.number(),
      description: z.string(),
      required: z.boolean(),
      estimatedTime: z.string().optional(),
      dependencies: z.array(z.number()).optional()
    })),
    resources: z.array(z.string()).optional(),
    risks: z.array(z.string()).optional()
  }),

  // Decision schema
  Decision: z.object({
    choice: z.string(),
    reasoning: z.string(),
    alternatives: z.array(z.object({
      option: z.string(),
      pros: z.array(z.string()),
      cons: z.array(z.string())
    })),
    confidence: z.number().min(0).max(1),
    recommendation: z.string()
  })
};

class StructuredOutput {
  constructor() {
    this.model = claudeCode('opus');
    this.schemaCache = new Map();
    this.validationStats = new Map();
  }

  /**
   * Gera output estruturado com schema customizado
   */
  async generate(prompt, schema, options = {}) {
    console.log('[StructuredOutput] Generating structured response...');
    
    const {
      maxRetries = 3,
      validateOutput = true,
      enhancePrompt = true,
      includeExamples = true
    } = options;

    let attempts = 0;
    let lastError = null;

    while (attempts < maxRetries) {
      attempts++;
      
      try {
        // Enhance prompt with schema information if requested
        const enhancedPrompt = enhancePrompt 
          ? this._enhancePromptWithSchema(prompt, schema, includeExamples)
          : prompt;

        const result = await generateObject({
          model: this.model,
          schema,
          prompt: enhancedPrompt,
          experimental_telemetry: {
            functionId: 'structured-generate',
            metadata: { 
              attempt: attempts,
              schemaComplexity: this._calculateSchemaComplexity(schema)
            }
          }
        });

        // Validate output if requested
        if (validateOutput) {
          const validation = await this._validateStructuredOutput(
            result.object,
            schema,
            prompt
          );
          
          if (!validation.valid) {
            throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
          }
        }

        // Track success
        this._updateValidationStats(schema, true);

        return {
          success: true,
          data: result.object,
          metadata: {
            attempts,
            tokens: result.usage?.totalTokens,
            validationPassed: validateOutput
          }
        };
      } catch (error) {
        console.error(`[StructuredOutput] Attempt ${attempts} failed:`, error);
        lastError = error;
        this._updateValidationStats(schema, false);
        
        // Wait before retry
        if (attempts < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 1000 * attempts));
        }
      }
    }

    return {
      success: false,
      error: lastError?.message || 'Failed to generate structured output',
      attempts
    };
  }

  /**
   * Gera múltiplos outputs estruturados
   */
  async generateMultiple(prompt, schema, count = 3, options = {}) {
    console.log(`[StructuredOutput] Generating ${count} structured responses...`);
    
    const {
      diverse = true,
      temperature = diverse ? 0.8 : 0.3
    } = options;

    const results = [];
    const variations = diverse ? this._createPromptVariations(prompt, count) : [prompt];

    for (let i = 0; i < count; i++) {
      const currentPrompt = variations[i % variations.length];
      
      const result = await this.generate(
        currentPrompt,
        schema,
        { ...options, temperature }
      );

      if (result.success) {
        results.push(result.data);
      }
    }

    return {
      success: results.length > 0,
      results,
      count: results.length,
      requestedCount: count
    };
  }

  /**
   * Transforma texto não estruturado em estruturado
   */
  async structureText(text, targetSchema, context = '') {
    console.log('[StructuredOutput] Structuring unstructured text...');
    
    const prompt = `
      Convert this unstructured text into structured data:
      
      Text: "${text}"
      
      Context: ${context}
      
      Extract and organize the information according to the schema requirements.
      Infer missing information when reasonable, or use null/empty values when not available.
    `;

    return await this.generate(prompt, targetSchema);
  }

  /**
   * Extrai dados estruturados de resposta natural
   */
  async extractStructured(naturalResponse, schema, options = {}) {
    console.log('[StructuredOutput] Extracting structured data from natural response...');
    
    const {
      strict = false,
      fillDefaults = true
    } = options;

    try {
      // First attempt: direct parsing
      const parsed = schema.parse(naturalResponse);
      return { success: true, data: parsed };
    } catch (parseError) {
      // Second attempt: AI extraction
      const extractionPrompt = `
        Extract structured data from this response:
        
        Response: "${naturalResponse}"
        
        Requirements:
        - Extract only information explicitly present ${strict ? '(strict mode)' : ''}
        - ${fillDefaults ? 'Fill reasonable defaults for missing optional fields' : 'Leave missing fields as null'}
        - Maintain data accuracy and consistency
      `;

      return await this.generate(extractionPrompt, schema, options);
    }
  }

  /**
   * Valida e corrige output estruturado
   */
  async validateAndFix(data, schema, options = {}) {
    console.log('[StructuredOutput] Validating and fixing structured data...');
    
    try {
      // Try direct validation
      const validated = schema.parse(data);
      return {
        success: true,
        data: validated,
        fixed: false
      };
    } catch (error) {
      // Attempt to fix validation errors
      const fixPrompt = `
        Fix these validation errors in the structured data:
        
        Data: ${JSON.stringify(data, null, 2)}
        
        Validation Errors: ${error.message}
        
        Provide corrected data that passes all validation requirements.
      `;

      const fixed = await this.generate(fixPrompt, schema, options);
      
      return {
        success: fixed.success,
        data: fixed.data,
        fixed: true,
        originalErrors: error.message
      };
    }
  }

  /**
   * Cria schema dinâmico baseado em exemplos
   */
  async inferSchema(examples, options = {}) {
    console.log('[StructuredOutput] Inferring schema from examples...');
    
    const {
      strict = false,
      includeOptional = true
    } = options;

    const inferencePrompt = `
      Analyze these examples and create a Zod schema:
      
      Examples:
      ${JSON.stringify(examples, null, 2)}
      
      Requirements:
      - Identify common fields and their types
      - ${strict ? 'All fields are required' : 'Mark consistent fields as required'}
      - ${includeOptional ? 'Include optional fields that appear sometimes' : 'Only include fields that always appear'}
      - Infer appropriate validations (min/max, enum values, etc.)
      
      Return a schema definition that would validate all examples.
    `;

    const SchemaDefinition = z.object({
      fields: z.array(z.object({
        name: z.string(),
        type: z.enum(['string', 'number', 'boolean', 'array', 'object', 'enum']),
        required: z.boolean(),
        validation: z.object({
          min: z.number().optional(),
          max: z.number().optional(),
          enum: z.array(z.string()).optional(),
          pattern: z.string().optional()
        }).optional()
      })),
      description: z.string()
    });

    const result = await this.generate(inferencePrompt, SchemaDefinition);
    
    if (result.success) {
      // Convert to actual Zod schema
      const schema = this._buildSchemaFromDefinition(result.data);
      return {
        success: true,
        schema,
        definition: result.data
      };
    }

    return result;
  }

  /**
   * Merge múltiplos outputs estruturados
   */
  async mergeStructured(items, schema, strategy = 'combine') {
    console.log(`[StructuredOutput] Merging ${items.length} structured items...`);
    
    const mergeStrategies = {
      combine: this._combineStrategy,
      override: this._overrideStrategy,
      consensus: this._consensusStrategy,
      custom: async (items) => items[0] // Default to first item
    };

    const mergeFunction = mergeStrategies[strategy] || mergeStrategies.custom;
    const merged = await mergeFunction.call(this, items);

    // Validate merged result
    try {
      const validated = schema.parse(merged);
      return {
        success: true,
        data: validated,
        strategy,
        itemCount: items.length
      };
    } catch (error) {
      // Try to fix merged result
      return await this.validateAndFix(merged, schema);
    }
  }

  /**
   * Pipeline de transformações estruturadas
   */
  async transformPipeline(input, transformations) {
    console.log(`[StructuredOutput] Running transformation pipeline with ${transformations.length} steps...`);
    
    let current = input;
    const history = [];

    for (const transform of transformations) {
      const { name, schema, prompt, processor } = transform;
      
      console.log(`[StructuredOutput] Applying transformation: ${name}`);
      
      try {
        // Generate structured output for this step
        const transformPrompt = typeof prompt === 'function' 
          ? prompt(current) 
          : `${prompt}\n\nInput: ${JSON.stringify(current)}`;

        const result = await this.generate(transformPrompt, schema);
        
        if (!result.success) {
          throw new Error(`Transformation ${name} failed: ${result.error}`);
        }

        // Apply optional processor
        current = processor ? await processor(result.data) : result.data;
        
        history.push({
          step: name,
          output: current
        });
      } catch (error) {
        console.error(`[StructuredOutput] Pipeline error at ${name}:`, error);
        return {
          success: false,
          error: error.message,
          lastSuccessful: history[history.length - 1]?.step,
          history
        };
      }
    }

    return {
      success: true,
      result: current,
      history,
      transformationCount: transformations.length
    };
  }

  /**
   * Obtém estatísticas de validação
   */
  getValidationStats() {
    const stats = Array.from(this.validationStats.entries()).map(([schemaKey, data]) => ({
      schema: schemaKey,
      attempts: data.attempts,
      successes: data.successes,
      successRate: data.successes / data.attempts,
      averageRetries: data.totalRetries / data.attempts
    }));

    return {
      schemas: stats.length,
      totalAttempts: stats.reduce((sum, s) => sum + s.attempts, 0),
      overallSuccessRate: stats.reduce((sum, s) => sum + s.successRate, 0) / stats.length,
      stats
    };
  }

  // Private helper methods
  _enhancePromptWithSchema(prompt, schema, includeExamples) {
    const schemaDescription = this._describeSchema(schema);
    
    let enhanced = `${prompt}\n\nOutput must conform to this structure:\n${schemaDescription}`;
    
    if (includeExamples) {
      const example = this._generateSchemaExample(schema);
      enhanced += `\n\nExample valid output:\n${JSON.stringify(example, null, 2)}`;
    }
    
    return enhanced;
  }

  _calculateSchemaComplexity(schema) {
    // Simple complexity calculation based on schema structure
    const schemaString = JSON.stringify(schema);
    const depth = (schemaString.match(/{/g) || []).length;
    const fields = (schemaString.match(/z\.\w+/g) || []).length;
    
    return {
      depth,
      fields,
      complexity: depth * fields > 50 ? 'high' : depth * fields > 20 ? 'medium' : 'low'
    };
  }

  async _validateStructuredOutput(output, schema, originalPrompt) {
    try {
      schema.parse(output);
      
      // Additional semantic validation
      const semanticCheck = await generateObject({
        model: this.model,
        schema: z.object({
          valid: z.boolean(),
          errors: z.array(z.string()),
          warnings: z.array(z.string())
        }),
        prompt: `
          Validate if this output correctly addresses the request:
          
          Request: "${originalPrompt}"
          Output: ${JSON.stringify(output, null, 2)}
          
          Check for logical consistency and completeness.
        `
      });
      
      return {
        valid: semanticCheck.object.valid,
        errors: semanticCheck.object.errors,
        warnings: semanticCheck.object.warnings
      };
    } catch (error) {
      return {
        valid: false,
        errors: [error.message],
        warnings: []
      };
    }
  }

  _updateValidationStats(schema, success) {
    const key = this._getSchemaKey(schema);
    
    if (!this.validationStats.has(key)) {
      this.validationStats.set(key, {
        attempts: 0,
        successes: 0,
        totalRetries: 0
      });
    }
    
    const stats = this.validationStats.get(key);
    stats.attempts++;
    if (success) stats.successes++;
  }

  _getSchemaKey(schema) {
    // Create a unique key for schema caching
    return JSON.stringify(schema).substring(0, 50);
  }

  _describeSchema(schema) {
    // Generate human-readable schema description
    // This is a simplified version - could be enhanced
    return "Structured data following the specified schema";
  }

  _generateSchemaExample(schema) {
    // Generate example data that would pass schema validation
    // This is a simplified version - could be enhanced
    return {};
  }

  _createPromptVariations(prompt, count) {
    const variations = [prompt];
    const prefixes = [
      "Please ",
      "Could you ",
      "I need you to ",
      "Help me "
    ];
    
    for (let i = 1; i < Math.min(count, prefixes.length); i++) {
      variations.push(prefixes[i] + prompt.toLowerCase());
    }
    
    return variations;
  }

  _buildSchemaFromDefinition(definition) {
    // Convert definition to actual Zod schema
    // This is a simplified implementation
    const schemaObject = {};
    
    definition.fields.forEach(field => {
      let fieldSchema;
      
      switch (field.type) {
        case 'string':
          fieldSchema = z.string();
          break;
        case 'number':
          fieldSchema = z.number();
          break;
        case 'boolean':
          fieldSchema = z.boolean();
          break;
        case 'array':
          fieldSchema = z.array(z.any());
          break;
        case 'object':
          fieldSchema = z.object({});
          break;
        default:
          fieldSchema = z.any();
      }
      
      if (!field.required) {
        fieldSchema = fieldSchema.optional();
      }
      
      schemaObject[field.name] = fieldSchema;
    });
    
    return z.object(schemaObject);
  }

  async _combineStrategy(items) {
    // Combine all items into one
    const combined = {};
    
    items.forEach(item => {
      Object.keys(item).forEach(key => {
        if (Array.isArray(item[key])) {
          combined[key] = combined[key] ? [...combined[key], ...item[key]] : item[key];
        } else if (typeof item[key] === 'object') {
          combined[key] = { ...combined[key], ...item[key] };
        } else {
          combined[key] = item[key];
        }
      });
    });
    
    return combined;
  }

  async _overrideStrategy(items) {
    // Later items override earlier ones
    return Object.assign({}, ...items);
  }

  async _consensusStrategy(items) {
    // Find most common values for each field
    const consensus = {};
    
    // Get all keys
    const allKeys = new Set();
    items.forEach(item => Object.keys(item).forEach(key => allKeys.add(key)));
    
    allKeys.forEach(key => {
      const values = items.map(item => item[key]).filter(v => v !== undefined);
      
      if (values.length === 0) return;
      
      // Find most common value
      const counts = new Map();
      values.forEach(value => {
        const key = JSON.stringify(value);
        counts.set(key, (counts.get(key) || 0) + 1);
      });
      
      let maxCount = 0;
      let mostCommon = values[0];
      
      counts.forEach((count, key) => {
        if (count > maxCount) {
          maxCount = count;
          mostCommon = JSON.parse(key);
        }
      });
      
      consensus[key] = mostCommon;
    });
    
    return consensus;
  }
}

module.exports = StructuredOutput;