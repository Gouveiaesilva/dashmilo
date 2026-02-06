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

        if (!adAccountId && action !== 'account-status') {
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

            default:
                // Buscar insights (comportamento padrão)
                result = await fetchInsights(formattedAccountId, accessToken, params);
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
    const url = `${META_API_BASE}/${accountId}/campaigns?fields=id,name,objective,status,effective_status&access_token=${accessToken}&limit=500`;

    const response = await fetch(url);
    const result = await response.json();

    if (result.error) {
        throw new Error(result.error.message);
    }

    // Filtrar campanhas de leads e mensagens
    const leadObjectives = [
        'OUTCOME_LEADS',
        'LEAD_GENERATION',
        'OUTCOME_ENGAGEMENT',
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

    let url = `${META_API_BASE}/${accountId}/insights?fields=campaign_id,impressions,actions&filtering=${encodeURIComponent(filtering)}&access_token=${accessToken}&level=campaign`;

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

    // Criar mapa de campanhas com seus dados de insights
    const campaignInsightsMap = new Map();
    (result.data || []).forEach(insight => {
        const impressions = parseInt(insight.impressions || 0);
        if (impressions > 0) {
            campaignInsightsMap.set(insight.campaign_id, {
                impressions,
                actions: insight.actions || []
            });
        }
    });

    // Filtrar campanhas baseado em critérios específicos
    const campaignsWithInsights = allCampaigns.filter(campaign => {
        const insightData = campaignInsightsMap.get(campaign.id);
        if (!insightData) return false; // Sem impressões no período

        // EXCLUIR campanhas de remarketing (pelo nome)
        const campaignNameLower = campaign.name.toLowerCase();
        if (campaignNameLower.includes('remarketing') || campaignNameLower.includes('rmkt')) {
            return false;
        }

        // Campanhas de LEADS (formulário) - incluir se tiverem impressões
        if (campaign.objective === 'OUTCOME_LEADS' || campaign.objective === 'LEAD_GENERATION') {
            return true;
        }

        // Campanhas de MENSAGENS/ENGAJAMENTO - incluir APENAS se tiverem conversões de mensagens
        if (campaign.objective === 'OUTCOME_ENGAGEMENT' || campaign.objective === 'MESSAGES') {
            const hasMessageConversions = insightData.actions.some(a =>
                a.action_type === 'onsite_conversion.messaging_conversation_started_7d' ||
                a.action_type === 'messaging_conversation_started_7d' ||
                a.action_type === 'onsite_conversion.messaging_first_reply'
            );
            return hasMessageConversions;
        }

        return false;
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
    // Campanhas de mensagens/engajamento
    if (objective === 'OUTCOME_ENGAGEMENT' || objective === 'MESSAGES') {
        return 'message'; // Contar apenas conversas iniciadas
    }
    return 'form'; // Padrão
}

// ==========================================
// BUSCAR CONJUNTOS DE ANÚNCIOS (função base - todos)
// ==========================================
async function fetchAdsets(campaignId, accessToken) {
    const url = `${META_API_BASE}/${campaignId}/adsets?fields=id,name,status,effective_status&access_token=${accessToken}&limit=500`;

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

    let url = `${META_API_BASE}/${formattedAccountId}/insights?fields=adset_id,impressions&filtering=${encodeURIComponent(filtering)}&access_token=${accessToken}&level=adset`;

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
    const url = `${META_API_BASE}/${adsetId}/ads?fields=id,name,status,effective_status&access_token=${accessToken}&limit=500`;

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
                summary: { spend: 0, impressions: 0, leads: 0, cpl: 0 },
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
    const urlTotals = `${META_API_BASE}/${accountId}/insights?fields=${fields}&filtering=${encodeURIComponent(filtering)}&access_token=${accessToken}&level=${level}${periodParam}`;

    const responseTotals = await fetch(urlTotals);
    const resultTotals = await responseTotals.json();

    if (resultTotals.error) {
        throw new Error(resultTotals.error.message);
    }

    // BUSCA 2: Dados diários (com time_increment=1) - para gráfico
    const urlDaily = `${META_API_BASE}/${accountId}/insights?fields=${fields}&filtering=${encodeURIComponent(filtering)}&access_token=${accessToken}&level=${level}&time_increment=1${periodParam}`;

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
    let totalLeads = 0;
    const campaignMap = new Map();

    insightsTotals.forEach(insight => {
        const impressions = parseInt(insight.impressions || 0);
        if (impressions === 0) return;

        const campaignId = insight.campaign_id;
        const campaignName = insight.campaign_name;
        const spend = parseFloat(insight.spend || 0);
        const conversionType = campaignConversionMap.get(campaignId) || 'form';
        const leads = countLeads(insight.actions, conversionType);

        totalSpend += spend;
        totalImpressions += impressions;
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
        const conversionType = campaignConversionMap.get(campaignId) || 'form';
        const leads = countLeads(insight.actions, conversionType);

        if (!dailyMap.has(date)) {
            dailyMap.set(date, { date, spend: 0, impressions: 0, leads: 0 });
        }
        const dayData = dailyMap.get(date);
        dayData.spend += spend;
        dayData.impressions += impressions;
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

    // Contar apenas o tipo de conversão correspondente ao objetivo da campanha
    if (conversionType === 'form') {
        // Campanhas de LEADS: contar apenas preenchimentos de formulário
        const formAction = actions.find(a => a.action_type === 'onsite_conversion.lead_grouped')
            || actions.find(a => a.action_type === 'lead');

        return formAction ? parseInt(formAction.value || 0) : 0;
    }

    if (conversionType === 'message') {
        // Campanhas de MENSAGENS: contar conversas iniciadas
        // Testar múltiplos action_types possíveis
        const messageActionTypes = [
            'onsite_conversion.messaging_conversation_started_7d',
            'messaging_conversation_started_7d',
            'onsite_conversion.messaging_first_reply',
            'messaging_first_reply',
            'onsitemessaging_conversation_started_7d',
            'messaging_conversations_started'
        ];

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
                fetch(`${META_API_BASE}/${accountId}?fields=account_status,balance,amount_spent,currency,disable_reason,name&access_token=${accessToken}`),
                fetch(`${META_API_BASE}/${accountId}/campaigns?fields=effective_status&filtering=${encodeURIComponent(JSON.stringify([{ field: 'effective_status', operator: 'IN', value: ['ACTIVE'] }]))}&limit=1&access_token=${accessToken}`)
            ]);

            const accountData = await accountRes.json();
            const campaignsData = await campaignsRes.json();

            if (accountData.error) {
                return { accountId, error: true, message: accountData.error.message };
            }

            return {
                accountId,
                account_status: accountData.account_status,
                balance: accountData.balance,
                amount_spent: accountData.amount_spent,
                currency: accountData.currency || 'BRL',
                disable_reason: accountData.disable_reason,
                name: accountData.name,
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
