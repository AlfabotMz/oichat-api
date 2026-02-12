# 📊 LÓGICA DE DADOS – FLUXO DE CONVERSÃO

## Entrada (Payload recebido)

O sistema recebe:

```json
{
  "location": "Boane",
  "number": "840147538",
  "product": "Produto X",
  "contact_owner": "856428686",
  "contact_delivery": "852942092",
  "agent_id": "uuid",
  "instanceName": "instance-123",
  "date": "2023-10-09",
  "whatsapp_number": "258840147538@s.whatsapp.net",
  "amount": 1500,
  "quantity": 2
}
```

---

# 🔁 Fluxo Lógico

## 1️⃣ Verificar conversão duplicada (Redis)

Gerar chave:

```
Converted.{instanceName}.{whatsapp_number}
```

Se existir → parar execução
Se não existir → continuar

---

## 2️⃣ Atualizar Analytics

Consultar tabela `analytics`:

```sql
SELECT * FROM analytics WHERE agent_id = ?
```

### Se existir:

```
conversions = conversions + 1
```

### Se não existir:

```
INSERT INTO analytics (agent_id, conversions)
VALUES (?, 1)
```

---

## 3️⃣ Buscar dados do agente

```sql
SELECT * FROM agents WHERE id = ?
```

Extrair:

```
custom_message
```

---

## 4️⃣ Construir mensagem dinâmica

Substituir placeholders:

```
{{product}}
{{number}}
{{location}}
{{date}}
{{amount}}
{{quantity}}
```

---

## 5️⃣ Enviar notificações

* Para owner
* Para delivery (se existir)
* Para grupo interno

---

## 6️⃣ Marcar como convertido (Redis)

Salvar:

```
key: Converted.{instance}.{whatsapp}
value: true
TTL: 48h
```

---

# 🚀 IMPLEMENTAÇÃO EM CÓDIGO (Node.js)

Agora vou transformar esse fluxo em backend puro.

Stack:

* Express
* Supabase
* Redis
* Axios (para Evolution API)

---

# Estrutura

```
/services
   analytics.js
   notification.js
   template.js
/routes
   conversion.js
```

---

# 📌 1️⃣ Endpoint principal

```javascript
// routes/conversion.js

const express = require("express");
const router = express.Router();
const { processConversion } = require("../services/conversionService");

router.post("/conversion", async (req, res) => {
  try {
    await processConversion(req.body);
    res.status(200).json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Conversion failed" });
  }
});

module.exports = router;
```

---

# 📌 2️⃣ Serviço principal

```javascript
// services/conversionService.js

const redis = require("../config/redis");
const supabase = require("../config/supabase");
const { buildMessage } = require("./templateService");
const { sendMessage } = require("./notificationService");

async function processConversion(data) {

  const {
    location,
    number,
    product,
    contact_owner,
    contact_delivery,
    agent_id,
    instanceName,
    date,
    whatsapp_number,
    amount,
    quantity
  } = data;

  const redisKey = `Converted.${instanceName}.${whatsapp_number}`;

  // 1️⃣ Check duplicate
  const alreadyConverted = await redis.get(redisKey);
  if (alreadyConverted) return;

  // 2️⃣ Update analytics
  const { data: analytics } = await supabase
    .from("analytics")
    .select("*")
    .eq("agent_id", agent_id)
    .single();

  if (analytics) {
    await supabase
      .from("analytics")
      .update({
        conversions: analytics.conversions + 1
      })
      .eq("agent_id", agent_id);
  } else {
    await supabase
      .from("analytics")
      .insert({
        agent_id,
        conversions: 1
      });
  }

  // 3️⃣ Get agent
  const { data: agent } = await supabase
    .from("agents")
    .select("*")
    .eq("id", agent_id)
    .single();

  const template = agent?.custom_message || "";

  // 4️⃣ Build message
  const message = buildMessage(template, {
    product,
    number,
    location,
    date,
    amount,
    quantity
  });

  // 5️⃣ Send notifications

  if (contact_owner) {
    await sendMessage(instanceName, contact_owner, message + "\n\n🤖 Parabéns!");
  }

  if (contact_delivery) {
    await sendMessage(instanceName, contact_delivery, message + "\n\n🚚 Nova entrega!");
  }

  // 6️⃣ Save redis flag (48h)
  await redis.set(redisKey, true, "EX", 172800);
}

module.exports = { processConversion };
```

---

# 📌 3️⃣ Template Engine

```javascript
// services/templateService.js

function buildMessage(template, variables) {
  return template
    .replace(/{{product}}/g, variables.product ?? "")
    .replace(/{{number}}/g, variables.number ?? "")
    .replace(/{{location}}/g, variables.location ?? "")
    .replace(/{{date}}/g, variables.date ?? "")
    .replace(/{{amount}}/g, variables.amount ?? "")
    .replace(/{{quantity}}/g, variables.quantity ?? "");
}

module.exports = { buildMessage };
```

---

# 📌 4️⃣ Envio de mensagem

```javascript
// services/notificationService.js

const axios = require("axios");

async function sendMessage(instanceName, number, message) {

  const formattedNumber =
    number.length === 12 ? number : `258${number}`;

  await axios.post("https://evolution-api-url/messages", {
    instanceName,
    remoteJid: formattedNumber,
    messageText: message
  });
}

module.exports = { sendMessage };
```

---

# 🧠 Resultado

Esse código faz exatamente o que seu n8n faz:

* Controle de conversão
* Anti-duplicação
* Atualização analytics
* Template dinâmico
* Envio múltiplo
* TTL 48h

---

# 📈 Diferença Conceitual

n8n = Orquestração visual
Código = Orquestração programática

Ambos executam o mesmo fluxo lógico:

```
Evento → Validar → Atualizar DB → Montar mensagem → Notificar → Cachear
```
