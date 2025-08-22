/**
 * PluginManager - Sistema de gerenciamento de plugins para agentes
 * Permite carregar/descarregar agentes dinamicamente sem modificar o core
 */

const EventEmitter = require('events');
const fs = require('fs-extra');
const path = require('path');
const chokidar = require('chokidar');

class PluginManager extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = {
      pluginsDir: config.pluginsDir || path.join(__dirname, 'available'),
      enabledDir: config.enabledDir || path.join(__dirname, 'enabled'),
      configFile: config.configFile || path.join(__dirname, '../config/plugins.json'),
      autoReload: config.autoReload !== false,
      ...config
    };
    
    this.plugins = new Map(); // pluginId -> plugin instance
    this.agentRegistry = null; // Reference to AgentManager
    this.watcher = null;
  }

  /**
   * Inicializa o gerenciador de plugins
   */
  async initialize(agentRegistry) {
    this.agentRegistry = agentRegistry;
    
    // Garantir que os diretórios existem
    await fs.ensureDir(this.config.pluginsDir);
    await fs.ensureDir(this.config.enabledDir);
    
    // Carregar configuração
    await this.loadConfig();
    
    // Carregar plugins habilitados
    await this.loadEnabledPlugins();
    
    // Configurar hot-reload se habilitado
    if (this.config.autoReload) {
      this.setupWatcher();
    }
    
    console.log(`✅ PluginManager inicializado com ${this.plugins.size} plugins`);
    
    return true;
  }

  /**
   * Carrega configuração de plugins
   */
  async loadConfig() {
    try {
      if (await fs.pathExists(this.config.configFile)) {
        const config = await fs.readJson(this.config.configFile);
        this.config = { ...this.config, ...config };
      } else {
        // Criar configuração padrão
        const defaultConfig = {
          enabled: [],
          available: [],
          settings: {}
        };
        await fs.writeJson(this.config.configFile, defaultConfig, { spaces: 2 });
      }
    } catch (error) {
      console.error('❌ Erro ao carregar configuração de plugins:', error);
    }
  }

  /**
   * Carrega plugins habilitados
   */
  async loadEnabledPlugins() {
    try {
      const config = await fs.readJson(this.config.configFile);
      
      for (const pluginId of config.enabled) {
        await this.loadPlugin(pluginId);
      }
    } catch (error) {
      console.error('❌ Erro ao carregar plugins habilitados:', error);
    }
  }

  /**
   * Carrega um plugin específico
   */
  async loadPlugin(pluginId) {
    try {
      // Verificar se já está carregado
      if (this.plugins.has(pluginId)) {
        console.log(`⚠️ Plugin ${pluginId} já está carregado`);
        return false;
      }
      
      // Procurar plugin nos diretórios
      const pluginPaths = [
        path.join(this.config.enabledDir, pluginId),
        path.join(this.config.pluginsDir, pluginId),
        path.join(this.config.enabledDir, `${pluginId}.js`),
        path.join(this.config.pluginsDir, `${pluginId}.js`)
      ];
      
      let pluginPath = null;
      for (const p of pluginPaths) {
        if (await fs.pathExists(p)) {
          pluginPath = p;
          break;
        }
      }
      
      if (!pluginPath) {
        console.error(`❌ Plugin ${pluginId} não encontrado`);
        return false;
      }
      
      // Carregar módulo do plugin
      delete require.cache[require.resolve(pluginPath)]; // Clear cache for hot-reload
      const PluginClass = require(pluginPath);
      
      // Verificar se é um plugin válido
      if (!PluginClass || typeof PluginClass !== 'function') {
        console.error(`❌ Plugin ${pluginId} inválido`);
        return false;
      }
      
      // Instanciar plugin
      const plugin = new PluginClass();
      
      // Verificar interface
      if (!plugin.name || !plugin.type || !plugin.getAgent) {
        console.error(`❌ Plugin ${pluginId} não implementa interface correta`);
        return false;
      }
      
      // Inicializar plugin
      if (plugin.initialize) {
        await plugin.initialize();
      }
      
      // Registrar agente no AgentManager
      const agent = plugin.getAgent();
      if (this.agentRegistry && agent) {
        this.agentRegistry.registerAgent(agent);
      }
      
      // Armazenar plugin
      this.plugins.set(pluginId, plugin);
      
      console.log(`✅ Plugin ${pluginId} carregado: ${plugin.name}`);
      this.emit('plugin:loaded', { pluginId, plugin });
      
      return true;
      
    } catch (error) {
      console.error(`❌ Erro ao carregar plugin ${pluginId}:`, error);
      return false;
    }
  }

  /**
   * Descarrega um plugin
   */
  async unloadPlugin(pluginId) {
    try {
      const plugin = this.plugins.get(pluginId);
      
      if (!plugin) {
        console.warn(`⚠️ Plugin ${pluginId} não está carregado`);
        return false;
      }
      
      // Desregistrar agente do AgentManager
      if (this.agentRegistry && plugin.getAgent) {
        const agent = plugin.getAgent();
        if (agent && agent.name) {
          await this.agentRegistry.unregisterAgent(agent.name);
        }
      }
      
      // Executar cleanup do plugin
      if (plugin.shutdown) {
        await plugin.shutdown();
      }
      
      // Remover do registro
      this.plugins.delete(pluginId);
      
      console.log(`✅ Plugin ${pluginId} descarregado`);
      this.emit('plugin:unloaded', { pluginId });
      
      return true;
      
    } catch (error) {
      console.error(`❌ Erro ao descarregar plugin ${pluginId}:`, error);
      return false;
    }
  }

  /**
   * Habilita um plugin
   */
  async enablePlugin(pluginId) {
    try {
      // Carregar plugin
      const success = await this.loadPlugin(pluginId);
      
      if (success) {
        // Atualizar configuração
        const config = await fs.readJson(this.config.configFile);
        if (!config.enabled.includes(pluginId)) {
          config.enabled.push(pluginId);
          await fs.writeJson(this.config.configFile, config, { spaces: 2 });
        }
      }
      
      return success;
      
    } catch (error) {
      console.error(`❌ Erro ao habilitar plugin ${pluginId}:`, error);
      return false;
    }
  }

  /**
   * Desabilita um plugin
   */
  async disablePlugin(pluginId) {
    try {
      // Descarregar plugin
      const success = await this.unloadPlugin(pluginId);
      
      if (success) {
        // Atualizar configuração
        const config = await fs.readJson(this.config.configFile);
        const index = config.enabled.indexOf(pluginId);
        if (index > -1) {
          config.enabled.splice(index, 1);
          await fs.writeJson(this.config.configFile, config, { spaces: 2 });
        }
      }
      
      return success;
      
    } catch (error) {
      console.error(`❌ Erro ao desabilitar plugin ${pluginId}:`, error);
      return false;
    }
  }

  /**
   * Lista plugins disponíveis
   */
  async listAvailablePlugins() {
    try {
      const available = [];
      
      // Verificar diretório de plugins disponíveis
      const files = await fs.readdir(this.config.pluginsDir);
      
      for (const file of files) {
        const filePath = path.join(this.config.pluginsDir, file);
        const stat = await fs.stat(filePath);
        
        // Verificar se é um diretório ou arquivo .js
        if (stat.isDirectory() || file.endsWith('.js')) {
          const pluginId = file.replace('.js', '');
          available.push({
            id: pluginId,
            loaded: this.plugins.has(pluginId),
            path: filePath
          });
        }
      }
      
      return available;
      
    } catch (error) {
      console.error('❌ Erro ao listar plugins disponíveis:', error);
      return [];
    }
  }

  /**
   * Configura watcher para hot-reload
   */
  setupWatcher() {
    const watchPaths = [
      this.config.pluginsDir,
      this.config.enabledDir,
      this.config.configFile
    ];
    
    this.watcher = chokidar.watch(watchPaths, {
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 500,
        pollInterval: 100
      }
    });
    
    this.watcher.on('change', async (filePath) => {
      console.log(`🔄 Detectada mudança em: ${filePath}`);
      
      // Se for o arquivo de configuração, recarregar tudo
      if (filePath === this.config.configFile) {
        await this.reloadAll();
        return;
      }
      
      // Identificar plugin modificado
      const pluginId = path.basename(filePath, '.js');
      
      // Recarregar plugin específico
      if (this.plugins.has(pluginId)) {
        console.log(`🔄 Recarregando plugin: ${pluginId}`);
        await this.unloadPlugin(pluginId);
        await this.loadPlugin(pluginId);
      }
    });
    
    console.log('👁 Hot-reload de plugins ativado');
  }

  /**
   * Recarrega todos os plugins
   */
  async reloadAll() {
    console.log('🔄 Recarregando todos os plugins...');
    
    // Descarregar todos
    const pluginIds = Array.from(this.plugins.keys());
    for (const pluginId of pluginIds) {
      await this.unloadPlugin(pluginId);
    }
    
    // Recarregar configuração e plugins
    await this.loadConfig();
    await this.loadEnabledPlugins();
  }

  /**
   * Obtém informações de um plugin
   */
  getPluginInfo(pluginId) {
    const plugin = this.plugins.get(pluginId);
    
    if (!plugin) {
      return null;
    }
    
    return {
      id: pluginId,
      name: plugin.name,
      type: plugin.type,
      version: plugin.version || '1.0.0',
      description: plugin.description || '',
      capabilities: plugin.capabilities || [],
      loaded: true
    };
  }

  /**
   * Obtém status de todos os plugins
   */
  getStatus() {
    const loaded = Array.from(this.plugins.keys()).map(id => this.getPluginInfo(id));
    
    return {
      loaded,
      total: loaded.length,
      autoReload: this.config.autoReload,
      directories: {
        available: this.config.pluginsDir,
        enabled: this.config.enabledDir
      }
    };
  }

  /**
   * Desliga o gerenciador
   */
  async shutdown() {
    // Parar watcher
    if (this.watcher) {
      await this.watcher.close();
    }
    
    // Descarregar todos os plugins
    const pluginIds = Array.from(this.plugins.keys());
    for (const pluginId of pluginIds) {
      await this.unloadPlugin(pluginId);
    }
    
    console.log('✅ PluginManager desligado');
  }
}

module.exports = PluginManager;