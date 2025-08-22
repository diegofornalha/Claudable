/**
 * Servidor Enhanced - Integra todas as melhorias inspiradas no Mesop
 * Este é um exemplo de como integrar o novo sistema
 */

const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const cors = require('cors');
const { getAgentManager } = require('./services/AgentManager');
const { getAsyncPoller } = require('./services/AsyncPoller');

// Configuração do servidor
const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Middleware
app.use(cors());
app.use(express.json());

// Gerenciadores
let agentManager = null;
let asyncPoller = null;

/**
 * Inicialização do sistema
 */
async function initializeSystem() {
  console.log('🚀 Iniciando Servidor Enhanced (Inspirado no Mesop)...');
  
  try {
    // Inicializar AgentManager
    agentManager = getAgentManager({
      enableAutoDiscovery: true,
      discoveryInterval: 30000,
      maxConcurrentTasks: 10
    });
    
    await agentManager.initialize();
    
    // Obter AsyncPoller (já iniciado pelo AgentManager)
    asyncPoller = getAsyncPoller();
    
    // Configurar listeners
    setupAgentListeners();
    setupPollerListeners();
    
    console.log('✅ Sistema inicializado com sucesso');
    
  } catch (error) {
    console.error('❌ Falha na inicialização:', error);
    process.exit(1);
  }
}

/**
 * Configurar listeners do AgentManager
 */
function setupAgentListeners() {
  agentManager.on('agent:registered', (data) => {
    io.emit('agent:registered', data);
    console.log(`📢 Broadcast: Novo agente registrado - ${data.agent}`);
  });
  
  agentManager.on('agent:healthy', (data) => {
    io.emit('agent:healthy', data);
  });
  
  agentManager.on('agent:unhealthy', (data) => {
    io.emit('agent:unhealthy', data);
  });
  
  agentManager.on('task:progress', (data) => {
    io.emit('task:progress', data);
  });
  
  agentManager.on('task:completed', (data) => {
    io.emit('task:completed', data);
  });
}

/**
 * Configurar listeners do AsyncPoller
 */
function setupPollerListeners() {
  asyncPoller.on('task:updated', (data) => {
    // Broadcast para todos os clientes
    io.emit('task:updated', data);
  });
}

/**
 * Socket.IO handlers
 */
io.on('connection', (socket) => {
  console.log(`👤 Cliente conectado: ${socket.id}`);
  
  // Adicionar cliente como subscriber do poller
  asyncPoller.addSubscriber(socket.id, socket);
  
  // Enviar estado inicial
  socket.emit('system:status', {
    agents: agentManager.getAgents(),
    metrics: agentManager.getInfo().metrics,
    pollerMetrics: asyncPoller.getMetrics()
  });
  
  /**
   * Processar mensagem com seleção automática de agente
   */
  socket.on('message', async (data) => {
    const { message, sessionId, options = {} } = data;
    
    console.log(`📨 Mensagem recebida: "${message?.substring(0, 50)}..."`);
    
    try {
      // Processar com AgentManager (seleção automática)
      const result = await agentManager.processTask({
        message,
        sessionId,
        ...options
      });
      
      // Enviar resposta
      socket.emit('message:response', {
        success: true,
        ...result
      });
      
    } catch (error) {
      console.error('❌ Erro processando mensagem:', error);
      socket.emit('message:error', {
        error: error.message
      });
    }
  });
  
  /**
   * Processar com agente específico
   */
  socket.on('message:agent', async (data) => {
    const { message, agent, sessionId, options = {} } = data;
    
    console.log(`📨 Mensagem para ${agent}: "${message?.substring(0, 50)}..."`);
    
    try {
      // Forçar uso de agente específico
      const result = await agentManager.processTask({
        message,
        agent,
        sessionId,
        ...options
      });
      
      socket.emit('message:response', {
        success: true,
        ...result
      });
      
    } catch (error) {
      console.error('❌ Erro processando mensagem:', error);
      socket.emit('message:error', {
        error: error.message
      });
    }
  });
  
  /**
   * Descobrir agentes disponíveis
   */
  socket.on('agents:discover', async () => {
    await agentManager.discoverAgents();
    socket.emit('agents:list', agentManager.getAgents());
  });
  
  /**
   * Listar agentes
   */
  socket.on('agents:list', () => {
    socket.emit('agents:list', agentManager.getAgents());
  });
  
  /**
   * Obter informações de um agente
   */
  socket.on('agent:info', (agentName) => {
    const agent = agentManager.getAgent(agentName);
    if (agent) {
      socket.emit('agent:info', agent.getInfo());
    } else {
      socket.emit('agent:error', {
        error: `Agent ${agentName} not found`
      });
    }
  });
  
  /**
   * Obter métricas do sistema
   */
  socket.on('system:metrics', () => {
    socket.emit('system:metrics', {
      agentManager: agentManager.getInfo(),
      poller: asyncPoller.getMetrics()
    });
  });
  
  /**
   * Executar workflow complexo
   */
  socket.on('workflow:execute', async (workflow) => {
    console.log(`🔄 Executando workflow: ${workflow.name}`);
    
    try {
      const crewAI = agentManager.getAgent('crew-ai');
      
      if (!crewAI) {
        throw new Error('CrewAI agent not available');
      }
      
      const result = await crewAI.executeWorkflow(workflow);
      
      socket.emit('workflow:result', {
        success: true,
        ...result
      });
      
    } catch (error) {
      console.error('❌ Erro no workflow:', error);
      socket.emit('workflow:error', {
        error: error.message
      });
    }
  });
  
  /**
   * Desconexão do cliente
   */
  socket.on('disconnect', () => {
    console.log(`👤 Cliente desconectado: ${socket.id}`);
    asyncPoller.removeSubscriber(socket.id);
  });
});

/**
 * Rotas REST (compatibilidade)
 */

// Status do sistema
app.get('/status', (req, res) => {
  res.json({
    status: 'healthy',
    agents: agentManager.getAgents(),
    metrics: agentManager.getInfo()
  });
});

// Listar agentes
app.get('/agents', (req, res) => {
  res.json(agentManager.getAgents());
});

// Informações de um agente
app.get('/agents/:name', (req, res) => {
  const agent = agentManager.getAgent(req.params.name);
  if (agent) {
    res.json(agent.getInfo());
  } else {
    res.status(404).json({ error: 'Agent not found' });
  }
});

// Processar tarefa
app.post('/process', async (req, res) => {
  try {
    const result = await agentManager.processTask(req.body);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Métricas do sistema
app.get('/metrics', (req, res) => {
  res.json({
    agentManager: agentManager.getInfo(),
    poller: asyncPoller.getMetrics(),
    uptime: process.uptime(),
    memory: process.memoryUsage()
  });
});

// Health check
app.get('/health', (req, res) => {
  const agents = agentManager.getAgents();
  const healthyAgents = agents.filter(a => a.status === 'healthy');
  
  if (healthyAgents.length === 0) {
    res.status(503).json({
      status: 'unhealthy',
      message: 'No healthy agents available'
    });
  } else {
    res.json({
      status: 'healthy',
      healthyAgents: healthyAgents.length,
      totalAgents: agents.length
    });
  }
});

/**
 * Graceful shutdown
 */
process.on('SIGINT', async () => {
  console.log('\n🛑 Recebido SIGINT, desligando gracefully...');
  
  try {
    // Desligar AgentManager
    if (agentManager) {
      await agentManager.shutdown();
    }
    
    // Fechar servidor
    server.close(() => {
      console.log('✅ Servidor desligado');
      process.exit(0);
    });
    
    // Forçar saída após 10 segundos
    setTimeout(() => {
      console.error('❌ Forçando saída...');
      process.exit(1);
    }, 10000);
    
  } catch (error) {
    console.error('❌ Erro no shutdown:', error);
    process.exit(1);
  }
});

/**
 * Iniciar servidor
 */
const PORT = process.env.PORT || 8090;

initializeSystem().then(() => {
  server.listen(PORT, () => {
    console.log(`
╔════════════════════════════════════════════╗
║   🚀 Servidor Enhanced Rodando             ║
║   📍 Porta: ${PORT}                          ║
║   🎯 Inspirado no Mesop/A2A-UI            ║
║   ✨ Features:                            ║
║      • Polling Assíncrono                 ║
║      • Descoberta Automática              ║
║      • Múltiplos Agentes                  ║
║      • Orquestração Inteligente          ║
╚════════════════════════════════════════════╝
    `);
  });
});