// Netlify Function para gerenciar clientes
// Usa Netlify Blobs para armazenamento persistente

const { getStore } = require("@netlify/blobs");

exports.handler = async (event, context) => {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Content-Type': 'application/json'
    };

    // Preflight
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    try {
        // Inicializar o store com configuração explícita
        // Se SITE_ID e NETLIFY_API_TOKEN estiverem definidos, usa configuração manual
        // Caso contrário, tenta configuração automática
        let store;

        if (process.env.SITE_ID && process.env.NETLIFY_API_TOKEN) {
            store = getStore({
                name: "clients",
                siteID: process.env.SITE_ID,
                token: process.env.NETLIFY_API_TOKEN,
                consistency: "strong"
            });
        } else {
            // Tenta configuração automática (funciona em deploys do Netlify com Blobs habilitado)
            store = getStore({
                name: "clients",
                consistency: "strong"
            });
        }
        const CLIENTS_KEY = "clients_list";

        // GET - Listar clientes (público)
        if (event.httpMethod === 'GET') {
            const data = await store.get(CLIENTS_KEY, { type: "json" });
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({
                    success: true,
                    clients: data || []
                })
            };
        }

        // POST - Adicionar cliente (requer senha admin)
        if (event.httpMethod === 'POST') {
            const body = JSON.parse(event.body || '{}');
            const { password, client } = body;

            // Verificar senha admin
            const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '123456789';
            if (password !== ADMIN_PASSWORD) {
                return {
                    statusCode: 401,
                    headers,
                    body: JSON.stringify({ error: 'Senha incorreta' })
                };
            }

            if (!client || !client.name || !client.adAccountId) {
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({ error: 'Dados do cliente incompletos' })
                };
            }

            // Buscar clientes existentes
            const existingData = await store.get(CLIENTS_KEY, { type: "json" });
            const clients = existingData || [];

            // Adicionar novo cliente
            const newClient = {
                id: 'client_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
                name: client.name,
                adAccountId: client.adAccountId,
                color: client.color || getRandomColor(),
                cplTargets: client.cplTargets || null,
                googleChatWebhook: client.googleChatWebhook || null,
                adsManagerUrl: client.adsManagerUrl || null,
                reportSchedules: client.reportSchedules || [],
                createdAt: new Date().toISOString()
            };

            clients.push(newClient);

            // Salvar
            await store.setJSON(CLIENTS_KEY, clients);

            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({
                    success: true,
                    message: 'Cliente adicionado',
                    client: newClient
                })
            };
        }

        // PUT - Atualizar cliente (requer senha admin)
        if (event.httpMethod === 'PUT') {
            const body = JSON.parse(event.body || '{}');
            const { password, clientId, updates } = body;

            const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '123456789';
            if (password !== ADMIN_PASSWORD) {
                return {
                    statusCode: 401,
                    headers,
                    body: JSON.stringify({ error: 'Senha incorreta' })
                };
            }

            if (!clientId || !updates) {
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({ error: 'Dados incompletos para atualização' })
                };
            }

            const existingData = await store.get(CLIENTS_KEY, { type: "json" });
            const clients = existingData || [];
            const index = clients.findIndex(c => c.id === clientId);

            if (index === -1) {
                return {
                    statusCode: 404,
                    headers,
                    body: JSON.stringify({ error: 'Cliente não encontrado' })
                };
            }

            // Atualizar apenas campos permitidos
            if (updates.name) clients[index].name = updates.name;
            if (updates.adAccountId) clients[index].adAccountId = updates.adAccountId;
            if (updates.color) clients[index].color = updates.color;
            // cplTargets pode ser null (remover) ou objeto
            if (updates.hasOwnProperty('cplTargets')) clients[index].cplTargets = updates.cplTargets;
            if (updates.hasOwnProperty('googleChatWebhook')) clients[index].googleChatWebhook = updates.googleChatWebhook;
            if (updates.hasOwnProperty('adsManagerUrl')) clients[index].adsManagerUrl = updates.adsManagerUrl;
            if (updates.hasOwnProperty('reportSchedules')) clients[index].reportSchedules = updates.reportSchedules;

            await store.setJSON(CLIENTS_KEY, clients);

            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({
                    success: true,
                    message: 'Cliente atualizado',
                    client: clients[index]
                })
            };
        }

        // DELETE - Remover cliente (requer senha admin)
        if (event.httpMethod === 'DELETE') {
            const body = JSON.parse(event.body || '{}');
            const { password, clientId } = body;

            // Verificar senha admin
            const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '123456789';
            if (password !== ADMIN_PASSWORD) {
                return {
                    statusCode: 401,
                    headers,
                    body: JSON.stringify({ error: 'Senha incorreta' })
                };
            }

            if (!clientId) {
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({ error: 'ID do cliente não informado' })
                };
            }

            // Buscar clientes existentes
            const existingData = await store.get(CLIENTS_KEY, { type: "json" });
            const clients = existingData || [];

            // Filtrar removendo o cliente
            const updatedClients = clients.filter(c => c.id !== clientId);

            if (updatedClients.length === clients.length) {
                return {
                    statusCode: 404,
                    headers,
                    body: JSON.stringify({ error: 'Cliente não encontrado' })
                };
            }

            // Salvar
            await store.setJSON(CLIENTS_KEY, updatedClients);

            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({
                    success: true,
                    message: 'Cliente removido'
                })
            };
        }

        return {
            statusCode: 405,
            headers,
            body: JSON.stringify({ error: 'Método não permitido' })
        };

    } catch (error) {
        console.error('Erro:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({
                error: 'Erro interno',
                message: error.message
            })
        };
    }
};

function getRandomColor() {
    const colors = ['blue', 'purple', 'orange', 'green', 'pink', 'cyan', 'red', 'yellow', 'indigo', 'teal'];
    return colors[Math.floor(Math.random() * colors.length)];
}
