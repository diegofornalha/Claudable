/**
 * Cliente A2A para o Chat App
 * Conecta e orquestra múltiplos agentes A2A com discovery automático
 */

const { EventEmitter } = require('events');
const WebSocket = require('ws');
const AgentDiscovery = require('./agent-discovery');

class A2AClient extends EventEmitter {
  constructor() {
    super();
    this.agents = new Map(); // Agentes registrados
    this.activeTasks = new Map(); // Tarefas em execução
    this.connections = new Map(); // Conexões WebSocket com agentes
    this.selectedAgent = null; // Agente atualmente selecionado
    
    // Inicializar serviço de discovery
    this.discovery = new AgentDiscovery();
    this.setupDiscoveryListeners();
    
    // Iniciar discovery automático
    this.discovery.startAutoDiscovery();
  }

  /**
   * Configurar listeners do discovery
   */
  setupDiscoveryListeners() {
    this.discovery.on('agents_discovered', (agents) => {
      // Só logar se houver agentes
      if (agents.length > 0) {
        console.log(`🔍 [A2A] ${agents.length} agentes descobertos`);
      }
      for (const agent of agents) {
        this.agents.set(agent.id, agent);
      }
      this.emit('agents:updated', this.listAgents());
    });

    this.discovery.on('discovery_complete', (agents) => {
      // Só logar se houver agentes
      if (agents.length > 0) {
        console.log(`✅ [A2A] Discovery completo: ${agents.length} agentes disponíveis`);
      }
    });
  }

  /**
   * Registrar um novo agente A2A
   */
  async registerAgent(name, config) {
    const agentInfo = {
      name,
      url: config.url,
      type: config.type || 'assistant',
      capabilities: [],
      status: 'disconnected',
      card: null
    };

    try {
      // Buscar agent card no endpoint padrão A2A
      const cardUrl = `${config.url}/.well-known/agent.json`;
      const response = await fetch(cardUrl);
      if (response.ok) {
        const card = await response.json();
        agentInfo.card = card;
        agentInfo.capabilities = card.capabilities || card.skills || [];
        agentInfo.status = 'connected';
      }
    } catch (error) {
      console.error(`Failed to connect to agent ${name}:`, error);
      agentInfo.status = 'error';
      agentInfo.error = error.message;
    }

    this.agents.set(name, agentInfo);
    this.emit('agent:registered', agentInfo);

    // Estabelecer conexão WebSocket se suportado
    if (agentInfo.card?.endpoints?.websocket) {
      this.connectWebSocket(name, agentInfo);
    }

    return agentInfo;
  }

  /**
   * Conectar via WebSocket para comunicação em tempo real
   */
  connectWebSocket(name, agentInfo) {
    const wsUrl = agentInfo.url.replace('http', 'ws') + '/ws';
    
    try {
      const ws = new WebSocket(wsUrl);

      ws.on('open', () => {
        console.log(`WebSocket connected to ${name}`);
        this.connections.set(name, ws);
        
        // Handshake inicial
        ws.send(JSON.stringify({
          type: 'handshake',
          client: 'chat-app',
          version: '1.0.0'
        }));
      });

      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleAgentMessage(name, message);
        } catch (error) {
          console.error(`Error parsing message from ${name}:`, error);
        }
      });

      ws.on('close', () => {
        console.log(`WebSocket disconnected from ${name}`);
        this.connections.delete(name);
        const agent = this.agents.get(name);
        if (agent) {
          agent.status = 'disconnected';
          this.emit('agent:disconnected', name);
        }
      });

      ws.on('error', (error) => {
        console.error(`WebSocket error with ${name}:`, error);
      });

    } catch (error) {
      console.error(`Failed to establish WebSocket with ${name}:`, error);
    }
  }

  /**
   * Processar mensagens recebidas dos agentes
   */
  handleAgentMessage(agentName, message) {
    const { type, ...data } = message;

    switch (type) {
      case 'connected':
        this.emit('agent:connected', { agent: agentName, ...data });
        break;

      case 'stream':
        // Repassar streaming para o cliente
        if (data.task_id) {
          const task = this.activeTasks.get(data.task_id);
          if (task) {
            task.stream.push(data.content);
            this.emit('task:stream', {
              task_id: data.task_id,
              content: data.content,
              agent: agentName
            });
          }
        }
        break;

      case 'complete':
        if (data.task_id) {
          const task = this.activeTasks.get(data.task_id);
          if (task) {
            task.status = 'completed';
            task.completed_at = new Date().toISOString();
            this.emit('task:complete', {
              task_id: data.task_id,
              agent: agentName
            });
          }
        }
        break;

      case 'knowledge_share':
        // Conhecimento compartilhado pelo agente
        this.emit('knowledge:shared', {
          agent: agentName,
          knowledge: data
        });
        break;

      case 'emergency':
        // Situação de emergência reportada pelo agente
        this.emit('emergency', {
          agent: agentName,
          ...data
        });
        break;

      default:
        this.emit('agent:message', {
          agent: agentName,
          type,
          data
        });
    }
  }

  /**
   * Selecionar agente ativo
   */
  selectAgent(name) {
    if (!this.agents.has(name)) {
      throw new Error(`Agent ${name} not found`);
    }

    const agent = this.agents.get(name);
    if (agent.status !== 'connected') {
      throw new Error(`Agent ${name} is not connected`);
    }

    this.selectedAgent = name;
    this.emit('agent:selected', name);
    return agent;
  }

  /**
   * Enviar tarefa para o agente selecionado (real ou mock)
   */
  async sendTask(task, options = {}) {
    if (!this.selectedAgent) {
      throw new Error('No agent selected');
    }

    const agent = this.agents.get(this.selectedAgent);
    if (!agent) {
      throw new Error('Selected agent not found');
    }

    const taskId = `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Criar registro da tarefa
    const taskRecord = {
      id: taskId,
      agent: this.selectedAgent,
      task,
      options,
      status: 'pending',
      created_at: new Date().toISOString(),
      stream: []
    };

    this.activeTasks.set(taskId, taskRecord);

    // Verificar se é um mock agent
    if (agent.endpoint && agent.endpoint.startsWith('mock://')) {
      console.log(`🤖 [A2A] Processando com mock agent: ${agent.name}`);
      return await this.processMockTask(taskId, agent, task, options);
    }

    try {
      // Garantir que task é uma string
      const taskContent = typeof task === 'string' ? task : JSON.stringify(task);
      
      // Enviar tarefa via API REST
      const response = await fetch(`${agent.url}/tasks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          task: taskContent,
          context: options.context || {},
          streaming: options.streaming || false
        })
      });

      if (!response.ok) {
        throw new Error(`Failed to submit task: ${response.statusText}`);
      }

      const result = await response.json();
      
      taskRecord.status = 'running';
      taskRecord.remote_id = result.task_id;

      // Se streaming está habilitado e há WebSocket
      if (options.streaming && this.connections.has(this.selectedAgent)) {
        const ws = this.connections.get(this.selectedAgent);
        ws.send(JSON.stringify({
          type: 'subscribe_task',
          task_id: result.task_id
        }));
      }

      this.emit('task:created', taskRecord);
      
      // Polling para tarefas não-streaming
      if (!options.streaming) {
        this.pollTaskStatus(taskId, result.task_id);
      }

      return taskRecord;

    } catch (error) {
      taskRecord.status = 'failed';
      taskRecord.error = error.message;
      this.emit('task:failed', taskRecord);
      throw error;
    }
  }

  /**
   * Polling do status da tarefa
   */
  async pollTaskStatus(localTaskId, remoteTaskId) {
    const task = this.activeTasks.get(localTaskId);
    if (!task) return;

    const agent = this.agents.get(task.agent);
    if (!agent) return;

    const pollInterval = setInterval(async () => {
      try {
        const response = await fetch(`${agent.url}/tasks/${remoteTaskId}`);
        
        if (!response.ok) {
          clearInterval(pollInterval);
          task.status = 'failed';
          task.error = 'Failed to poll task status';
          this.emit('task:failed', task);
          return;
        }

        const status = await response.json();
        
        task.status = status.status;
        
        if (status.status === 'completed') {
          clearInterval(pollInterval);
          task.result = status.result;
          task.completed_at = status.completed_at;
          this.emit('task:complete', task);
        } else if (status.status === 'failed') {
          clearInterval(pollInterval);
          task.error = status.error;
          this.emit('task:failed', task);
        }

      } catch (error) {
        clearInterval(pollInterval);
        task.status = 'failed';
        task.error = error.message;
        this.emit('task:failed', task);
      }
    }, 2000); // Poll a cada 2 segundos

    // Timeout após 5 minutos
    setTimeout(() => {
      clearInterval(pollInterval);
      if (task.status === 'running') {
        task.status = 'timeout';
        this.emit('task:timeout', task);
      }
    }, 5 * 60 * 1000);
  }

  /**
   * Enviar mensagem direta via chat (específico para Claude)
   */
  async sendChatMessage(message, sessionId = null) {
    if (!this.selectedAgent) {
      throw new Error('No agent selected');
    }

    const agent = this.agents.get(this.selectedAgent);
    
    // Verificar se o agente suporta chat direto
    if (!agent.card?.endpoints?.claude?.chat) {
      // Fallback para tarefa A2A padrão
      return this.sendTask(message, { streaming: true });
    }

    // Garantir que message é uma string
    const messageContent = typeof message === 'string' ? message : JSON.stringify(message);
    
    // Usar endpoint de chat específico
    const response = await fetch(`${agent.url}/claude/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: messageContent,
        session_id: sessionId
      })
    });

    if (!response.ok) {
      throw new Error(`Chat request failed: ${response.statusText}`);
    }

    return await response.json();
  }

  /**
   * Solicitar decisão do agente
   */
  async requestDecision(context, options) {
    if (!this.selectedAgent) {
      throw new Error('No agent selected');
    }

    const agent = this.agents.get(this.selectedAgent);
    
    const response = await fetch(`${agent.url}/decide`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ context, options })
    });

    if (!response.ok) {
      throw new Error(`Decision request failed: ${response.statusText}`);
    }

    const decision = await response.json();
    this.emit('decision:made', {
      agent: this.selectedAgent,
      decision
    });

    return decision;
  }

  /**
   * Compartilhar conhecimento com o agente
   */
  async shareKnowledge(knowledge) {
    if (!this.selectedAgent) {
      throw new Error('No agent selected');
    }

    const agent = this.agents.get(this.selectedAgent);
    
    const response = await fetch(`${agent.url}/learn`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ data: knowledge })
    });

    if (!response.ok) {
      throw new Error(`Knowledge sharing failed: ${response.statusText}`);
    }

    return await response.json();
  }

  /**
   * Processar tarefa com mock agent
   */
  async processMockTask(taskId, agent, task, options) {
    const taskRecord = this.activeTasks.get(taskId);
    
    try {
      // Atualizar status
      taskRecord.status = 'processing';
      
      // Processar com mock
      const result = await this.discovery.processMockMessage(agent.id, task);
      
      // Atualizar registro
      taskRecord.status = 'completed';
      taskRecord.result = result.response;
      taskRecord.completed_at = new Date().toISOString();
      
      // Emitir eventos
      this.emit('task:completed', {
        id: taskId,
        agent: agent.name,
        result: result.response,
        isMock: true
      });
      
      return taskRecord;
      
    } catch (error) {
      taskRecord.status = 'error';
      taskRecord.error = error.message;
      
      this.emit('task:error', {
        id: taskId,
        agent: agent.name,
        error: error.message
      });
      
      throw error;
    }
  }

  /**
   * Listar agentes disponíveis
   */
  listAgents() {
    return Array.from(this.agents.values()).map(agent => ({
      name: agent.name,
      type: agent.type,
      status: agent.status,
      capabilities: agent.capabilities
    }));
  }

  /**
   * Obter status de todas as tarefas
   */
  getTasksStatus() {
    return Array.from(this.activeTasks.values());
  }

  /**
   * Limpar tarefa concluída
   */
  clearTask(taskId) {
    this.activeTasks.delete(taskId);
  }

  /**
   * Desconectar de todos os agentes
   */
  disconnect() {
    // Fechar todas as conexões WebSocket
    for (const [name, ws] of this.connections) {
      ws.close();
    }
    
    this.connections.clear();
    this.agents.clear();
    this.activeTasks.clear();
    this.selectedAgent = null;
    
    this.emit('client:disconnected');
  }
}

module.exports = A2AClient;