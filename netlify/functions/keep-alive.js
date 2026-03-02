// Netlify Scheduled Function: pinga a Evolution API a cada 5 minutos
// Mantem a sessao WhatsApp ativa verificando o estado da conexao

exports.handler = async (event, context) => {
    const API_URL = (process.env.EVOLUTION_API_URL || '').replace(/\/+$/, '');
    const API_KEY = process.env.EVOLUTION_API_KEY || '';
    const INSTANCE = process.env.EVOLUTION_INSTANCE_NAME || 'dashboard-milo';

    if (!API_URL || !API_KEY) {
        console.log('keep-alive: API nao configurada, pulando');
        return { statusCode: 200 };
    }

    try {
        const resp = await fetchWithTimeout(
            `${API_URL}/instance/connectionState/${INSTANCE}`,
            { method: 'GET', headers: { 'apikey': API_KEY } },
            8000
        );
        const data = await resp.json();
        const state = data.instance?.state || data.state || 'unknown';
        console.log(`keep-alive: "${INSTANCE}" state: ${state}`);
    } catch (e) {
        console.error(`keep-alive: ${e.message}`);
    }

    return { statusCode: 200 };
};

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
