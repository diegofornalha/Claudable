# Claude Code Chat - Aplicação Multi-Agente com AI SDK

## 📋 Sobre o Projeto

Este é um sistema avançado de chat que integra o Claude AI SDK com múltiplos agentes inteligentes, permitindo processamento contextual, memória persistente e interface configurável. O projeto foi desenvolvido para demonstrar a integração entre Claude AI e outras ferramentas de IA.

## 🌟 Principais Funcionalidades

### Interface de Chat Avançada
- **Chat em tempo real** com Claude AI
- **Processamento configurável** - logs técnicos opcionais
- **Interface responsiva** com suporte a dark mode
- **Indicadores visuais** de processamento elegantes
- **Histórico de conversas** com sessões persistentes

### Sistema Multi-Agente
- **Claude AI** - Assistente principal com capacidades avançadas
- **Crew AI** - Orquestração de múltiplos agentes especializados
- **A2A (Agent-to-Agent)** - Comunicação entre agentes
- **Context Engine** - Processamento contextual avançado
- **Memory System** - Memória persistente com Neo4j

### Integrações
- **AI SDK Provider v5** - Última versão do SDK da Anthropic
- **MCP (Model Context Protocol)** - Protocolo para contexto de modelos
- **Neo4j** - Banco de dados de grafos para memória
- **Socket.io** - Comunicação em tempo real
- **React + TypeScript** - Frontend moderno e tipado

## 🚀 Como Executar

### Pré-requisitos
- Node.js 18+
- npm ou yarn
- Neo4j (opcional, para memória persistente)
- API Key do Claude (configurar em `.env`)

### Instalação

1. Clone o repositório:
```bash
git clone [url-do-repositorio]
cd chat-app-claude-code-sdk
```

2. Instale as dependências:
```bash
# Backend
cd backend
npm install

# Frontend
cd ../frontend
npm install
```

3. Configure as variáveis de ambiente:
```bash
# backend/.env
PORT=8080
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=password
```

4. Execute o projeto:
```bash
# Terminal 1 - Backend
cd backend
npm start

# Terminal 2 - Frontend
cd frontend
npm start
```

A aplicação estará disponível em `http://localhost:3000`

## 🛠️ Configurações Disponíveis

### Configurações de UI (UI Config)
- **Mostrar Logs de Processamento** - Exibe detalhes técnicos durante o processamento
- **Métricas Detalhadas** - Mostra estatísticas avançadas de performance
- **Auto-expandir Logs** - Expande automaticamente os detalhes dos logs
- **Animações** - Habilita/desabilita animações na interface
- **Modo Compacto** - Reduz espaçamento para mostrar mais conteúdo

### Configurações do Sistema (Settings)
- **System Prompt** - Personaliza o comportamento do Claude
- **Max Turns** - Limite de turnos na conversa
- **Streaming** - Habilita resposta em tempo real

## 🏗️ Arquitetura

```
chat-app-claude-code-sdk/
├── frontend/               # Aplicação React
│   ├── src/
│   │   ├── components/    # Componentes React
│   │   ├── context/       # Context API para estado global
│   │   └── App.tsx        # Componente principal
│   └── public/
├── backend/               # Servidor Node.js
│   ├── server.js         # Servidor principal
│   ├── services/         # Serviços de agentes
│   ├── mcp/             # Integração MCP
│   └── agents/          # Definições de agentes
└── providers/           # Provedores AI SDK
    └── ai-sdk-provider/ # Provider customizado
```

## 📡 Endpoints Principais

### WebSocket Events
- `send_message` - Enviar mensagem para processamento
- `message` - Receber mensagem do usuário
- `message_stream` - Streaming de resposta
- `message_complete` - Resposta completa
- `processing_step` - Etapas de processamento
- `error` - Mensagens de erro

### REST API
- `GET /health` - Status do servidor
- `GET /agents` - Lista de agentes disponíveis
- `GET /sessions` - Histórico de sessões
- `POST /upload` - Upload de arquivos

## 🤖 Agentes Disponíveis

1. **Claude** - Assistente principal com capacidades de código e análise
2. **Crew-AI** - Orquestração de tarefas complexas
3. **Context Engine** - Processamento com memória e contexto
4. **A2A Router** - Roteamento inteligente entre agentes

## 🔧 Desenvolvimento

### Estrutura de Componentes
- `ProcessingIndicator` - Indicador de processamento configurável
- `UISettings` - Painel de configurações de interface
- `AgentSelector` - Seleção de agentes
- `ChatInterface` - Interface principal do chat

### Context API
- `AppContext` - Estado global da aplicação
- Gerenciamento de sessões, mensagens e configurações

## 🐛 Solução de Problemas

### Erro "[object Object]" na interface
- Corrigido no commit mais recente
- O servidor agora sempre envia mensagens no formato correto

### "Claude is thinking..." após limpar chat
- Corrigido - estados são limpos corretamente

### Conexão com Neo4j
- Verifique se o Neo4j está rodando
- Configure as credenciais no `.env`

## 📄 Licença

Este projeto é proprietário e confidencial.

## 🤝 Contribuindo

Para contribuir com o projeto:
1. Faça um fork
2. Crie uma branch para sua feature
3. Commit suas mudanças
4. Push para a branch
5. Abra um Pull Request

## 📞 Suporte

Para dúvidas ou problemas, abra uma issue no repositório.

---

Desenvolvido com ❤️ usando Claude AI SDK