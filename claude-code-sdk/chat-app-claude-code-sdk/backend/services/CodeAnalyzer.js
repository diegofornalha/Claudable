const fs = require('fs').promises;
const path = require('path');

class CodeAnalyzer {
  constructor() {
    this.projectRoot = path.resolve(__dirname, '../..');
    this.allowedExtensions = [
      '.js', '.jsx', '.ts', '.tsx', 
      '.json', '.md', '.css', '.html',
      '.env.example', '.gitignore'
    ];
    this.ignorePaths = [
      'node_modules',
      '.git',
      'dist',
      'build',
      '.env',
      'coverage',
      '.cache',
      'server.log'
    ];
  }

  /**
   * Lista todos os arquivos do projeto
   */
  async listProjectFiles() {
    const files = [];
    
    const walk = async (dir, prefix = '') => {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const relativePath = path.join(prefix, entry.name);
        
        // Ignorar caminhos específicos
        if (this.ignorePaths.some(ignore => relativePath.includes(ignore))) {
          continue;
        }
        
        if (entry.isDirectory()) {
          await walk(fullPath, relativePath);
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name);
          if (this.allowedExtensions.includes(ext)) {
            files.push({
              path: relativePath,
              name: entry.name,
              extension: ext,
              size: (await fs.stat(fullPath)).size
            });
          }
        }
      }
    };
    
    await walk(this.projectRoot);
    return files;
  }

  /**
   * Lê o conteúdo de um arquivo específico
   */
  async readFile(filePath) {
    // Validar caminho para evitar acesso não autorizado
    const normalizedPath = path.normalize(filePath);
    const fullPath = path.join(this.projectRoot, normalizedPath);
    
    // Verificar se o caminho está dentro do projeto
    if (!fullPath.startsWith(this.projectRoot)) {
      throw new Error('Acesso negado: caminho fora do projeto');
    }
    
    // Verificar se o arquivo não está em pastas ignoradas
    if (this.ignorePaths.some(ignore => normalizedPath.includes(ignore))) {
      throw new Error('Acesso negado: arquivo em pasta ignorada');
    }
    
    // Verificar extensão
    const ext = path.extname(normalizedPath);
    if (!this.allowedExtensions.includes(ext)) {
      throw new Error('Acesso negado: tipo de arquivo não permitido');
    }
    
    try {
      const content = await fs.readFile(fullPath, 'utf8');
      return {
        path: normalizedPath,
        content: content,
        lines: content.split('\n').length,
        size: Buffer.byteLength(content, 'utf8')
      };
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new Error('Arquivo não encontrado');
      }
      throw error;
    }
  }

  /**
   * Analisa a estrutura do projeto
   */
  async analyzeProjectStructure() {
    const structure = {
      frontend: {
        framework: null,
        components: [],
        dependencies: {}
      },
      backend: {
        framework: null,
        services: [],
        dependencies: {}
      },
      total: {
        files: 0,
        lines: 0,
        size: 0
      }
    };
    
    try {
      // Analisar frontend
      const frontendPackage = await this.readFile('frontend/package.json');
      const frontendDeps = JSON.parse(frontendPackage.content);
      structure.frontend.dependencies = frontendDeps.dependencies || {};
      
      // Detectar framework
      if (frontendDeps.dependencies?.react) {
        structure.frontend.framework = 'React';
      } else if (frontendDeps.dependencies?.vue) {
        structure.frontend.framework = 'Vue';
      } else if (frontendDeps.dependencies?.angular) {
        structure.frontend.framework = 'Angular';
      }
      
      // Analisar backend
      const backendPackage = await this.readFile('backend/package.json');
      const backendDeps = JSON.parse(backendPackage.content);
      structure.backend.dependencies = backendDeps.dependencies || {};
      
      // Detectar framework backend
      if (backendDeps.dependencies?.express) {
        structure.backend.framework = 'Express';
      } else if (backendDeps.dependencies?.fastify) {
        structure.backend.framework = 'Fastify';
      } else if (backendDeps.dependencies?.koa) {
        structure.backend.framework = 'Koa';
      }
      
      // Contar arquivos
      const files = await this.listProjectFiles();
      structure.total.files = files.length;
      structure.total.size = files.reduce((acc, f) => acc + f.size, 0);
      
    } catch (error) {
      console.error('Erro analisando estrutura:', error);
    }
    
    return structure;
  }

  /**
   * Busca por padrões no código
   */
  async searchInCode(pattern, options = {}) {
    const results = [];
    const files = await this.listProjectFiles();
    const regex = new RegExp(pattern, options.flags || 'gi');
    
    for (const file of files) {
      try {
        const content = await this.readFile(file.path);
        const lines = content.content.split('\n');
        
        lines.forEach((line, index) => {
          if (regex.test(line)) {
            results.push({
              file: file.path,
              line: index + 1,
              content: line.trim(),
              match: line.match(regex)[0]
            });
          }
        });
      } catch (error) {
        // Ignorar erros de leitura
      }
    }
    
    return results;
  }

  /**
   * Gera contexto sobre o projeto para o Claude
   */
  async generateProjectContext() {
    const structure = await this.analyzeProjectStructure();
    const files = await this.listProjectFiles();
    
    // Organizar arquivos por tipo
    const filesByType = {
      components: files.filter(f => f.path.includes('/components/')),
      services: files.filter(f => f.path.includes('/services/')),
      configs: files.filter(f => f.name.includes('config') || f.name.includes('.env')),
      tests: files.filter(f => f.name.includes('.test.') || f.name.includes('.spec.')),
      docs: files.filter(f => f.extension === '.md')
    };
    
    const context = `
# Contexto do Projeto

## Estrutura Geral
- Frontend: ${structure.frontend.framework || 'Desconhecido'} com ${Object.keys(structure.frontend.dependencies).length} dependências
- Backend: ${structure.backend.framework || 'Node.js'} com ${Object.keys(structure.backend.dependencies).length} dependências
- Total de arquivos: ${structure.total.files}
- Tamanho total: ${(structure.total.size / 1024 / 1024).toFixed(2)} MB

## Organização de Arquivos
- Componentes: ${filesByType.components.length} arquivos
- Serviços: ${filesByType.services.length} arquivos
- Configurações: ${filesByType.configs.length} arquivos
- Testes: ${filesByType.tests.length} arquivos
- Documentação: ${filesByType.docs.length} arquivos

## Principais Tecnologias
### Frontend
${Object.entries(structure.frontend.dependencies)
  .filter(([key]) => ['react', 'typescript', 'axios', 'socket.io-client'].includes(key))
  .map(([key, value]) => `- ${key}: ${value}`)
  .join('\n')}

### Backend
${Object.entries(structure.backend.dependencies)
  .filter(([key]) => ['express', 'socket.io', '@anthropic-ai/sdk', 'neo4j-driver'].includes(key))
  .map(([key, value]) => `- ${key}: ${value}`)
  .join('\n')}

## Funcionalidades Principais
- Chat em tempo real com WebSocket
- Integração com Claude AI SDK
- Sistema multi-agente
- Memória persistente com Neo4j
- Interface configurável
- Processamento em streaming

Este é um projeto completo de chat que integra Claude AI com múltiplos agentes e capacidades avançadas.
`;
    
    return context;
  }
}

module.exports = new CodeAnalyzer();