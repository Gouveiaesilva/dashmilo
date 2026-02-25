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

        const usePeriod = period || 'yesterday';
        const includePdfLink = params.includePdfLink === '1' || params.includePdfLink === 'true';
        const { since, until, label } = getPeriodDates(usePeriod);
        const prev = getPreviousPeriodDates(usePeriod, since, until);
        const [data, previousData] = await Promise.all([
            fetchInsightsData(client.adAccountId, since, until, accessToken),
            fetchInsightsData(client.adAccountId, prev.since, prev.until, accessToken)
        ]);
        const card = buildGoogleChatCard(client.name, data, previousData, label, usePeriod, clientId, includePdfLink, client.cplTargets);

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
// CALCULAR PERIODO ANTERIOR (COMPARACAO)
// ==========================================
function getPreviousPeriodDates(period, currentSince, currentUntil) {
    const sinceDate = new Date(currentSince + 'T00:00:00Z');
    const untilDate = new Date(currentUntil + 'T00:00:00Z');
    const daysDiff = Math.round((untilDate - sinceDate) / (1000 * 60 * 60 * 24)) + 1;

    const prevUntil = new Date(sinceDate);
    prevUntil.setUTCDate(prevUntil.getUTCDate() - 1);
    const prevSince = new Date(prevUntil);
    prevSince.setUTCDate(prevSince.getUTCDate() - daysDiff + 1);

    return {
        since: prevSince.toISOString().split('T')[0],
        until: prevUntil.toISOString().split('T')[0]
    };
}

// ==========================================
// CLASSIFICAR CPL NAS FAIXAS DO CLIENTE
// ==========================================
function classifyCpl(cplValue, cplTargets) {
    if (!cplTargets || cplValue <= 0) return null;
    if (cplValue <= cplTargets.excellent) return { label: 'Excelente', emoji: '🟢', icon: 'check_circle' };
    if (cplValue <= cplTargets.healthy)   return { label: 'Saudavel', emoji: '🔵', icon: 'check_circle' };
    if (cplValue <= cplTargets.warning)   return { label: 'Atencao', emoji: '🟡', icon: 'warning' };
    return                                       { label: 'Critico', emoji: '🔴', icon: 'error' };
}

// ==========================================
// CALCULAR VARIACAO PERCENTUAL
// ==========================================
function calcVariation(current, previous) {
    if (previous === 0 && current === 0) return null;
    if (previous === 0) return { pct: null, direction: 'new' };
    const pct = ((current - previous) / previous) * 100;
    return {
        pct: Math.abs(pct),
        direction: pct > 0.5 ? 'up' : pct < -0.5 ? 'down' : 'neutral'
    };
}

function formatVariation(variation, metric) {
    if (!variation) return '';
    if (variation.direction === 'new') return '✨ Novo';

    const pctStr = variation.pct.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

    // Para CPL, subir e ruim; para leads/impressoes, subir e bom
    const isCpl = metric === 'cpl';
    const isSpend = metric === 'spend';

    if (variation.direction === 'neutral') return `→ estavel`;

    if (variation.direction === 'up') {
        if (isCpl) return `↗ +${pctStr}% ⚠`;
        return `↗ +${pctStr}%`;
    }
    // down
    if (isCpl) return `↘ -${pctStr}%`;
    return `↘ -${pctStr}%`;
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
    const allCampaigns = (campData.data || []).filter(c => leadObjectives.includes(c.objective));

    if (allCampaigns.length === 0) {
        return { summary: { spend: 0, leads: 0, cpl: 0, impressions: 0 }, campaigns: [] };
    }

    // Buscar insights de TODAS as campanhas para filtrar por resultado real
    const allCampaignIds = allCampaigns.map(c => c.id);
    const allFiltering = JSON.stringify([{ field: 'campaign.id', operator: 'IN', value: allCampaignIds }]);
    const fields = 'campaign_id,campaign_name,spend,impressions,actions';
    const insightsUrl = `${META_API_BASE}/${accountId}/insights?fields=${fields}&filtering=${encodeURIComponent(allFiltering)}&access_token=${accessToken}&level=campaign&limit=500&time_range=${encodeURIComponent(timeRange)}`;

    const insResp = await fetch(insightsUrl);
    const insData = await insResp.json();

    if (insData.error) throw new Error(insData.error.message);

    // Tipos de resultado que contam como lead/conversa
    const leadActionTypes = [
        'onsite_conversion.lead_grouped',
        'offsite_conversion.fb_pixel_lead',
        'lead',
        'onsite_conversion.messaging_conversation_started_7d',
        'messaging_conversation_started_7d'
    ];

    // Tipos de conversa para determinar conversionType
    const messageActionTypes = [
        'onsite_conversion.messaging_conversation_started_7d',
        'messaging_conversation_started_7d',
        'onsite_conversion.messaging_first_reply',
        'messaging_first_reply',
        'messaging_conversations_started'
    ];

    let totalSpend = 0, totalLeads = 0, totalImpressions = 0;
    const campaignResults = [];

    (insData.data || []).forEach(insight => {
        const spend = parseFloat(insight.spend || 0);
        const impressions = parseInt(insight.impressions || 0);
        if (impressions === 0 || spend <= 0) return;

        // Filtrar: só incluir campanhas cujo resultado real é lead ou conversa
        const actions = insight.actions || [];
        const hasLeadResult = actions.some(a =>
            leadActionTypes.includes(a.action_type) && parseInt(a.value || 0) > 0
        );
        if (!hasLeadResult) return;

        // Determinar tipo de conversão baseado nas actions reais
        const hasMessageResult = actions.some(a =>
            messageActionTypes.includes(a.action_type) && parseInt(a.value || 0) > 0
        );
        const convType = hasMessageResult ? 'message' : 'form';
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
        const onsite = actions.find(a => a.action_type === 'onsite_conversion.lead_grouped');
        const pixel = actions.find(a => a.action_type === 'offsite_conversion.fb_pixel_lead');

        if (onsite || pixel) {
            return (onsite ? parseInt(onsite.value || 0) : 0)
                 + (pixel ? parseInt(pixel.value || 0) : 0);
        }

        const leadAgg = actions.find(a => a.action_type === 'lead');
        return leadAgg ? parseInt(leadAgg.value || 0) : 0;
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
function buildGoogleChatCard(clientName, data, previousData, periodLabel, periodType, clientId, includePdfLink, cplTargets) {
    const { summary, campaigns } = data;
    const prev = previousData ? previousData.summary : null;

    const fmtCurrency = (v) => `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const fmtNumber = (v) => v.toLocaleString('pt-BR');

    const periodNames = {
        yesterday: 'Dia anterior',
        last_7d: 'Ultimos 7 dias',
        last_14d: 'Ultimos 14 dias',
        last_30d: 'Ultimos 30 dias',
        this_week: 'Semana corrente',
        this_month: 'Mes corrente'
    };

    // --- Variacoes ---
    const spendVar = prev ? calcVariation(summary.spend, prev.spend) : null;
    const leadsVar = prev ? calcVariation(summary.leads, prev.leads) : null;
    const cplVar = prev ? calcVariation(summary.cpl, prev.cpl) : null;
    const impressionsVar = prev ? calcVariation(summary.impressions, prev.impressions) : null;

    // --- CPL classification ---
    const cplClass = classifyCpl(summary.cpl, cplTargets);
    const cplValueText = summary.cpl > 0
        ? `<b>${fmtCurrency(summary.cpl)}</b>${cplClass ? ` ${cplClass.emoji}` : ''}`
        : `<b>—</b>`;

    const metricWidgets = [
        {
            decoratedText: {
                topLabel: "INVESTIMENTO",
                text: `💰 <b>${fmtCurrency(summary.spend)}</b>`,
                bottomLabel: formatVariation(spendVar, 'spend') || (prev ? '→ estavel' : '')
            }
        },
        {
            decoratedText: {
                topLabel: "LEADS",
                text: `👥 <b>${fmtNumber(summary.leads)}</b>`,
                bottomLabel: formatVariation(leadsVar, 'leads') || (prev ? '→ estavel' : '')
            }
        },
        {
            decoratedText: {
                topLabel: "CUSTO POR LEAD",
                text: `📊 ${cplValueText}`,
                bottomLabel: formatVariation(cplVar, 'cpl') || (prev && summary.cpl > 0 ? '→ estavel' : '')
            }
        },
        {
            decoratedText: {
                topLabel: "IMPRESSOES",
                text: `👁 <b>${fmtNumber(summary.impressions)}</b>`,
                bottomLabel: formatVariation(impressionsVar, 'impressions') || (prev ? '→ estavel' : '')
            }
        }
    ];

    const sections = [
        { widgets: metricWidgets }
    ];

    // --- Secao: Botoes ---
    const dashUrl = process.env.URL || "https://dashboardmilo.netlify.app";
    const buttons = [{
        text: "📈 Abrir Dashboard",
        onClick: { openLink: { url: dashUrl } }
    }];

    if (includePdfLink && clientId) {
        buttons.push({
            text: "📄 Gerar Relatorio PDF",
            onClick: { openLink: { url: `${dashUrl}?autoReport=${encodeURIComponent(clientId)}&period=${periodType}` } }
        });
    }

    sections.push({
        widgets: [{ buttonList: { buttons } }]
    });

    return {
        cardsV2: [{
            cardId: `report_${Date.now()}`,
            card: {
                header: {
                    title: `📊 ${clientName}`,
                    subtitle: `Relatorio · ${periodNames[periodType] || periodType} · ${periodLabel}`
                },
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
