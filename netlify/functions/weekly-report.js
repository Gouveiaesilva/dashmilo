// Netlify Scheduled Function — roda a cada hora e verifica agendamentos
// NAO pode ser chamada via HTTP (limitacao do Netlify scheduled functions)
// Para envio manual, usar send-report.js

const { getStore } = require("@netlify/blobs");

const META_API_VERSION = 'v24.0';
const META_API_BASE = `https://graph.facebook.com/${META_API_VERSION}`;

// Schedule inline (redundante com netlify.toml, mas garante registro)
exports.schedule = "@hourly";

exports.handler = async (event, context) => {
    const accessToken = process.env.META_ACCESS_TOKEN;
    if (!accessToken) {
        console.log('weekly-report: META_ACCESS_TOKEN nao configurado');
        return;
    }

    try {
        const store = getClientStore();
        const clients = await store.get("clients_list", { type: "json" }) || [];

        // Hora atual em BRT (UTC-3)
        const now = new Date();
        const brt = new Date(now.getTime() - 3 * 60 * 60 * 1000);
        const currentHour = String(brt.getUTCHours()).padStart(2, '0');
        const dayMap = { 0: 'dom', 1: 'mon', 2: 'tue', 3: 'wed', 4: 'thu', 5: 'fri', 6: 'sat' };
        const currentDay = dayMap[brt.getUTCDay()];

        console.log(`weekly-report: checking schedules at ${currentHour}:00 BRT, day=${currentDay}`);

        let sentCount = 0;

        for (const client of clients) {
            if (!client.googleChatWebhook || !client.reportSchedules) continue;

            for (const schedule of client.reportSchedules) {
                if (!schedule.enabled) continue;
                if (!schedule.days || !schedule.days.includes(currentDay)) continue;

                const schedHour = (schedule.time || '08:00').split(':')[0];
                if (schedHour !== currentHour) continue;

                try {
                    const { since, until, label } = getPeriodDates(schedule.period || 'yesterday');
                    const prev = getPreviousPeriodDates(schedule.period || 'yesterday', since, until);
                    const [data, previousData] = await Promise.all([
                        fetchInsightsData(client.adAccountId, since, until, accessToken),
                        fetchInsightsData(client.adAccountId, prev.since, prev.until, accessToken)
                    ]);
                    const card = buildGoogleChatCard(client.name, data, previousData, label, schedule.period, client.id, schedule.includePdfLink, client.cplTargets);

                    await sendToGoogleChat(client.googleChatWebhook, card);
                    sentCount++;
                    console.log(`weekly-report: sent to ${client.name} (${schedule.period})`);
                } catch (err) {
                    console.error(`weekly-report: error for ${client.name}:`, err.message);
                }
            }
        }

        console.log(`weekly-report: done, sent ${sentCount} reports`);
    } catch (error) {
        console.error('weekly-report error:', error);
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

    const isCpl = metric === 'cpl';
    const isSpend = metric === 'spend';

    if (variation.direction === 'neutral') return `→ estavel`;

    if (variation.direction === 'up') {
        if (isCpl) return `↗ +${pctStr}% ⚠`;
        if (isSpend) return `↗ +${pctStr}%`;
        return `↗ +${pctStr}% ✅`;
    }
    if (isCpl) return `↘ -${pctStr}% ✅`;
    if (isSpend) return `↘ -${pctStr}%`;
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
        ? `<b>${fmtCurrency(summary.cpl)}</b>${cplClass ? ` ${cplClass.emoji} ${cplClass.label}` : ''}`
        : `<b>—</b>`;

    // --- Secao: Resumo do Periodo ---
    const metricWidgets = [
        {
            decoratedText: {
                topLabel: "💰 Investimento",
                text: `<b>${fmtCurrency(summary.spend)}</b>`,
                bottomLabel: formatVariation(spendVar, 'spend') || (prev ? '→ estavel' : '')
            }
        },
        {
            decoratedText: {
                topLabel: "👥 Leads",
                text: `<b>${fmtNumber(summary.leads)}</b>`,
                bottomLabel: formatVariation(leadsVar, 'leads') || (prev ? '→ estavel' : '')
            }
        },
        {
            decoratedText: {
                topLabel: "📊 Custo por Lead",
                text: cplValueText,
                bottomLabel: formatVariation(cplVar, 'cpl') || (prev && summary.cpl > 0 ? '→ estavel' : '')
            }
        },
        {
            decoratedText: {
                topLabel: "👁 Impressoes",
                text: `<b>${fmtNumber(summary.impressions)}</b>`,
                bottomLabel: formatVariation(impressionsVar, 'impressions') || (prev ? '→ estavel' : '')
            }
        }
    ];

    const sections = [
        { header: `Resumo — ${periodNames[periodType] || periodType}`, widgets: metricWidgets }
    ];

    // --- Secao: Status do CPL (se cplTargets configurado) ---
    if (cplTargets && summary.cpl > 0) {
        const cplStatusWidgets = [];

        if (cplClass) {
            const limitLabel = cplClass.label === 'Critico'
                ? `acima de ${fmtCurrency(cplTargets.warning)}`
                : cplClass.label === 'Excelente'
                    ? `abaixo de ${fmtCurrency(cplTargets.excellent)}`
                    : cplClass.label === 'Saudavel'
                        ? `ate ${fmtCurrency(cplTargets.healthy)}`
                        : `ate ${fmtCurrency(cplTargets.warning)}`;

            cplStatusWidgets.push({
                decoratedText: {
                    startIcon: { materialIcon: { name: cplClass.icon } },
                    text: `${cplClass.emoji} CPL em faixa <b>${cplClass.label.toUpperCase()}</b> (${limitLabel})`
                }
            });
        }

        cplStatusWidgets.push({
            decoratedText: {
                text: `🟢 ≤${fmtCurrency(cplTargets.excellent)}  🔵 ≤${fmtCurrency(cplTargets.healthy)}  🟡 ≤${fmtCurrency(cplTargets.warning)}  🔴 acima`
            }
        });

        sections.push({ header: "Status do CPL", widgets: cplStatusWidgets });
    }

    // --- Secao: Top Campanhas ---
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
                    text: `✅ Melhor: ${truncate(best.name, 35)} — CPL ${fmtCurrency(best.cpl)}`
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
                    ? `⚠ ${truncate(worst.name, 30)} gastou ${fmtCurrency(worst.spend)} sem leads`
                    : `⚠ ${truncate(worst.name, 30)} — CPL alto: ${fmtCurrency(worst.cpl)}`;
                highlightWidgets.push({
                    decoratedText: {
                        startIcon: { materialIcon: { name: "warning" } },
                        text: worstMsg
                    }
                });
            }
        }
    }

    if (highlightWidgets.length > 0) {
        sections.push({ header: "Top Campanhas", widgets: highlightWidgets });
    }

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
