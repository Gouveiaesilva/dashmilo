// Netlify Scheduled Function para envio automatico de relatorios via Google Chat
// Roda a cada hora e verifica quais clientes precisam de envio

const { getStore } = require("@netlify/blobs");

const META_API_VERSION = 'v24.0';
const META_API_BASE = `https://graph.facebook.com/${META_API_VERSION}`;

// Schedule: roda a cada hora
exports.schedule = "@hourly";

exports.handler = async (event, context) => {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Content-Type': 'application/json'
    };

    // Preflight
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    const accessToken = process.env.META_ACCESS_TOKEN;
    if (!accessToken) {
        return { statusCode: 500, headers, body: JSON.stringify({ error: 'META_ACCESS_TOKEN nao configurado' }) };
    }

    try {
        const params = event.queryStringParameters || {};

        // Chamada manual: enviar para um cliente especifico
        if (params.clientId) {
            const result = await handleManualSend(params.clientId, params.period || 'yesterday', accessToken);
            return { statusCode: 200, headers, body: JSON.stringify(result) };
        }

        // Chamada agendada (cron): verificar todos os clientes
        const result = await handleScheduledSend(accessToken);
        return { statusCode: 200, headers, body: JSON.stringify(result) };

    } catch (error) {
        console.error('weekly-report error:', error);
        return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) };
    }
};

// ==========================================
// ENVIO MANUAL (chamada via GET com clientId)
// ==========================================
async function handleManualSend(clientId, period, accessToken) {
    const store = getClientStore();
    const clients = await store.get("clients_list", { type: "json" }) || [];
    const client = clients.find(c => c.id === clientId);

    if (!client) return { success: false, error: 'Cliente nao encontrado' };
    if (!client.googleChatWebhook) return { success: false, error: 'Cliente nao possui webhook' };

    const { since, until, label } = getPeriodDates(period);
    const data = await fetchInsightsData(client.adAccountId, since, until, accessToken);
    const card = buildGoogleChatCard(client.name, data, label, period);

    await sendToGoogleChat(client.googleChatWebhook, card);
    return { success: true, message: `Relatorio enviado para ${client.name}` };
}

// ==========================================
// ENVIO AGENDADO (cron hourly)
// ==========================================
async function handleScheduledSend(accessToken) {
    const store = getClientStore();
    const clients = await store.get("clients_list", { type: "json" }) || [];

    // Hora atual em BRT (UTC-3)
    const now = new Date();
    const brt = new Date(now.getTime() - 3 * 60 * 60 * 1000);
    const currentHour = String(brt.getUTCHours()).padStart(2, '0');
    const currentMinute = '00'; // Cron roda no inicio da hora
    const currentTime = `${currentHour}:${currentMinute}`;

    const dayMap = { 0: 'dom', 1: 'mon', 2: 'tue', 3: 'wed', 4: 'thu', 5: 'fri', 6: 'sat' };
    const currentDay = dayMap[brt.getUTCDay()];

    const sent = [];
    const errors = [];

    for (const client of clients) {
        if (!client.googleChatWebhook || !client.reportSchedules) continue;

        for (const schedule of client.reportSchedules) {
            if (!schedule.enabled) continue;
            if (!schedule.days || !schedule.days.includes(currentDay)) continue;

            // Verificar horario (comparar apenas hora, ignorar minutos)
            const schedHour = (schedule.time || '08:00').split(':')[0];
            if (schedHour !== currentHour) continue;

            try {
                const { since, until, label } = getPeriodDates(schedule.period || 'yesterday');
                const data = await fetchInsightsData(client.adAccountId, since, until, accessToken);
                const card = buildGoogleChatCard(client.name, data, label, schedule.period);

                // Adicionar link do dashboard se includePdfLink
                if (schedule.includePdfLink) {
                    addDashboardLink(card);
                }

                await sendToGoogleChat(client.googleChatWebhook, card);
                sent.push({ client: client.name, period: schedule.period });
            } catch (err) {
                errors.push({ client: client.name, error: err.message });
            }
        }
    }

    return { success: true, sent, errors, checkedAt: currentTime, day: currentDay };
}

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
    // Ajustar para BRT
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
            // Segunda-feira da semana atual ate hoje
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
            // Fallback: yesterday
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

    // 1. Buscar campanhas de leads/mensagens
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

    // 2. Buscar insights agregados
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

    // Widgets de metricas
    const metricWidgets = [
        {
            decoratedText: {
                topLabel: "Investimento",
                text: `<b>${fmtCurrency(summary.spend)}</b>`
            }
        },
        {
            decoratedText: {
                topLabel: "Leads",
                text: `<b>${fmtNumber(summary.leads)}</b>`
            }
        },
        {
            decoratedText: {
                topLabel: "CPL",
                text: `<b>${fmtCurrency(summary.cpl)}</b>`
            }
        },
        {
            decoratedText: {
                topLabel: "Impressoes",
                text: `<b>${fmtNumber(summary.impressions)}</b>`
            }
        }
    ];

    // Widgets de destaques (top campanhas)
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

        // Campanha com pior performance
        const worst = campaigns.filter(c => c.spend > 10).reduce((a, b) => {
            if (a.leads === 0 && b.leads === 0) return a.spend > b.spend ? a : b;
            if (a.leads === 0) return a;
            if (b.leads === 0) return b;
            return a.cpl > b.cpl ? a : b;
        }, campaigns[0]);

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

    // Periodo legivel
    const periodNames = {
        yesterday: 'Dia anterior',
        last_7d: 'Ultimos 7 dias',
        last_14d: 'Ultimos 14 dias',
        last_30d: 'Ultimos 30 dias',
        this_week: 'Semana corrente',
        this_month: 'Mes corrente'
    };

    const sections = [
        {
            header: `Metricas — ${periodNames[periodType] || periodType}`,
            widgets: metricWidgets
        }
    ];

    if (highlightWidgets.length > 0) {
        sections.push({
            header: "Destaques",
            widgets: highlightWidgets
        });
    }

    // Botao abrir dashboard
    sections.push({
        widgets: [{
            buttonList: {
                buttons: [{
                    text: "Abrir Dashboard",
                    onClick: {
                        openLink: {
                            url: process.env.URL || "https://dashboardmilo.netlify.app"
                        }
                    }
                }]
            }
        }]
    });

    return {
        cardsV2: [{
            cardId: `report_${Date.now()}`,
            card: {
                header: {
                    title: `📊 ${clientName}`,
                    subtitle: periodLabel
                },
                sections
            }
        }]
    };
}

function addDashboardLink(card) {
    const dashUrl = process.env.URL || "https://dashboardmilo.netlify.app";
    const sections = card.cardsV2[0].card.sections;
    // Adicionar botao para relatorio PDF
    const lastSection = sections[sections.length - 1];
    if (lastSection.widgets && lastSection.widgets[0] && lastSection.widgets[0].buttonList) {
        lastSection.widgets[0].buttonList.buttons.push({
            text: "Ver Relatorio PDF",
            onClick: {
                openLink: {
                    url: `${dashUrl}?tab=relatorios`
                }
            }
        });
    }
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
