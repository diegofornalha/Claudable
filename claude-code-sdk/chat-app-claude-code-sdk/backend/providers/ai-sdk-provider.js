/**
 * AI SDK Provider Wrapper
 * Fornece um fallback seguro para quando o Claude Code SDK não está disponível
 */

let claudeCodeProvider = null;

// Tentar carregar o provider real
try {
  // Primeiro tentar o pacote npm oficial
  const aiSdk = require('ai');
  if (aiSdk && aiSdk.claudeCode) {
    claudeCodeProvider = aiSdk.claudeCode;
    console.log('✅ [AI SDK] Provider oficial carregado');
  }
} catch (error) {
  console.log('⚠️ [AI SDK] Provider oficial não disponível, usando fallback');
}

// Se não conseguiu carregar, tentar alternativas
if (!claudeCodeProvider) {
  try {
    // Tentar carregar de @anthropic-ai/claude-code
    const { query } = require('@anthropic-ai/claude-code');
    
    // Criar um wrapper compatível com AI SDK
    claudeCodeProvider = {
      chat: async function(options) {
        const { messages, model, temperature, maxTokens } = options;
        
        // Converter mensagens para o formato do Claude Code
        const prompt = messages
          .map(m => `${m.role}: ${m.content}`)
          .join('\n');
        
        const result = [];
        try {
          for await (const message of query({ 
            prompt, 
            options: { 
              maxTurns: 1,
              temperature,
              maxTokens 
            } 
          })) {
            result.push(message);
          }
          
          const lastMessage = result[result.length - 1];
          return {
            text: lastMessage?.content || '',
            usage: {
              promptTokens: 0,
              completionTokens: 0,
              totalTokens: 0
            }
          };
        } catch (error) {
          throw new Error(`Claude Code SDK error: ${error.message}`);
        }
      },
      
      // Método de streaming
      streamChat: async function*(options) {
        const { messages } = options;
        const prompt = messages
          .map(m => `${m.role}: ${m.content}`)
          .join('\n');
        
        try {
          for await (const message of query({ 
            prompt, 
            options: { maxTurns: 1 } 
          })) {
            yield {
              type: 'text',
              text: message.content || ''
            };
          }
        } catch (error) {
          yield {
            type: 'error',
            error: error.message
          };
        }
      }
    };
    
    console.log('✅ [AI SDK] Fallback provider criado com Claude Code SDK');
  } catch (fallbackError) {
    console.error('❌ [AI SDK] Nenhum provider disponível:', fallbackError.message);
    
    // Provider mock para não quebrar a aplicação
    claudeCodeProvider = {
      chat: async function(options) {
        console.warn('⚠️ [AI SDK] Usando mock provider - sem funcionalidade real');
        return {
          text: 'Mock response: AI SDK provider not available',
          usage: {
            promptTokens: 0,
            completionTokens: 0,
            totalTokens: 0
          }
        };
      },
      
      streamChat: async function*(options) {
        yield {
          type: 'text',
          text: 'Mock stream response: AI SDK provider not available'
        };
      }
    };
  }
}

// Criar função wrapper que retorna o provider
const claudeCodeFunction = (model) => {
  // O modelo é ignorado no fallback, mas mantemos a interface
  return claudeCodeProvider;
};

// Exportar o provider (real ou fallback)
module.exports = {
  claudeCode: claudeCodeFunction,
  
  // Helper para verificar se o provider está funcional
  isAvailable: () => {
    return claudeCodeProvider !== null;
  },
  
  // Helper para obter status do provider
  getStatus: () => {
    if (!claudeCodeProvider) {
      return { available: false, type: 'none' };
    }
    
    if (claudeCodeProvider.chat.toString().includes('Mock')) {
      return { available: false, type: 'mock' };
    }
    
    if (claudeCodeProvider.chat.toString().includes('Claude Code SDK')) {
      return { available: true, type: 'fallback' };
    }
    
    return { available: true, type: 'official' };
  }
};