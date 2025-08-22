/**
 * ClaudeAgent - Agente específico para Claude
 * Herda de BaseAgent e implementa lógica específica do Claude
 */

const BaseAgent = require('./BaseAgent');
const { query } = require('@anthropic-ai/claude-code');

class ClaudeAgent extends BaseAgent {
  constructor(config = {}) {
    super({
      name: 'claude',
      url: config.url || 'http://localhost:8001',
      type: 'llm',
      version: '2.0.0',
      description: 'Claude AI Assistant via Code SDK',
      capabilities: [
        'text_generation',
        'code_analysis',
        'code_generation',
        'conversation',
        'reasoning',
        'planning',
        'file_analysis'
      ],
      cacheEnabled: true,
      cacheTTL: 600000, // 10 minutos para Claude
      ...config
    });
    
    // Configurações específicas do Claude
    this.model = config.model || 'claude-3-opus';
    this.maxTokens = config.maxTokens || 4096;
    this.temperature = config.temperature || 0.7;
    this.systemPrompt = config.systemPrompt || null;
  }

  /**
   * Sobrescreve executeTask para usar Claude SDK
   */
  async executeTask(task) {
    const { message, context, options = {} } = task;
    
    console.log(`🤖 Claude processando: "${message?.substring(0, 50)}..."`);
    
    try {
      // Construir prompt com contexto
      let prompt = message;
      
      if (this.systemPrompt) {
        prompt = `${this.systemPrompt}\n\n${prompt}`;
      }
      
      if (context) {
        prompt = `Context: ${JSON.stringify(context)}\n\n${prompt}`;
      }
      
      // Configurar opções do Claude
      const queryOptions = {
        maxTurns: options.maxTurns || 1,
        temperature: options.temperature || this.temperature,
        ...options
      };
      
      // Executar query no Claude
      let response = '';
      const startTime = Date.now();
      
      for await (const msg of query({
        prompt: prompt,
        options: queryOptions
      })) {
        if (msg.type === 'result' && !msg.is_error && msg.result) {
          response = msg.result;
          break;
        }
      }
      
      const processingTime = Date.now() - startTime;
      
      // Retornar resposta estruturada
      return {
        success: true,
        agent: this.name,
        result: response,
        metadata: {
          model: this.model,
          processingTime,
          tokenEstimate: Math.ceil(response.length / 4),
          cached: false
        }
      };
      
    } catch (error) {
      console.error(`❌ Erro no Claude Agent:`, error);
      throw new Error(`Claude processing failed: ${error.message}`);
    }
  }

  /**
   * Análise especializada de código
   */
  async analyzeCode(code, language = 'javascript') {
    const task = {
      message: `Analyze this ${language} code and provide insights:\n\n\`\`\`${language}\n${code}\n\`\`\``,
      options: {
        temperature: 0.3, // Mais determinístico para análise
        maxTurns: 1
      }
    };
    
    return this.process(task);
  }

  /**
   * Geração de código
   */
  async generateCode(specification, language = 'javascript') {
    const task = {
      message: `Generate ${language} code based on this specification:\n${specification}`,
      options: {
        temperature: 0.5,
        maxTurns: 1
      }
    };
    
    return this.process(task);
  }

  /**
   * Análise de intenção (para integração com CrewAI)
   */
  async analyzeIntent(message) {
    const task = {
      message: `Analyze the intent of this message and return a JSON object:
      "${message}"
      
      Return JSON with:
      - intent: (data_extraction|pattern_analysis|report_generation|general_query|code_task)
      - entities: list of mentioned entities
      - complexity: (simple|moderate|complex)
      - suggested_agent: (claude|crew-ai|both)
      
      Respond ONLY with valid JSON.`,
      options: {
        temperature: 0.2,
        maxTurns: 1
      }
    };
    
    const result = await this.process(task);
    
    try {
      return JSON.parse(result.result);
    } catch (error) {
      // Fallback se não for JSON válido
      return {
        intent: 'general_query',
        entities: [],
        complexity: 'simple',
        suggested_agent: 'claude'
      };
    }
  }

  /**
   * Formatação de resposta final
   */
  async formatResponse(originalMessage, analysisResult, agentResult) {
    const task = {
      message: `Format a natural response based on:
      
      User message: "${originalMessage}"
      
      Analysis: ${JSON.stringify(analysisResult)}
      
      Agent result: ${JSON.stringify(agentResult)}
      
      Provide a helpful, natural response in Portuguese.`,
      options: {
        temperature: 0.7,
        maxTurns: 1
      }
    };
    
    return this.process(task);
  }

  /**
   * Health check específico do Claude
   */
  async healthCheck() {
    try {
      // Testar com uma query simples
      const result = await this.executeTask({
        message: 'Say "OK" if you are working',
        options: { maxTurns: 1 }
      });
      
      this.lastHealthCheck = Date.now();
      this.status = result.success ? 'healthy' : 'unhealthy';
      
      return result.success;
    } catch (error) {
      this.status = 'unhealthy';
      return false;
    }
  }

  /**
   * Retorna informações específicas do Claude
   */
  getInfo() {
    return {
      ...super.getInfo(),
      model: this.model,
      maxTokens: this.maxTokens,
      temperature: this.temperature,
      hasSystemPrompt: !!this.systemPrompt
    };
  }
}

module.exports = ClaudeAgent;