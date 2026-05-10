# Integração do Webhook de Notificações Frontend

Este documento descreve como a API do OiChat (Backend) enviará notificações de "Lead Convertido" para o seu sistema Frontend ou serviço PWA de notificações.

## Configuração Obrigatória
Para ativar o disparo destas notificações em tempo real, você deve definir a seguinte variável de ambiente no servidor do Backend (arquivo `.env` do `oichat-api`):

```bash
FRONTEND_NOTIFICATION_WEBHOOK_URL="https://your-frontend.com/api/webhooks/conversion"
```

Quando um `send_conversation` for invocado pela IA (o Lead for fechado/concluído), o Backend fará um `POST` para essa URL.

## Estrutura do Payload (JSON)
O seu sistema de recebimento no Frontend deverá estar programado para receber a seguinte estrutura `POST`:

```json
{
  "date": "2026-05-10",
  "agentId": "uuid-do-agente-que-atendeu",
  "userNumber": "5511999999999",
  "form": "🚀 Nova Encomenda Recebida!\n\n💸 Produto: Camiseta Branca\n💸 Quantidade: 2\n💸 Valor: 100.00\n💸 Número: 5511999999999\n💸 Local: Rua ABC, 123"
}
```

### Detalhes dos Campos:
- **`date`**: A data do registro da reserva/venda (formato `YYYY-MM-DD`).
- **`agentId`**: Útil para o Frontend saber exatamente qual Vendedor/Agente gerou a venda para exibir a notificação no painel correto do sistema.
- **`userNumber`**: Útil para saber qual cliente final (`remoteJid`) gerou o Lead.
- **`form`**: Um texto em markdown ou string padronizado exato contendo a "Custom Message" amigável, pronto para ser exibido diretamente na tela do usuário.

## Como Implementar o Recebimento num Frontend Next.js (Exemplo)
Se o seu PWA/Web for feito em Next.js (App Router), você poderia criar um Route Handler em `app/api/webhooks/conversion/route.ts`:

```typescript
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    
    const { date, agentId, userNumber, form } = payload;

    // 1. Aqui você pode injetar esse aviso via Socket.io ou Pusher para a UI respectiva
    // Você vai escutar/enviar no canal específico desse agente:
    // await pusherServer.trigger(`agent-${agentId}`, 'new-lead-conversion', { form, userNumber });

    // 2. Ou salvar num banco de dados do frontend para exibir num painel
    
    console.log(`New notification received for agent: ${agentId}`);

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to process webhook' }, { status: 400 });
  }
}
```
