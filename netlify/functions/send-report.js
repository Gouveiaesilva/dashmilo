// Netlify Function para envio manual de relatorios via Google Chat
// Chamada via GET: /.netlify/functions/send-report?clientId=X&period=last_7d

const { getStore } = require("@netlify/blobs");

const META_API_VERSION = 'v24.0';
const META_API_BASE = `https://graph.facebook.com/${META_API_VERSION}`;

exports.handler = async (event, context) => {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Content-Type': 'application/json'
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    const accessToken = process.env.META_ACCESS_TOKEN;
    if (!accessToken) {
        return { statusCode: 500, headers, body: JSON.stringify({ error: 'META_ACCESS_TOKEN nao configurado' }) };
    }

    try {
        const params = event.queryStringParameters || {};
        const { clientId, period } = params;

        if (!clientId) {
            return { statusCode: 400, headers, body: JSON.stringify({ error: 'clientId e obrigatorio' }) };
        }

        const store = getClientStore();
        const clients = await store.get("clients_list", { type: "json" }) || [];
        const client = clients.find(c => c.id === clientId);

        if (!client) {
            return { statusCode: 404, headers, body: JSON.stringify({ success: false, error: 'Cliente nao encontrado' }) };
        }
        if (!client.googleChatWebhook) {
            return { statusCode: 400, headers, body: JSON.stringify({ success: false, error: 'Cliente nao possui webhook configurado' }) };
        }

        const { since, until, label } = getPeriodDates(period || 'yesterday');
        const data = await fetchInsightsData(client.adAccountId, since, until, accessToken);
        const card = buildGoogleChatCard(client.name, data, label, period || 'yesterday');

        await sendToGoogleChat(client.googleChatWebhook, card);

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ success: true, message: `Relatorio enviado para ${client.name}` })
        };

    } catch (error) {
        console.error('send-report error:', error);
        return { statusCode: 500, headers, body: JSON.stringify({ success: false, error: error.message }) };
    }
};

// ==========================================
// INICIALIZAR STORE
// ==========================================
function getClientStore() {
    if (process.env.SITE_ID && process.env.NETLIFY_API_TOKEN) {
        return getStore({
            name: "clients",
            siteID: process.env.SITE_ID,
            token: process.env.NETLIFY_API_TOKEN,
            consistency: "strong"
        });
    }
    return getStore({ name: "clients", consistency: "strong" });
}

// ==========================================
// CALCULAR DATAS DO PERIODO
// ==========================================
function getPeriodDates(period) {
    const today = new Date();
    const brt = new Date(today.getTime() - 3 * 60 * 60 * 1000);
    const todayStr = brt.toISOString().split('T')[0];
    const d = new Date(brt);
    let since, until, label;

    switch (period) {
        case 'yesterday': {
            const y = new Date(d);
            y.setUTCDate(y.getUTCDate() - 1);
            since = until = y.toISOString().split('T')[0];
            label = formatDateBR(since);
            break;
        }
        case 'last_7d': {
            const end = new Date(d);
            end.setUTCDate(end.getUTCDate() - 1);
            const start = new Date(end);
            start.setUTCDate(start.getUTCDate() - 6);
            since = start.toISOString().split('T')[0];
            until = end.toISOString().split('T')[0];
            label = `${formatDateBR(since)} a ${formatDateBR(until)}`;
            break;
        }
        case 'last_14d': {
            const end = new Date(d);
            end.setUTCDate(end.getUTCDate() - 1);
            const start = new Date(end);
            start.setUTCDate(start.getUTCDate() - 13);
            since = start.toISOString().split('T')[0];
            until = end.toISOString().split('T')[0];
            label = `${formatDateBR(since)} a ${formatDateBR(until)}`;
            break;
        }
        case 'last_30d': {
            const end = new Date(d);
            end.setUTCDate(end.getUTCDate() - 1);
            const start = new Date(end);
            start.setUTCDate(start.getUTCDate() - 29);
            since = start.toISOString().split('T')[0];
            until = end.toISOString().split('T')[0];
            label = `${formatDateBR(since)} a ${formatDateBR(until)}`;
            break;
        }
        case 'this_week': {
            const dayOfWeek = d.getUTCDay();
            const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
            const monday = new Date(d);
            monday.setUTCDate(monday.getUTCDate() + mondayOffset);
            since = monday.toISOString().split('T')[0];
            until = todayStr;
            label = `${formatDateBR(since)} a ${formatDateBR(until)}`;
            break;
        }
        case 'this_month': {
            since = `${todayStr.substring(0, 8)}01`;
            until = todayStr;
            label = `${formatDateBR(since)} a ${formatDateBR(until)}`;
            break;
        }
        default: {
            const y = new Date(d);
            y.setUTCDate(y.getUTCDate() - 1);
            since = until = y.toISOString().split('T')[0];
            label = formatDateBR(since);
        }
    }

    return { since, until, label };
}

function formatDateBR(dateStr) {
    const [y, m, d] = dateStr.split('-');
    return `${d}/${m}/${y}`;
}

// ==========================================
// BUSCAR DADOS DA META API
// ==========================================
async function fetchInsightsData(adAccountId, since, until, accessToken) {
    const accountId = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`;
    const timeRange = JSON.stringify({ since, until });

    const campaignsUrl = `${META_API_BASE}/${accountId}/campaigns?fields=id,name,objective,effective_status&filtering=${encodeURIComponent(JSON.stringify([{ field: 'effective_status', operator: 'IN', value: ['ACTIVE', 'PAUSED', 'ARCHIVED'] }]))}&access_token=${accessToken}&limit=500`;
    const campResp = await fetch(campaignsUrl);
    const campData = await campResp.json();

    if (campData.error) throw new Error(campData.error.message);

    const leadObjectives = ['OUTCOME_LEADS', 'LEAD_GENERATION', 'OUTCOME_ENGAGEMENT', 'OUTCOME_SALES', 'MESSAGES'];
    const campaigns = (campData.data || []).filter(c => leadObjectives.includes(c.objective));

    if (campaigns.length === 0) {
        return { summary: { spend: 0, leads: 0, cpl: 0, impressions: 0 }, campaigns: [] };
    }

    const campaignIds = campaigns.map(c => c.id);
    const conversionMap = new Map();
    campaigns.forEach(c => {
        if (c.objective === 'OUTCOME_LEADS' || c.objective === 'LEAD_GENERATION') {
            conversionMap.set(c.id, 'form');
        } else {
            conversionMap.set(c.id, 'message');
        }
    });

    const filtering = JSON.stringify([{ field: 'campaign.id', operator: 'IN', value: campaignIds }]);
    const fields = 'campaign_id,campaign_name,spend,impressions,actions';
    const insightsUrl = `${META_API_BASE}/${accountId}/insights?fields=${fields}&filtering=${encodeURIComponent(filtering)}&access_token=${accessToken}&level=campaign&limit=500&time_range=${encodeURIComponent(timeRange)}`;

    const insResp = await fetch(insightsUrl);
    const insData = await insResp.json();

    if (insData.error) throw new Error(insData.error.message);

    let totalSpend = 0, totalLeads = 0, totalImpressions = 0;
    const campaignResults = [];

    (insData.data || []).forEach(insight => {
        const spend = parseFloat(insight.spend || 0);
        const impressions = parseInt(insight.impressions || 0);
        if (impressions === 0) return;

        const convType = conversionMap.get(insight.campaign_id) || 'form';
        const leads = countLeadsFromActions(insight.actions, convType);

        totalSpend += spend;
        totalLeads += leads;
        totalImpressions += impressions;

        campaignResults.push({
            name: insight.campaign_name,
            spend, leads, impressions,
            cpl: leads > 0 ? spend / leads : 0
        });
    });

    campaignResults.sort((a, b) => b.spend - a.spend);

    return {
        summary: {
            spend: totalSpend,
            leads: totalLeads,
            cpl: totalLeads > 0 ? totalSpend / totalLeads : 0,
            impressions: totalImpressions
        },
        campaigns: campaignResults.slice(0, 5)
    };
}

function countLeadsFromActions(actions, conversionType) {
    if (!actions || !Array.isArray(actions)) return 0;

    if (conversionType === 'form') {
        const formAction = actions.find(a => a.action_type === 'onsite_conversion.lead_grouped')
            || actions.find(a => a.action_type === 'lead');
        return formAction ? parseInt(formAction.value || 0) : 0;
    }

    if (conversionType === 'message') {
        const messageTypes = [
            'onsite_conversion.messaging_conversation_started_7d',
            'messaging_conversation_started_7d',
            'onsite_conversion.messaging_first_reply',
            'messaging_first_reply',
            'onsitemessaging_conversation_started_7d',
            'messaging_conversations_started'
        ];
        for (const actionType of messageTypes) {
            const action = actions.find(a => a.action_type === actionType);
            if (action) return parseInt(action.value || 0);
        }
    }

    return 0;
}

// ==========================================
// CONSTRUIR CARD DO GOOGLE CHAT (v2)
// ==========================================
function buildGoogleChatCard(clientName, data, periodLabel, periodType) {
    const { summary, campaigns } = data;

    const fmtCurrency = (v) => `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const fmtNumber = (v) => v.toLocaleString('pt-BR');

    const metricWidgets = [
        { decoratedText: { topLabel: "Investimento", text: `<b>${fmtCurrency(summary.spend)}</b>` } },
        { decoratedText: { topLabel: "Leads", text: `<b>${fmtNumber(summary.leads)}</b>` } },
        { decoratedText: { topLabel: "CPL", text: `<b>${fmtCurrency(summary.cpl)}</b>` } },
        { decoratedText: { topLabel: "Impressoes", text: `<b>${fmtNumber(summary.impressions)}</b>` } }
    ];

    const highlightWidgets = [];
    if (campaigns.length > 0) {
        const best = campaigns.reduce((a, b) => {
            if (a.leads === 0 && b.leads === 0) return a.spend < b.spend ? a : b;
            if (a.leads === 0) return b;
            if (b.leads === 0) return a;
            return a.cpl < b.cpl ? a : b;
        });

        if (best.leads > 0) {
            highlightWidgets.push({
                decoratedText: {
                    startIcon: { materialIcon: { name: "check_circle" } },
                    text: `Melhor campanha: ${truncate(best.name, 40)} (CPL ${fmtCurrency(best.cpl)})`
                }
            });
        }

        const worstCandidates = campaigns.filter(c => c.spend > 10);
        if (worstCandidates.length > 0) {
            const worst = worstCandidates.reduce((a, b) => {
                if (a.leads === 0 && b.leads === 0) return a.spend > b.spend ? a : b;
                if (a.leads === 0) return a;
                if (b.leads === 0) return b;
                return a.cpl > b.cpl ? a : b;
            });

            if (worst && worst !== best && (worst.leads === 0 || worst.cpl > summary.cpl * 1.3)) {
                const worstMsg = worst.leads === 0
                    ? `${truncate(worst.name, 35)} gastou ${fmtCurrency(worst.spend)} sem leads`
                    : `${truncate(worst.name, 35)} com CPL alto: ${fmtCurrency(worst.cpl)}`;
                highlightWidgets.push({
                    decoratedText: {
                        startIcon: { materialIcon: { name: "warning" } },
                        text: worstMsg
                    }
                });
            }
        }
    }

    const periodNames = {
        yesterday: 'Dia anterior',
        last_7d: 'Ultimos 7 dias',
        last_14d: 'Ultimos 14 dias',
        last_30d: 'Ultimos 30 dias',
        this_week: 'Semana corrente',
        this_month: 'Mes corrente'
    };

    const sections = [
        { header: `Metricas — ${periodNames[periodType] || periodType}`, widgets: metricWidgets }
    ];

    if (highlightWidgets.length > 0) {
        sections.push({ header: "Destaques", widgets: highlightWidgets });
    }

    sections.push({
        widgets: [{
            buttonList: {
                buttons: [{
                    text: "Abrir Dashboard",
                    onClick: { openLink: { url: process.env.URL || "https://dashboardmilo.netlify.app" } }
                }]
            }
        }]
    });

    return {
        cardsV2: [{
            cardId: `report_${Date.now()}`,
            card: {
                header: { title: `📊 ${clientName}`, subtitle: periodLabel },
                sections
            }
        }]
    };
}

function truncate(str, maxLen) {
    if (!str) return '';
    return str.length > maxLen ? str.substring(0, maxLen - 1) + '…' : str;
}

// ==========================================
// ENVIAR PARA GOOGLE CHAT
// ==========================================
async function sendToGoogleChat(webhookUrl, payload) {
    const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=UTF-8' },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Google Chat webhook error ${response.status}: ${text}`);
    }

    return true;
}
