# Test /create-agent Endpoint

Use the following `curl` command to test the newly created endpoint. This request will:
1. Create an agent in Supabase.
2. Initialize an analytics row.
3. Create a WhatsApp instance in Evolution API.

```bash
curl -X POST http://localhost:3000/create-agent \
-H "Content-Type: application/json" \
-d '{
  "user_id": "7dc8a5e4-ef53-42da-b97b-460731198558",
  "nome": "Cleer Commercial ",
  "prompt": "Olá.👋\nTUDO BOM, Sou INÁCIO  _GRAVE MEU CONTACTO PARA MELHOR INTERAÇÃO!_\n\nVeja, Muitas pessoas tem dificuldade em ter um corpo melhor \n\nCom o Tummy Trimmer você consegue👇:\n\n✔️ Queimar gordura abdominal\n✔️ Fortalecer abdômen, pernas, braços e glúteos\n✔️ Treinar em casa, em qualquer lugar e a qualquer hora\n\nPreço normal: ~1.150MT~ \nHOJE por apenas 880MT\n\n🎁 Entrega GRÁTIS em Maputo e Matola\n💵 Pagamento somente após receber o produto\n\n*Gostarias de adquirir o seu tummy trimmer?*",
  "phone_number": "877596000",
  "action": "create_agent"
}'
```

The response should look like this:

```json
[
  {
    "success": true,
    "message": "Agente criado com sucesso!",
    "agent": {
      "agent_id": "d4077031-d007-4c9e-acac-3d21104aed0e"
    },
    "nome": "Cleer Commercial ",
    "prompt": "Olá.👋\nTUDO BOM, Sou INÁCIO...",
    "status": "inactive"
  }
]
```
