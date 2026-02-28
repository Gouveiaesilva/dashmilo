// Netlify Function para integracao com WhatsApp via Evolution API
// Gerenciamento de conexao + envio de mensagens e relatorios
// Configuracoes sensiveis em variaveis de ambiente (Netlify)

const { getStore } = require('@netlify/blobs');

exports.handler = async (event, context) => {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Content-Type': 'application/json'
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Apenas POST permitido' }) };
    }

    try {
        const body = JSON.parse(event.body || '{}');
        const { action, password } = body;

        // Todas as actions exigem senha admin
        const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '123456789';
        if (password !== ADMIN_PASSWORD) {
            return { statusCode: 401, headers, body: JSON.stringify({ error: 'Senha incorreta' }) };
        }

        // Config via variaveis de ambiente
        const API_URL = (process.env.EVOLUTION_API_URL || '').replace(/\/+$/, '');
        const API_KEY = process.env.EVOLUTION_API_KEY || '';
        const INSTANCE = process.env.EVOLUTION_INSTANCE_NAME || 'dashboard-milo';

        // Action de status da config (nao precisa de API conectada)
        if (action === 'get-config') {
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({
                    success: true,
                    config: {
                        hasApiUrl: !!API_URL,
                        hasApiKey: !!API_KEY,
                        hasInstance: !!INSTANCE,
                        instanceName: INSTANCE
                    }
                })
            };
        }

        // Actions de Lead Push usam Netlify Blobs (nao precisam de Evolution API)
        if (action === 'get-lead-config' || action === 'save-lead-config') {
            let result;
            if (action === 'get-lead-config') {
                result = await getLeadConfig(body.clientId);
            } else {
                result = await saveLeadConfig(body.clientId, body.formId, body.config);
            }
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({ success: true, ...result })
            };
        }

        // Demais actions precisam de config valida
        if (!API_URL || !API_KEY) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: 'WhatsApp nao configurado. Configure EVOLUTION_API_URL e EVOLUTION_API_KEY nas variaveis de ambiente do Netlify.' })
            };
        }

        let result;

        switch (action) {
            // === CONEXAO ===
            case 'test-connection':
                result = await testConnection(API_URL, API_KEY, INSTANCE);
                break;

            case 'get-qrcode':
                result = await getQrCode(API_URL, API_KEY, INSTANCE);
                break;

            case 'create-instance':
                result = await createInstance(API_URL, API_KEY, INSTANCE);
                break;

            case 'logout-instance':
                result = await logoutInstance(API_URL, API_KEY, INSTANCE);
                break;

            case 'restart-instance':
                result = await restartInstance(API_URL, API_KEY, INSTANCE);
                break;

            // === ENVIO ===
            case 'send-text':
                result = await sendText(API_URL, API_KEY, INSTANCE, body.number, body.text);
                break;

            case 'send-report':
                result = await sendReport(API_URL, API_KEY, INSTANCE, body.number, body.clientName, body.metrics, body.period);
                break;

            case 'send-media':
                result = await sendMedia(API_URL, API_KEY, INSTANCE, body.number, body.mediaBase64, body.fileName, body.caption);
                break;

            default:
                return { statusCode: 400, headers, body: JSON.stringify({ error: `Action desconhecida: ${action}` }) };
        }

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ success: true, ...result })
        };

    } catch (error) {
        console.error('whatsapp error:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ success: false, error: error.message })
        };
    }
};

// ==========================================
// CONEXAO
// ==========================================

async function testConnection(apiUrl, apiKey, instance) {
    const resp = await fetch(`${apiUrl}/instance/connectionState/${instance}`, {
        method: 'GET',
        headers: { 'apikey': apiKey }
    });
    const data = await resp.json();

    if (data.error) throw new Error(data.error.message || 'Erro ao verificar conexao');

    const state = data.instance?.state || data.state || 'close';
    return {
        connected: state === 'open',
        state,
        instance
    };
}

async function getQrCode(apiUrl, apiKey, instance) {
    const resp = await fetch(`${apiUrl}/instance/connect/${instance}`, {
        method: 'GET',
        headers: { 'apikey': apiKey }
    });
    const data = await resp.json();

    if (data.error) throw new Error(data.error.message || 'Erro ao gerar QR code');

    return {
        qrcode: data.base64 || data.qrcode?.base64 || null,
        pairingCode: data.pairingCode || null,
        instance
    };
}

async function createInstance(apiUrl, apiKey, instance) {
    const resp = await fetch(`${apiUrl}/instance/create`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'apikey': apiKey
        },
        body: JSON.stringify({
            instanceName: instance,
            integration: 'WHATSAPP-BAILEYS',
            qrcode: true
        })
    });
    const data = await resp.json();

    if (data.error) throw new Error(data.error.message || 'Erro ao criar instancia');

    return {
        instanceName: data.instance?.instanceName || instance,
        status: data.instance?.status || 'created'
    };
}

async function logoutInstance(apiUrl, apiKey, instance) {
    const resp = await fetch(`${apiUrl}/instance/logout/${instance}`, {
        method: 'DELETE',
        headers: { 'apikey': apiKey }
    });
    const data = await resp.json();

    if (data.error) throw new Error(data.error.message || 'Erro ao desconectar');

    return { disconnected: true };
}

async function restartInstance(apiUrl, apiKey, instance) {
    const resp = await fetch(`${apiUrl}/instance/restart/${instance}`, {
        method: 'PUT',
        headers: { 'apikey': apiKey }
    });
    const data = await resp.json();

    if (data.error) throw new Error(data.error.message || 'Erro ao reiniciar instancia');

    return { restarted: true };
}

// ==========================================
// ENVIO
// ==========================================

function validateNumber(number) {
    if (!number) throw new Error('Numero e obrigatorio');
    const clean = number.replace(/\D/g, '');
    if (clean.length < 12 || clean.length > 13) {
        throw new Error('Numero invalido. Use formato: 5511999999999');
    }
    if (!clean.startsWith('55')) {
        throw new Error('Numero deve comecar com 55 (codigo do Brasil)');
    }
    return clean;
}

async function sendText(apiUrl, apiKey, instance, number, text) {
    const cleanNumber = validateNumber(number);
    if (!text) throw new Error('Texto e obrigatorio');

    const resp = await fetch(`${apiUrl}/message/sendText/${instance}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'apikey': apiKey
        },
        body: JSON.stringify({
            number: cleanNumber,
            text: text
        })
    });
    const data = await resp.json();

    if (data.error || data.status >= 400) {
        // Extrair mensagem de erro da Evolution API
        let errMsg = 'Erro ao enviar mensagem';
        if (data.response?.message) {
            const msg = data.response.message;
            if (Array.isArray(msg)) {
                // Verificar se é erro de numero inexistente
                const notFound = msg.find(m => m && typeof m === 'object' && m.exists === false);
                if (notFound) {
                    errMsg = `Numero ${notFound.number || ''} nao encontrado no WhatsApp`;
                } else {
                    errMsg = JSON.stringify(msg);
                }
            } else {
                errMsg = String(msg);
            }
        } else if (typeof data.error === 'string') {
            errMsg = data.error;
        } else if (data.error?.message) {
            errMsg = data.error.message;
        }
        throw new Error(errMsg);
    }

    return {
        sent: true,
        messageId: data.key?.id || data.messageId || null
    };
}

async function sendReport(apiUrl, apiKey, instance, number, clientName, metrics, period) {
    const cleanNumber = validateNumber(number);
    if (!clientName) throw new Error('Nome do cliente e obrigatorio');
    if (!metrics) throw new Error('Metricas sao obrigatorias');

    const { spend, impressions, clicks, leads, cpl } = metrics;
    const { start, end } = period || {};

    let message = `📊 *Relatório — ${clientName}*\n`;
    if (start && end) {
        message += `📅 Período: ${start} a ${end}\n`;
    }
    message += `\n`;
    message += `💰 Investido: R$ ${fmtNum(spend)}\n`;
    message += `👁 Impressões: ${fmtInt(impressions)}\n`;
    message += `👆 Cliques: ${fmtInt(clicks)}\n`;
    message += `📋 Leads: ${fmtInt(leads)}\n`;
    message += `💵 CPL: R$ ${fmtNum(cpl)}\n`;
    if (metrics.variation) {
        message += `\n${metrics.variation}\n`;
    }
    message += `\n_Enviado via Dashboard Milo_`;

    return await sendText(apiUrl, apiKey, instance, cleanNumber, message);
}

async function sendMedia(apiUrl, apiKey, instance, number, mediaBase64, fileName, caption) {
    const cleanNumber = validateNumber(number);
    if (!mediaBase64) throw new Error('Arquivo e obrigatorio');

    const resp = await fetch(`${apiUrl}/message/sendMedia/${instance}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'apikey': apiKey
        },
        body: JSON.stringify({
            number: cleanNumber,
            mediatype: 'document',
            media: mediaBase64,
            fileName: fileName || 'relatorio.pdf',
            caption: caption || ''
        })
    });
    const data = await resp.json();

    if (data.error) throw new Error(data.error.message || 'Erro ao enviar arquivo');

    return {
        sent: true,
        messageId: data.key?.id || data.messageId || null
    };
}

// ==========================================
// HELPERS
// ==========================================

function fmtNum(val) {
    if (val === null || val === undefined) return '0,00';
    return Number(val).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtInt(val) {
    if (val === null || val === undefined) return '0';
    return Number(val).toLocaleString('pt-BR');
}

// ==========================================
// LEAD PUSH CONFIG (Netlify Blobs)
// ==========================================

function getLeadPushStore() {
    if (process.env.SITE_ID && process.env.NETLIFY_API_TOKEN) {
        return getStore({ name: 'lead-push', siteID: process.env.SITE_ID, token: process.env.NETLIFY_API_TOKEN, consistency: 'strong' });
    }
    return getStore({ name: 'lead-push', consistency: 'strong' });
}

async function getLeadConfig(clientId) {
    if (!clientId) throw new Error('clientId e obrigatorio');
    const store = getLeadPushStore();
    try {
        const data = await store.get(`config_${clientId}`, { type: 'json' });
        return { config: data || { forms: {} } };
    } catch (e) {
        return { config: { forms: {} } };
    }
}

async function saveLeadConfig(clientId, formId, formConfig) {
    if (!clientId) throw new Error('clientId e obrigatorio');
    if (!formId) throw new Error('formId e obrigatorio');

    const store = getLeadPushStore();
    let existing = { forms: {} };
    try {
        const data = await store.get(`config_${clientId}`, { type: 'json' });
        if (data) existing = data;
    } catch (e) {}

    existing.forms[formId] = {
        enabled: formConfig.enabled !== undefined ? formConfig.enabled : true,
        template: formConfig.template || '',
        updatedAt: new Date().toISOString()
    };

    await store.setJSON(`config_${clientId}`, existing);
    return { saved: true, config: existing };
}
