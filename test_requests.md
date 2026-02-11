# Test Agent Endpoints

The most reliable way to test on Windows is to use a JSON file to avoid quoting issues in the terminal.

## 1. Create Agent
First, ensure you have the [create_agent_body.json](file:///c:/Users/Rapeizee/Documents/proects/oichat/oichat-api/create_agent_body.json) file in the directory.

```bash
curl -X POST http://localhost:3000/api/agents/create-agent \
-H "Content-Type: application/json" \
--data-binary "@create_agent_body.json"
```

## 2. Delete Agent
Create a file named `delete_agent_body.json`:
```json
{
  "agent_id": "YOUR_AGENT_ID"
}
```

Then run:
```bash
curl -X POST http://localhost:3000/api/agents/delete-agent \
-H "Content-Type: application/json" \
--data-binary "@delete_agent_body.json"
```
## 3. Connect WhatsApp
Create a file named `connect_whatsapp_body.json`:
```json
{
  "agent_id": "YOUR_AGENT_ID"
}
```

Then run:
```bash
curl -X POST http://localhost:3000/api/agents/connect-whatsapp \
-H "Content-Type: application/json" \
--data-binary "@connect_whatsapp_body.json"
```

## 4. Check Status
Create a file named `check_status_body.json`:
```json
{
  "agent_id": "YOUR_AGENT_ID"
}
```

Then run:
```bash
curl -X POST http://localhost:3000/api/agents/check-status \
-H "Content-Type: application/json" \
--data-binary "@check_status_body.json"
```
