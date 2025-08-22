/**
 * MCP Client para Neo4j Memory
 * Usa stdio transport para evitar conflitos com WebSocket
 */

const { spawn } = require('child_process');
const { EventEmitter } = require('events');
const path = require('path');

class MCPClient extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.mcpProcess = null;
    this.connected = false;
    this.requestQueue = [];
    this.responseHandlers = new Map();
    this.requestId = 0;
    this.connectionAttempts = 0;
    this.lastConnectionError = null;
    
    // Configurações com melhor retry logic
    this.config = {
      mcpServerPath: options.mcpServerPath || '/Users/2a/.claude/mcp-neo4j-agent-memory/build/index.js',
      neo4jUri: options.neo4jUri || process.env.NEO4J_URI || 'bolt://localhost:7687',
      neo4jUsername: options.neo4jUsername || process.env.NEO4J_USERNAME || 'neo4j',
      neo4jPassword: options.neo4jPassword || process.env.NEO4J_PASSWORD || 'password',
      transport: 'stdio', // Sempre usar stdio
      debug: options.debug || false,
      // Retry configuration
      maxRetries: options.maxRetries || 3,
      initialRetryDelay: options.initialRetryDelay || 1000, // 1 second
      maxRetryDelay: options.maxRetryDelay || 30000, // 30 seconds
      retryBackoffMultiplier: options.retryBackoffMultiplier || 2,
      connectionTimeout: options.connectionTimeout || 10000 // 10 seconds per attempt
    };
    
    this.buffer = '';
    this.reconnectTimer = null;
    this.isReconnecting = false;
  }

  /**
   * Conectar ao servidor MCP Neo4j com retry logic
   */
  async connect() {
    if (this.connected) {
      console.log('⚠️ MCP Client já está conectado');
      return true;
    }

    if (this.isReconnecting) {
      console.log('⚠️ Reconexão já em andamento...');
      return false;
    }

    this.isReconnecting = true;
    let lastError = null;

    // Tentativas com backoff exponencial
    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      this.connectionAttempts = attempt + 1;
      
      try {
        console.log(`🔌 [MCP] Tentativa ${attempt + 1}/${this.config.maxRetries + 1} de conectar ao Neo4j...`);
        
        // Verificar se o arquivo existe
        const fs = require('fs');
        if (!fs.existsSync(this.config.mcpServerPath)) {
          throw new Error(`MCP server não encontrado em: ${this.config.mcpServerPath}`);
        }

        // Limpar processo anterior se existir
        if (this.mcpProcess) {
          this.mcpProcess.kill();
          this.mcpProcess = null;
        }

        // Iniciar processo MCP
        this.mcpProcess = spawn('node', [this.config.mcpServerPath], {
          stdio: ['pipe', 'pipe', 'pipe'],
          env: {
            ...process.env,
            NEO4J_URI: this.config.neo4jUri,
            NEO4J_USERNAME: this.config.neo4jUsername,
            NEO4J_PASSWORD: this.config.neo4jPassword,
            MCP_TRANSPORT: 'stdio'
          }
        });

        // Configurar handlers de eventos
        this.mcpProcess.stdout.on('data', this.handleStdout.bind(this));
        this.mcpProcess.stderr.on('data', this.handleStderr.bind(this));
        
        this.mcpProcess.on('close', (code) => {
          console.log(`[MCP] Process exited with code ${code}`);
          this.connected = false;
          this.emit('disconnected', code);
          
          // Auto-reconnect se não foi intencional
          if (code !== 0 && !this.isReconnecting) {
            this.scheduleReconnect();
          }
        });

        this.mcpProcess.on('error', (error) => {
          console.error('[MCP] Process error:', error);
          this.connected = false;
          this.lastConnectionError = error;
          this.emit('error', error);
        });

        // Aguardar inicialização com timeout
        await this.waitForConnection();
        
        // Inicializar protocolo MCP
        await this.initializeMCPProtocol();
        
        console.log('✅ [MCP] Client conectado com sucesso');
        this.connected = true;
        this.isReconnecting = false;
        this.connectionAttempts = 0;
        this.lastConnectionError = null;
        this.emit('connected');
        
        return true;
        
      } catch (error) {
        lastError = error;
        this.lastConnectionError = error;
        console.error(`❌ [MCP] Tentativa ${attempt + 1} falhou:`, error.message);
        
        // Se não é a última tentativa, aguardar com backoff
        if (attempt < this.config.maxRetries) {
          const delay = Math.min(
            this.config.initialRetryDelay * Math.pow(this.config.retryBackoffMultiplier, attempt),
            this.config.maxRetryDelay
          );
          console.log(`⏳ [MCP] Aguardando ${delay}ms antes da próxima tentativa...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    // Todas as tentativas falharam
    this.isReconnecting = false;
    this.connected = false;
    console.error(`❌ [MCP] Falha ao conectar após ${this.config.maxRetries + 1} tentativas`);
    this.emit('connection_failed', lastError);
    
    return false;
  }

  /**
   * Aguardar conexão estar pronta com timeout otimizado
   */
  async waitForConnection() {
    const timeoutMs = this.config.connectionTimeout;
    
    return new Promise((resolve, reject) => {
      let connectionEstablished = false;
      let checkInterval;
      
      const timeout = setTimeout(() => {
        if (!connectionEstablished) {
          clearInterval(checkInterval);
          reject(new Error(`Timeout após ${timeoutMs}ms aguardando MCP inicializar`));
        }
      }, timeoutMs);

      // Verificar se o processo está vivo e pronto
      checkInterval = setInterval(() => {
        try {
          if (this.mcpProcess && !this.mcpProcess.killed && this.mcpProcess.pid) {
            // Processo está rodando
            connectionEstablished = true;
            clearInterval(checkInterval);
            clearTimeout(timeout);
            console.log(`✅ [MCP] Processo inicializado (PID: ${this.mcpProcess.pid})`);
            resolve();
          }
        } catch (error) {
          if (this.config.debug) {
            console.log(`⏳ [MCP] Aguardando inicialização...`);
          }
        }
      }, 500); // Check a cada 500ms
    });
  }

  /**
   * Agendar reconexão automática
   */
  scheduleReconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    const delay = Math.min(
      this.config.initialRetryDelay * Math.pow(this.config.retryBackoffMultiplier, this.connectionAttempts),
      this.config.maxRetryDelay
    );

    console.log(`🔄 [MCP] Reconexão automática agendada em ${delay}ms...`);
    
    this.reconnectTimer = setTimeout(async () => {
      console.log('🔄 [MCP] Tentando reconectar automaticamente...');
      try {
        await this.connect();
      } catch (error) {
        console.error('❌ [MCP] Falha na reconexão automática:', error.message);
      }
    }, delay);
  }

  /**
   * Processar dados do stdout
   */
  handleStdout(data) {
    this.buffer += data.toString();
    
    // Processar mensagens completas (separadas por newline)
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() || ''; // Guardar última linha incompleta
    
    for (const line of lines) {
      if (line.trim()) {
        try {
          const message = JSON.parse(line);
          this.handleMessage(message);
        } catch (error) {
          if (this.config.debug) {
            console.log('Non-JSON output:', line);
          }
        }
      }
    }
  }

  /**
   * Processar stderr
   */
  handleStderr(data) {
    const message = data.toString();
    if (this.config.debug || message.toLowerCase().includes('error')) {
      console.error('MCP stderr:', message);
    }
  }

  /**
   * Processar mensagem recebida
   */
  handleMessage(message) {
    if (this.config.debug) {
      console.log('MCP message received:', JSON.stringify(message, null, 2));
    }

    // Verificar se é uma resposta para requisição pendente
    if (message.id && this.responseHandlers.has(message.id)) {
      const handler = this.responseHandlers.get(message.id);
      this.responseHandlers.delete(message.id);
      
      if (message.error) {
        handler.reject(new Error(message.error.message || 'MCP error'));
      } else {
        handler.resolve(message.result);
      }
    }
    
    // Emitir evento para mensagens não solicitadas
    if (message.method) {
      this.emit('notification', message);
    }
  }

  /**
   * Enviar requisição ao MCP
   */
  async sendRequest(method, params = {}) {
    if (!this.mcpProcess) {
      throw new Error('MCP não está conectado');
    }

    const id = ++this.requestId;
    const request = {
      jsonrpc: '2.0',
      id,
      method,
      params
    };

    return new Promise((resolve, reject) => {
      // Registrar handler para resposta
      this.responseHandlers.set(id, { resolve, reject });
      
      // Enviar requisição
      const requestStr = JSON.stringify(request) + '\n';
      this.mcpProcess.stdin.write(requestStr);
      
      if (this.config.debug) {
        console.log('MCP request sent:', request);
      }
      
      // Timeout
      setTimeout(() => {
        if (this.responseHandlers.has(id)) {
          this.responseHandlers.delete(id);
          reject(new Error(`Timeout for request ${id}`));
        }
      }, 30000);
    });
  }

  /**
   * Inicializar protocolo MCP
   */
  async initializeMCPProtocol() {
    try {
      console.log('🔧 Inicializando protocolo MCP...');
      
      // Fase 1: Initialize
      const initResult = await this.sendRequest('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {
          roots: {
            listChanged: true
          },
          sampling: {}
        },
        clientInfo: {
          name: 'chat-app-claude-code-sdk',
          version: '1.0.0'
        }
      });
      
      console.log('✅ MCP initialize result:', initResult);
      
      // Fase 2: Initialized notification (não esperar resposta)
      try {
        // Enviar notification sem esperar resposta
        const notificationStr = JSON.stringify({
          jsonrpc: '2.0',
          method: 'notifications/initialized',
          params: {}
        }) + '\n';
        this.mcpProcess.stdin.write(notificationStr);
        console.log('✅ MCP initialized notification sent');
      } catch (notifError) {
        console.log('⚠️ Notification error (ok to ignore):', notifError.message);
      }
      
      return true;
    } catch (error) {
      console.error('❌ Erro inicializando protocolo MCP:', error.message);
      throw error;
    }
  }

  /**
   * Registrar aplicação no Neo4j
   */
  async registerChatApp() {
    try {
      const result = await this.createMemory('platform_session', {
        name: 'Chat App SDK Active Session',
        type: 'web_chat_active',
        started_at: new Date().toISOString(),
        pid: process.pid,
        status: 'active',
        has_a2a: true,
        has_mcp: true,
        platform: 'chat_app_sdk'
      });
      
      console.log('📝 Chat App registrado no Neo4j:', result);
      return result;
    } catch (error) {
      console.error('Erro registrando Chat App:', error);
    }
  }

  // === Métodos de Memória ===

  /**
   * Buscar memórias
   */
  async searchMemories(params = {}) {
    try {
      const result = await this.sendRequest('tools/call', {
        name: 'search_memories',
        arguments: {
          query: params.query || '',
          limit: params.limit || 10,
          depth: params.depth || 1,
          label: params.label,
          since_date: params.since_date
        }
      });
      
      // Extrair dados do formato MCP
      const content = result?.content?.[0]?.text;
      if (content) {
        const parsed = JSON.parse(content);
        return parsed?.memories || [];
      }
      return [];
    } catch (error) {
      console.error('Erro buscando memórias:', error);
      return [];
    }
  }

  /**
   * Criar nova memória
   */
  async createMemory(label, properties) {
    try {
      const result = await this.sendRequest('tools/call', {
        name: 'create_memory',
        arguments: {
          label,
          properties
        }
      });
      
      // Extrair dados do formato MCP
      const content = result?.content?.[0]?.text;
      if (content) {
        return JSON.parse(content);
      }
      return result;
    } catch (error) {
      console.error('Erro criando memória:', error);
      throw error;
    }
  }

  /**
   * Criar conexão entre memórias
   */
  async createConnection(fromMemoryId, toMemoryId, type, properties = {}) {
    try {
      const result = await this.sendRequest('tools/call', {
        name: 'create_connection',
        arguments: {
          fromMemoryId,
          toMemoryId,
          type,
          properties
        }
      });
      
      // Extrair dados do formato MCP
      const content = result?.content?.[0]?.text;
      if (content) {
        return JSON.parse(content);
      }
      return result;
    } catch (error) {
      console.error('Erro criando conexão:', error);
      throw error;
    }
  }

  /**
   * Atualizar memória existente
   */
  async updateMemory(nodeId, properties) {
    try {
      const result = await this.sendRequest('tools/call', {
        name: 'update_memory',
        arguments: {
          nodeId,
          properties
        }
      });
      
      // Extrair dados do formato MCP
      const content = result?.content?.[0]?.text;
      if (content) {
        return JSON.parse(content);
      }
      return result;
    } catch (error) {
      console.error('Erro atualizando memória:', error);
      throw error;
    }
  }

  /**
   * Deletar memória
   */
  async deleteMemory(nodeId) {
    try {
      const result = await this.sendRequest('tools/call', {
        name: 'delete_memory',
        arguments: {
          nodeId
        }
      });
      
      // Extrair dados do formato MCP
      const content = result?.content?.[0]?.text;
      if (content) {
        return JSON.parse(content);
      }
      return result;
    } catch (error) {
      console.error('Erro deletando memória:', error);
      throw error;
    }
  }

  /**
   * Listar labels de memória
   */
  async listMemoryLabels() {
    try {
      const result = await this.sendRequest('tools/call', {
        name: 'list_memory_labels',
        arguments: {}
      });
      
      // Extrair dados do formato MCP
      const content = result?.content?.[0]?.text;
      if (content) {
        const parsed = JSON.parse(content);
        return parsed?.labels || [];
      }
      return [];
    } catch (error) {
      console.error('Erro listando labels:', error);
      return [];
    }
  }

  /**
   * Desconectar cliente
   */
  async disconnect() {
    if (this.mcpProcess) {
      console.log('🔌 Desconectando MCP Client...');
      
      // Tentar shutdown gracioso
      try {
        await this.sendRequest('shutdown', {});
      } catch (error) {
        // Ignorar erros no shutdown
      }
      
      // Fechar processo
      this.mcpProcess.kill();
      this.mcpProcess = null;
      this.connected = false;
      
      console.log('✅ MCP Client desconectado');
    }
  }

  /**
   * Status do cliente
   */
  getStatus() {
    return {
      connected: this.connected,
      processRunning: !!this.mcpProcess,
      pendingRequests: this.responseHandlers.size,
      config: {
        neo4jUri: this.config.neo4jUri,
        transport: this.config.transport
      }
    };
  }

  /**
   * Testar conexão com Neo4j através do MCP
   */
  async testConnection() {
    try {
      console.log('🧪 Testando conexão MCP -> Neo4j...');
      
      // Tentar buscar labels como teste
      const labels = await this.listMemoryLabels();
      
      // Tentar criar uma memória de teste
      const testMemory = await this.createMemory('test_connection', {
        name: 'MCP Connection Test',
        timestamp: new Date().toISOString(),
        test: true
      });
      
      // Deletar memória de teste
      if (testMemory?.memory?._id) {
        await this.deleteMemory(testMemory.memory._id);
      }
      
      console.log('✅ Conexão MCP -> Neo4j funcionando!');
      return {
        success: true,
        connected: true,
        labels: labels.length,
        message: 'MCP conectado e Neo4j acessível'
      };
    } catch (error) {
      console.error('❌ Falha no teste de conexão:', error.message);
      return {
        success: false,
        connected: this.connected,
        error: error.message,
        message: 'Falha na conexão MCP -> Neo4j'
      };
    }
  }
}

module.exports = MCPClient;