import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

export const logController = async (app: FastifyInstance) => {

    // Endpoint to get raw log data (for the UI)
    app.get("/logs/data", async (_request: FastifyRequest, reply: FastifyReply) => {
        try {
            const logPath = "./logs/app.log";
            const file = await Deno.readTextFile(logPath);

            // Parse NDJSON (newline-delimited JSON)
            const logs = file.split("\n")
                .filter(line => line.trim() !== "")
                .map(line => {
                    try {
                        return JSON.parse(line);
                    } catch {
                        return { msg: line, level: 30, time: Date.now() };
                    }
                })
                .reverse() // Newest first
                .slice(0, 500); // Limit to last 500 entries for memory safety

            return reply.status(200).send(logs);
        } catch (err) {
            return reply.status(500).send({ error: "Failed to read logs", details: err });
        }
    });

    // The Visual Dashboard
    app.get("/logs-ui", async (_request: FastifyRequest, reply: FastifyReply) => {
        const html = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>OiChat Logs Dashboard</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600&display=swap" rel="stylesheet">
    <style>
        body { font-family: 'Inter', sans-serif; background: #0f172a; color: #e2e8f0; }
        .glass { background: rgba(30, 41, 59, 0.7); backdrop-filter: blur(12px); border: 1px solid rgba(255, 255, 255, 0.1); }
        .log-error { border-left: 4px solid #ef4444; background: rgba(239, 68, 68, 0.05); }
        .log-warn { border-left: 4px solid #f59e0b; background: rgba(245, 158, 11, 0.05); }
        .log-info { border-left: 4px solid #3b82f6; background: rgba(59, 130, 246, 0.05); }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        .animate-fade { animation: fadeIn 0.3s ease-out forwards; }
    </style>
</head>
<body class="p-4 md:p-8">
    <div class="max-w-6xl mx-auto">
        <!-- Header -->
        <div class="glass rounded-2xl p-6 mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
                <h1 class="text-3xl font-600 bg-gradient-to-r from-blue-400 to-emerald-400 bg-clip-text text-transparent">OiChat Logs</h1>
                <p class="text-slate-400 text-sm mt-1">Monitoramento em tempo real e histórico local</p>
            </div>
            <div class="flex items-center gap-3">
                <input type="text" id="search" placeholder="Pesquisar logs..." class="bg-slate-800 border-none rounded-xl px-4 py-2 focus:ring-2 focus:ring-blue-500 outline-none w-full md:w-64">
                <button onclick="fetchLogs()" class="bg-blue-600 hover:bg-blue-700 transition px-6 py-2 rounded-xl font-semibold">Atualizar</button>
            </div>
        </div>

        <!-- Filters -->
        <div class="flex gap-4 mb-6 overflow-x-auto pb-2">
            <button onclick="filterLogs('all')" class="glass px-4 py-2 rounded-lg hover:bg-slate-700 transition whitespace-nowrap">Todos</button>
            <button onclick="filterLogs('error')" class="glass px-4 py-2 rounded-lg hover:bg-red-900/30 text-red-400 border-red-900/30 transition whitespace-nowrap">Erros</button>
            <button onclick="filterLogs('info')" class="glass px-4 py-2 rounded-lg hover:bg-blue-900/30 text-blue-400 border-blue-900/30 transition whitespace-nowrap">Info</button>
        </div>

        <!-- Logs Container -->
        <div id="logs-container" class="space-y-3">
            <div class="glass p-12 rounded-2xl text-center text-slate-500">
                Carregando logs...
            </div>
        </div>
    </div>

    <script>
        let allLogs = [];

        async function fetchLogs() {
            try {
                const res = await fetch('/api/admin/logs/data');
                allLogs = await res.json();
                renderLogs(allLogs);
            } catch (err) {
                document.getElementById('logs-container').innerHTML = '<div class="glass p-8 text-red-400 rounded-2xl">Falha ao carregar logs. Verifique se a API está online.</div>';
            }
        }

        function renderLogs(logs) {
            const container = document.getElementById('logs-container');
            if (logs.length === 0) {
                container.innerHTML = '<div class="glass p-12 text-center text-slate-500 rounded-2xl">Nenhum log encontrado.</div>';
                return;
            }

            container.innerHTML = logs.map((log, i) => {
                const date = new Date(log.time).toLocaleString('pt-BR');
                const levelClass = log.level >= 50 ? 'log-error' : (log.level >= 40 ? 'log-warn' : 'log-info');
                const levelLabel = log.level >= 50 ? 'ERROR' : (log.level >= 40 ? 'WARN' : 'INFO');
                
                return \`
                    <div class="glass rounded-xl p-4 animate-fade \${levelClass}" style="animation-delay: \${i * 0.02}s">
                        <div class="flex items-center justify-between mb-2">
                            <span class="text-xs font-bold tracking-wider \${log.level >= 50 ? 'text-red-400' : 'text-blue-400'}">\${levelLabel}</span>
                            <span class="text-xs text-slate-500">\${date}</span>
                        </div>
                        <p class="text-sm font-mono">\${log.msg || log.message}</p>
                        \${log.stack ? \`<pre class="mt-3 text-[10px] bg-black/30 p-3 rounded-lg overflow-x-auto text-slate-400">\${log.stack}</pre>\` : ''}
                        \${log.req ? \`<div class="mt-2 text-[10px] text-emerald-400 opacity-60">\${log.req.method} \${log.req.url}</div>\` : ''}
                    </div>
                \`;
            }).join('');
        }

        function filterLogs(level) {
            if (level === 'all') renderLogs(allLogs);
            else if (level === 'error') renderLogs(allLogs.filter(l => l.level >= 50));
            else if (level === 'info') renderLogs(allLogs.filter(l => l.level < 50));
        }

        document.getElementById('search').addEventListener('input', (e) => {
            const term = e.target.value.toLowerCase();
            const filtered = allLogs.filter(l => 
                (l.msg && l.msg.toLowerCase().includes(term)) || 
                (l.message && l.message.toLowerCase().includes(term)) ||
                (l.stack && l.stack.toLowerCase().includes(term))
            );
            renderLogs(filtered);
        });

        fetchLogs();
        // Auto refresh a cada 10 segundos
        setInterval(fetchLogs, 10000);
    </script>
</body>
</html>
    `;
        reply.type("text/html").send(html);
    });
};
