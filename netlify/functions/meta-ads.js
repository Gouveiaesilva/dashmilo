// Netlify Function para buscar dados da Meta Ads API
// Foco: Campanhas de Leads (formulário nativo + mensagens iniciadas)

const META_API_VERSION = 'v24.0';
const META_API_BASE = `https://graph.facebook.com/${META_API_VERSION}`;

exports.handler = async (event, context) => {
    // Headers CORS
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Content-Type': 'application/json'
    };

    // Responder preflight requests
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    // Verificar se o token está configurado
    const accessToken = process.env.META_ACCESS_TOKEN;
    if (!accessToken) {
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({
                error: 'Token não configurado',
                message: 'Configure a variável de ambiente META_ACCESS_TOKEN no Netlify'
            })
        };
    }

    try {
        const params = event.queryStringParameters || {};
        const { adAccountId, action, campaignId, adsetId, datePreset, timeRange } = params;

        if (!adAccountId && !['account-status', 'facebook-pages', 'search-interests'].includes(action)) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({
                    error: 'Parâmetro obrigatório ausente',
                    message: 'O parâmetro adAccountId é obrigatório'
                })
            };
        }

        const formattedAccountId = adAccountId
            ? (adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`)
            : null;

        let result;

        // Roteamento por ação
        switch (action) {
            case 'campaigns':
                // Buscar campanhas da conta que tiveram veiculação no período
                result = await fetchCampaignsWithInsights(formattedAccountId, accessToken, params);
                break;

            case 'adsets':
                // Buscar conjuntos de uma campanha que tiveram veiculação no período
                if (!campaignId) {
                    return {
                        statusCode: 400,
                        headers,
                        body: JSON.stringify({ error: 'campaignId é obrigatório para buscar conjuntos' })
                    };
                }
                result = await fetchAdsetsWithInsights(campaignId, accessToken, params);
                break;

            case 'ads':
                // Buscar anúncios de um conjunto
                if (!adsetId) {
                    return {
                        statusCode: 400,
                        headers,
                        body: JSON.stringify({ error: 'adsetId é obrigatório para buscar anúncios' })
                    };
                }
                result = await fetchAds(adsetId, accessToken);
                break;

            case 'account-status':
                // Buscar status e saldo de múltiplas contas
                result = await fetchAccountStatuses(params, accessToken);
                break;

            case 'debug':
                // Debug: retorna todas as actions para análise
                result = await fetchDebugActions(formattedAccountId, accessToken, params);
                break;

            case 'raw-campaigns':
                // Diagnóstico: listar todas as campanhas sem filtro de objetivo
                const rawUrl = `${META_API_BASE}/${formattedAccountId}/campaigns?fields=id,name,objective,status,effective_status&access_token=${accessToken}&limit=500`;
                const rawResp = await fetch(rawUrl);
                const rawResult = await rawResp.json();
                result = { campaigns: (rawResult.data || []).map(c => ({ id: c.id, name: c.name, objective: c.objective, status: c.effective_status })) };
                break;

            case 'ad-creatives':
                // Buscar criativos com métricas de performance + vídeo
                result = await fetchAdCreatives(formattedAccountId, accessToken, params);
                break;

            case 'campaign-analysis':
                // Análise de campanhas com métricas detalhadas
                result = await fetchCampaignAnalysis(formattedAccountId, accessToken, params);
                break;

            case 'macro-analysis': {
                // Análise macro: busca todos os dados brutos para análise completa da conta
                result = await fetchMacroAnalysis(formattedAccountId, accessToken, params);
                break;
            }

            case 'ad-daily': {
                // Buscar insights diários de um anúncio específico
                const { adId: targetAdId } = params;
                if (!targetAdId) {
                    return { statusCode: 400, headers, body: JSON.stringify({ error: 'adId é obrigatório' }) };
                }
                result = await fetchAdDailyInsights(formattedAccountId, targetAdId, accessToken, params);
                break;
            }

            case 'facebook-pages': {
                // Listar páginas do Facebook vinculadas ao token
                result = await fetchFacebookPages(accessToken);
                break;
            }

            case 'search-interests': {
                // Buscar interesses para targeting
                const { q } = params;
                if (!q) {
                    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Parâmetro q é obrigatório' }) };
                }
                result = await searchTargetingInterests(q, accessToken);
                break;
            }

            case 'leadgen-forms': {
                // Buscar formulários de lead ativos da conta
                result = await fetchLeadgenForms(formattedAccountId, accessToken);
                break;
            }

            default:
                // Buscar insights (comportamento padrão)
                result = await fetchInsights(formattedAccountId, accessToken, params);
                // Buscar currency da conta para formatação no frontend
                try {
                    const currResp = await fetch(`${META_API_BASE}/${formattedAccountId}?fields=currency&access_token=${accessToken}`);
                    const currData = await currResp.json();
                    result.currency = currData.currency || 'BRL';
                } catch (e) {
                    result.currency = 'BRL';
                }
                break;
        }

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                success: true,
                accountId: formattedAccountId,
                ...result
            })
        };

    } catch (error) {
        console.error('Function error:', error);
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

// ==========================================
// BUSCAR CAMPANHAS (função base - todas)
// ==========================================
async function fetchCampaigns(accountId, accessToken) {
    // Incluir campanhas em qualquer status (ativas, pausadas, arquivadas) para capturar todas que tiveram veiculação no período
    const statusFilter = encodeURIComponent(JSON.stringify([{
        field: 'effective_status',
        operator: 'IN',
        value: ['ACTIVE', 'PAUSED', 'ARCHIVED']
    }]));
    const url = `${META_API_BASE}/${accountId}/campaigns?fields=id,name,objective,status,effective_status&filtering=${statusFilter}&access_token=${accessToken}&limit=500`;

    const response = await fetch(url);
    const result = await response.json();

    if (result.error) {
        throw new Error(result.error.message);
    }

    // Filtrar campanhas cujo resultado seja leads ou conversas iniciadas
    const leadObjectives = [
        'OUTCOME_LEADS',
        'LEAD_GENERATION',
        'OUTCOME_ENGAGEMENT',
        'OUTCOME_SALES',
        'MESSAGES'
    ];

    const campaigns = (result.data || [])
        .filter(c => leadObjectives.includes(c.objective))
        .map(c => ({
            id: c.id,
            name: c.name,
            objective: c.objective,
            status: c.effective_status || c.status,
            // Definir tipo de conversão esperada baseado no objetivo
            conversionType: getConversionType(c.objective)
        }));

    return { campaigns };
}

// ==========================================
// BUSCAR CAMPANHAS COM VEICULAÇÃO NO PERÍODO
// ==========================================
async function fetchCampaignsWithInsights(accountId, accessToken, params) {
    const { datePreset, timeRange } = params;

    // Primeiro buscar todas as campanhas de leads/mensagens
    const allCampaignsResult = await fetchCampaigns(accountId, accessToken);
    const allCampaigns = allCampaignsResult.campaigns;

    if (allCampaigns.length === 0) {
        return { campaigns: [] };
    }

    // Buscar insights de todas as campanhas no período COM ACTIONS
    const campaignIds = allCampaigns.map(c => c.id);

    const filtering = JSON.stringify([{
        field: 'campaign.id',
        operator: 'IN',
        value: campaignIds
    }]);

    let url = `${META_API_BASE}/${accountId}/insights?fields=campaign_id,spend,actions&filtering=${encodeURIComponent(filtering)}&access_token=${accessToken}&level=campaign&limit=500`;

    // Adicionar período
    if (timeRange) {
        url += `&time_range=${encodeURIComponent(timeRange)}`;
    } else {
        url += `&date_preset=${datePreset || 'last_30d'}`;
    }

    const response = await fetch(url);
    const result = await response.json();

    if (result.error) {
        throw new Error(result.error.message);
    }

    // Criar mapa de campanhas com gasto e actions no período
    const campaignInsightsMap = new Map();
    (result.data || []).forEach(insight => {
        campaignInsightsMap.set(insight.campaign_id, {
            spend: parseFloat(insight.spend || 0),
            actions: insight.actions || []
        });
    });

    // Tipos de resultado que contam como lead/conversa
    const leadActionTypes = [
        'onsite_conversion.lead_grouped',           // lead formulário nativo
        'offsite_conversion.fb_pixel_lead',          // lead no site via pixel
        'lead',                                      // lead agregado
        'onsite_conversion.messaging_conversation_started_7d',  // conversa iniciada
        'messaging_conversation_started_7d'          // variante
    ];

    // Objetivos que são intrinsecamente de leads/mensagens (sempre incluir se tiveram gasto)
    const alwaysIncludeObjectives = ['OUTCOME_LEADS', 'LEAD_GENERATION', 'MESSAGES'];

    // Incluir campanhas com gasto > 0:
    // - LEADS/MESSAGES: sempre (mesmo sem resultados, o gasto é relevante)
    // - ENGAGEMENT/SALES: apenas se geraram resultado de lead/conversa nas actions
    const campaignsWithInsights = allCampaigns.filter(campaign => {
        const insightData = campaignInsightsMap.get(campaign.id);
        if (!insightData || insightData.spend <= 0) return false;

        // Campanhas de leads/mensagens: sempre incluir
        if (alwaysIncludeObjectives.includes(campaign.objective)) return true;

        // Campanhas de engagement/sales: filtrar por resultado real
        const actions = insightData.actions || [];
        const hasLeadResult = actions.some(a =>
            leadActionTypes.includes(a.action_type) && parseInt(a.value || 0) > 0
        );
        return hasLeadResult;
    });

    return { campaigns: campaignsWithInsights };
}

// ==========================================
// DETERMINAR TIPO DE CONVERSÃO PELO OBJETIVO
// ==========================================
function getConversionType(objective) {
    // Campanhas de leads (formulário)
    if (objective === 'OUTCOME_LEADS' || objective === 'LEAD_GENERATION') {
        return 'form'; // Contar apenas preenchimentos de formulário
    }
    // Campanhas de mensagens/engajamento/vendas via WhatsApp
    if (objective === 'OUTCOME_ENGAGEMENT' || objective === 'MESSAGES' || objective === 'OUTCOME_SALES') {
        return 'message'; // Contar apenas conversas iniciadas
    }
    return 'form'; // Padrão
}

// ==========================================
// BUSCAR CONJUNTOS DE ANÚNCIOS (função base - todos)
// ==========================================
async function fetchAdsets(campaignId, accessToken) {
    // Incluir conjuntos em qualquer status para capturar todos que tiveram veiculação no período
    const statusFilter = encodeURIComponent(JSON.stringify([{
        field: 'effective_status',
        operator: 'IN',
        value: ['ACTIVE', 'PAUSED', 'ARCHIVED', 'CAMPAIGN_PAUSED']
    }]));
    const url = `${META_API_BASE}/${campaignId}/adsets?fields=id,name,status,effective_status&filtering=${statusFilter}&access_token=${accessToken}&limit=500`;

    const response = await fetch(url);
    const result = await response.json();

    if (result.error) {
        throw new Error(result.error.message);
    }

    const adsets = (result.data || []).map(a => ({
        id: a.id,
        name: a.name,
        status: a.effective_status || a.status
    }));

    return { adsets };
}

// ==========================================
// BUSCAR CONJUNTOS COM VEICULAÇÃO NO PERÍODO
// ==========================================
async function fetchAdsetsWithInsights(campaignId, accessToken, params) {
    const { adAccountId, datePreset, timeRange } = params;

    // Primeiro buscar todos os conjuntos da campanha
    const allAdsetsResult = await fetchAdsets(campaignId, accessToken);
    const allAdsets = allAdsetsResult.adsets;

    if (allAdsets.length === 0) {
        return { adsets: [] };
    }

    // Formatar account ID
    const formattedAccountId = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`;

    // Buscar insights de todos os conjuntos no período
    const adsetIds = allAdsets.map(a => a.id);

    const filtering = JSON.stringify([{
        field: 'adset.id',
        operator: 'IN',
        value: adsetIds
    }]);

    let url = `${META_API_BASE}/${formattedAccountId}/insights?fields=adset_id,impressions&filtering=${encodeURIComponent(filtering)}&access_token=${accessToken}&level=adset&limit=500`;

    // Adicionar período
    if (timeRange) {
        url += `&time_range=${encodeURIComponent(timeRange)}`;
    } else {
        url += `&date_preset=${datePreset || 'last_30d'}`;
    }

    const response = await fetch(url);
    const result = await response.json();

    if (result.error) {
        throw new Error(result.error.message);
    }

    // Identificar conjuntos que tiveram impressões > 0 no período
    const adsetsWithImpressionsSet = new Set();
    (result.data || []).forEach(insight => {
        const impressions = parseInt(insight.impressions || 0);
        if (impressions > 0) {
            adsetsWithImpressionsSet.add(insight.adset_id);
        }
    });

    // Filtrar apenas conjuntos que tiveram veiculação
    const adsetsWithInsights = allAdsets.filter(a => adsetsWithImpressionsSet.has(a.id));

    return { adsets: adsetsWithInsights };
}

// ==========================================
// BUSCAR ANÚNCIOS
// ==========================================
async function fetchAds(adsetId, accessToken) {
    const statusFilter = encodeURIComponent(JSON.stringify([{
        field: 'effective_status',
        operator: 'IN',
        value: ['ACTIVE', 'PAUSED', 'ARCHIVED', 'CAMPAIGN_PAUSED', 'ADSET_PAUSED']
    }]));
    const url = `${META_API_BASE}/${adsetId}/ads?fields=id,name,status,effective_status&filtering=${statusFilter}&access_token=${accessToken}&limit=500`;

    const response = await fetch(url);
    const result = await response.json();

    if (result.error) {
        throw new Error(result.error.message);
    }

    const ads = (result.data || []).map(a => ({
        id: a.id,
        name: a.name,
        status: a.effective_status || a.status
    }));

    return { ads };
}

// ==========================================
// BUSCAR INSIGHTS
// ==========================================
async function fetchInsights(accountId, accessToken, params) {
    const { campaignId, adsetId, adId, datePreset, timeRange } = params;

    // Buscar campanhas válidas (leads + mensagens com conversões)
    // Usa a mesma lógica de filtro que fetchCampaignsWithInsights
    const campaignsResult = await fetchCampaignsWithInsights(accountId, accessToken, params);
    const leadCampaigns = campaignsResult.campaigns;

    if (leadCampaigns.length === 0) {
        return {
            data: {
                summary: { spend: 0, impressions: 0, clicks: 0, leads: 0, cpl: 0 },
                daily: [],
                trends: { spend: 0, impressions: 0, leads: 0, cpl: 0 },
                campaigns: []
            }
        };
    }

    // Determinar IDs para filtrar
    let filterIds = [];
    let filterField = 'campaign.id';
    let level = 'campaign';

    if (adId) {
        filterIds = [adId];
        filterField = 'ad.id';
        level = 'ad';
    } else if (adsetId) {
        filterIds = [adsetId];
        filterField = 'adset.id';
        level = 'adset';
    } else if (campaignId) {
        filterIds = [campaignId];
        filterField = 'campaign.id';
        level = 'campaign';
    } else {
        // Todas as campanhas de leads
        filterIds = leadCampaigns.map(c => c.id);
        filterField = 'campaign.id';
        level = 'campaign';
    }

    // Campos para buscar
    const fields = [
        'campaign_id',
        'campaign_name',
        'adset_id',
        'adset_name',
        'ad_id',
        'ad_name',
        'spend',
        'impressions',
        'clicks',
        'reach',
        'actions',
        'cost_per_action_type'
    ].join(',');

    // Montar filtro
    const filtering = JSON.stringify([{
        field: filterField,
        operator: 'IN',
        value: filterIds
    }]);

    // Criar mapa de campanhas com seus tipos de conversão
    const campaignConversionMap = new Map();
    leadCampaigns.forEach(c => {
        campaignConversionMap.set(c.id, c.conversionType);
    });

    // Montar parâmetros de período
    let periodParam = '';
    if (timeRange) {
        periodParam = `&time_range=${encodeURIComponent(timeRange)}`;
    } else {
        periodParam = `&date_preset=${datePreset || 'last_30d'}`;
    }

    // BUSCA 1: Totais agregados (sem time_increment) - para KPIs precisos
    const urlTotals = `${META_API_BASE}/${accountId}/insights?fields=${fields}&filtering=${encodeURIComponent(filtering)}&access_token=${accessToken}&level=${level}&limit=500${periodParam}`;

    const responseTotals = await fetch(urlTotals);
    const resultTotals = await responseTotals.json();

    if (resultTotals.error) {
        throw new Error(resultTotals.error.message);
    }

    // BUSCA 2: Dados diários (com time_increment=1) - para gráfico
    const urlDaily = `${META_API_BASE}/${accountId}/insights?fields=${fields}&filtering=${encodeURIComponent(filtering)}&access_token=${accessToken}&level=${level}&time_increment=1&limit=500${periodParam}`;

    const responseDaily = await fetch(urlDaily);
    const resultDaily = await responseDaily.json();

    if (resultDaily.error) {
        throw new Error(resultDaily.error.message);
    }

    const insightsTotals = resultTotals.data || [];
    const insightsDaily = resultDaily.data || [];

    const processedData = processInsightsDataV2(insightsTotals, insightsDaily, campaignConversionMap);

    return { data: processedData };
}

// ==========================================
// PROCESSAR DADOS DOS INSIGHTS (V2 - Totais + Diário separados)
// ==========================================
function processInsightsDataV2(insightsTotals, insightsDaily, campaignConversionMap = new Map()) {
    // Processar TOTAIS AGREGADOS (para KPIs precisos)
    let totalSpend = 0;
    let totalImpressions = 0;
    let totalClicks = 0;
    let totalLeads = 0;
    const campaignMap = new Map();

    insightsTotals.forEach(insight => {
        const impressions = parseInt(insight.impressions || 0);
        if (impressions === 0) return;

        const campaignId = insight.campaign_id;
        const campaignName = insight.campaign_name;
        const spend = parseFloat(insight.spend || 0);
        const clicks = parseInt(insight.clicks || 0);
        const conversionType = campaignConversionMap.get(campaignId) || 'form';
        const leads = countLeads(insight.actions, conversionType);

        totalSpend += spend;
        totalImpressions += impressions;
        totalClicks += clicks;
        totalLeads += leads;

        // Agrupar por campanha
        if (campaignId && !campaignMap.has(campaignId)) {
            campaignMap.set(campaignId, {
                id: campaignId,
                name: campaignName,
                spend: 0,
                impressions: 0,
                leads: 0,
                conversionType: conversionType
            });
        }
        if (campaignId) {
            const campaignData = campaignMap.get(campaignId);
            campaignData.spend += spend;
            campaignData.impressions += impressions;
            campaignData.leads += leads;
        }
    });

    // Processar DADOS DIÁRIOS (para gráfico)
    const dailyMap = new Map();

    insightsDaily.forEach(insight => {
        const impressions = parseInt(insight.impressions || 0);
        if (impressions === 0) return;

        const date = insight.date_start;
        const campaignId = insight.campaign_id;
        const spend = parseFloat(insight.spend || 0);
        const clicks = parseInt(insight.clicks || 0);
        const conversionType = campaignConversionMap.get(campaignId) || 'form';
        const leads = countLeads(insight.actions, conversionType);

        if (!dailyMap.has(date)) {
            dailyMap.set(date, { date, spend: 0, impressions: 0, clicks: 0, leads: 0 });
        }
        const dayData = dailyMap.get(date);
        dayData.spend += spend;
        dayData.impressions += impressions;
        dayData.clicks += clicks;
        dayData.leads += leads;
    });

    const dailyData = Array.from(dailyMap.values())
        .sort((a, b) => new Date(a.date) - new Date(b.date))
        .map(day => ({
            ...day,
            cpl: day.leads > 0 ? day.spend / day.leads : 0
        }));

    const campaignsData = Array.from(campaignMap.values())
        .map(campaign => ({
            ...campaign,
            cpl: campaign.leads > 0 ? campaign.spend / campaign.leads : 0
        }))
        .sort((a, b) => b.spend - a.spend);

    const totalCPL = totalLeads > 0 ? totalSpend / totalLeads : 0;
    const trends = calculateTrends(dailyData);

    return {
        summary: {
            spend: totalSpend,
            impressions: totalImpressions,
            clicks: totalClicks,
            leads: totalLeads,
            cpl: totalCPL
        },
        daily: dailyData,
        trends: trends,
        campaigns: campaignsData
    };
}

// ==========================================
// CONTAR LEADS PELO TIPO DE CONVERSÃO
// ==========================================
function countLeads(actions, conversionType = 'form') {
    if (!actions || !Array.isArray(actions)) return 0;

    const messageActionTypes = [
        'onsite_conversion.messaging_conversation_started_7d',
        'messaging_conversation_started_7d',
        'onsite_conversion.messaging_first_reply',
        'messaging_first_reply',
        'onsitemessaging_conversation_started_7d',
        'messaging_conversations_started'
    ];

    // Contar apenas o tipo de conversão correspondente ao objetivo da campanha
    if (conversionType === 'form') {
        // Campanhas de LEADS: contar formularios nativos + leads no site (pixel)
        const onsite = actions.find(a => a.action_type === 'onsite_conversion.lead_grouped');
        const pixel = actions.find(a => a.action_type === 'offsite_conversion.fb_pixel_lead');

        if (onsite || pixel) {
            return (onsite ? parseInt(onsite.value || 0) : 0)
                 + (pixel ? parseInt(pixel.value || 0) : 0);
        }

        const leadAgg = actions.find(a => a.action_type === 'lead');
        if (leadAgg && parseInt(leadAgg.value || 0) > 0) {
            return parseInt(leadAgg.value);
        }

        // Fallback: campanha de LEADS mas conversões reais são mensagens (ex: leads via WhatsApp)
        for (const actionType of messageActionTypes) {
            const msgAction = actions.find(a => a.action_type === actionType);
            if (msgAction) return parseInt(msgAction.value || 0);
        }

        return 0;
    }

    if (conversionType === 'message') {
        // Campanhas de MENSAGENS: contar conversas iniciadas
        for (const actionType of messageActionTypes) {
            const msgAction = actions.find(a => a.action_type === actionType);
            if (msgAction) {
                return parseInt(msgAction.value || 0);
            }
        }

        return 0;
    }

    return 0;
}

// ==========================================
// DEBUG: LISTAR TODAS AS ACTIONS
// ==========================================
async function fetchDebugActions(accountId, accessToken, params) {
    const { datePreset, timeRange } = params;

    // Buscar campanhas válidas (mesma lógica do dashboard)
    const campaignsResult = await fetchCampaignsWithInsights(accountId, accessToken, params);
    const campaigns = campaignsResult.campaigns;

    if (campaigns.length === 0) {
        return { debug: { message: 'Nenhuma campanha válida encontrada (leads ou mensagens com conversões)', campaigns: [] } };
    }

    const campaignIds = campaigns.map(c => c.id);

    const filtering = JSON.stringify([{
        field: 'campaign.id',
        operator: 'IN',
        value: campaignIds
    }]);

    // Buscar insights com actions
    let url = `${META_API_BASE}/${accountId}/insights?fields=campaign_id,campaign_name,actions&filtering=${encodeURIComponent(filtering)}&access_token=${accessToken}&level=campaign`;

    if (timeRange) {
        url += `&time_range=${encodeURIComponent(timeRange)}`;
    } else {
        url += `&date_preset=${datePreset || 'last_30d'}`;
    }

    const response = await fetch(url);
    const result = await response.json();

    if (result.error) {
        throw new Error(result.error.message);
    }

    // Extrair todas as actions únicas
    const allActions = new Map();
    const campaignDetails = [];

    (result.data || []).forEach(insight => {
        const campaignInfo = {
            id: insight.campaign_id,
            name: insight.campaign_name,
            objective: campaigns.find(c => c.id === insight.campaign_id)?.objective,
            actions: []
        };

        if (insight.actions && Array.isArray(insight.actions)) {
            insight.actions.forEach(action => {
                // Adicionar ao mapa global
                if (!allActions.has(action.action_type)) {
                    allActions.set(action.action_type, 0);
                }
                allActions.set(action.action_type, allActions.get(action.action_type) + parseInt(action.value || 0));

                // Adicionar aos detalhes da campanha
                campaignInfo.actions.push({
                    type: action.action_type,
                    value: parseInt(action.value || 0)
                });
            });
        }

        campaignDetails.push(campaignInfo);
    });

    // Converter mapa para array ordenado por valor
    const actionsSummary = Array.from(allActions.entries())
        .map(([type, value]) => ({ type, value }))
        .sort((a, b) => b.value - a.value);

    return {
        debug: {
            totalCampaigns: campaigns.length,
            actionsSummary,
            campaignDetails
        }
    };
}

// ==========================================
// BUSCAR STATUS DAS CONTAS (BATCH)
// ==========================================
async function fetchAccountStatuses(params, accessToken) {
    const { accountIds } = params;

    if (!accountIds) {
        throw new Error('O parâmetro accountIds é obrigatório');
    }

    const ids = accountIds.split(',').map(id => {
        const trimmed = id.trim();
        return trimmed.startsWith('act_') ? trimmed : `act_${trimmed}`;
    });

    const promises = ids.map(async (accountId) => {
        try {
            // Buscar dados da conta e campanhas ativas em paralelo
            const [accountRes, campaignsRes] = await Promise.all([
                fetch(`${META_API_BASE}/${accountId}?fields=account_status,balance,spend_cap,amount_spent,currency,disable_reason,name,is_prepay_account,funding_source_details&access_token=${accessToken}`),
                fetch(`${META_API_BASE}/${accountId}/campaigns?fields=effective_status&filtering=${encodeURIComponent(JSON.stringify([{ field: 'effective_status', operator: 'IN', value: ['ACTIVE'] }]))}&limit=1&access_token=${accessToken}`)
            ]);

            const accountData = await accountRes.json();
            const campaignsData = await campaignsRes.json();

            if (accountData.error) {
                return { accountId, error: true, message: accountData.error.message };
            }

            // Extrair saldo real do funding_source_details (mais preciso que balance)
            let fundingBalance = null;
            if (accountData.funding_source_details) {
                const fsd = accountData.funding_source_details;
                // display_string contém "Available Balance (R$897.21)" ou similar
                if (fsd.display_string) {
                    const match = fsd.display_string.match(/[\d.,]+/);
                    if (match) {
                        // Converter string formatada para centavos
                        const numStr = match[0].replace(/\./g, '').replace(',', '.');
                        fundingBalance = Math.round(parseFloat(numStr) * 100);
                    }
                }
                // Alguns retornam campo current_balance diretamente
                if (fsd.current_balance != null) {
                    fundingBalance = parseInt(fsd.current_balance);
                }
            }

            return {
                accountId,
                account_status: accountData.account_status,
                balance: accountData.balance,
                spend_cap: accountData.spend_cap,
                amount_spent: accountData.amount_spent,
                currency: accountData.currency || 'BRL',
                disable_reason: accountData.disable_reason,
                name: accountData.name,
                is_prepay_account: !!accountData.is_prepay_account,
                funding_balance: fundingBalance,
                hasActiveCampaigns: !!(campaignsData.data && campaignsData.data.length > 0),
                error: false
            };
        } catch (err) {
            return { accountId, error: true, message: err.message };
        }
    });

    const accounts = await Promise.all(promises);
    return { accounts };
}

// ==========================================
// CALCULAR TENDÊNCIAS
// ==========================================
function calculateTrends(dailyData) {
    if (dailyData.length < 2) {
        return { spend: 0, impressions: 0, leads: 0, cpl: 0 };
    }

    const midPoint = Math.floor(dailyData.length / 2);
    const firstHalf = dailyData.slice(0, midPoint);
    const secondHalf = dailyData.slice(midPoint);

    const calcTrend = (key) => {
        const firstSum = firstHalf.reduce((sum, d) => sum + (d[key] || 0), 0);
        const secondSum = secondHalf.reduce((sum, d) => sum + (d[key] || 0), 0);

        if (firstSum === 0) return secondSum > 0 ? 100 : 0;
        return parseFloat(((secondSum - firstSum) / firstSum * 100).toFixed(1));
    };

    return {
        spend: calcTrend('spend'),
        impressions: calcTrend('impressions'),
        leads: calcTrend('leads'),
        cpl: calcTrend('cpl')
    };
}

// ==========================================
// BUSCAR CRIATIVOS COM MÉTRICAS DE PERFORMANCE
// ==========================================
async function fetchAdCreatives(accountId, accessToken, params) {
    const { campaignId, adsetId, datePreset, timeRange } = params;
    const limit = parseInt(params.limit) || 10;
    const offset = parseInt(params.offset) || 0;

    // Buscar campanhas para mapear conversionType (em paralelo com insights)
    const campaignsPromise = fetchCampaigns(accountId, accessToken);

    // Passo 1: Buscar insights diretamente no nível de anúncio (leve, já filtrado pelo período)
    const insightFields = 'ad_id,ad_name,campaign_id,impressions,reach,inline_link_clicks,ctr,spend,actions';

    // Filtro por campanha ou adset
    const insightFilters = [];
    if (adsetId) {
        insightFilters.push({ field: 'adset.id', operator: 'IN', value: [adsetId] });
    } else if (campaignId) {
        insightFilters.push({ field: 'campaign.id', operator: 'IN', value: [campaignId] });
    }

    let periodParam = '';
    if (timeRange) {
        periodParam = `&time_range=${encodeURIComponent(timeRange)}`;
    } else {
        periodParam = `&date_preset=${datePreset || 'last_30d'}`;
    }

    const filterParam = insightFilters.length > 0
        ? `&filtering=${encodeURIComponent(JSON.stringify(insightFilters))}`
        : '';

    const insightsUrl = `${META_API_BASE}/${accountId}/insights?fields=${insightFields}&level=ad&limit=500${filterParam}${periodParam}&access_token=${accessToken}`;

    const insightsResponse = await fetch(insightsUrl);
    const insightsResult = await insightsResponse.json();

    if (insightsResult.error) {
        throw new Error(insightsResult.error.message);
    }

    const allInsights = insightsResult.data || [];
    if (allInsights.length === 0) {
        return { creatives: [], total: 0, hasMore: false };
    }

    // Ordenar por spend desc e paginar
    allInsights.sort((a, b) => parseFloat(b.spend || 0) - parseFloat(a.spend || 0));
    const total = allInsights.length;
    const insights = allInsights.slice(offset, offset + limit);
    const hasMore = (offset + limit) < total;

    // Aguardar campanhas
    const campaignsResult = await campaignsPromise;
    const campaignConversionMap = new Map();
    campaignsResult.campaigns.forEach(c => {
        campaignConversionMap.set(c.id, c.conversionType);
    });

    // Passo 2: Buscar detalhes apenas dos anúncios da página
    const adIds = insights.map(i => i.ad_id);
    const BATCH_SIZE = 50;
    const adsMap = new Map();

    const batches = [];
    for (let i = 0; i < adIds.length; i += BATCH_SIZE) {
        batches.push(adIds.slice(i, i + BATCH_SIZE));
    }

    await Promise.all(batches.map(async (batchIds) => {
        const adFiltering = JSON.stringify([{ field: 'id', operator: 'IN', value: batchIds }]);
        const url = `${META_API_BASE}/${accountId}/ads?fields=id,effective_status,created_time,creative{thumbnail_url,object_type}&filtering=${encodeURIComponent(adFiltering)}&access_token=${accessToken}&limit=100`;

        const response = await fetch(url);
        const result = await response.json();
        if (result.data) {
            result.data.forEach(ad => adsMap.set(ad.id, ad));
        }
    }));

    // Passo 3: Buscar métricas de vídeo apenas para anúncios com video_view nas actions
    const videoAdIds = insights
        .filter(i => getActionValue(i.actions, 'video_view') > 0)
        .map(i => i.ad_id);

    const videoMetricsMap = new Map();
    if (videoAdIds.length > 0) {
        const videoFields = 'ad_id,video_thruplay_watched_actions,video_p95_watched_actions,video_avg_time_watched_actions';
        const videoBatches = [];
        for (let i = 0; i < videoAdIds.length; i += BATCH_SIZE) {
            videoBatches.push(videoAdIds.slice(i, i + BATCH_SIZE));
        }

        await Promise.all(videoBatches.map(async (batchIds) => {
            const filtering = JSON.stringify([{ field: 'ad.id', operator: 'IN', value: batchIds }]);
            const url = `${META_API_BASE}/${accountId}/insights?fields=${videoFields}&filtering=${encodeURIComponent(filtering)}&level=ad&limit=500${periodParam}&access_token=${accessToken}`;

            const response = await fetch(url);
            const result = await response.json();
            if (result.data) {
                result.data.forEach(d => videoMetricsMap.set(d.ad_id, d));
            }
        }));
    }

    // Passo 4: Montar resultado final
    const creatives = insights.map(insight => {
        const adId = insight.ad_id;
        const adDetail = adsMap.get(adId) || {};
        const impressions = parseInt(insight.impressions || 0);
        const reach = parseInt(insight.reach || 0);
        const linkClicks = parseInt(insight.inline_link_clicks || 0);
        const ctr = parseFloat(insight.ctr || 0);
        const spend = parseFloat(insight.spend || 0);

        const conversionType = campaignConversionMap.get(insight.campaign_id) || 'form';
        const leads = countLeads(insight.actions, conversionType);
        const cpl = leads > 0 ? spend / leads : 0;

        const objectType = adDetail.creative?.object_type || '';
        const video3s = getActionValue(insight.actions, 'video_view');
        const isVideo = objectType === 'VIDEO' || video3s > 0;

        let videoMetrics = null;
        if (isVideo && impressions > 0) {
            const vData = videoMetricsMap.get(adId);
            const thruplay = vData ? getVideoActionValue(vData.video_thruplay_watched_actions) : 0;
            const p95 = vData ? getVideoActionValue(vData.video_p95_watched_actions) : 0;
            const avgWatchTime = vData ? getVideoAvgWatchTime(vData.video_avg_time_watched_actions) : 0;

            videoMetrics = {
                hookRate: parseFloat(((video3s / impressions) * 100).toFixed(2)),
                retention: parseFloat(((thruplay / impressions) * 100).toFixed(2)),
                holdRate: parseFloat(((p95 / impressions) * 100).toFixed(2)),
                avgWatchTime
            };
        }

        return {
            id: adId,
            name: insight.ad_name,
            status: adDetail.effective_status || 'UNKNOWN',
            createdTime: adDetail.created_time || null,
            thumbnailUrl: adDetail.creative?.thumbnail_url || null,
            objectType,
            isVideo,
            metrics: {
                impressions, reach, linkClicks,
                ctr: parseFloat(ctr.toFixed(2)),
                spend: parseFloat(spend.toFixed(2)),
                leads,
                cpl: parseFloat(cpl.toFixed(2))
            },
            videoMetrics
        };
    });
    // Já ordenados por spend via allInsights.sort acima

    return { creatives, total, hasMore };
}

// ==========================================
// ANÁLISE DE CAMPANHAS COM MÉTRICAS DETALHADAS
// ==========================================
async function fetchCampaignAnalysis(accountId, accessToken, params) {
    const { datePreset, timeRange } = params;

    // 1. Buscar campanhas válidas (já filtradas por objetivo)
    const campaignsResult = await fetchCampaignsWithInsights(accountId, accessToken, params);
    const campaigns = campaignsResult.campaigns;

    if (campaigns.length === 0) {
        return { campaigns: [] };
    }

    const campaignIds = campaigns.map(c => c.id);
    const campaignConversionMap = new Map();
    campaigns.forEach(c => campaignConversionMap.set(c.id, c.conversionType));

    // Período
    let periodParam = '';
    if (timeRange) {
        periodParam = `&time_range=${encodeURIComponent(timeRange)}`;
    } else {
        periodParam = `&date_preset=${datePreset || 'last_30d'}`;
    }

    // 2. Buscar insights agregados + created_time + contagem de ads ativos em paralelo
    const filtering = JSON.stringify([{ field: 'campaign.id', operator: 'IN', value: campaignIds }]);
    const insightFields = 'campaign_id,impressions,reach,spend,inline_link_clicks,ctr,actions';

    const [insightsRes, campaignDetailsRes, activeAdsRes] = await Promise.all([
        // Insights agregados
        fetch(`${META_API_BASE}/${accountId}/insights?fields=${insightFields}&filtering=${encodeURIComponent(filtering)}&level=campaign&limit=500${periodParam}&access_token=${accessToken}`),
        // Created time das campanhas
        fetch(`${META_API_BASE}/${accountId}/campaigns?fields=id,created_time&filtering=${encodeURIComponent(JSON.stringify([{ field: 'id', operator: 'IN', value: campaignIds }]))}&limit=500&access_token=${accessToken}`),
        // Ads ativos agrupados
        fetch(`${META_API_BASE}/${accountId}/ads?fields=campaign_id&filtering=${encodeURIComponent(JSON.stringify([{ field: 'effective_status', operator: 'IN', value: ['ACTIVE'] }, { field: 'campaign.id', operator: 'IN', value: campaignIds }]))}&limit=500&access_token=${accessToken}`)
    ]);

    const insightsData = await insightsRes.json();
    const campaignDetailsData = await campaignDetailsRes.json();
    const activeAdsData = await activeAdsRes.json();

    // Mapas
    const insightsMap = new Map();
    (insightsData.data || []).forEach(i => insightsMap.set(i.campaign_id, i));

    const createdTimeMap = new Map();
    (campaignDetailsData.data || []).forEach(c => createdTimeMap.set(c.id, c.created_time));

    const activeAdsCountMap = new Map();
    (activeAdsData.data || []).forEach(ad => {
        const cid = ad.campaign_id;
        activeAdsCountMap.set(cid, (activeAdsCountMap.get(cid) || 0) + 1);
    });

    // 3. Montar resultado
    const result = campaigns
        .filter(c => insightsMap.has(c.id))
        .map(campaign => {
            const insight = insightsMap.get(campaign.id);
            const impressions = parseInt(insight.impressions || 0);
            const reach = parseInt(insight.reach || 0);
            const linkClicks = parseInt(insight.inline_link_clicks || 0);
            const ctr = parseFloat(insight.ctr || 0);
            const spend = parseFloat(insight.spend || 0);
            const leads = countLeads(insight.actions, campaign.conversionType);
            const cpl = leads > 0 ? spend / leads : 0;

            return {
                id: campaign.id,
                name: campaign.name,
                objective: campaign.objective,
                status: campaign.status,
                conversionType: campaign.conversionType,
                createdTime: createdTimeMap.get(campaign.id) || null,
                activeAdsCount: activeAdsCountMap.get(campaign.id) || 0,
                metrics: {
                    impressions, reach, linkClicks,
                    ctr: parseFloat(ctr.toFixed(2)),
                    spend: parseFloat(spend.toFixed(2)),
                    leads,
                    cpl: parseFloat(cpl.toFixed(2))
                }
            };
        })
        .sort((a, b) => b.metrics.spend - a.metrics.spend);

    return { campaigns: result };
}

// Extrair valor de uma action específica do array de actions
function getActionValue(actions, actionType) {
    if (!actions || !Array.isArray(actions)) return 0;
    const action = actions.find(a => a.action_type === actionType);
    return action ? parseInt(action.value || 0) : 0;
}

// Extrair valor de ações de vídeo (formato: [{action_type, value}])
function getVideoActionValue(videoActions) {
    if (!videoActions || !Array.isArray(videoActions)) return 0;
    const action = videoActions[0];
    return action ? parseInt(action.value || 0) : 0;
}

// Extrair tempo médio de exibição em segundos
function getVideoAvgWatchTime(avgWatchActions) {
    if (!avgWatchActions || !Array.isArray(avgWatchActions)) return 0;
    const action = avgWatchActions[0];
    return action ? parseFloat(action.value || 0) : 0;
}

// ==========================================
// BUSCAR INSIGHTS DIÁRIOS DE UM ANÚNCIO
// ==========================================
async function fetchAdDailyInsights(accountId, adId, accessToken, params) {
    const { datePreset, timeRange } = params;

    // Buscar campanhas para determinar conversionType
    const campaignsResult = await fetchCampaigns(accountId, accessToken);
    const campaignConversionMap = new Map();
    campaignsResult.campaigns.forEach(c => {
        campaignConversionMap.set(c.id, c.conversionType);
    });

    const filtering = JSON.stringify([{ field: 'ad.id', operator: 'IN', value: [adId] }]);
    const fields = 'campaign_id,spend,impressions,reach,inline_link_clicks,ctr,actions';

    let url = `${META_API_BASE}/${accountId}/insights?fields=${fields}&filtering=${encodeURIComponent(filtering)}&access_token=${accessToken}&level=ad&time_increment=1&limit=500`;

    if (timeRange) {
        url += `&time_range=${encodeURIComponent(timeRange)}`;
    } else {
        url += `&date_preset=${datePreset || 'last_30d'}`;
    }

    const response = await fetch(url);
    const result = await response.json();

    if (result.error) {
        throw new Error(result.error.message);
    }

    const daily = (result.data || []).map(day => {
        const campaignId = day.campaign_id;
        const conversionType = campaignConversionMap.get(campaignId) || 'form';
        const spend = parseFloat(day.spend || 0);
        const leads = countLeads(day.actions, conversionType);

        return {
            date: day.date_start,
            spend,
            impressions: parseInt(day.impressions || 0),
            reach: parseInt(day.reach || 0),
            linkClicks: parseInt(day.inline_link_clicks || 0),
            ctr: parseFloat(day.ctr || 0),
            leads,
            cpl: leads > 0 ? parseFloat((spend / leads).toFixed(2)) : 0
        };
    }).sort((a, b) => new Date(a.date) - new Date(b.date));

    return { daily };
}

// ==========================================
// ANÁLISE MACRO — DADOS BRUTOS DA CONTA
// ==========================================
async function fetchMacroAnalysis(accountId, accessToken, params) {
    const { timeRange, prevTimeRange } = params;

    if (!timeRange || !prevTimeRange) {
        throw new Error('timeRange e prevTimeRange são obrigatórios para macro-analysis');
    }

    const statusFilter = encodeURIComponent(JSON.stringify([{
        field: 'effective_status',
        operator: 'IN',
        value: ['ACTIVE', 'PAUSED', 'ARCHIVED']
    }]));

    // 4 chamadas em paralelo
    const [campaignsRes, currentDailyRes, prevDailyRes, currentAdsRes] = await Promise.all([
        // 1. Todas as campanhas (sem filtro de objetivo)
        fetch(`${META_API_BASE}/${accountId}/campaigns?fields=id,name,objective,status,effective_status,daily_budget,lifetime_budget,created_time&filtering=${statusFilter}&access_token=${accessToken}&limit=500`),
        // 2. Insights diários - período atual (todas as campanhas)
        fetch(`${META_API_BASE}/${accountId}/insights?fields=campaign_id,campaign_name,spend,impressions,reach,clicks,actions&level=campaign&time_increment=1&time_range=${encodeURIComponent(timeRange)}&access_token=${accessToken}&limit=500`),
        // 3. Insights diários - período anterior
        fetch(`${META_API_BASE}/${accountId}/insights?fields=campaign_id,campaign_name,spend,impressions,reach,clicks,actions&level=campaign&time_increment=1&time_range=${encodeURIComponent(prevTimeRange)}&access_token=${accessToken}&limit=500`),
        // 4. Insights por anúncio (agregado)
        fetch(`${META_API_BASE}/${accountId}/insights?fields=ad_id,ad_name,campaign_id,campaign_name,spend,impressions,clicks,actions&level=ad&time_range=${encodeURIComponent(timeRange)}&access_token=${accessToken}&limit=500`)
    ]);

    const [campaignsData, currentDailyData, prevDailyData, currentAdsData] = await Promise.all([
        campaignsRes.json(), currentDailyRes.json(), prevDailyRes.json(), currentAdsRes.json()
    ]);

    // Paginação para daily data (pode exceder 500 rows)
    async function fetchAllPages(initialData) {
        let allData = initialData.data || [];
        let nextUrl = initialData.paging?.next;
        while (nextUrl) {
            const res = await fetch(nextUrl);
            const page = await res.json();
            allData = allData.concat(page.data || []);
            nextUrl = page.paging?.next;
        }
        return allData;
    }

    const [currentDaily, prevDaily] = await Promise.all([
        fetchAllPages(currentDailyData),
        fetchAllPages(prevDailyData)
    ]);

    return {
        campaigns: campaignsData.data || [],
        currentDaily,
        prevDaily,
        ads: currentAdsData.data || []
    };
}

// ==========================================
// BUSCAR PÁGINAS DO FACEBOOK
// ==========================================
async function fetchFacebookPages(accessToken) {
    const url = `${META_API_BASE}/me/accounts?fields=id,name,picture{url}&access_token=${accessToken}&limit=100`;
    const response = await fetch(url);
    const data = await response.json();

    if (data.error) throw new Error(data.error.message);

    return {
        pages: (data.data || []).map(p => ({
            id: p.id,
            name: p.name,
            pictureUrl: p.picture && p.picture.data ? p.picture.data.url : null
        }))
    };
}

// ==========================================
// BUSCAR INTERESSES PARA TARGETING
// ==========================================
async function searchTargetingInterests(query, accessToken) {
    const url = `${META_API_BASE}/search?type=adinterest&q=${encodeURIComponent(query)}&access_token=${accessToken}&limit=15`;
    const response = await fetch(url);
    const data = await response.json();

    if (data.error) throw new Error(data.error.message);

    return {
        interests: (data.data || []).map(i => ({
            id: i.id,
            name: i.name,
            audienceSize: i.audience_size || null,
            path: i.path || []
        }))
    };
}

async function fetchLeadgenForms(accountId, accessToken) {
    // Buscar formulários de lead ativos da conta
    const formsUrl = `${META_API_BASE}/${accountId}/leadgen_forms?fields=id,name,status,leads_count,created_time&limit=100&access_token=${accessToken}`;
    const formsResp = await fetch(formsUrl);
    const formsData = await formsResp.json();

    if (formsData.error) throw new Error(formsData.error.message);

    const forms = [];
    for (const form of (formsData.data || [])) {
        // Buscar campos (questions) de cada formulário
        let questions = [];
        try {
            const qUrl = `${META_API_BASE}/${form.id}?fields=questions&access_token=${accessToken}`;
            const qResp = await fetch(qUrl);
            const qData = await qResp.json();
            questions = (qData.questions || []).map(q => ({
                key: q.key,
                label: q.label,
                type: q.type
            }));
        } catch (e) {
            // Se falhar ao buscar campos, continua sem eles
        }

        forms.push({
            id: form.id,
            name: form.name,
            status: form.status,
            leadsCount: form.leads_count || 0,
            createdTime: form.created_time,
            questions
        });
    }

    return { forms };
}
