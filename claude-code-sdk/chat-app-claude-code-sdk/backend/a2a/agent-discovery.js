/**
 * A2A Agent Discovery Service
 * Descoberta automática e mock de agentes para desenvolvimento
 */

const { EventEmitter } = require('events');

class AgentDiscovery extends EventEmitter {
  constructor() {
    super();
    
    this.agents = new Map();
    this.mockAgents = new Map();
    this.discoveryInterval = null;
    this.config = {
      discoveryIntervalMs: 30000, // 30 segundos
      enableMockAgents: false, // Desabilitado por padrão
      mockResponseDelay: 1000 // 1 segundo de delay para simular latência
    };
    
    // Mock agents desabilitados por padrão
    // Para habilitar, defina enableMockAgents como true no config acima
    if (this.config.enableMockAgents) {
      this.initializeMockAgents();
    }
  }

  /**
   * Inicializar agentes mock para desenvolvimento
   */
  initializeMockAgents() {
    const mockAgents = [
      {
        id: 'mock-claude-direct',
        name: 'Claude Direct (Mock)',
        type: 'claude',
        status: 'available',
        capabilities: ['chat', 'code', 'analysis'],
        endpoint: 'mock://claude-direct',
        card: {
          name: 'Claude Direct Mock',
          description: 'Mock agent simulando Claude Direct para desenvolvimento',
          version: '1.0.0',
          status: 'active',
          endpoints: {
            claude: {
              chat: 'mock://claude/chat',
              task: 'mock://claude/task'
            }
          }
        }
      },
      {
        id: 'mock-crew-ai',
        name: 'CrewAI Agent (Mock)',
        type: 'crewai',
        status: 'available',
        capabilities: ['research', 'planning', 'execution'],
        endpoint: 'mock://crew-ai',
        card: {
          name: 'CrewAI Mock',
          description: 'Mock agent simulando CrewAI para desenvolvimento',
          version: '1.0.0',
          status: 'active',
          endpoints: {
            crew: {
              task: 'mock://crew/task',
              research: 'mock://crew/research'
            }
          }
        }
      },
      {
        id: 'mock-code-assistant',
        name: 'Code Assistant (Mock)',
        type: 'developer',
        status: 'available',
        capabilities: ['code-review', 'refactoring', 'testing'],
        endpoint: 'mock://code-assistant',
        card: {
          name: 'Code Assistant Mock',
          description: 'Mock agent para assistência de código',
          version: '1.0.0',
          status: 'active',
          endpoints: {
            code: {
              review: 'mock://code/review',
              refactor: 'mock://code/refactor',
              test: 'mock://code/test'
            }
          }
        }
      }
    ];

    for (const agent of mockAgents) {
      this.mockAgents.set(agent.id, agent);
      this.agents.set(agent.id, agent);
      console.log(`🤖 [Discovery] Mock agent registrado: ${agent.name}`);
    }
    
    this.emit('agents_discovered', mockAgents);
  }

  /**
   * Descobrir agentes reais na rede
   */
  async discoverAgents() {
    try {
      // Só mostrar log se estiver procurando ativamente
      if (this.config.enableMockAgents || this.agents.size > 0) {
        console.log('🔍 [Discovery] Procurando agentes A2A...');
      }
      
      // Tentar descobrir agentes reais (placeholder para implementação futura)
      const realAgents = await this.scanForRealAgents();
      
      // Combinar com mock agents se habilitado
      if (this.config.enableMockAgents) {
        for (const [id, agent] of this.mockAgents) {
          if (!this.agents.has(id)) {
            this.agents.set(id, agent);
          }
        }
      }
      
      const allAgents = Array.from(this.agents.values());
      
      // Só mostrar log se houver agentes
      if (allAgents.length > 0) {
        console.log(`✅ [Discovery] ${allAgents.length} agentes disponíveis`);
      }
      
      this.emit('discovery_complete', allAgents);
      return allAgents;
      
    } catch (error) {
      console.error('❌ [Discovery] Erro na descoberta:', error.message);
      
      // Retornar apenas mock agents em caso de erro
      if (this.config.enableMockAgents) {
        return Array.from(this.mockAgents.values());
      }
      
      return [];
    }
  }

  /**
   * Escanear por agentes reais (stub para implementação futura)
   */
  async scanForRealAgents() {
    // Aqui seria implementada a lógica real de descoberta
    // Por enquanto, apenas simula uma busca
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve([]);
      }, 500);
    });
  }

  /**
   * Iniciar descoberta automática periódica
   */
  startAutoDiscovery() {
    if (this.discoveryInterval) {
      return; // Já está ativo, não precisa logar
    }

    // Só logar se mock agents estiverem habilitados
    if (this.config.enableMockAgents) {
      console.log('🚀 [Discovery] Iniciando auto-discovery de agentes');
    }
    
    // Descoberta inicial
    this.discoverAgents();
    
    // Descoberta periódica
    this.discoveryInterval = setInterval(() => {
      this.discoverAgents();
    }, this.config.discoveryIntervalMs);
  }

  /**
   * Parar descoberta automática
   */
  stopAutoDiscovery() {
    if (this.discoveryInterval) {
      clearInterval(this.discoveryInterval);
      this.discoveryInterval = null;
      console.log('🛑 [Discovery] Auto-discovery parado');
    }
  }

  /**
   * Obter agente por ID
   */
  getAgent(agentId) {
    return this.agents.get(agentId);
  }

  /**
   * Listar todos os agentes
   */
  listAgents() {
    return Array.from(this.agents.values());
  }

  /**
   * Verificar se um agente está disponível
   */
  isAgentAvailable(agentId) {
    const agent = this.agents.get(agentId);
    return agent && agent.status === 'available';
  }

  /**
   * Processar mensagem com mock agent
   */
  async processMockMessage(agentId, message) {
    const agent = this.mockAgents.get(agentId);
    
    if (!agent) {
      throw new Error(`Mock agent ${agentId} não encontrado`);
    }

    // Simular delay de processamento
    await new Promise(resolve => setTimeout(resolve, this.config.mockResponseDelay));

    // Gerar resposta mock baseada no tipo de agente
    let response = '';
    
    switch (agent.type) {
      case 'claude':
        response = `[Mock Claude] Processando: "${message}"\n\n` +
                  `Como um assistente mock, eu simularia uma resposta detalhada aqui. ` +
                  `Esta é uma resposta de desenvolvimento para testar a integração.`;
        break;
        
      case 'crewai':
        response = `[Mock CrewAI] Tarefa recebida: "${message}"\n\n` +
                  `📋 Plano de execução:\n` +
                  `1. Análise da solicitação\n` +
                  `2. Pesquisa de informações\n` +
                  `3. Execução da tarefa\n` +
                  `4. Validação dos resultados\n\n` +
                  `Status: Simulação concluída com sucesso.`;
        break;
        
      case 'developer':
        response = `[Mock Code Assistant] Analisando código...\n\n` +
                  `📝 Análise:\n` +
                  `- Estrutura: OK\n` +
                  `- Qualidade: 8/10\n` +
                  `- Sugestões: Adicionar comentários\n\n` +
                  `Esta é uma resposta mock para desenvolvimento.`;
        break;
        
      default:
        response = `[Mock Agent] Mensagem recebida e processada: "${message}"`;
    }

    return {
      agentId,
      agentName: agent.name,
      response,
      timestamp: Date.now(),
      isMock: true
    };
  }

  /**
   * Obter status do serviço
   */
  getStatus() {
    return {
      totalAgents: this.agents.size,
      mockAgents: this.mockAgents.size,
      realAgents: this.agents.size - this.mockAgents.size,
      autoDiscoveryActive: this.discoveryInterval !== null,
      agents: this.listAgents().map(a => ({
        id: a.id,
        name: a.name,
        type: a.type,
        status: a.status,
        isMock: this.mockAgents.has(a.id)
      }))
    };
  }
}

module.exports = AgentDiscovery;