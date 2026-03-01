// Netlify Scheduled Function: pinga a Evolution API a cada 5 minutos
// Mantém o Render awake E a sessão WhatsApp ativa (não só o servidor)

const { getStore } = require('@netlify/blobs');

exports.handler = async (event, context) => {
    const API_URL = (process.env.EVOLUTION_API_URL || '').replace(/\/+$/, '');
    const API_KEY = process.env.EVOLUTION_API_KEY || '';
    const DEFAULT_INSTANCE = process.env.EVOLUTION_INSTANCE_NAME || 'dashboard-milo';

    if (!API_URL || !API_KEY) {
        console.log('keep-alive: API nao configurada, pulando');
        return { statusCode: 200 };
    }

    // Buscar instancia ativa (pode ter sido trocada por force-reset)
    let instance = DEFAULT_INSTANCE;
    try {
        const store = getInstanceStore();
        const override = await store.get('active_instance');
        if (override) instance = override;
    } catch (e) { /* usa default */ }

    try {
        // Ping 1: Root (acorda o Render)
        const rootResp = await fetchWithTimeout(`${API_URL}`, {
            method: 'GET', headers: { 'apikey': API_KEY }
        }, 8000);
        console.log(`keep-alive: root ping OK (${rootResp.status})`);

        // Ping 2: Connection state (mantém sessão WhatsApp ativa)
        const stateResp = await fetchWithTimeout(`${API_URL}/instance/connectionState/${instance}`, {
            method: 'GET', headers: { 'apikey': API_KEY }
        }, 8000);
        const stateData = await stateResp.json();
        const state = stateData.instance?.state || stateData.state || 'unknown';
        console.log(`keep-alive: instance "${instance}" state: ${state}`);

    } catch (e) {
        console.error(`keep-alive: erro - ${e.message}`);
    }

    return { statusCode: 200 };
};

function getInstanceStore() {
    if (process.env.SITE_ID && process.env.NETLIFY_API_TOKEN) {
        return getStore({ name: 'whatsapp-config', siteID: process.env.SITE_ID, token: process.env.NETLIFY_API_TOKEN, consistency: 'strong' });
    }
    return getStore({ name: 'whatsapp-config', consistency: 'strong' });
}

async function fetchWithTimeout(url, options, timeoutMs = 8000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const resp = await fetch(url, { ...options, signal: controller.signal });
        clearTimeout(timer);
        return resp;
    } catch (e) {
        clearTimeout(timer);
        if (e.name === 'AbortError') throw new Error('Timeout');
        throw e;
    }
}
