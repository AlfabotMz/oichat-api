# PROMPT TÉCNICO — Fluxo de Atendimento Automático WhatsApp (OiChat / n8n)

Implemente um sistema de atendimento automático para WhatsApp com arquitetura orientada a eventos, controle de estado via Redis, IA com memória contextual e integração com API de envio de mensagens.

O fluxo deve seguir rigorosamente as etapas abaixo.

---

# 1. TRIGGER DE ENTRADA

### Origem:

Webhook Evolution API

### Payload recebido:

JSON contendo:

* instance
* server_url
* sender
* messageType
* message
* base64 (se mídia)
* fromMe (boolean)
* remoteJid
* id da mensagem
* quotedMessage (se reply)
* editedMessage (se editada)

### Etapa 1 — Normalização

Parseie o JSON bruto e normalize para esta estrutura:

```json
{
  "whatsapp": {
    "instance": "",
    "server_url": "",
    "sender": "",
    "remoteJid": "",
    "fromMe": false,
    "messageType": "",
    "message": {
      "conversation": "",
      "extendedTextMessage": "",
      "editedMessage": ""
    },
    "quotedMessage": {
      "conversation": ""
    },
    "base64": ""
  }
}
```

---

# 2. FILTROS INICIAIS

## 2.1 Ignorar grupos

Se:

```
remoteJid termina com "@g.us"
```

→ Encerrar fluxo.

---

## 2.2 Controle de janela pós-envio (FROM-ME-WINDOW)

Se `fromMe == true`:

* Criar chave Redis:

```
Timeout-IUser.{remoteJid}.{sender}
```

* TTL = FROM-ME-WINDOW * 60 segundos
* Valor = FROM-ME-WINDOW

Encerrar fluxo.

---

Se `fromMe == false`:

Verificar se existe a chave:

```
Timeout-IUser.{remoteJid}.{sender}
```

Se existir → encerrar fluxo
Se não existir → continuar

---

# 3. CONFIGURAÇÕES GLOBAIS

Definir variáveis fixas:

```
TIMEOUT = 12 segundos
FROM-ME-WINDOW = 120 minutos
TIME-PER-CHAR = 15 ms
EVOLUTION-API-KEY = chave da API
```

---

# 4. IDENTIFICAÇÃO DO TIPO DE MENSAGEM

Switch por `messageType`:

| Tipo                | Ação                      |
| ------------------- | ------------------------- |
| conversation        | texto simples             |
| extendedTextMessage | resposta citando mensagem |
| editedMessage       | mensagem editada          |
| audioMessage        | áudio                     |
| imageMessage        | imagem                    |

---

# 5. PROCESSAMENTO POR TIPO

## 5.1 Texto simples

```
MESSAGE = conversation
```

---

## 5.2 Resposta (reply)

```
MESSAGE = 
"Menção: {quotedMessage}
Resposta: {extendedTextMessage}"
```

---

## 5.3 Editada

```
MESSAGE = editedMessage
```

---

## 5.4 Áudio

Se houver base64:

1. Converter base64 para binário (mp3)
2. Enviar para modelo Gemini (transcription)
3. Receber texto transcrito
4. MESSAGE = "Transcrição do Áudio enviado pelo usuário: {conteúdo}"

---

## 5.5 Imagem

Se houver base64:

1. Converter base64 para binário (webp/jpg)
2. Enviar para Gemini (analyze image)
3. Receber descrição
4. MESSAGE = descrição retornada

---

# 6. ARMAZENAMENTO DE MENSAGENS

Salvar no Redis:

```
Lista: Messages.{remoteJid}
Operação: push (append)
Valor: MESSAGE
```

---

# 7. MECANISMO DE TIMEOUT (AGRUPADOR DE MENSAGENS)

Objetivo: esperar o usuário terminar de digitar antes de responder.

### 7.1 Criar chave:

```
Timeout.{remoteJid}
```

Valor:

```
now + TIMEOUT segundos
```

---

### 7.2 Esperar TIMEOUT segundos

---

### 7.3 Verificar Timeout

Recuperar chave `Timeout.{remoteJid}`

Se:

```
agora > timestamp salvo
```

→ continuar
Senão → encerrar (há mensagem nova chegando)

---

# 8. RECUPERAÇÃO DO HISTÓRICO

Buscar no Redis:

```
Messages.{remoteJid}
```

Concatenar todas as mensagens com quebra de linha.

---

# 9. CARREGAMENTO DO AGENTE

## 9.1 Verificar cache

Redis:

```
{instance}.{sender}
```

Se existir → usar
Se não existir:

Consultar Supabase:

Tabela: agents
Filtro:

```
phone_number = sender
status = active
```

Salvar no Redis com TTL de 1 hora.

---

# 10. PREPARAÇÃO DO PROMPT

Montar:

* Prompt principal do agente
* Anexos formatados
* Histórico das mensagens
* System message fixa do OiChatAgent

Incluindo:

* Diretrizes
* Tom
* Objetivo
* Função obrigatória: send_conversetion

---

# 11. MEMÓRIA CONTEXTUAL

Criar sessão Redis Chat Memory:

```
SessionKey:
Messages.{instanceName}.{remoteJid}
```

TTL: 24 horas
Janela de contexto: 25 mensagens

---

# 12. EXECUÇÃO DO AGENTE IA

Entrada:

```
histórico completo do usuário
```

Saída esperada:

```
Texto estruturado
```

Separar respostas por:

```
\n\n
```

Converter para array `messages[]`

---

# 13. ENVIO DE RESPOSTA

Loop em `messages[]`

Para cada item:

---

## 13.1 Detectar tipo

Switch:

### Se contiver URL imagem (.jpg .png .webp)

→ enviar via:

```
POST /message/sendMedia
mediatype: image
```

---

### Se contiver URL vídeo (.mp4 .mov .mkv)

→ enviar via:

```
POST /message/sendMedia
mediatype: video
```

---

### Se texto puro

Enviar via:

```
POST /message/sendText
```

Parâmetros:

```
number = remoteJid
delay = tamanho_mensagem * TIME-PER-CHAR
presence = "composing"
text = mensagem
```

Timeout da request:

```
1000 * message_delay
```

---

# 14. APÓS ENVIO

Apagar:

```
Messages.{remoteJid}
```

Limpar histórico temporário.

---

# 15. FUNÇÃO DE CONVERSÃO (OBRIGATÓRIA)

Se a IA identificar conversão (ex: cliente confirmou compra):

Executar:

```
send_conversetion
```

Com:

* location
* number
* date
* product
* contact_owner
* contact_delivery
* agent_id
* instanceName
* whatsapp_number
* quantity
* amount

⚠️ Não informar o usuário que a função foi chamada.

---

# 16. TRATAMENTO DE ERROS

* Falha de tool → não informar usuário
* Retry HTTP: até 5 tentativas
* Continuar fluxo mesmo com erro leve

---

# 17. ARQUITETURA RESUMIDA

RabbitMQ
→ Normalização
→ Filtros (grupo / fromMe)
→ Timeout anti-spam
→ Processamento por tipo
→ Redis (mensagens)
→ Delay agregador
→ Recupera histórico
→ Carrega agente
→ IA com memória
→ Split respostas
→ Switch tipo envio
→ HTTP Evolution API
→ Delete histórico