const express = require('express');
const router = express.Router();

/**
 * Rotas de Gestão de Memória
 */
class MemoryRoutes {
  constructor(memoryMiddleware, ragService) {
    this.memoryMiddleware = memoryMiddleware;
    this.ragService = ragService;
    this.setupRoutes();
  }

  setupRoutes() {
    // Buscar memórias
    router.get('/search', async (req, res) => {
      try {
        const { query, limit = 10, sessionId, userId } = req.query;
        
        // Construir query baseada nos parâmetros
        let searchQuery = query || '';
        if (sessionId) searchQuery += ` session:${sessionId}`;
        if (userId) searchQuery += ` user:${userId}`;
        
        const result = await this.ragService.searchMemories({
          query: searchQuery,
          limit: parseInt(limit)
        });
        const memories = result?.memories || result || [];
        
        res.json({
          success: true,
          count: memories.length,
          memories: memories.map(m => ({
            id: m.id,
            label: m.label,
            properties: m.properties,
            connections: m.connections || []
          }))
        });
      } catch (error) {
        console.error('❌ Erro ao buscar memórias:', error);
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // Obter contexto para uma mensagem
    router.post('/context', async (req, res) => {
      try {
        const { message, userId, sessionId } = req.body;
        
        if (!message) {
          return res.status(400).json({
            success: false,
            error: 'Mensagem é obrigatória'
          });
        }
        
        const context = await this.memoryMiddleware.getRelevantContext(
          message,
          userId || 'anonymous',
          sessionId || 'default'
        );
        
        res.json({
          success: true,
          context: this.memoryMiddleware.formatContext(context)
        });
      } catch (error) {
        console.error('❌ Erro ao obter contexto:', error);
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // Processar mensagem com memória
    router.post('/process', async (req, res) => {
      try {
        const { message, userId, sessionId } = req.body;
        
        if (!message) {
          return res.status(400).json({
            success: false,
            error: 'Mensagem é obrigatória'
          });
        }
        
        const processed = await this.memoryMiddleware.processMessage(
          message,
          userId || 'anonymous',
          sessionId || 'default'
        );
        
        res.json({
          success: true,
          message: processed
        });
      } catch (error) {
        console.error('❌ Erro ao processar mensagem:', error);
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // Obter resumo da sessão
    router.get('/session/:sessionId/summary', (req, res) => {
      try {
        const { sessionId } = req.params;
        
        const summary = this.memoryMiddleware.getSessionSummary(sessionId);
        
        res.json({
          success: true,
          sessionId,
          summary
        });
      } catch (error) {
        console.error('❌ Erro ao obter resumo da sessão:', error);
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // Exportar memória da sessão
    router.get('/session/:sessionId/export', (req, res) => {
      try {
        const { sessionId } = req.params;
        
        const exported = this.memoryMiddleware.exportSessionMemory(sessionId);
        
        res.json({
          success: true,
          data: exported
        });
      } catch (error) {
        console.error('❌ Erro ao exportar sessão:', error);
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // Importar memória da sessão
    router.post('/session/:sessionId/import', (req, res) => {
      try {
        const { sessionId } = req.params;
        const data = req.body;
        
        const success = this.memoryMiddleware.importSessionMemory(sessionId, data);
        
        res.json({
          success,
          message: success ? 'Memória importada com sucesso' : 'Falha ao importar memória'
        });
      } catch (error) {
        console.error('❌ Erro ao importar sessão:', error);
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // Limpar sessões antigas
    router.post('/cleanup', (req, res) => {
      try {
        const { maxAge } = req.body;
        
        this.memoryMiddleware.cleanupOldSessions(maxAge);
        
        res.json({
          success: true,
          message: 'Limpeza de sessões antigas executada'
        });
      } catch (error) {
        console.error('❌ Erro ao limpar sessões:', error);
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // Estatísticas de memória
    router.get('/stats', async (req, res) => {
      try {
        // Obter labels do Neo4j
        const labels = await this.ragService.listMemoryLabels();
        
        // Obter contagem de sessões ativas
        const activeSessions = this.memoryMiddleware.sessionMemory.size;
        
        // Calcular uso de memória
        let totalMessages = 0;
        for (const messages of this.memoryMiddleware.sessionMemory.values()) {
          totalMessages += messages.length;
        }
        
        res.json({
          success: true,
          stats: {
            neo4j: {
              labels: labels || [],
              connected: this.ragService.isConnected()
            },
            sessions: {
              active: activeSessions,
              totalMessages
            },
            contextWindow: this.memoryMiddleware.contextWindow
          }
        });
      } catch (error) {
        console.error('❌ Erro ao obter estatísticas:', error);
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // Criar memória manualmente
    router.post('/create', async (req, res) => {
      try {
        const { label, properties } = req.body;
        
        if (!label || !properties) {
          return res.status(400).json({
            success: false,
            error: 'Label e properties são obrigatórios'
          });
        }
        
        const memory = await this.ragService.createMemory({
          label,
          properties: {
            ...properties,
            created_at: new Date().toISOString(),
            source: 'manual'
          }
        });
        
        res.json({
          success: true,
          memory
        });
      } catch (error) {
        console.error('❌ Erro ao criar memória:', error);
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // Conectar memórias
    router.post('/connect', async (req, res) => {
      try {
        const { fromMemoryId, toMemoryId, type, properties } = req.body;
        
        if (!fromMemoryId || !toMemoryId || !type) {
          return res.status(400).json({
            success: false,
            error: 'fromMemoryId, toMemoryId e type são obrigatórios'
          });
        }
        
        const connection = await this.ragService.createConnection({
          fromMemoryId,
          toMemoryId,
          type,
          properties: properties || {}
        });
        
        res.json({
          success: true,
          connection
        });
      } catch (error) {
        console.error('❌ Erro ao criar conexão:', error);
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // Atualizar memória
    router.put('/:nodeId', async (req, res) => {
      try {
        const { nodeId } = req.params;
        const { properties } = req.body;
        
        if (!properties) {
          return res.status(400).json({
            success: false,
            error: 'Properties são obrigatórias'
          });
        }
        
        const updated = await this.ragService.updateMemory({
          nodeId: parseInt(nodeId),
          properties: {
            ...properties,
            updated_at: new Date().toISOString()
          }
        });
        
        res.json({
          success: true,
          memory: updated
        });
      } catch (error) {
        console.error('❌ Erro ao atualizar memória:', error);
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // Deletar memória (com cuidado!)
    router.delete('/:nodeId', async (req, res) => {
      try {
        const { nodeId } = req.params;
        const { confirm } = req.query;
        
        if (confirm !== 'true') {
          return res.status(400).json({
            success: false,
            error: 'Adicione ?confirm=true para confirmar deleção'
          });
        }
        
        await this.ragService.deleteMemory({
          nodeId: parseInt(nodeId)
        });
        
        res.json({
          success: true,
          message: `Memória ${nodeId} deletada`
        });
      } catch (error) {
        console.error('❌ Erro ao deletar memória:', error);
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });
  }

  getRouter() {
    return router;
  }
}

module.exports = MemoryRoutes;