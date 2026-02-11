# OiChat API MVP

Este é o backend do MVP do OiChat, uma plataforma para gerenciamento de agentes de IA e conversas inteligentes. O projeto é construído com **Deno**, **Fastify**, **Supabase**, **Redis** e **LangChain**.

## 🚀 Tecnologias

-   **Runtime:** [Deno](https://deno.land/) (v2.x)
-   **Framework Web:** [Fastify](https://www.fastify.io/) (via compatibilidade npm)
-   **Banco de Dados:** [Supabase](https://supabase.com/) (PostgreSQL)
-   **Cache & Memória:** [Redis](https://redis.io/)
-   **IA & LLM:** [LangChain](https://js.langchain.com/)
-   **Validação:** [Zod](https://zod.dev/)
-   **Documentação API:** Swagger / OpenAPI

## 📋 Pré-requisitos

-   [Deno](https://deno.land/manual/getting_started/installation) instalado.
-   [Docker](https://www.docker.com/) e Docker Compose (opcional, para rodar com Redis local).
-   Conta no Supabase e OpenRouter (ou outra API compatível com OpenAI).

## ⚙️ Configuração

1.  **Clone o repositório:**
    ```bash
    git clone <seu-repo>
    cd oichat-api
    ```

2.  **Variáveis de Ambiente:**
    Copie o arquivo de exemplo e preencha com suas credenciais:
    ```bash
    cp .env.example .env
    ```

    **Variáveis Necessárias:**
    -   `SUPABASE_URL`, `SUPABASE_ANON_KEY`: Credenciais do Supabase.
    -   `REDIS_HOST`, `REDIS_PORT`: Configuração do Redis (padrão: localhost:6379).
    -   `EVOLUTION_API_URL`, `EVOLUTION_API_KEY`: Integração com WhatsApp (Evolution API).
    -   `OPENROUTER_API_KEY`: Chave da API de LLM (OpenRouter).

## 🏃‍♂️ Como Rodar

### Desenvolvimento Local

1.  Inicie o Redis (se não tiver um rodando):
    ```bash
    docker-compose up -d redis
    ```

2.  Execute o projeto com Deno:
    ```bash
    deno task dev
    ```
    O servidor iniciará em `http://localhost:3000`.

### Com Docker

Para rodar a aplicação completa (API + Redis) via Docker:

```bash
docker-compose up --build
```

## 📚 Documentação da API

A documentação interativa (Swagger UI) está disponível em:

```
http://localhost:3000/docs
```

Lá você pode testar todos os endpoints de Agentes, Conversas e Webhooks.

## 📂 Estrutura do Projeto

-   `src/controllers`: Lógica de controle das rotas.
-   `src/services`: Regras de negócio (IA, Memória, Integrações).
-   `src/repository`: Acesso a dados (Supabase).
-   `src/models`: Definições de tipos e esquemas Zod.
-   `src/http`: Configuração de rotas e servidor.
