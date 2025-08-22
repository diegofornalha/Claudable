/**
 * Memory Extractor Service
 * Extrai e gerencia informações importantes das conversas
 */

class MemoryExtractor {
  constructor(neo4jService) {
    this.neo4jService = neo4jService;
    this.userInfo = new Map(); // Cache local de informações do usuário
  }

  /**
   * Extrai informações pessoais de uma mensagem
   */
  extractPersonalInfo(message) {
    const info = {};
    
    // Padrões para detectar nome
    const namePatterns = [
      /(?:meu nome é|me chamo|sou o?a?)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/i,
      /(?:olá|oi),?\s*(?:eu sou|sou o?a?)\s+([A-Z][a-z]+)/i,
      /^([A-Z][a-z]+)(?:\s+aqui)?[.!]?$/  // Nome sozinho no início
    ];
    
    for (const pattern of namePatterns) {
      const match = message.match(pattern);
      if (match) {
        info.name = match[1].trim();
        break;
      }
    }
    
    // Detectar outras informações
    if (message.toLowerCase().includes('projeto')) {
      info.hasProject = true;
    }
    
    if (message.match(/\b\d+\s*anos?\b/)) {
      const ageMatch = message.match(/(\d+)\s*anos?/);
      if (ageMatch) {
        info.age = parseInt(ageMatch[1]);
      }
    }
    
    return info;
  }

  /**
   * Salva informações do usuário no Neo4j
   */
  async saveUserInfo(sessionId, info) {
    if (!this.neo4jService || !this.neo4jService.isConnected()) {
      console.log('⚠️ Neo4j not connected, using local cache only');
      this.userInfo.set(sessionId, info);
      return;
    }

    try {
      // Salvar no Neo4j
      const query = `
        MERGE (u:User {session_id: $sessionId})
        SET u += $info
        SET u.updated_at = datetime()
        RETURN u
      `;
      
      await this.neo4jService.session.run(query, {
        sessionId,
        info: {
          ...info,
          last_seen: new Date().toISOString()
        }
      });
      
      // Atualizar cache local
      this.userInfo.set(sessionId, info);
      
      console.log('✅ User info saved to Neo4j:', info);
    } catch (error) {
      console.error('❌ Error saving user info:', error);
      // Fallback para cache local
      this.userInfo.set(sessionId, info);
    }
  }

  /**
   * Recupera informações do usuário
   */
  async getUserInfo(sessionId) {
    // Verificar cache local primeiro
    if (this.userInfo.has(sessionId)) {
      return this.userInfo.get(sessionId);
    }

    if (!this.neo4jService || !this.neo4jService.isConnected()) {
      return null;
    }

    try {
      // Buscar no Neo4j
      const query = `
        MATCH (u:User {session_id: $sessionId})
        RETURN u
        LIMIT 1
      `;
      
      const result = await this.neo4jService.session.run(query, { sessionId });
      
      if (result.records.length > 0) {
        const userNode = result.records[0].get('u');
        const userInfo = userNode.properties;
        
        // Atualizar cache local
        this.userInfo.set(sessionId, userInfo);
        
        return userInfo;
      }
    } catch (error) {
      console.error('❌ Error retrieving user info:', error);
    }

    return null;
  }

  /**
   * Processa uma mensagem e extrai/salva informações relevantes
   */
  async processMessage(message, sessionId) {
    const extractedInfo = this.extractPersonalInfo(message);
    
    if (Object.keys(extractedInfo).length > 0) {
      // Mesclar com informações existentes
      const existingInfo = await this.getUserInfo(sessionId) || {};
      const updatedInfo = { ...existingInfo, ...extractedInfo };
      
      await this.saveUserInfo(sessionId, updatedInfo);
      
      return {
        extracted: extractedInfo,
        updated: updatedInfo
      };
    }
    
    return null;
  }

  /**
   * Verifica se a mensagem é uma pergunta sobre informações pessoais
   */
  isAskingAboutSelf(message) {
    const patterns = [
      /qual (?:é )?(?:o )?meu nome/i,
      /(?:você )?(?:sabe|lembra) (?:o )?meu nome/i,
      /como (?:eu )?me chamo/i,
      /quem sou eu/i,
      /(?:você )?(?:se )?lembra de mim/i,
      /(?:o que|quais) (?:você )?sabe sobre mim/i
    ];
    
    return patterns.some(pattern => pattern.test(message));
  }

  /**
   * Gera resposta baseada nas informações do usuário
   */
  async generatePersonalizedResponse(message, sessionId) {
    if (!this.isAskingAboutSelf(message)) {
      return null;
    }

    const userInfo = await this.getUserInfo(sessionId);
    
    if (!userInfo) {
      return "Desculpe, ainda não nos conhecemos. Qual é o seu nome?";
    }

    // Construir resposta baseada nas informações disponíveis
    const responses = [];
    
    if (userInfo.name) {
      if (message.toLowerCase().includes('nome')) {
        return `Seu nome é ${userInfo.name}! 😊`;
      }
      responses.push(`Claro que lembro de você, ${userInfo.name}!`);
    }
    
    if (userInfo.age) {
      responses.push(`Você tem ${userInfo.age} anos.`);
    }
    
    if (userInfo.hasProject) {
      responses.push(`Você mencionou estar trabalhando em um projeto.`);
    }
    
    if (userInfo.last_seen) {
      const lastSeen = new Date(userInfo.last_seen);
      const now = new Date();
      const diffHours = Math.floor((now - lastSeen) / (1000 * 60 * 60));
      
      if (diffHours < 1) {
        responses.push(`Estamos conversando há alguns minutos.`);
      } else if (diffHours < 24) {
        responses.push(`Nos falamos há ${diffHours} horas atrás.`);
      }
    }
    
    return responses.length > 0 
      ? responses.join(' ') 
      : "Estou aqui para ajudar com seu projeto!";
  }

  /**
   * Limpa o cache local (útil para testes)
   */
  clearCache(sessionId = null) {
    if (sessionId) {
      this.userInfo.delete(sessionId);
    } else {
      this.userInfo.clear();
    }
  }
}

module.exports = MemoryExtractor;