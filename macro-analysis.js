// ==========================================
// ANALISE MACRO — RESUMO AUTOMATICO DA CONTA
// ==========================================

var macroAnalysisData = null;

// ==========================================
// FUNCAO PRINCIPAL
// ==========================================

async function generateMacroAnalysis() {
    var clientSelect = document.getElementById('reportClientFilter');
    var selectedOption = clientSelect.options[clientSelect.selectedIndex];
    if (!clientSelect.value || !selectedOption) return;

    var adAccountId = selectedOption.dataset.adAccountId;
    var clientName = selectedOption.textContent;
    var period = getReportPeriod();
    var prevPeriod = getPreviousPeriod(period.since, period.until);

    // Esconder outros previews
    document.getElementById('reportPreview').classList.add('hidden');
    document.getElementById('reportProgress').classList.add('hidden');
    document.getElementById('macroAnalysisResult').classList.add('hidden');

    var progressEl = document.getElementById('macroAnalysisProgress');
    var progressText = document.getElementById('macroProgressText');
    var progressBar = document.getElementById('macroProgressBar');
    progressEl.classList.remove('hidden');
    progressBar.style.width = '10%';
    progressText.textContent = 'Buscando dados da conta...';

    try {
        progressBar.style.width = '20%';
        progressText.textContent = 'Consultando Meta API (campanhas + insights)...';

        var baseUrl = window.location.hostname === 'localhost' ? 'http://localhost:8888' : '';
        var formattedId = adAccountId.startsWith('act_') ? adAccountId : 'act_' + adAccountId;
        var timeRange = JSON.stringify({ since: period.since, until: period.until });
        var prevTimeRange = JSON.stringify({ since: prevPeriod.since, until: prevPeriod.until });

        var url = baseUrl + '/.netlify/functions/meta-ads?action=macro-analysis'
            + '&adAccountId=' + encodeURIComponent(formattedId)
            + '&timeRange=' + encodeURIComponent(timeRange)
            + '&prevTimeRange=' + encodeURIComponent(prevTimeRange);

        var response = await fetch(url);
        var result = await response.json();

        if (!response.ok || result.error) throw new Error(result.message || 'Erro ao buscar dados');

        progressBar.style.width = '60%';
        progressText.textContent = 'Analisando dados...';

        var raw = result.data || result;
        var analysis = analyzeMacroData(raw, period, prevPeriod);

        progressBar.style.width = '80%';
        progressText.textContent = 'Renderizando analise...';

        macroAnalysisData = { clientName: clientName, period: period, prevPeriod: prevPeriod, analysis: analysis, raw: raw };

        renderMacroAnalysis(macroAnalysisData);

        progressBar.style.width = '100%';
        setTimeout(function() {
            progressEl.classList.add('hidden');
            document.getElementById('macroAnalysisResult').classList.remove('hidden');
        }, 300);

    } catch (err) {
        console.error('Erro na analise macro:', err);
        progressEl.classList.add('hidden');
        showToast('Erro ao gerar analise: ' + err.message, 'error');
    }
}

// ==========================================
// MOTOR DE ANALISE
// ==========================================

function analyzeMacroData(raw, period, prevPeriod) {
    var campaigns = raw.campaigns || [];
    var currentDaily = raw.currentDaily || [];
    var prevDaily = raw.prevDaily || [];
    var ads = raw.ads || [];

    var currentByCampaign = groupDailybyCampaign(currentDaily);
    var prevByCampaign = groupDailybyCampaign(prevDaily);

    var overview = buildOverview(currentByCampaign, prevByCampaign, campaigns);
    var timeline = buildTimeline(currentByCampaign, prevByCampaign, campaigns, period);
    var campaignPerformance = buildCampaignPerformance(currentByCampaign, prevByCampaign, campaigns);
    var lifecycle = buildLifecycle(currentByCampaign, prevByCampaign, campaigns);
    var creatives = buildCreativeAnalysis(ads);
    var diagnostic = buildDiagnostic(overview, campaignPerformance, lifecycle, creatives, currentByCampaign, prevByCampaign, period);

    return { overview: overview, timeline: timeline, campaignPerformance: campaignPerformance, lifecycle: lifecycle, creatives: creatives, diagnostic: diagnostic };
}

function groupDailybyCampaign(dailyRows) {
    var map = {};
    dailyRows.forEach(function(row) {
        var id = row.campaign_id;
        if (!map[id]) map[id] = { id: id, name: row.campaign_name, days: [], totalSpend: 0, totalImpressions: 0, totalClicks: 0, totalReach: 0, actions: {} };
        var spend = parseFloat(row.spend || 0);
        map[id].days.push({ date: row.date_start, spend: spend, impressions: parseInt(row.impressions || 0), clicks: parseInt(row.clicks || 0), reach: parseInt(row.reach || 0), actions: row.actions || [] });
        map[id].totalSpend += spend;
        map[id].totalImpressions += parseInt(row.impressions || 0);
        map[id].totalClicks += parseInt(row.clicks || 0);
        map[id].totalReach += parseInt(row.reach || 0);
        (row.actions || []).forEach(function(a) {
            if (!map[id].actions[a.action_type]) map[id].actions[a.action_type] = 0;
            map[id].actions[a.action_type] += parseInt(a.value || 0);
        });
    });
    return map;
}

function getMainMetric(objective, actions) {
    var leadTypes = ['onsite_conversion.lead_grouped', 'offsite_conversion.fb_pixel_lead', 'lead'];
    var msgTypes = ['onsite_conversion.messaging_conversation_started_7d', 'messaging_conversation_started_7d'];
    if (objective === 'OUTCOME_LEADS' || objective === 'LEAD_GENERATION') {
        var t = 0; leadTypes.forEach(function(k) { t += (actions[k] || 0); });
        if (t === 0) msgTypes.forEach(function(k) { t += (actions[k] || 0); });
        return { value: t, label: 'Leads', costLabel: 'CPL' };
    }
    if (objective === 'MESSAGES' || objective === 'OUTCOME_ENGAGEMENT') {
        var m = 0; msgTypes.forEach(function(k) { m += (actions[k] || 0); });
        if (m > 0) return { value: m, label: 'Conversas', costLabel: 'Custo/Conversa' };
        var l = 0; leadTypes.forEach(function(k) { l += (actions[k] || 0); });
        if (l > 0) return { value: l, label: 'Leads', costLabel: 'CPL' };
        return { value: 0, label: 'Conversas', costLabel: 'Custo/Conversa' };
    }
    if (objective === 'OUTCOME_TRAFFIC' || objective === 'LINK_CLICKS') {
        return { value: actions['link_click'] || actions['landing_page_view'] || 0, label: 'Cliques', costLabel: 'CPC' };
    }
    if (objective === 'OUTCOME_AWARENESS' || objective === 'BRAND_AWARENESS' || objective === 'REACH') {
        return { value: 0, label: 'Alcance', costLabel: 'CPM', useReach: true };
    }
    if (objective === 'OUTCOME_SALES') {
        var p = actions['purchase'] || actions['offsite_conversion.fb_pixel_purchase'] || 0;
        if (p > 0) return { value: p, label: 'Vendas', costLabel: 'CPA' };
    }
    var any = 0; leadTypes.forEach(function(k) { any += (actions[k] || 0); });
    return { value: any, label: 'Resultados', costLabel: 'Custo/Resultado' };
}

function getObjectiveLabel(obj) {
    var m = { 'OUTCOME_LEADS': 'Leads', 'LEAD_GENERATION': 'Leads', 'MESSAGES': 'Mensagens', 'OUTCOME_ENGAGEMENT': 'Engajamento', 'OUTCOME_TRAFFIC': 'Trafego', 'LINK_CLICKS': 'Trafego', 'OUTCOME_AWARENESS': 'Reconhecimento', 'BRAND_AWARENESS': 'Reconhecimento', 'REACH': 'Alcance', 'OUTCOME_SALES': 'Vendas', 'POST_ENGAGEMENT': 'Engajamento', 'VIDEO_VIEWS': 'Video Views' };
    return m[obj] || obj;
}

function calcPctChange(c, p) { if (p === 0) return c > 0 ? 100 : 0; return ((c - p) / p) * 100; }

// ==========================================
// SECAO 1: VISAO GERAL
// ==========================================

function buildOverview(currentMap, prevMap, campaigns) {
    var leadTypes = ['onsite_conversion.lead_grouped', 'offsite_conversion.fb_pixel_lead', 'lead', 'onsite_conversion.messaging_conversation_started_7d', 'messaging_conversation_started_7d'];
    var cur = { spend: 0, impressions: 0, clicks: 0, reach: 0, leads: 0, activeCampaigns: 0 };
    var prev = { spend: 0, impressions: 0, clicks: 0, reach: 0, leads: 0, activeCampaigns: 0 };
    Object.values(currentMap).forEach(function(c) { cur.spend += c.totalSpend; cur.impressions += c.totalImpressions; cur.clicks += c.totalClicks; cur.reach += c.totalReach; cur.activeCampaigns++; leadTypes.forEach(function(t) { cur.leads += (c.actions[t] || 0); }); });
    Object.values(prevMap).forEach(function(p) { prev.spend += p.totalSpend; prev.impressions += p.totalImpressions; prev.clicks += p.totalClicks; prev.reach += p.totalReach; prev.activeCampaigns++; leadTypes.forEach(function(t) { prev.leads += (p.actions[t] || 0); }); });
    cur.cpl = cur.leads > 0 ? cur.spend / cur.leads : 0;
    prev.cpl = prev.leads > 0 ? prev.spend / prev.leads : 0;
    return { current: cur, prev: prev, changes: { spend: calcPctChange(cur.spend, prev.spend), impressions: calcPctChange(cur.impressions, prev.impressions), leads: calcPctChange(cur.leads, prev.leads), cpl: calcPctChange(cur.cpl, prev.cpl), campaigns: cur.activeCampaigns - prev.activeCampaigns } };
}

// ==========================================
// SECAO 2: TIMELINE
// ==========================================

function getStatusLabel(status) {
    var m = { 'ACTIVE': 'Ativa', 'PAUSED': 'Pausada', 'DELETED': 'Excluida', 'ARCHIVED': 'Arquivada', 'CAMPAIGN_PAUSED': 'Campanha Pausada', 'ADSET_PAUSED': 'Conjunto Pausado', 'IN_PROCESS': 'Em Processamento', 'WITH_ISSUES': 'Com Problemas', 'PENDING_REVIEW': 'Em Revisao', 'DISAPPROVED': 'Reprovada', 'PREAPPROVED': 'Pre-aprovada', 'PENDING_BILLING_INFO': 'Pendente Faturamento', 'NOT_DELIVERING': 'Sem Veiculacao' };
    return m[(status || '').toUpperCase()] || status || 'Desconhecido';
}

function getStatusBadge(status) {
    var s = (status || '').toUpperCase();
    if (s === 'ACTIVE') return '● Ativa';
    if (s === 'PAUSED' || s === 'CAMPAIGN_PAUSED' || s === 'ADSET_PAUSED') return '◼ Pausada';
    if (s === 'DELETED' || s === 'ARCHIVED') return '✕ ' + getStatusLabel(s);
    return '○ ' + getStatusLabel(s);
}

function buildTimeline(currentMap, prevMap, campaigns, period) {
    var events = [];
    // Mapa de metadados das campanhas (inclui effective_status, objective, budgets)
    var meta = {};
    campaigns.forEach(function(c) {
        meta[c.id] = {
            status: (c.effective_status || c.status || '').toUpperCase(),
            objective: c.objective || '',
            dailyBudget: c.daily_budget ? parseFloat(c.daily_budget) / 100 : 0,
            lifetimeBudget: c.lifetime_budget ? parseFloat(c.lifetime_budget) / 100 : 0,
            createdTime: c.created_time || ''
        };
    });

    function statusInfo(id) {
        var m = meta[id];
        if (!m) return '';
        return ' [Status atual: ' + getStatusBadge(m.status) + ']';
    }

    function budgetInfo(id) {
        var m = meta[id];
        if (!m) return '';
        if (m.dailyBudget > 0) return 'Orcamento diario: ' + fmtCur(m.dailyBudget);
        if (m.lifetimeBudget > 0) return 'Orcamento vitalicio: ' + fmtCur(m.lifetimeBudget);
        return 'Orcamento definido no conjunto';
    }

    function objectiveInfo(id) {
        var m = meta[id];
        if (!m || !m.objective) return '';
        return 'Objetivo: ' + getObjectiveLabel(m.objective);
    }

    // Campanhas novas (presentes no atual, ausentes no anterior)
    Object.keys(currentMap).forEach(function(id) {
        if (!prevMap[id]) {
            var c = currentMap[id];
            var days = c.days.filter(function(d) { return d.spend > 0; }).sort(function(a, b) { return a.date.localeCompare(b.date); });
            if (days.length > 0) {
                var detailParts = ['Investiu ' + fmtCur(c.totalSpend) + ' em ' + days.length + ' dia(s)'];
                var obj = objectiveInfo(id);
                if (obj) detailParts.push(obj);
                var bud = budgetInfo(id);
                if (bud) detailParts.push(bud);
                detailParts.push(getStatusBadge((meta[id] || {}).status));
                events.push({ date: days[0].date, type: 'new', icon: 'add_circle', color: 'emerald', text: 'Campanha "' + c.name + '" iniciou veiculacao', detail: detailParts.join(' | ') });
            }
        }
    });

    // Campanhas que pararam (presentes no anterior, ausentes no atual)
    Object.keys(prevMap).forEach(function(id) {
        if (!currentMap[id]) {
            var p = prevMap[id];
            var m = meta[id] || {};
            var statusText = m.status ? getStatusBadge(m.status) : 'Status desconhecido';
            var reason = '';
            if (m.status === 'PAUSED' || m.status === 'CAMPAIGN_PAUSED') reason = 'Campanha foi pausada manualmente';
            else if (m.status === 'DELETED' || m.status === 'ARCHIVED') reason = 'Campanha foi excluida/arquivada';
            else if (m.status === 'ACTIVE') reason = 'Campanha esta ativa mas sem entrega — possivel problema de orcamento, segmentacao ou aprovacao';
            else reason = 'Motivo provavel: ' + getStatusLabel(m.status);
            events.push({ date: period.since, type: 'stopped', icon: 'pause_circle', color: 'red', text: 'Campanha "' + p.name + '" parou de gastar' + statusInfo(id), detail: 'Gastava ' + fmtCur(p.totalSpend) + ' no periodo anterior. ' + reason });
        }
    });

    // Campanhas que existiam nos dois periodos — detectar gaps, retomadas, paradas
    Object.keys(currentMap).forEach(function(id) {
        if (!prevMap[id]) return;
        var c = currentMap[id];
        var m = meta[id] || {};
        var activeDays = c.days.filter(function(d) { return d.spend > 0; }).sort(function(a, b) { return a.date.localeCompare(b.date); });
        if (activeDays.length === 0) return;
        var firstDay = activeDays[0].date;
        var lastDay = activeDays[activeDays.length - 1].date;

        // Retomou (nao gastou nos primeiros dias do periodo)
        if (firstDay > period.since) {
            var daysOff = Math.round((new Date(firstDay) - new Date(period.since)) / 86400000);
            events.push({ date: firstDay, type: 'resumed', icon: 'play_circle', color: 'blue', text: 'Campanha "' + c.name + '" retomou veiculacao apos ' + daysOff + ' dia(s) parada', detail: 'Reativada em ' + formatDateBR(firstDay) + ' | ' + getStatusBadge(m.status) });
        }

        // Parou no meio do periodo
        if (lastDay < period.until) {
            var daysInactive = Math.round((new Date(period.until) - new Date(lastDay)) / 86400000);
            var reason = '';
            if (m.status === 'PAUSED' || m.status === 'CAMPAIGN_PAUSED') reason = 'Campanha pausada manualmente';
            else if (m.status === 'ACTIVE') reason = 'Campanha ativa mas sem entrega — verificar orcamento/aprovacao';
            else reason = getStatusLabel(m.status);
            events.push({ date: lastDay, type: 'paused_mid', icon: 'pause', color: 'amber', text: 'Campanha "' + c.name + '" parou de gastar — ' + daysInactive + ' dia(s) inativa' + statusInfo(id), detail: 'Ultimo gasto: ' + formatDateBR(lastDay) + ' | ' + reason });
        }

        // Gaps no meio (>=3 dias sem gasto)
        for (var gi = 1; gi < activeDays.length; gi++) {
            var prevDate = new Date(activeDays[gi - 1].date);
            var currDate = new Date(activeDays[gi].date);
            var gapDays = Math.round((currDate - prevDate) / 86400000);
            if (gapDays >= 3) {
                var gapReason = m.status === 'ACTIVE' ? 'Campanha ativa — gap pode indicar limite de orcamento atingido, problema de entrega ou pausa temporaria' : 'Status atual: ' + getStatusBadge(m.status);
                events.push({ date: activeDays[gi - 1].date, type: 'gap', icon: 'schedule', color: 'amber', text: 'Campanha "' + c.name + '" ficou ' + gapDays + ' dia(s) sem gastar' + statusInfo(id), detail: 'De ' + formatDateBR(activeDays[gi - 1].date) + ' a ' + formatDateBR(activeDays[gi].date) + ' | ' + gapReason });
            }
        }
    });

    // Mudancas de orcamento (gasto medio diario)
    Object.keys(currentMap).forEach(function(id) {
        if (!prevMap[id]) return;
        var cDays = currentMap[id].days.filter(function(d) { return d.spend > 0; });
        var pDays = prevMap[id].days.filter(function(d) { return d.spend > 0; });
        if (cDays.length < 2 || pDays.length < 2) return;
        var cAvg = currentMap[id].totalSpend / cDays.length;
        var pAvg = prevMap[id].totalSpend / pDays.length;
        if (pAvg === 0) return;
        var ratio = cAvg / pAvg;
        var bud = budgetInfo(id);
        if (ratio > 1.5) events.push({ date: period.since, type: 'budget_up', icon: 'trending_up', color: 'blue', text: 'Campanha "' + currentMap[id].name + '": gasto medio subiu ' + Math.round((ratio - 1) * 100) + '%' + statusInfo(id), detail: 'De ' + fmtCur(pAvg) + '/dia para ' + fmtCur(cAvg) + '/dia' + (bud ? ' | ' + bud : '') });
        else if (ratio < 0.5) events.push({ date: period.since, type: 'budget_down', icon: 'trending_down', color: 'amber', text: 'Campanha "' + currentMap[id].name + '": gasto medio caiu ' + Math.round((1 - ratio) * 100) + '%' + statusInfo(id), detail: 'De ' + fmtCur(pAvg) + '/dia para ' + fmtCur(cAvg) + '/dia' + (bud ? ' | ' + bud : '') });
    });

    // Picos anormais na conta
    var dailyTotals = {};
    Object.values(currentMap).forEach(function(c) { c.days.forEach(function(d) { if (!dailyTotals[d.date]) dailyTotals[d.date] = 0; dailyTotals[d.date] += d.spend; }); });
    var dailyVals = Object.keys(dailyTotals).map(function(date) { return { date: date, spend: dailyTotals[date] }; });
    if (dailyVals.length > 3) {
        var avg = dailyVals.reduce(function(s, d) { return s + d.spend; }, 0) / dailyVals.length;
        var stdDev = Math.sqrt(dailyVals.reduce(function(s, d) { return s + Math.pow(d.spend - avg, 2); }, 0) / dailyVals.length);
        if (stdDev > 0 && avg > 0) dailyVals.forEach(function(d) {
            if (d.spend > avg + 2 * stdDev) events.push({ date: d.date, type: 'spike', icon: 'priority_high', color: 'amber', text: 'Pico de gasto na conta: ' + fmtCur(d.spend), detail: 'Media do periodo: ' + fmtCur(avg) + ' | Desvio: +' + Math.round(((d.spend - avg) / avg) * 100) + '%' });
            else if (d.spend < avg - 1.5 * stdDev && d.spend > 0) events.push({ date: d.date, type: 'dip', icon: 'arrow_downward', color: 'amber', text: 'Queda de gasto na conta: ' + fmtCur(d.spend), detail: 'Media do periodo: ' + fmtCur(avg) + ' | Desvio: ' + Math.round(((d.spend - avg) / avg) * 100) + '%' });
        });
    }
    events.sort(function(a, b) { return a.date.localeCompare(b.date); });
    return events;
}

// ==========================================
// SECAO 3: PERFORMANCE POR CAMPANHA
// ==========================================

function buildCampaignPerformance(currentMap, prevMap, campaigns) {
    var meta = {}; campaigns.forEach(function(c) { meta[c.id] = c; });
    var results = [];
    Object.keys(currentMap).forEach(function(id) {
        var c = currentMap[id]; var m = meta[id] || {}; var obj = m.objective || '';
        var metric = getMainMetric(obj, c.actions);
        var cur = { spend: c.totalSpend, impressions: c.totalImpressions, clicks: c.totalClicks, reach: c.totalReach, result: metric.useReach ? c.totalReach : metric.value, costPerResult: metric.value > 0 ? c.totalSpend / metric.value : (metric.useReach && c.totalReach > 0 ? (c.totalSpend / c.totalReach) * 1000 : 0), days: c.days.filter(function(d) { return d.spend > 0; }).length };
        var prev = null; var changes = null; var verdict = 'nova';
        if (prevMap[id]) {
            var p = prevMap[id]; var pm = getMainMetric(obj, p.actions);
            prev = { spend: p.totalSpend, impressions: p.totalImpressions, result: pm.useReach ? p.totalReach : pm.value, costPerResult: pm.value > 0 ? p.totalSpend / pm.value : (pm.useReach && p.totalReach > 0 ? (p.totalSpend / p.totalReach) * 1000 : 0) };
            changes = { spend: calcPctChange(cur.spend, prev.spend), result: calcPctChange(cur.result, prev.result), costPerResult: calcPctChange(cur.costPerResult, prev.costPerResult) };
            verdict = getVerdict(changes, cur, prev);
        }
        results.push({ id: id, name: c.name, objective: obj, objectiveLabel: getObjectiveLabel(obj), status: (m.effective_status || m.status || '').toUpperCase(), metricLabel: metric.label, costLabel: metric.costLabel, current: cur, prev: prev, changes: changes, verdict: verdict });
    });
    Object.keys(prevMap).forEach(function(id) {
        if (currentMap[id]) return;
        var p = prevMap[id]; var m = meta[id] || {}; var obj = m.objective || '';
        var pm = getMainMetric(obj, p.actions);
        results.push({ id: id, name: p.name, objective: obj, objectiveLabel: getObjectiveLabel(obj), status: (m.effective_status || 'PAUSED').toUpperCase(), metricLabel: pm.label, costLabel: pm.costLabel, current: { spend: 0, impressions: 0, result: 0, costPerResult: 0 }, prev: { spend: p.totalSpend, impressions: p.totalImpressions, result: pm.value, costPerResult: pm.value > 0 ? p.totalSpend / pm.value : 0 }, changes: null, verdict: 'pausada' });
    });
    results.sort(function(a, b) { return b.current.spend - a.current.spend; });
    return results;
}

function getVerdict(ch, cur, prev) {
    if (!ch) return 'nova';
    if (cur.result === 0 && cur.spend > 0) return 'sem_resultado';
    if (ch.result > 15 && ch.costPerResult < -10) return 'melhorando';
    if (ch.result > 15 && ch.spend > 15 && Math.abs(ch.costPerResult) <= 15) return 'escalando_bem';
    if (ch.spend > 20 && ch.costPerResult > 25) return 'escalando_mal';
    if (ch.costPerResult > 25 || (ch.result < -25 && cur.spend > 10)) return 'piorando';
    if (Math.abs(ch.costPerResult) <= 15 && Math.abs(ch.result) <= 15) return 'estavel';
    if (ch.result > 15) return 'melhorando';
    if (ch.costPerResult < -15) return 'melhorando';
    return 'estavel';
}

// ==========================================
// SECAO 4: CICLO DE VIDA
// ==========================================

function buildLifecycle(currentMap, prevMap, campaigns) {
    var meta = {}; campaigns.forEach(function(c) { meta[c.id] = c; });
    var newC = []; var stopped = [];
    Object.keys(currentMap).forEach(function(id) {
        if (prevMap[id]) return;
        var c = currentMap[id]; var m = meta[id] || {}; var metric = getMainMetric(m.objective || '', c.actions);
        var days = c.days.filter(function(d) { return d.spend > 0; });
        newC.push({ name: c.name, objective: getObjectiveLabel(m.objective || ''), spend: c.totalSpend, result: metric.value, resultLabel: metric.label, days: days.length, avgDaily: days.length > 0 ? c.totalSpend / days.length : 0 });
    });
    Object.keys(prevMap).forEach(function(id) {
        if (currentMap[id]) return;
        var p = prevMap[id]; var m = meta[id] || {}; var metric = getMainMetric(m.objective || '', p.actions);
        stopped.push({ name: p.name, objective: getObjectiveLabel(m.objective || ''), spend: p.totalSpend, result: metric.value, resultLabel: metric.label });
    });
    return { newCampaigns: newC, stoppedCampaigns: stopped };
}

// ==========================================
// SECAO 5: CRIATIVOS
// ==========================================

function buildCreativeAnalysis(ads) {
    if (!ads || ads.length === 0) return { top: [], bottom: [] };
    var leadTypes = ['onsite_conversion.lead_grouped', 'offsite_conversion.fb_pixel_lead', 'lead', 'onsite_conversion.messaging_conversation_started_7d', 'messaging_conversation_started_7d'];
    var processed = ads.map(function(ad) {
        var spend = parseFloat(ad.spend || 0); var impr = parseInt(ad.impressions || 0); var clicks = parseInt(ad.clicks || 0); var res = 0;
        (ad.actions || []).forEach(function(a) { if (leadTypes.indexOf(a.action_type) !== -1) res += parseInt(a.value || 0); });
        return { id: ad.ad_id, name: ad.ad_name, campaignName: ad.campaign_name || '', spend: spend, impressions: impr, clicks: clicks, results: res, cpr: res > 0 ? spend / res : (spend > 0 ? Infinity : 0), ctr: impr > 0 ? (clicks / impr * 100) : 0 };
    }).filter(function(a) { return a.spend > 0 && a.impressions > 100; });
    var withRes = processed.filter(function(a) { return a.results > 0; }).sort(function(a, b) { return a.cpr - b.cpr; });
    var top = withRes.slice(0, 5);
    var bottom = processed.filter(function(a) { return a.results === 0; }).sort(function(a, b) { return b.spend - a.spend; }).slice(0, 5);
    if (bottom.length === 0 && withRes.length > 5) bottom = withRes.slice(-3).reverse();
    return { top: top, bottom: bottom };
}

// ==========================================
// SECAO 6: DIAGNOSTICO APROFUNDADO
// ==========================================

function buildDiagnostic(overview, perf, lifecycle, creatives, currentMap, prevMap, period) {
    var items = [];
    var cur = overview.current;
    var ch = overview.changes;
    var active = perf.filter(function(c) { return c.current.spend > 0; });

    // --- INVESTIMENTO ---
    // Concentracao
    if (active.length > 1 && cur.spend > 0) {
        var topSpend = active[0];
        var pct = (topSpend.current.spend / cur.spend) * 100;
        if (pct > 80) items.push({ type: 'danger', icon: 'pie_chart', text: 'Concentracao critica: a campanha "' + topSpend.name + '" concentra ' + Math.round(pct) + '% de todo o investimento da conta (' + fmtCur(topSpend.current.spend) + ' de ' + fmtCur(cur.spend) + '). Qualquer queda nela impacta toda a operacao.' });
        else if (pct > 60) items.push({ type: 'warning', icon: 'pie_chart', text: 'A campanha "' + topSpend.name + '" concentra ' + Math.round(pct) + '% do investimento total. Considere diversificar para reduzir dependencia.' });
    }

    // Investimento total mudou significativamente
    if (Math.abs(ch.spend) > 30 && cur.spend > 50) {
        if (ch.spend > 0) items.push({ type: 'info', icon: 'payments', text: 'Investimento total subiu ' + Math.round(ch.spend) + '% em relacao ao periodo anterior (de ' + fmtCur(overview.prev.spend) + ' para ' + fmtCur(cur.spend) + '). ' + (ch.leads > ch.spend * 0.7 ? 'Os resultados acompanharam o aumento — escalagem saudavel.' : 'Os resultados nao acompanharam proporcionalmente — atencao a eficiencia.') });
        else items.push({ type: 'warning', icon: 'payments', text: 'Investimento total caiu ' + Math.round(Math.abs(ch.spend)) + '% em relacao ao periodo anterior (de ' + fmtCur(overview.prev.spend) + ' para ' + fmtCur(cur.spend) + ').' });
    }

    // --- RESULTADOS E EFICIENCIA ---
    // Sem resultado geral
    if (cur.spend > 20 && cur.leads === 0) {
        items.push({ type: 'danger', icon: 'error', text: 'A conta investiu ' + fmtCur(cur.spend) + ' no periodo sem gerar nenhum resultado mensuravel (lead, conversa ou conversao). Revise urgentemente as campanhas, criativos e segmentacao.' });
    }

    // CPL geral subiu
    if (ch.cpl > 20 && cur.leads > 0 && overview.prev.leads > 0) {
        var worst = perf.filter(function(c) { return c.changes && c.changes.costPerResult > 25 && c.current.result > 0; }).map(function(c) { return '"' + c.name + '" (+' + Math.round(c.changes.costPerResult) + '%)'; }).slice(0, 3);
        items.push({ type: 'warning', icon: 'trending_up', text: 'Custo por resultado geral subiu ' + Math.round(ch.cpl) + '% (de ' + fmtCur(overview.prev.cpl) + ' para ' + fmtCur(cur.cpl) + ').' + (worst.length > 0 ? ' Principais responsaveis: ' + worst.join(', ') + '.' : '') });
    }
    // CPL geral caiu
    if (ch.cpl < -15 && cur.leads > 2 && overview.prev.leads > 2) {
        var best = perf.filter(function(c) { return c.changes && c.changes.costPerResult < -15 && c.current.result > 0; }).map(function(c) { return '"' + c.name + '" (' + Math.round(c.changes.costPerResult) + '%)'; }).slice(0, 3);
        items.push({ type: 'success', icon: 'trending_down', text: 'Custo por resultado geral caiu ' + Math.round(Math.abs(ch.cpl)) + '% (de ' + fmtCur(overview.prev.cpl) + ' para ' + fmtCur(cur.cpl) + '). Otima performance!' + (best.length > 0 ? ' Destaque: ' + best.join(', ') + '.' : '') });
    }

    // Resultados subiram
    if (ch.leads > 25 && cur.leads > 3) {
        items.push({ type: 'success', icon: 'arrow_upward', text: 'Resultados totais cresceram ' + Math.round(ch.leads) + '% (de ' + overview.prev.leads + ' para ' + cur.leads + ').' + (ch.spend < ch.leads * 0.5 ? ' Crescimento organico, sem aumento proporcional de investimento.' : '') });
    }
    // Resultados cairam
    if (ch.leads < -25 && overview.prev.leads > 3) {
        items.push({ type: 'danger', icon: 'arrow_downward', text: 'Resultados totais cairam ' + Math.round(Math.abs(ch.leads)) + '% (de ' + overview.prev.leads + ' para ' + cur.leads + ').' + (Math.abs(ch.spend) < 15 ? ' O investimento se manteve semelhante, indicando perda de eficiencia.' : '') });
    }

    // --- CAMPANHAS SEM RESULTADO ---
    var noResults = active.filter(function(c) { return c.current.result === 0 && c.current.spend > 10; });
    if (noResults.length > 0) {
        var totalWaste = noResults.reduce(function(s, c) { return s + c.current.spend; }, 0);
        var names = noResults.map(function(c) { return '"' + c.name + '" (' + fmtCur(c.current.spend) + ')'; }).slice(0, 4);
        items.push({ type: 'danger', icon: 'money_off', text: noResults.length + ' campanha(s) gastaram ' + fmtCur(totalWaste) + ' sem gerar nenhum resultado: ' + names.join(', ') + '. Revise criativos e segmentacao ou pause para realocar verba.' });
    }

    // --- CAMPANHAS PIORANDO ---
    var worsening = perf.filter(function(c) { return c.verdict === 'piorando'; });
    if (worsening.length > 0) {
        worsening.forEach(function(c) {
            var detail = '';
            if (c.changes) {
                if (c.changes.costPerResult > 25) detail += 'custo/resultado subiu ' + Math.round(c.changes.costPerResult) + '%';
                if (c.changes.result < -25) detail += (detail ? ' e ' : '') + 'resultados cairam ' + Math.round(Math.abs(c.changes.result)) + '%';
            }
            items.push({ type: 'warning', icon: 'warning', text: 'Campanha "' + c.name + '" com piora significativa' + (detail ? ': ' + detail : '') + '. ' + (c.current.spend > 50 ? 'Por investir ' + fmtCur(c.current.spend) + ', impacta o resultado geral da conta.' : 'Investimento baixo (' + fmtCur(c.current.spend) + '), impacto limitado.') });
        });
    }

    // --- ESCALAGEM ---
    var scalingBad = perf.filter(function(c) { return c.verdict === 'escalando_mal'; });
    scalingBad.forEach(function(c) {
        items.push({ type: 'warning', icon: 'speed', text: 'Campanha "' + c.name + '" esta escalando mal: investimento subiu ' + Math.round(c.changes.spend) + '% mas custo/resultado subiu ' + Math.round(c.changes.costPerResult) + '%. Considere voltar ao orcamento anterior e otimizar antes de escalar novamente.' });
    });
    var scalingGood = perf.filter(function(c) { return c.verdict === 'escalando_bem'; });
    scalingGood.forEach(function(c) {
        items.push({ type: 'success', icon: 'rocket_launch', text: 'Campanha "' + c.name + '" escalou bem: investimento subiu ' + Math.round(c.changes.spend) + '% e resultados subiram ' + Math.round(c.changes.result) + '% com custo/resultado estavel. Continue monitorando.' });
    });

    // --- CAMPANHAS NOVAS ---
    if (lifecycle.newCampaigns.length > 0) {
        var goodNew = lifecycle.newCampaigns.filter(function(c) { return c.result > 0; });
        var badNew = lifecycle.newCampaigns.filter(function(c) { return c.result === 0 && c.spend > 10; });
        if (goodNew.length > 0) items.push({ type: 'success', icon: 'new_releases', text: goodNew.length + ' campanha(s) nova(s) ja geraram resultados: ' + goodNew.map(function(c) { return '"' + c.name + '" (' + c.result + ' ' + c.resultLabel + ', ' + fmtCur(c.spend) + ')'; }).join(', ') + '.' });
        if (badNew.length > 0) items.push({ type: 'warning', icon: 'hourglass_top', text: badNew.length + ' campanha(s) nova(s) ainda sem resultado: ' + badNew.map(function(c) { return '"' + c.name + '" (' + fmtCur(c.spend) + ' investidos)'; }).join(', ') + '. Acompanhe de perto — pode ser fase de aprendizado do algoritmo.' });
    }

    // --- CAMPANHAS PAUSADAS ---
    if (lifecycle.stoppedCampaigns.length > 0) {
        var goodStopped = lifecycle.stoppedCampaigns.filter(function(c) { return c.result > 0; });
        if (goodStopped.length > 0) items.push({ type: 'info', icon: 'info', text: goodStopped.length + ' campanha(s) que geravam resultado foram pausadas: ' + goodStopped.map(function(c) { return '"' + c.name + '" (' + c.result + ' ' + c.resultLabel + ')'; }).join(', ') + '. Se a pausa foi intencional, verifique se ha campanhas substitutas cobrindo a demanda.' });
    }

    // --- CRIATIVOS ---
    if (creatives.top.length > 0) {
        var bestAd = creatives.top[0];
        items.push({ type: 'success', icon: 'star', text: 'Criativo mais eficiente: "' + bestAd.name + '" com ' + bestAd.results + ' resultado(s) a ' + fmtCur(bestAd.cpr) + ' cada (CTR: ' + bestAd.ctr.toFixed(1) + '%). Considere usar abordagem semelhante em novos criativos.' });
    }
    if (creatives.bottom.length > 0) {
        var worstTotal = creatives.bottom.reduce(function(s, a) { return s + a.spend; }, 0);
        items.push({ type: 'warning', icon: 'image_not_supported', text: creatives.bottom.length + ' anuncio(s) gastaram ' + fmtCur(worstTotal) + ' sem gerar resultado. Considere substituir criativos: ' + creatives.bottom.map(function(a) { return '"' + a.name + '"'; }).slice(0, 3).join(', ') + '.' });
    }

    // --- PADRAO DE GASTO ---
    var dailyTotals = {};
    Object.values(currentMap).forEach(function(c) { c.days.forEach(function(d) { if (!dailyTotals[d.date]) dailyTotals[d.date] = 0; dailyTotals[d.date] += d.spend; }); });
    var dailyVals = Object.values(dailyTotals);
    if (dailyVals.length > 3) {
        var min = Math.min.apply(null, dailyVals.filter(function(v) { return v > 0; }));
        var max = Math.max.apply(null, dailyVals);
        if (max > 0 && min > 0 && max / min > 3) items.push({ type: 'info', icon: 'equalizer', text: 'Grande variacao no gasto diario: de ' + fmtCur(min) + ' a ' + fmtCur(max) + '. Pode indicar inconsistencia na entrega ou orcamentos muito variados entre campanhas.' });
    }

    if (items.length === 0) items.push({ type: 'success', icon: 'check_circle', text: 'Conta operando dentro dos parametros normais no periodo analisado. Sem alertas significativos.' });

    return items;
}

// ==========================================
// FORMATACAO
// ==========================================

function fmtCur(v) {
    var cur = (typeof currentCurrency !== 'undefined') ? currentCurrency : 'BRL';
    var locale = cur === 'BRL' ? 'pt-BR' : 'en-US';
    return new Intl.NumberFormat(locale, { style: 'currency', currency: cur, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
}
function fmtNum(v) { return Math.round(v).toLocaleString('pt-BR'); }
function fmtPct(v) { return (v > 0 ? '+' : '') + Math.round(v) + '%'; }

// ==========================================
// RENDERIZACAO HTML
// ==========================================

function renderMacroAnalysis(data) {
    var container = document.getElementById('macroAnalysisResult');
    var a = data.analysis;
    var p = data.period;
    var html = '';

    // Header
    html += '<div class="bg-surface-dark border border-border-dark rounded-xl sm:rounded-2xl p-4 sm:p-6 shadow-sm">';
    html += '<div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">';
    html += '<div><h2 class="text-lg font-bold text-white flex items-center gap-2"><span class="material-symbols-outlined text-blue-400">query_stats</span> Analise Macro</h2>';
    html += '<p class="text-xs text-slate-500 mt-1">' + data.clientName + ' — ' + formatDateBR(p.since) + ' a ' + formatDateBR(p.until) + ' (comparado com ' + formatDateBR(data.prevPeriod.since) + ' a ' + formatDateBR(data.prevPeriod.until) + ')</p></div>';
    html += '<button onclick="exportMacroAnalysisPDF()" class="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm font-bold transition-colors shrink-0">';
    html += '<span class="material-symbols-outlined text-base">picture_as_pdf</span> Exportar PDF</button></div>';

    // KPIs
    html += renderOverviewHTML(a.overview);
    html += '</div>';

    // Timeline
    if (a.timeline.length > 0) html += renderTimelineHTML(a.timeline);

    // Performance
    html += renderPerformanceHTML(a.campaignPerformance);

    // Lifecycle
    if (a.lifecycle.newCampaigns.length > 0 || a.lifecycle.stoppedCampaigns.length > 0) html += renderLifecycleHTML(a.lifecycle);

    // Criativos
    if (a.creatives.top.length > 0 || a.creatives.bottom.length > 0) html += renderCreativesHTML(a.creatives);

    // Diagnostico
    html += renderDiagnosticHTML(a.diagnostic);

    container.innerHTML = html;
}

function renderOverviewHTML(ov) {
    var c = ov.current; var ch = ov.changes;
    function kpi(label, value, change, invert) {
        var col = change > 0 ? (invert ? 'text-red-400' : 'text-emerald-400') : (change < 0 ? (invert ? 'text-emerald-400' : 'text-red-400') : 'text-slate-400');
        var arr = change > 0 ? 'arrow_upward' : (change < 0 ? 'arrow_downward' : 'remove');
        return '<div class="bg-background-dark border border-border-dark rounded-xl p-4"><span class="text-[10px] font-bold text-slate-500 uppercase">' + label + '</span><p class="text-xl font-bold text-white mt-1">' + value + '</p><div class="flex items-center gap-1 mt-2 ' + col + ' text-xs font-bold"><span class="material-symbols-outlined text-xs">' + arr + '</span><span>' + fmtPct(change) + ' vs anterior</span></div></div>';
    }
    var h = '<div class="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-2">';
    h += kpi('Investimento Total', fmtCur(c.spend), ch.spend, false);
    h += kpi('Impressoes', fmtNum(c.impressions), ch.impressions, false);
    h += kpi('Resultados', fmtNum(c.leads), ch.leads, false);
    h += kpi('Custo por Resultado', c.cpl > 0 ? fmtCur(c.cpl) : '--', ch.cpl, true);
    h += '</div>';
    h += '<p class="text-xs text-slate-500 mt-3"><span class="font-semibold text-white">' + c.activeCampaigns + '</span> campanhas com veiculacao no periodo';
    if (ch.campaigns !== 0) h += ' <span class="' + (ch.campaigns > 0 ? 'text-emerald-400' : 'text-red-400') + '">(' + (ch.campaigns > 0 ? '+' : '') + ch.campaigns + ' vs anterior)</span>';
    h += '</p>';
    return h;
}

function renderTimelineHTML(tl) {
    var h = '<div class="bg-surface-dark border border-border-dark rounded-xl sm:rounded-2xl p-4 sm:p-6 shadow-sm">';
    h += '<h3 class="text-sm font-bold text-white flex items-center gap-2 mb-4"><span class="material-symbols-outlined text-blue-400 text-base">timeline</span> Timeline de Mudancas</h3>';
    h += '<div class="space-y-2">';
    tl.forEach(function(e) {
        var bg = 'bg-' + e.color + '-500/10'; var bc = 'border-' + e.color + '-500/10'; var tc = 'text-' + e.color + '-400';
        h += '<div class="flex items-start gap-3 p-3 rounded-lg ' + bg + ' border ' + bc + '">';
        h += '<span class="material-symbols-outlined ' + tc + ' text-lg shrink-0 mt-0.5">' + e.icon + '</span>';
        h += '<div class="flex-1 min-w-0"><p class="text-sm text-white">' + e.text + '</p>';
        if (e.detail) h += '<p class="text-[11px] text-slate-400 mt-0.5">' + e.detail + '</p>';
        h += '<p class="text-[10px] text-slate-500 mt-0.5">' + formatDateBR(e.date) + '</p></div></div>';
    });
    h += '</div></div>';
    return h;
}

function renderPerformanceHTML(camps) {
    var h = '<div class="bg-surface-dark border border-border-dark rounded-xl sm:rounded-2xl p-4 sm:p-6 shadow-sm">';
    h += '<h3 class="text-sm font-bold text-white flex items-center gap-2 mb-4"><span class="material-symbols-outlined text-blue-400 text-base">leaderboard</span> Performance por Campanha</h3>';
    if (camps.length === 0) { h += '<p class="text-sm text-slate-500">Nenhuma campanha com gasto no periodo.</p></div>'; return h; }
    h += '<div class="overflow-x-auto"><table class="w-full text-xs"><thead><tr class="text-slate-500 border-b border-border-dark">';
    h += '<th class="text-left py-2 pr-3 font-semibold">Campanha</th>';
    h += '<th class="text-left py-2 px-2 font-semibold hidden sm:table-cell">Tipo</th>';
    h += '<th class="text-right py-2 px-2 font-semibold">Invest.</th>';
    h += '<th class="text-right py-2 px-2 font-semibold">Resultado</th>';
    h += '<th class="text-right py-2 px-2 font-semibold">Custo/Res.</th>';
    h += '<th class="text-right py-2 px-2 font-semibold hidden sm:table-cell">Var.</th>';
    h += '<th class="text-right py-2 pl-2 font-semibold">Status</th>';
    h += '</tr></thead><tbody>';
    camps.forEach(function(c) {
        var vc = getVerdictConfig(c.verdict);
        var cpr = c.current.costPerResult > 0 && c.current.costPerResult !== Infinity ? fmtCur(c.current.costPerResult) : '--';
        var chText = c.changes ? fmtPct(c.changes.costPerResult) : '--';
        var chCol = c.changes ? (c.changes.costPerResult > 10 ? 'text-red-400' : (c.changes.costPerResult < -10 ? 'text-emerald-400' : 'text-slate-400')) : 'text-slate-500';
        h += '<tr class="border-b border-border-dark/50 hover:bg-background-dark/50">';
        h += '<td class="py-2.5 pr-3"><span class="text-white font-medium truncate block max-w-[200px]" title="' + c.name + '">' + c.name + '</span></td>';
        h += '<td class="py-2.5 px-2 text-slate-400 hidden sm:table-cell">' + c.objectiveLabel + '</td>';
        h += '<td class="py-2.5 px-2 text-right text-white font-medium">' + fmtCur(c.current.spend) + '</td>';
        h += '<td class="py-2.5 px-2 text-right text-white">' + fmtNum(c.current.result) + ' <span class="text-slate-500 text-[10px]">' + c.metricLabel + '</span></td>';
        h += '<td class="py-2.5 px-2 text-right text-white">' + cpr + '</td>';
        h += '<td class="py-2.5 px-2 text-right ' + chCol + ' hidden sm:table-cell">' + chText + '</td>';
        h += '<td class="py-2.5 pl-2 text-right"><span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ' + vc.classes + '"><span class="material-symbols-outlined text-[10px]">' + vc.icon + '</span>' + vc.label + '</span></td>';
        h += '</tr>';
    });
    h += '</tbody></table></div></div>';
    return h;
}

function getVerdictConfig(v) {
    return { melhorando: { label: 'Melhorando', icon: 'trending_up', classes: 'text-emerald-400 bg-emerald-500/10' }, escalando_bem: { label: 'Escalando', icon: 'rocket_launch', classes: 'text-blue-400 bg-blue-500/10' }, escalando_mal: { label: 'Ineficiente', icon: 'warning', classes: 'text-red-400 bg-red-500/10' }, piorando: { label: 'Piorando', icon: 'trending_down', classes: 'text-red-400 bg-red-500/10' }, estavel: { label: 'Estavel', icon: 'check_circle', classes: 'text-slate-400 bg-slate-500/10' }, nova: { label: 'Nova', icon: 'add_circle', classes: 'text-emerald-400 bg-emerald-500/10' }, pausada: { label: 'Pausada', icon: 'pause_circle', classes: 'text-red-400 bg-red-500/10' }, sem_resultado: { label: 'Sem resultado', icon: 'block', classes: 'text-red-400 bg-red-500/10' } }[v] || { label: 'Estavel', icon: 'check_circle', classes: 'text-slate-400 bg-slate-500/10' };
}

function renderLifecycleHTML(lc) {
    var h = '<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">';
    if (lc.newCampaigns.length > 0) {
        h += '<div class="bg-surface-dark border border-emerald-500/20 rounded-xl p-4 sm:p-6">';
        h += '<h3 class="text-sm font-bold text-emerald-400 flex items-center gap-2 mb-3"><span class="material-symbols-outlined text-base">add_circle</span> Campanhas Novas (' + lc.newCampaigns.length + ')</h3>';
        h += '<div class="space-y-2">';
        lc.newCampaigns.forEach(function(c) {
            h += '<div class="flex items-center justify-between text-xs p-2.5 bg-emerald-500/5 rounded-lg gap-2">';
            h += '<div class="min-w-0"><span class="text-white font-medium block truncate">' + c.name + '</span><span class="text-slate-500">' + c.objective + ' | ' + c.days + ' dia(s) ativo</span></div>';
            h += '<div class="text-right shrink-0 text-slate-400">' + fmtCur(c.spend) + '<br>' + c.result + ' ' + c.resultLabel + '</div></div>';
        });
        h += '</div></div>';
    }
    if (lc.stoppedCampaigns.length > 0) {
        h += '<div class="bg-surface-dark border border-red-500/20 rounded-xl p-4 sm:p-6">';
        h += '<h3 class="text-sm font-bold text-red-400 flex items-center gap-2 mb-3"><span class="material-symbols-outlined text-base">pause_circle</span> Campanhas Pausadas (' + lc.stoppedCampaigns.length + ')</h3>';
        h += '<div class="space-y-2">';
        lc.stoppedCampaigns.forEach(function(c) {
            h += '<div class="flex items-center justify-between text-xs p-2.5 bg-red-500/5 rounded-lg gap-2">';
            h += '<div class="min-w-0"><span class="text-white font-medium block truncate">' + c.name + '</span><span class="text-slate-500">' + c.objective + '</span></div>';
            h += '<div class="text-right shrink-0 text-slate-400">Gastava ' + fmtCur(c.spend) + '<br>' + c.result + ' ' + c.resultLabel + '</div></div>';
        });
        h += '</div></div>';
    }
    h += '</div>';
    return h;
}

function renderCreativesHTML(cr) {
    var h = '<div class="bg-surface-dark border border-border-dark rounded-xl sm:rounded-2xl p-4 sm:p-6 shadow-sm">';
    h += '<h3 class="text-sm font-bold text-white flex items-center gap-2 mb-4"><span class="material-symbols-outlined text-blue-400 text-base">ads_click</span> Analise de Criativos</h3>';
    h += '<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">';
    if (cr.top.length > 0) {
        h += '<div><h4 class="text-xs font-bold text-emerald-400 mb-2 flex items-center gap-1"><span class="material-symbols-outlined text-xs">emoji_events</span> Melhores por Eficiencia</h4><div class="space-y-1.5">';
        var medals = ['1o', '2o', '3o', '4o', '5o'];
        cr.top.forEach(function(ad, i) {
            h += '<div class="flex items-center gap-2 text-xs p-2.5 bg-emerald-500/5 rounded-lg"><span class="text-emerald-400 font-bold w-5 text-center shrink-0">' + medals[i] + '</span>';
            h += '<div class="flex-1 min-w-0"><span class="text-white font-medium truncate block" title="' + ad.name + '">' + ad.name + '</span>';
            h += '<span class="text-slate-500">' + ad.results + ' res. a ' + fmtCur(ad.cpr) + ' | CTR: ' + ad.ctr.toFixed(1) + '%</span></div>';
            h += '<span class="text-slate-400 shrink-0">' + fmtCur(ad.spend) + '</span></div>';
        });
        h += '</div></div>';
    }
    if (cr.bottom.length > 0) {
        h += '<div><h4 class="text-xs font-bold text-red-400 mb-2 flex items-center gap-1"><span class="material-symbols-outlined text-xs">thumb_down</span> Revisar / Sem Resultado</h4><div class="space-y-1.5">';
        cr.bottom.forEach(function(ad) {
            h += '<div class="flex items-center gap-2 text-xs p-2.5 bg-red-500/5 rounded-lg"><span class="material-symbols-outlined text-red-400 text-sm shrink-0">close</span>';
            h += '<div class="flex-1 min-w-0"><span class="text-white font-medium truncate block" title="' + ad.name + '">' + ad.name + '</span>';
            h += '<span class="text-slate-500">' + ad.results + ' res. | ' + fmtNum(ad.impressions) + ' impr. | CTR: ' + ad.ctr.toFixed(1) + '%</span></div>';
            h += '<span class="text-slate-400 shrink-0">' + fmtCur(ad.spend) + '</span></div>';
        });
        h += '</div></div>';
    }
    h += '</div></div>';
    return h;
}

function renderDiagnosticHTML(items) {
    var h = '<div class="bg-surface-dark border border-border-dark rounded-xl sm:rounded-2xl p-4 sm:p-6 shadow-sm">';
    h += '<h3 class="text-sm font-bold text-white flex items-center gap-2 mb-4"><span class="material-symbols-outlined text-blue-400 text-base">psychology</span> Diagnostico e Recomendacoes</h3>';
    h += '<div class="space-y-2">';
    items.forEach(function(it) {
        var cm = { success: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/10', warning: 'text-amber-400 bg-amber-500/10 border-amber-500/10', danger: 'text-red-400 bg-red-500/10 border-red-500/10', info: 'text-blue-400 bg-blue-500/10 border-blue-500/10' };
        var cls = (cm[it.type] || cm.info).split(' ');
        h += '<div class="flex items-start gap-3 p-3 rounded-lg ' + cls[1] + ' border ' + cls[2] + '">';
        h += '<span class="material-symbols-outlined ' + cls[0] + ' text-lg shrink-0 mt-0.5">' + it.icon + '</span>';
        h += '<p class="text-sm text-slate-200 leading-relaxed">' + it.text + '</p></div>';
    });
    h += '</div></div>';
    return h;
}

// ==========================================
// EXPORTACAO PDF (padrao visual do relatorio)
// ==========================================

function exportMacroAnalysisPDF() {
    if (!macroAnalysisData) return;
    var data = macroAnalysisData;
    var a = data.analysis;

    var doc = new jspdf.jsPDF('p', 'mm', 'a4');
    var W = 210, M = 15, CW = W - 2 * M;
    var y = 0;

    // Cores (mesmo padrao do relatorio principal)
    var colors = {
        primary: [19, 127, 236],
        dark: [15, 23, 42],
        text: [30, 41, 59],
        textLight: [100, 116, 139],
        green: [16, 185, 129],
        red: [239, 68, 68],
        bgLight: [248, 250, 252],
        border: [226, 232, 240],
        white: [255, 255, 255],
        amber: [245, 158, 11]
    };

    function setColor(c) { doc.setTextColor(c[0], c[1], c[2]); }
    function setFill(c) { doc.setFillColor(c[0], c[1], c[2]); }
    function setDraw(c) { doc.setDrawColor(c[0], c[1], c[2]); }

    function checkPage(needed) { if (y + needed > 280) { addFooter(); doc.addPage(); y = M; } }

    var pageNum = 1;
    function addFooter() {
        doc.setFontSize(6.5); setColor(colors.textLight);
        doc.text('Milo MKT | Analise Macro gerada automaticamente pelo Painel Gerencial Meta Ads', M, 290);
        doc.text('Pagina ' + pageNum, W - M, 290, { align: 'right' });
        pageNum++;
    }

    // === HEADER ===
    // Barra superior amber
    setFill(colors.primary); doc.rect(0, 0, W, 3, 'F');
    y = 3;

    // Titulo
    y += 10;
    doc.setFontSize(18); doc.setFont('helvetica', 'bold'); setColor(colors.dark);
    doc.text('Analise Macro', M, y);
    y += 5;
    doc.setFontSize(9); doc.setFont('helvetica', 'normal'); setColor(colors.textLight);
    doc.text('Resumo de atividade da conta — Meta Ads', M, y);
    y += 8;

    // Info cards: Cliente + Periodo
    var cardW = 82, cardH = 14, gap = 6;
    setFill(colors.bgLight);
    doc.roundedRect(M, y, cardW, cardH, 2, 2, 'F');
    doc.roundedRect(M + cardW + gap, y, cardW, cardH, 2, 2, 'F');
    doc.setFontSize(7); setColor(colors.textLight);
    doc.text('CLIENTE', M + 4, y + 5);
    doc.text('PERIODO', M + cardW + gap + 4, y + 5);
    doc.setFontSize(9); doc.setFont('helvetica', 'bold'); setColor(colors.dark);
    doc.text(data.clientName.substring(0, 35), M + 4, y + 11);
    doc.text(formatDateBR(data.period.since) + ' a ' + formatDateBR(data.period.until), M + cardW + gap + 4, y + 11);
    y += cardH + 5;

    // Separador
    setDraw(colors.border); doc.setLineWidth(0.3); doc.line(M, y, M + CW, y);
    y += 6;

    // === SECAO 1: KPIs ===
    doc.setFontSize(11); doc.setFont('helvetica', 'bold'); setColor(colors.primary);
    doc.text('Visao Geral da Conta', M, y); y += 6;

    var cur = a.overview.current, ch = a.overview.changes;
    var kpis = [
        { label: 'INVESTIMENTO', value: fmtCur(cur.spend), change: ch.spend },
        { label: 'IMPRESSOES', value: fmtNum(cur.impressions), change: ch.impressions },
        { label: 'RESULTADOS', value: fmtNum(cur.leads), change: ch.leads },
        { label: 'CUSTO/RESULTADO', value: cur.cpl > 0 ? fmtCur(cur.cpl) : '--', change: ch.cpl, invert: true }
    ];
    var kW = 40, kH = 28, kGap = 3.3;
    kpis.forEach(function(kpi, i) {
        var x = M + i * (kW + kGap);
        setFill(colors.bgLight); doc.roundedRect(x, y, kW, kH, 2, 2, 'F');
        // Barra lateral
        setFill(colors.primary); doc.roundedRect(x + 1.5, y + 2, 1.2, kH - 4, 0.5, 0.5, 'F');
        // Label
        doc.setFontSize(6.5); doc.setFont('helvetica', 'normal'); setColor(colors.textLight);
        doc.text(kpi.label, x + 5, y + 7);
        // Valor
        doc.setFontSize(13); doc.setFont('helvetica', 'bold'); setColor(colors.dark);
        doc.text(kpi.value, x + 5, y + 15);
        // Variacao
        var isGood = kpi.invert ? kpi.change < 0 : kpi.change > 0;
        var isBad = kpi.invert ? kpi.change > 0 : kpi.change < 0;
        setColor(isGood ? colors.green : (isBad ? colors.red : colors.textLight));
        doc.setFontSize(7); doc.setFont('helvetica', 'bold');
        doc.text(fmtPct(kpi.change) + ' vs anterior', x + 5, y + 21);
    });
    y += kH + 6;

    // Campanhas ativas
    doc.setFontSize(8); doc.setFont('helvetica', 'normal'); setColor(colors.textLight);
    doc.text(cur.activeCampaigns + ' campanhas com veiculacao no periodo' + (ch.campaigns !== 0 ? ' (' + (ch.campaigns > 0 ? '+' : '') + ch.campaigns + ' vs anterior)' : ''), M, y);
    y += 8;

    // === SECAO 2: TIMELINE ===
    if (a.timeline.length > 0) {
        checkPage(20);
        setDraw(colors.border); doc.setLineWidth(0.15); doc.line(M, y, M + CW, y); y += 5;
        doc.setFontSize(11); doc.setFont('helvetica', 'bold'); setColor(colors.primary);
        doc.text('Timeline de Mudancas', M, y); y += 6;

        a.timeline.forEach(function(e) {
            checkPage(14);
            setFill(colors.bgLight); doc.roundedRect(M, y, CW, 10, 1, 1, 'F');
            // Indicador colorido
            var eColor = e.color === 'emerald' ? colors.green : (e.color === 'red' ? colors.red : (e.color === 'blue' ? colors.primary : colors.amber));
            setFill(eColor); doc.roundedRect(M + 1.5, y + 2, 1.2, 6, 0.5, 0.5, 'F');
            // Data
            doc.setFontSize(7); doc.setFont('helvetica', 'bold'); setColor(colors.textLight);
            doc.text(formatDateBR(e.date), M + 5, y + 4.5);
            // Texto
            doc.setFont('helvetica', 'normal'); setColor(colors.dark);
            var evText = e.text.length > 85 ? e.text.substring(0, 82) + '...' : e.text;
            doc.text(evText, M + 22, y + 4.5);
            // Detalhe
            if (e.detail) {
                doc.setFontSize(6); setColor(colors.textLight);
                doc.text(e.detail.substring(0, 90), M + 22, y + 8.5);
            }
            y += 12;
        });
        y += 3;
    }

    // === SECAO 3: PERFORMANCE ===
    checkPage(25);
    setDraw(colors.border); doc.setLineWidth(0.15); doc.line(M, y, M + CW, y); y += 5;
    doc.setFontSize(11); doc.setFont('helvetica', 'bold'); setColor(colors.primary);
    doc.text('Performance por Campanha', M, y); y += 6;

    // Header da tabela
    setFill(colors.primary); doc.roundedRect(M, y, CW, 7, 1, 1, 'F');
    doc.setFontSize(7); doc.setFont('helvetica', 'bold'); setColor(colors.white);
    doc.text('Campanha', M + 3, y + 5);
    doc.text('Tipo', M + 75, y + 5);
    doc.text('Invest.', M + 100, y + 5);
    doc.text('Resultado', M + 120, y + 5);
    doc.text('Custo/Res.', M + 142, y + 5);
    doc.text('Status', M + 164, y + 5);
    y += 9;

    a.campaignPerformance.forEach(function(c, i) {
        checkPage(8);
        if (i % 2 === 0) { setFill(colors.bgLight); doc.rect(M, y - 1, CW, 7, 'F'); }
        doc.setFontSize(7); doc.setFont('helvetica', 'normal'); setColor(colors.dark);
        var nm = c.name.length > 35 ? c.name.substring(0, 32) + '...' : c.name;
        doc.text(nm, M + 3, y + 4);
        setColor(colors.textLight);
        doc.text(c.objectiveLabel, M + 75, y + 4);
        setColor(colors.dark);
        doc.text(fmtCur(c.current.spend), M + 100, y + 4);
        doc.text(fmtNum(c.current.result) + ' ' + c.metricLabel, M + 120, y + 4);
        doc.text(c.current.costPerResult > 0 && c.current.costPerResult !== Infinity ? fmtCur(c.current.costPerResult) : '--', M + 142, y + 4);
        var vc = getVerdictConfig(c.verdict);
        var vColor = (c.verdict === 'melhorando' || c.verdict === 'escalando_bem' || c.verdict === 'nova') ? colors.green : ((c.verdict === 'piorando' || c.verdict === 'escalando_mal' || c.verdict === 'pausada' || c.verdict === 'sem_resultado') ? colors.red : colors.textLight);
        setColor(vColor); doc.setFont('helvetica', 'bold');
        doc.text(vc.label, M + 164, y + 4);
        y += 7;
    });
    y += 4;

    // === SECAO 6: DIAGNOSTICO ===
    checkPage(20);
    setDraw(colors.border); doc.setLineWidth(0.15); doc.line(M, y, M + CW, y); y += 5;
    doc.setFontSize(11); doc.setFont('helvetica', 'bold'); setColor(colors.primary);
    doc.text('Diagnostico e Recomendacoes', M, y); y += 6;

    a.diagnostic.forEach(function(item) {
        var lines = doc.splitTextToSize(item.text, CW - 10);
        var blockH = 4 + lines.length * 3.5;
        checkPage(blockH + 3);
        setFill(colors.bgLight); doc.roundedRect(M, y, CW, blockH, 1, 1, 'F');
        var iColor = item.type === 'success' ? colors.green : (item.type === 'danger' ? colors.red : (item.type === 'warning' ? colors.amber : colors.primary));
        setFill(iColor); doc.roundedRect(M + 1.5, y + 2, 1.2, blockH - 4, 0.5, 0.5, 'F');
        doc.setFontSize(7.5); doc.setFont('helvetica', 'normal'); setColor(colors.dark);
        doc.text(lines, M + 5, y + 5);
        y += blockH + 2;
    });

    // Footer
    addFooter();

    // Salvar
    var presetLabels = { 'last_7d': 'ULTIMOS 7 DIAS', 'last_14d': 'ULTIMOS 14 DIAS', 'last_28d': 'ULTIMOS 28 DIAS', 'last_30d': 'ULTIMOS 30 DIAS', 'this_week': 'ESTA SEMANA', 'last_week': 'SEMANA PASSADA', 'this_month': 'ESTE MES', 'last_month': 'MES PASSADO' };
    var periodLabel = presetLabels[data.period.preset] || data.period.label;
    doc.save('[MILO][' + data.clientName.toUpperCase() + '][ANALISE MACRO][' + periodLabel + '].pdf');
}
