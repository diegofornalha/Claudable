/**
 * A2A Native Routes - Endpoints /delegate e /communicate
 * Implementação nativa do protocolo A2A como no Mesop
 */

const express = require('express');
const router = express.Router();
const { getAgentManager } = require('../services/AgentManager');

/**
 * POST /delegate
 * Delega uma tarefa para outro agente
 * 
 * Body:
 * {
 *   "from": "agent-source",
 *   "to": "agent-target",
 *   "task": {
 *     "message": "...",
 *     "context": {},
 *     "options": {}
 *   }
 * }
 */
router.post('/delegate', async (req, res) => {
  try {
    const { from, to, task } = req.body;
    
    // Validação
    if (!from || !to || !task) {
      return res.status(400).json({
        error: 'Missing required fields: from, to, task'
      });
    }
    
    const agentManager = getAgentManager();
    
    // Verificar se os agentes existem
    const sourceAgent = agentManager.getAgent(from);
    const targetAgent = agentManager.getAgent(to);
    
    if (!sourceAgent) {
      return res.status(404).json({
        error: `Source agent not found: ${from}`
      });
    }
    
    if (!targetAgent) {
      return res.status(404).json({
        error: `Target agent not found: ${to}`
      });
    }
    
    // Verificar se o agente alvo está healthy
    if (targetAgent.status !== 'healthy') {
      return res.status(503).json({
        error: `Target agent is not healthy: ${to} (${targetAgent.status})`
      });
    }
    
    console.log(`📤 Delegating task from ${from} to ${to}`);
    
    // Adicionar contexto de delegação
    const delegatedTask = {
      ...task,
      context: {
        ...task.context,
        delegatedFrom: from,
        delegatedTo: to,
        delegatedAt: Date.now()
      }
    };
    
    // Processar com o agente alvo
    const result = await targetAgent.process(delegatedTask);
    
    // Registrar métricas
    const delegationInfo = {
      from,
      to,
      taskId: result.taskId,
      success: result.success,
      processingTime: result.processingTime
    };
    
    console.log(`✅ Delegation completed:`, delegationInfo);
    
    res.json({
      success: true,
      delegation: delegationInfo,
      result
    });
    
  } catch (error) {
    console.error('❌ Delegation error:', error);
    res.status(500).json({
      error: error.message
    });
  }
});

/**
 * POST /communicate
 * Permite comunicação direta entre agentes
 * 
 * Body:
 * {
 *   "from": "agent-source",
 *   "to": "agent-target",
 *   "message": {
 *     "type": "query|inform|request|response",
 *     "content": "...",
 *     "metadata": {}
 *   }
 * }
 */
router.post('/communicate', async (req, res) => {
  try {
    const { from, to, message } = req.body;
    
    // Validação
    if (!from || !to || !message) {
      return res.status(400).json({
        error: 'Missing required fields: from, to, message'
      });
    }
    
    const agentManager = getAgentManager();
    
    // Verificar agentes
    const sourceAgent = agentManager.getAgent(from);
    const targetAgent = agentManager.getAgent(to);
    
    if (!sourceAgent || !targetAgent) {
      return res.status(404).json({
        error: 'One or both agents not found'
      });
    }
    
    console.log(`💬 Communication from ${from} to ${to} (${message.type})`);
    
    // Estruturar mensagem de comunicação
    const communication = {
      id: `comm-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      from,
      to,
      type: message.type || 'inform',
      content: message.content,
      metadata: {
        ...message.metadata,
        timestamp: Date.now(),
        sourceStatus: sourceAgent.status,
        targetStatus: targetAgent.status
      }
    };
    
    // Processar baseado no tipo de mensagem
    let response = null;
    
    switch (communication.type) {
      case 'query':
        // Agente alvo processa a query
        response = await targetAgent.process({
          message: communication.content,
          context: {
            communicationType: 'query',
            from: from,
            metadata: communication.metadata
          }
        });
        break;
        
      case 'request':
        // Agente alvo executa a requisição
        response = await targetAgent.process({
          message: communication.content,
          context: {
            communicationType: 'request',
            from: from,
            metadata: communication.metadata
          }
        });
        break;
        
      case 'inform':
        // Apenas registrar a informação
        response = {
          success: true,
          acknowledged: true,
          message: 'Information received'
        };
        break;
        
      case 'response':
        // Resposta a uma comunicação anterior
        response = {
          success: true,
          acknowledged: true,
          originalResponse: communication.content
        };
        break;
        
      default:
        response = {
          success: false,
          error: `Unknown communication type: ${communication.type}`
        };
    }
    
    // Registrar comunicação
    const communicationLog = {
      ...communication,
      response,
      completedAt: Date.now()
    };
    
    console.log(`✅ Communication completed:`, {
      id: communication.id,
      type: communication.type,
      success: response.success
    });
    
    res.json({
      success: true,
      communication: communicationLog
    });
    
  } catch (error) {
    console.error('❌ Communication error:', error);
    res.status(500).json({
      error: error.message
    });
  }
});

/**
 * POST /negotiate
 * Negociação de capacidades entre agentes
 * 
 * Body:
 * {
 *   "from": "agent-source",
 *   "requirements": ["capability1", "capability2"],
 *   "preferences": {
 *     "maxResponseTime": 5000,
 *     "preferredType": "llm"
 *   }
 * }
 */
router.post('/negotiate', async (req, res) => {
  try {
    const { from, requirements, preferences = {} } = req.body;
    
    if (!from || !requirements) {
      return res.status(400).json({
        error: 'Missing required fields: from, requirements'
      });
    }
    
    const agentManager = getAgentManager();
    const agents = agentManager.getAgents();
    
    console.log(`🤝 Negotiating agents for ${from} with requirements:`, requirements);
    
    // Filtrar agentes que atendem aos requisitos
    const eligibleAgents = agents.filter(agent => {
      // Não incluir o próprio agente solicitante
      if (agent.name === from) return false;
      
      // Verificar se está healthy
      if (agent.status !== 'healthy') return false;
      
      // Verificar capacidades
      const hasAllCapabilities = requirements.every(req =>
        agent.capabilities.includes(req)
      );
      
      if (!hasAllCapabilities) return false;
      
      // Aplicar preferências
      if (preferences.preferredType && agent.type !== preferences.preferredType) {
        return false;
      }
      
      if (preferences.maxResponseTime && agent.metrics) {
        if (agent.metrics.averageResponseTime > preferences.maxResponseTime) {
          return false;
        }
      }
      
      return true;
    });
    
    // Ordenar por métricas (melhor performance primeiro)
    eligibleAgents.sort((a, b) => {
      // Priorizar por taxa de sucesso
      const successA = a.metrics?.successRate || 0;
      const successB = b.metrics?.successRate || 0;
      
      if (successA !== successB) {
        return successB - successA;
      }
      
      // Depois por tempo de resposta
      const timeA = a.metrics?.averageResponseTime || Infinity;
      const timeB = b.metrics?.averageResponseTime || Infinity;
      
      return timeA - timeB;
    });
    
    console.log(`✅ Found ${eligibleAgents.length} eligible agents`);
    
    res.json({
      success: true,
      negotiation: {
        from,
        requirements,
        preferences,
        eligibleAgents: eligibleAgents.map(a => ({
          name: a.name,
          type: a.type,
          capabilities: a.capabilities,
          metrics: a.metrics,
          score: calculateAgentScore(a, requirements, preferences)
        })),
        recommended: eligibleAgents[0]?.name || null
      }
    });
    
  } catch (error) {
    console.error('❌ Negotiation error:', error);
    res.status(500).json({
      error: error.message
    });
  }
});

/**
 * GET /discover
 * Descoberta de agentes disponíveis
 */
router.get('/discover', async (req, res) => {
  try {
    const agentManager = getAgentManager();
    
    // Forçar descoberta
    await agentManager.discoverAgents();
    
    const agents = agentManager.getAgents();
    
    res.json({
      success: true,
      agents: agents.map(agent => ({
        name: agent.name,
        type: agent.type,
        url: agent.url,
        status: agent.status,
        capabilities: agent.capabilities,
        metrics: agent.metrics
      })),
      timestamp: Date.now()
    });
    
  } catch (error) {
    console.error('❌ Discovery error:', error);
    res.status(500).json({
      error: error.message
    });
  }
});

/**
 * GET /.well-known/agent.json
 * Informações do próprio servidor como agente A2A
 */
router.get('/.well-known/agent.json', (req, res) => {
  res.json({
    name: 'a2a-orchestrator',
    version: '2.0.0',
    type: 'orchestrator',
    description: 'A2A Orchestrator with delegation and communication capabilities',
    capabilities: [
      'delegation',
      'communication',
      'negotiation',
      'discovery',
      'orchestration',
      'workflow_execution'
    ],
    protocol: {
      version: 'a2a/2.0',
      features: [
        'delegate',
        'communicate',
        'negotiate',
        'discover'
      ]
    },
    endpoints: {
      delegate: '/delegate',
      communicate: '/communicate',
      negotiate: '/negotiate',
      discover: '/discover',
      health: '/health',
      process: '/process'
    },
    metadata: {
      author: 'Chat App Enhanced',
      license: 'MIT',
      documentation: 'https://github.com/your-repo/docs'
    }
  });
});

/**
 * Função auxiliar para calcular score de agente
 */
function calculateAgentScore(agent, requirements, preferences) {
  let score = 100;
  
  // Penalizar por capacidades extras não requisitadas (complexidade)
  const extraCapabilities = agent.capabilities.length - requirements.length;
  score -= extraCapabilities * 2;
  
  // Bonificar por métricas
  if (agent.metrics) {
    score += (agent.metrics.successRate || 0) * 0.5;
    
    // Penalizar por tempo de resposta alto
    const responseTime = agent.metrics.averageResponseTime || 0;
    if (responseTime > 5000) {
      score -= (responseTime - 5000) / 100;
    }
  }
  
  // Bonificar se corresponde ao tipo preferido
  if (preferences.preferredType && agent.type === preferences.preferredType) {
    score += 20;
  }
  
  return Math.max(0, Math.round(score));
}

module.exports = router;