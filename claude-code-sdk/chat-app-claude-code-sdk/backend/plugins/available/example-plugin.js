/**
 * Exemplo de Plugin de Agente
 * Demonstra como criar um plugin que pode ser carregado dinamicamente
 */

const AgentPlugin = require('../AgentPlugin');
const BaseAgent = require('../../agents/BaseAgent');

/**
 * Agente customizado do plugin
 */
class ExampleAgent extends BaseAgent {
  constructor(config = {}) {
    super({
      name: 'example-agent',
      url: config.url || 'http://localhost:8080',
      type: 'example',
      version: '1.0.0',
      description: 'Example agent for demonstration',
      capabilities: ['echo', 'demo', 'test'],
      ...config
    });
  }

  async executeTask(task) {
    const { message } = task;
    
    // Simular processamento
    await this.delay(100);
    
    return {
      success: true,
      agent: this.name,
      result: `Echo from example agent: ${message}`,
      metadata: {
        processingTime: 100,
        cached: false
      }
    };
  }
}

/**
 * Plugin que encapsula o agente
 */
class ExamplePlugin extends AgentPlugin {
  constructor() {
    super({
      name: 'example-plugin',
      type: 'demo',
      version: '1.0.0',
      description: 'Example plugin showing how to create agent plugins',
      author: 'System',
      capabilities: ['echo', 'demo'],
      agentClass: ExampleAgent,
      agentConfig: {
        timeout: 5000,
        retries: 2
      }
    });
  }

  /**
   * Inicialização customizada
   */
  async initialize() {
    console.log('🔌 Example Plugin: Inicializando...');
    
    // Chamar inicialização base
    const success = await super.initialize();
    
    if (success) {
      console.log('🔌 Example Plugin: Pronto para uso!');
    }
    
    return success;
  }

  /**
   * Manipulador de eventos customizado
   */
  async handleEvent(eventName, eventData) {
    switch (eventName) {
      case 'test':
        console.log('🔌 Example Plugin: Teste recebido', eventData);
        break;
      default:
        await super.handleEvent(eventName, eventData);
    }
  }
}

// Exportar o plugin
module.exports = ExamplePlugin;