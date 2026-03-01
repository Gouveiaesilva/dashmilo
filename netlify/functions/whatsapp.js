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
        const DEFAULT_INSTANCE = process.env.EVOLUTION_INSTANCE_NAME || 'dashboard-milo';

        // Buscar instancia ativa (pode ter sido trocada por force-reset)
        const INSTANCE = await getActiveInstance(DEFAULT_INSTANCE);

        // Action de status da config (nao precisa de API conectada)
        if (action === 'get-config') {
            const activeInstance = await getActiveInstance(DEFAULT_INSTANCE);
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({
                    success: true,
                    config: {
                        hasApiUrl: !!API_URL,
                        hasApiKey: !!API_KEY,
                        hasInstance: !!activeInstance,
                        instanceName: activeInstance
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

            // === DIAGNOSTICO ===
            case 'diagnose':
                result = await diagnoseAPI(API_URL, API_KEY, INSTANCE);
                break;

            case 'force-reset':
                result = await forceReset(API_URL, API_KEY, INSTANCE);
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
    const resp = await fetchWithTimeout(`${apiUrl}/instance/connectionState/${instance}`, {
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
    const resp = await fetchWithTimeout(`${apiUrl}/instance/connect/${instance}`, {
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
    const resp = await fetchWithTimeout(`${apiUrl}/instance/create`, {
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
    const resp = await fetchWithTimeout(`${apiUrl}/instance/logout/${instance}`, {
        method: 'DELETE',
        headers: { 'apikey': apiKey }
    });
    const data = await resp.json();

    if (data.error) throw new Error(data.error.message || 'Erro ao desconectar');

    return { disconnected: true };
}

async function restartInstance(apiUrl, apiKey, instance) {
    const resp = await fetchWithTimeout(`${apiUrl}/instance/restart/${instance}`, {
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

    const resp = await fetchWithTimeout(`${apiUrl}/message/sendText/${instance}`, {
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

    const resp = await fetchWithTimeout(`${apiUrl}/message/sendMedia/${instance}`, {
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
// FORCE RESET
// ==========================================

async function forceReset(apiUrl, apiKey, oldInstance) {
    const steps = [];

    // Estrategia: ABANDONAR a instancia travada e criar uma nova com nome unico
    // Isso evita qualquer operacao na instancia travada (que causa timeout)
    const newName = 'milo-' + Date.now().toString(36);

    // Step 1: Criar instancia nova (nao toca na velha)
    let createData = null;
    try {
        const resp = await fetchWithTimeout(`${apiUrl}/instance/create`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'apikey': apiKey },
            body: JSON.stringify({ instanceName: newName, integration: 'WHATSAPP-BAILEYS', qrcode: true })
        }, 8000);
        createData = await resp.json();
        steps.push({ step: 'create', ok: resp.ok, status: resp.status, newInstance: newName });
    } catch (e) {
        steps.push({ step: 'create', ok: false, error: e.message });
        return { reset: false, steps, error: 'Nao foi possivel criar nova instancia: ' + e.message };
    }

    // Step 2: Salvar nome da nova instancia no Blobs (override)
    try {
        await saveActiveInstance(newName);
        steps.push({ step: 'save', ok: true, newInstance: newName });
    } catch (e) {
        steps.push({ step: 'save', ok: false, error: e.message });
    }

    // Step 3: Buscar QR code (a criacao pode ja ter retornado)
    let qrcode = createData?.qrcode?.base64 || createData?.base64 || null;
    let pairingCode = createData?.pairingCode || null;

    if (!qrcode) {
        try {
            await new Promise(r => setTimeout(r, 500));
            const resp = await fetchWithTimeout(`${apiUrl}/instance/connect/${newName}`, {
                method: 'GET', headers: { 'apikey': apiKey }
            }, 6000);
            const data = await resp.json();
            qrcode = data.base64 || data.qrcode?.base64 || null;
            pairingCode = data.pairingCode || pairingCode;
            steps.push({ step: 'qrcode', ok: !!qrcode });
        } catch (e) {
            steps.push({ step: 'qrcode', ok: false, error: e.message });
        }
    }

    // Step 4: Tentar limpar instancia velha em background (fire-and-forget, 2s max)
    try {
        await fetchWithTimeout(`${apiUrl}/instance/delete/${oldInstance}`, {
            method: 'DELETE', headers: { 'apikey': apiKey }
        }, 2000);
    } catch (e) { /* ignorado */ }

    return {
        reset: true,
        steps,
        newInstance: newName,
        qrcode,
        pairingCode
    };
}

// Gerenciamento de instancia ativa via Blobs
function getInstanceStore() {
    if (process.env.SITE_ID && process.env.NETLIFY_API_TOKEN) {
        return getStore({ name: 'whatsapp-config', siteID: process.env.SITE_ID, token: process.env.NETLIFY_API_TOKEN, consistency: 'strong' });
    }
    return getStore({ name: 'whatsapp-config', consistency: 'strong' });
}

async function getActiveInstance(defaultName) {
    try {
        const store = getInstanceStore();
        const override = await store.get('active_instance');
        return override || defaultName;
    } catch (e) {
        return defaultName;
    }
}

async function saveActiveInstance(name) {
    const store = getInstanceStore();
    await store.set('active_instance', name);
}

// ==========================================
// DIAGNOSTICO
// ==========================================

async function diagnoseAPI(apiUrl, apiKey, instance) {
    const tests = [];

    // Test 1: API alcancavel (GET /)
    tests.push(await runDiagTest('API Alcancavel', async () => {
        const resp = await fetchWithTimeout(`${apiUrl}`, {
            method: 'GET',
            headers: { 'apikey': apiKey }
        }, 4000);
        let data;
        try { data = await resp.json(); } catch { data = { raw: (await resp.text()).substring(0, 200) }; }
        return { status: resp.status, version: data.version || null, data };
    }));

    // Test 2: Estado da instancia
    tests.push(await runDiagTest('Estado da Instancia', async () => {
        const resp = await fetchWithTimeout(`${apiUrl}/instance/connectionState/${instance}`, {
            method: 'GET',
            headers: { 'apikey': apiKey }
        }, 4000);
        const data = await resp.json();
        return { status: resp.status, state: data.instance?.state || data.state, data };
    }));

    // Test 3: Detalhes da instancia (busca token)
    let instanceToken = null;
    tests.push(await runDiagTest('Detalhes da Instancia', async () => {
        const resp = await fetchWithTimeout(`${apiUrl}/instance/fetchInstances?instanceName=${instance}`, {
            method: 'GET',
            headers: { 'apikey': apiKey }
        }, 4000);
        const data = await resp.json();
        if (Array.isArray(data) && data[0]) {
            instanceToken = data[0].token || data[0].instance?.token || null;
        } else if (data.token) {
            instanceToken = data.token;
        } else if (data.instance?.token) {
            instanceToken = data.instance.token;
        }
        return { status: resp.status, hasToken: !!instanceToken, instanceData: JSON.stringify(data).substring(0, 500) };
    }));

    // Test 4: sendText com chave global (numero invalido — so testa se o endpoint responde)
    const testBody = { number: '5500000000000', text: 'diag' };
    tests.push(await runDiagTest('sendText (chave global)', async () => {
        const resp = await fetchWithTimeout(`${apiUrl}/message/sendText/${instance}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'apikey': apiKey },
            body: JSON.stringify(testBody)
        }, 6000);
        const data = await resp.json();
        return { status: resp.status, data };
    }));

    // Test 5: sendText com token da instancia (se disponivel)
    if (instanceToken) {
        tests.push(await runDiagTest('sendText (token instancia)', async () => {
            const resp = await fetchWithTimeout(`${apiUrl}/message/sendText/${instance}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'apikey': instanceToken },
                body: JSON.stringify(testBody)
            }, 6000);
            const data = await resp.json();
            return { status: resp.status, data };
        }));
    }

    // Test 6: sendText formato v1 (textMessage wrapper)
    const lastSendTest = tests.find(t => t.name.startsWith('sendText'));
    if (lastSendTest && !lastSendTest.ok) {
        tests.push(await runDiagTest('sendText (formato v1 wrapper)', async () => {
            const resp = await fetchWithTimeout(`${apiUrl}/message/sendText/${instance}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'apikey': apiKey },
                body: JSON.stringify({ number: '5500000000000', textMessage: { text: 'diag' } })
            }, 6000);
            const data = await resp.json();
            return { status: resp.status, data };
        }));
    }

    return {
        diagnostics: tests,
        summary: tests.map(t => `${t.ok ? 'OK' : 'FALHA'} ${t.name} (${t.timeMs}ms)`).join(' | '),
        recommendation: generateRecommendation(tests, instanceToken)
    };
}

async function runDiagTest(name, fn) {
    const start = Date.now();
    try {
        const result = await fn();
        return { name, ok: true, timeMs: Date.now() - start, ...result };
    } catch (e) {
        return { name, ok: false, timeMs: Date.now() - start, error: e.message };
    }
}

function generateRecommendation(tests, hasToken) {
    const apiOk = tests[0]?.ok;
    const stateOk = tests[1]?.ok;
    const sendGlobal = tests.find(t => t.name === 'sendText (chave global)');
    const sendToken = tests.find(t => t.name === 'sendText (token instancia)');
    const sendV1 = tests.find(t => t.name === 'sendText (formato v1 wrapper)');

    if (!apiOk) return 'SERVIDOR_OFFLINE: A Evolution API nao esta respondendo. Verifique se o servidor Oracle Cloud esta rodando e se o Docker container esta ativo.';
    if (!stateOk) return 'INSTANCIA_ERRO: O servidor responde mas a instancia nao foi encontrada. Verifique o nome da instancia nas variaveis de ambiente.';

    const state = tests[1]?.state;
    if (state !== 'open') return `WHATSAPP_DESCONECTADO: A instancia esta com estado "${state}". Reconecte o WhatsApp escaneando o QR code.`;

    if (sendGlobal?.ok) return 'TUDO_OK: O envio funciona com a chave global. Se ainda falhar com numeros reais, o problema pode ser o formato do numero.';
    if (sendToken?.ok) return 'USAR_TOKEN: O envio funciona com o token da instancia mas NAO com a chave global. O sistema sera atualizado para usar o token automaticamente.';
    if (sendV1?.ok) return 'FORMATO_V1: O envio funciona com o formato v1 (textMessage wrapper). O sistema sera atualizado para usar este formato.';

    if (sendGlobal && sendGlobal.error?.includes('tempo')) return 'TIMEOUT_ENVIO: O endpoint de envio nao responde. O container pode estar travado. Tente reiniciar a instancia pelo botao abaixo.';

    return 'ERRO_DESCONHECIDO: O envio falhou por motivo nao identificado. Verifique os detalhes dos testes abaixo.';
}

// ==========================================
// HELPERS
// ==========================================

async function fetchWithTimeout(url, options, timeoutMs = 25000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const resp = await fetch(url, { ...options, signal: controller.signal });
        clearTimeout(timer);
        return resp;
    } catch (e) {
        clearTimeout(timer);
        if (e.name === 'AbortError') {
            throw new Error(`Evolution API nao respondeu em ${Math.round(timeoutMs/1000)}s. Verifique se o servidor esta online e acessivel.`);
        }
        if (e.code === 'ECONNREFUSED') {
            throw new Error('Conexao recusada. O servidor Evolution API pode estar desligado.');
        }
        if (e.code === 'ENOTFOUND') {
            throw new Error('Servidor nao encontrado. Verifique a URL da Evolution API.');
        }
        throw new Error(`Erro de rede: ${e.message}`);
    }
}

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
