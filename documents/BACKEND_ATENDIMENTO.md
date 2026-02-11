# Documentação Backend - Sistema de Atendimento IA

Este documento oferece uma visão geral da arquitetura do backend, as integrações principais e os processos de resolução de problemas enfrentados durante o desenvolvimento.

---

## 🚀 Visão Geral do Sistema

O sistema é uma automação de atendimento via WhatsApp que utiliza Inteligência Artificial avançada para processar mensagens, manter contexto (através de Redis) e registrar conversões (no Supabase). A interface de comunicação é feita via **Evolution API**.

### 1. Agente de Atendimento (O "Cérebro")
Localizado em `lib/agent.js`, o agente não é apenas uma chamada simples à API da OpenAI.
- **Tecnologia**: LangChain + LangGraph.
- **Funcionamento**: O agente recebe o histórico e a mensagem atual, processa as instruções do sistema (prompt) e pode decidir usar ferramentas.
- **Ferramentas (Tools)**: A ferramenta `send_conversetion` é injetada no agente, permitindo que ele reconheça quando uma venda foi feita e a registre automaticamente no banco de dados.
- **IA Generativa**: Conectado ao **OpenRouter**, permitindo trocar de modelo (Gemini, GPT-4, Claude) apenas alterando uma variável de ambiente.

### 2. Webhook (A Porta de Entrada)
Implementado em `app/api/webhook/route.js`, ele é o receptor de todos os eventos do WhatsApp.
- **Tratamento de Dados**: Normaliza o JSON complexo da Evolution API para um formato amigável.
- **Filtros**: Bloqueia grupos e evita que o robô responda a si mesmo (loop infinito).
- **Deduplicação**: Usa um cache de memória global para garantir que mensagens repetidas pelo servidor webhook não gerem várias respostas da IA.

### 3. Integrações de Infraestrutura

- **Evolution API**: Gerencia a conexão com o WhatsApp, simulando digitação e enviando mídias.
- **Redis (Buffer)**: Atua como uma sala de espera. Se o usuário envia 5 mensagens seguidas, o Redis as agrupa e entrega para a IA como um único parágrafo, economizando tokens e parecendo mais humano.
- **Supabase**: Armazena o conhecimento do agente (prompts personalizados) e o log final de conversões para análises de vendas.
- **Local Logs**: Sistema de monitoramento em tempo real que exibe as interações no Dashboard sem precisar consultar o banco de dados a cada segundo.

---

## 🛠️ Guia de Sobrevivência (Bugs e Soluções)

Para quem for replicar este projeto, estes são os pontos críticos onde bugs comuns ocorrem e como eles foram resolvidos:

### ⚠️ Erros de Resposta (400/404)
Muitas vezes a API retorna erro ao tentar enviar uma mensagem.
- **Causa**: O nome da instância (`instance`) no webhook pode mudar de lugar no JSON dependendo da versão da Evolution API.
- **Prevenção**: No `lib/evolution.js`, criamos uma busca flexível que tenta encontrar o nome da instância em múltiplos campos (`instance`, `instanceName`, etc).

### ⚠️ Mensagens Duplicadas
O maior desafio em webhooks de chat.
- **Causa**: O webhook envia o evento de "mensagem enviada pela IA" de volta para o próprio sistema.
- **Prevenção**: Verificamos rigorosamente o campo `fromMe`. Se for verdadeiro, interrompemos o processamento imediatamente. Além disso, filtramos apenas eventos do tipo `messages.upsert`.

### ⚠️ Erro de Hydration (Próximo ao Frontend)
O Next.js pode reclamar que o HTML do servidor é diferente do navegador.
- **Causa**: Formatação de datas ou geração de IDs aleatórios.
- **Prevenção**: Use o hook `useEffect` para garantir que elementos dinâmicos (como o horário da mensagem) sejam renderizados apenas no cliente.

### ⚠️ Configuração OpenRouter no LangChain
- **Causa**: O LangChain espera especificamente o campo `apiKey` mesmo para o OpenRouter.
- **Prevenção**: Configure o `ChatOpenAI` passando a chave no campo `apiKey` e apontando o `baseURL` para a URL do OpenRouter.

---

## 📌 Requisitos de Configuração

- Configurar `.env` com todas as chaves (Evolution URL, API Key, Supabase Keys, OpenRouter Key).
- Ter o Redis rodando para a lógica de agrupamento.
- Configurar as tabelas `agents`, `conversions` e `messages` (se desejar persistência total) no Supabase.
