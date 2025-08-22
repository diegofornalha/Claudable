/**
 * AgentPlugin - Interface base para plugins de agentes
 * Todos os plugins devem herdar desta classe
 */

const BaseAgent = require('../agents/BaseAgent');

class AgentPlugin {
  constructor(config = {}) {
    // Metadados do plugin
    this.name = config.name || 'unnamed-plugin';
    this.type = config.type || 'generic';
    this.version = config.version || '1.0.0';
    this.description = config.description || '';
    this.author = config.author || '';
    this.repository = config.repository || '';
    
    // Capacidades do plugin
    this.capabilities = config.capabilities || [];
    
    // Configuração específica
    this.config = config;
    
    // Instância do agente
    this.agent = null;
  }

  /**
   * Inicializa o plugin
   * Deve ser sobrescrito pelos plugins específicos
   */
  async initialize() {
    console.log(`📦 Inicializando plugin: ${this.name}`);
    
    // Criar instância do agente se necessário
    if (this.config.agentClass) {
      this.agent = new this.config.agentClass(this.config.agentConfig || {});
      
      // Inicializar agente
      if (this.agent && this.agent.initialize) {
        const success = await this.agent.initialize();
        if (!success) {
          console.error(`❌ Falha ao inicializar agente do plugin ${this.name}`);
          return false;
        }
      }
    }
    
    return true;
  }

  /**
   * Retorna a instância do agente
   * Deve ser sobrescrito se o plugin criar agentes customizados
   */
  getAgent() {
    return this.agent;
  }

  /**
   * Verifica saúde do plugin
   */
  async healthCheck() {
    if (this.agent && this.agent.healthCheck) {
      return await this.agent.healthCheck();
    }
    return true;
  }

  /**
   * Obtém informações do plugin
   */
  getInfo() {
    return {
      name: this.name,
      type: this.type,
      version: this.version,
      description: this.description,
      author: this.author,
      repository: this.repository,
      capabilities: this.capabilities,
      agentName: this.agent ? this.agent.name : null,
      status: this.agent ? this.agent.status : 'inactive'
    };
  }

  /**
   * Atualiza configuração do plugin
   */
  async updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    
    // Reconfigurar agente se necessário
    if (this.agent && this.agent.updateConfig) {
      await this.agent.updateConfig(newConfig.agentConfig || {});
    }
    
    return true;
  }

  /**
   * Executa limpeza ao descarregar o plugin
   */
  async shutdown() {
    console.log(`📦 Desligando plugin: ${this.name}`);
    
    // Desligar agente
    if (this.agent && this.agent.shutdown) {
      await this.agent.shutdown();
    }
    
    this.agent = null;
    
    return true;
  }

  /**
   * Manipulador de eventos customizados
   */
  async handleEvent(eventName, eventData) {
    // Pode ser sobrescrito pelos plugins para manipular eventos específicos
    console.log(`📦 Plugin ${this.name} recebeu evento: ${eventName}`);
  }

  /**
   * Valida se o plugin está funcionando corretamente
   */
  async validate() {
    // Verificações básicas
    if (!this.name || !this.type) {
      return {
        valid: false,
        error: 'Plugin deve ter name e type definidos'
      };
    }
    
    // Verificar agente se existir
    if (this.agent) {
      if (!(this.agent instanceof BaseAgent)) {
        return {
          valid: false,
          error: 'Agente deve herdar de BaseAgent'
        };
      }
    }
    
    return {
      valid: true
    };
  }

  /**
   * Método estático para criar plugin a partir de configuração
   */
  static async createFromConfig(config) {
    const plugin = new AgentPlugin(config);
    
    if (await plugin.initialize()) {
      return plugin;
    }
    
    return null;
  }
}

/**
 * Decorator para registrar plugin automaticamente
 */
AgentPlugin.register = function(PluginClass) {
  // Adicionar metadados para auto-registro
  PluginClass.prototype.__autoRegister = true;
  return PluginClass;
};

module.exports = AgentPlugin;