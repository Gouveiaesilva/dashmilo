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

    // Esconder preview de relatorio e resultado anterior
    document.getElementById('reportPreview').classList.add('hidden');
    document.getElementById('reportProgress').classList.add('hidden');
    document.getElementById('macroAnalysisResult').classList.add('hidden');

    // Mostrar progresso
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

        if (!response.ok || result.error) {
            throw new Error(result.message || 'Erro ao buscar dados da analise macro');
        }

        progressBar.style.width = '60%';
        progressText.textContent = 'Analisando dados...';

        var raw = result.data || result;
        var analysis = analyzeMacroData(raw, period, prevPeriod);

        progressBar.style.width = '80%';
        progressText.textContent = 'Renderizando analise...';

        macroAnalysisData = {
            clientName: clientName,
            period: period,
            prevPeriod: prevPeriod,
            analysis: analysis,
            raw: raw
        };

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

    // Agrupar daily por campanha
    var currentByCampaign = groupDailybyCampaign(currentDaily);
    var prevByCampaign = groupDailybyCampaign(prevDaily);

    // 1. Visao geral
    var overview = buildOverview(currentByCampaign, prevByCampaign, campaigns);

    // 2. Timeline de mudancas
    var timeline = buildTimeline(currentByCampaign, prevByCampaign, campaigns, period);

    // 3. Performance por campanha
    var campaignPerformance = buildCampaignPerformance(currentByCampaign, prevByCampaign, campaigns);

    // 4. Campanhas novas e pausadas
    var lifecycle = buildLifecycle(currentByCampaign, prevByCampaign, campaigns);

    // 5. Top criativos
    var creatives = buildCreativeAnalysis(ads);

    // 6. Diagnostico
    var diagnostic = buildDiagnostic(overview, campaignPerformance, lifecycle, creatives);

    return { overview: overview, timeline: timeline, campaignPerformance: campaignPerformance, lifecycle: lifecycle, creatives: creatives, diagnostic: diagnostic };
}

function groupDailybyCampaign(dailyRows) {
    var map = {};
    dailyRows.forEach(function(row) {
        var id = row.campaign_id;
        if (!map[id]) {
            map[id] = { id: id, name: row.campaign_name, days: [], totalSpend: 0, totalImpressions: 0, totalClicks: 0, totalReach: 0, actions: {} };
        }
        var spend = parseFloat(row.spend || 0);
        var impressions = parseInt(row.impressions || 0);
        var clicks = parseInt(row.clicks || 0);
        var reach = parseInt(row.reach || 0);
        map[id].days.push({ date: row.date_start, spend: spend, impressions: impressions, clicks: clicks, reach: reach, actions: row.actions || [] });
        map[id].totalSpend += spend;
        map[id].totalImpressions += impressions;
        map[id].totalClicks += clicks;
        map[id].totalReach += reach;
        // Agregar actions
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
        var total = 0;
        leadTypes.forEach(function(t) { total += (actions[t] || 0); });
        if (total === 0) msgTypes.forEach(function(t) { total += (actions[t] || 0); });
        return { value: total, label: 'Leads', costLabel: 'CPL' };
    }
    if (objective === 'MESSAGES' || objective === 'OUTCOME_ENGAGEMENT') {
        var msgs = 0;
        msgTypes.forEach(function(t) { msgs += (actions[t] || 0); });
        if (msgs > 0) return { value: msgs, label: 'Conversas', costLabel: 'Custo/Conversa' };
        var leads = 0;
        leadTypes.forEach(function(t) { leads += (actions[t] || 0); });
        if (leads > 0) return { value: leads, label: 'Leads', costLabel: 'CPL' };
        return { value: 0, label: 'Conversas', costLabel: 'Custo/Conversa' };
    }
    if (objective === 'OUTCOME_TRAFFIC' || objective === 'LINK_CLICKS') {
        var linkClicks = actions['link_click'] || actions['landing_page_view'] || 0;
        return { value: linkClicks, label: 'Cliques', costLabel: 'CPC' };
    }
    if (objective === 'OUTCOME_AWARENESS' || objective === 'BRAND_AWARENESS' || objective === 'REACH') {
        return { value: 0, label: 'Alcance', costLabel: 'CPM', useReach: true };
    }
    // Default
    var anyLeads = 0;
    leadTypes.forEach(function(t) { anyLeads += (actions[t] || 0); });
    return { value: anyLeads, label: 'Resultados', costLabel: 'Custo/Resultado' };
}

function getObjectiveLabel(objective) {
    var labels = {
        'OUTCOME_LEADS': 'Leads', 'LEAD_GENERATION': 'Leads',
        'MESSAGES': 'Mensagens', 'OUTCOME_ENGAGEMENT': 'Engajamento',
        'OUTCOME_TRAFFIC': 'Trafego', 'LINK_CLICKS': 'Trafego',
        'OUTCOME_AWARENESS': 'Reconhecimento', 'BRAND_AWARENESS': 'Reconhecimento',
        'REACH': 'Alcance', 'OUTCOME_SALES': 'Vendas',
        'POST_ENGAGEMENT': 'Engajamento', 'VIDEO_VIEWS': 'Video Views'
    };
    return labels[objective] || objective;
}

// ==========================================
// SECAO 1: VISAO GERAL
// ==========================================

function buildOverview(currentMap, prevMap, campaigns) {
    var current = { spend: 0, impressions: 0, clicks: 0, reach: 0, leads: 0, activeCampaigns: 0 };
    var prev = { spend: 0, impressions: 0, clicks: 0, reach: 0, leads: 0, activeCampaigns: 0 };

    var leadTypes = ['onsite_conversion.lead_grouped', 'offsite_conversion.fb_pixel_lead', 'lead',
                     'onsite_conversion.messaging_conversation_started_7d', 'messaging_conversation_started_7d'];

    Object.keys(currentMap).forEach(function(id) {
        var c = currentMap[id];
        current.spend += c.totalSpend;
        current.impressions += c.totalImpressions;
        current.clicks += c.totalClicks;
        current.reach += c.totalReach;
        current.activeCampaigns++;
        leadTypes.forEach(function(t) { current.leads += (c.actions[t] || 0); });
    });

    Object.keys(prevMap).forEach(function(id) {
        var p = prevMap[id];
        prev.spend += p.totalSpend;
        prev.impressions += p.totalImpressions;
        prev.clicks += p.totalClicks;
        prev.reach += p.totalReach;
        prev.activeCampaigns++;
        leadTypes.forEach(function(t) { prev.leads += (p.actions[t] || 0); });
    });

    current.cpl = current.leads > 0 ? current.spend / current.leads : 0;
    prev.cpl = prev.leads > 0 ? prev.spend / prev.leads : 0;

    return {
        current: current,
        prev: prev,
        changes: {
            spend: calcPctChange(current.spend, prev.spend),
            impressions: calcPctChange(current.impressions, prev.impressions),
            leads: calcPctChange(current.leads, prev.leads),
            cpl: calcPctChange(current.cpl, prev.cpl),
            campaigns: current.activeCampaigns - prev.activeCampaigns
        }
    };
}

function calcPctChange(current, previous) {
    if (previous === 0) return current > 0 ? 100 : 0;
    return ((current - previous) / previous) * 100;
}

// ==========================================
// SECAO 2: TIMELINE
// ==========================================

function buildTimeline(currentMap, prevMap, campaigns, period) {
    var events = [];

    // Campanhas novas (no atual, nao no anterior)
    Object.keys(currentMap).forEach(function(id) {
        if (!prevMap[id]) {
            var c = currentMap[id];
            var days = c.days.filter(function(d) { return d.spend > 0; }).sort(function(a, b) { return a.date.localeCompare(b.date); });
            if (days.length > 0) {
                events.push({ date: days[0].date, type: 'new', icon: 'add_circle', color: 'emerald', text: 'Campanha "' + c.name + '" iniciou veiculacao', spend: c.totalSpend });
            }
        }
    });

    // Campanhas pausadas (no anterior, nao no atual)
    Object.keys(prevMap).forEach(function(id) {
        if (!currentMap[id]) {
            var p = prevMap[id];
            events.push({ date: period.since, type: 'stopped', icon: 'pause_circle', color: 'red', text: 'Campanha "' + p.name + '" parou de gastar', spend: p.totalSpend });
        }
    });

    // Deteccao mid-periodo (inicio/pausa no meio do periodo)
    Object.keys(currentMap).forEach(function(id) {
        if (prevMap[id]) {
            var c = currentMap[id];
            var activeDays = c.days.filter(function(d) { return d.spend > 0; }).sort(function(a, b) { return a.date.localeCompare(b.date); });
            if (activeDays.length === 0) return;

            var firstDay = activeDays[0].date;
            var lastDay = activeDays[activeDays.length - 1].date;

            if (firstDay > period.since) {
                events.push({ date: firstDay, type: 'resumed', icon: 'play_circle', color: 'blue', text: 'Campanha "' + c.name + '" retomou em ' + formatDateBR(firstDay) });
            }
            if (lastDay < period.until) {
                events.push({ date: lastDay, type: 'paused_mid', icon: 'pause', color: 'amber', text: 'Campanha "' + c.name + '" parou de gastar em ' + formatDateBR(lastDay) });
            }
        }
    });

    // Mudancas de orcamento (media diaria mudou >50%)
    Object.keys(currentMap).forEach(function(id) {
        if (!prevMap[id]) return;
        var cDays = currentMap[id].days.filter(function(d) { return d.spend > 0; });
        var pDays = prevMap[id].days.filter(function(d) { return d.spend > 0; });
        if (cDays.length === 0 || pDays.length === 0) return;

        var cAvg = currentMap[id].totalSpend / cDays.length;
        var pAvg = prevMap[id].totalSpend / pDays.length;
        if (pAvg === 0) return;

        var ratio = cAvg / pAvg;
        if (ratio > 1.5) {
            events.push({ date: period.since, type: 'budget_up', icon: 'trending_up', color: 'blue', text: 'Campanha "' + currentMap[id].name + '" aumentou gasto diario medio em ' + Math.round((ratio - 1) * 100) + '%' });
        } else if (ratio < 0.5) {
            events.push({ date: period.since, type: 'budget_down', icon: 'trending_down', color: 'amber', text: 'Campanha "' + currentMap[id].name + '" reduziu gasto diario medio em ' + Math.round((1 - ratio) * 100) + '%' });
        }
    });

    // Picos anormais de gasto (conta total por dia)
    var dailyTotals = {};
    Object.values(currentMap).forEach(function(c) {
        c.days.forEach(function(d) {
            if (!dailyTotals[d.date]) dailyTotals[d.date] = 0;
            dailyTotals[d.date] += d.spend;
        });
    });
    var dailyValues = Object.keys(dailyTotals).map(function(date) { return { date: date, spend: dailyTotals[date] }; });
    if (dailyValues.length > 2) {
        var avg = dailyValues.reduce(function(s, d) { return s + d.spend; }, 0) / dailyValues.length;
        var variance = dailyValues.reduce(function(s, d) { return s + Math.pow(d.spend - avg, 2); }, 0) / dailyValues.length;
        var stdDev = Math.sqrt(variance);
        if (stdDev > 0) {
            dailyValues.forEach(function(d) {
                if (d.spend > avg + 2 * stdDev) {
                    events.push({ date: d.date, type: 'spike', icon: 'priority_high', color: 'amber', text: 'Pico de gasto: ' + fmtCur(d.spend) + ' (media: ' + fmtCur(avg) + ')' });
                } else if (d.spend < avg - 2 * stdDev && d.spend > 0) {
                    events.push({ date: d.date, type: 'dip', icon: 'arrow_downward', color: 'amber', text: 'Queda de gasto: ' + fmtCur(d.spend) + ' (media: ' + fmtCur(avg) + ')' });
                }
            });
        }
    }

    events.sort(function(a, b) { return a.date.localeCompare(b.date); });
    return events;
}

// ==========================================
// SECAO 3: PERFORMANCE POR CAMPANHA
// ==========================================

function buildCampaignPerformance(currentMap, prevMap, campaigns) {
    var campaignMeta = {};
    campaigns.forEach(function(c) { campaignMeta[c.id] = c; });

    var results = [];

    // Campanhas ativas no periodo atual
    Object.keys(currentMap).forEach(function(id) {
        var c = currentMap[id];
        var meta = campaignMeta[id] || {};
        var objective = meta.objective || '';
        var metric = getMainMetric(objective, c.actions);

        var current = {
            spend: c.totalSpend,
            impressions: c.totalImpressions,
            result: metric.useReach ? c.totalReach : metric.value,
            costPerResult: metric.value > 0 ? c.totalSpend / metric.value : (metric.useReach && c.totalReach > 0 ? (c.totalSpend / c.totalReach) * 1000 : 0)
        };

        var prev = null;
        var changes = null;
        var verdict = 'nova';

        if (prevMap[id]) {
            var p = prevMap[id];
            var pMetric = getMainMetric(objective, p.actions);
            prev = {
                spend: p.totalSpend,
                impressions: p.totalImpressions,
                result: pMetric.useReach ? p.totalReach : pMetric.value,
                costPerResult: pMetric.value > 0 ? p.totalSpend / pMetric.value : (pMetric.useReach && p.totalReach > 0 ? (p.totalSpend / p.totalReach) * 1000 : 0)
            };
            changes = {
                spend: calcPctChange(current.spend, prev.spend),
                result: calcPctChange(current.result, prev.result),
                costPerResult: calcPctChange(current.costPerResult, prev.costPerResult)
            };
            verdict = getVerdict(changes);
        }

        results.push({
            id: id,
            name: c.name,
            objective: objective,
            objectiveLabel: getObjectiveLabel(objective),
            status: (meta.effective_status || meta.status || '').toUpperCase(),
            metricLabel: metric.label,
            costLabel: metric.costLabel,
            current: current,
            prev: prev,
            changes: changes,
            verdict: verdict
        });
    });

    // Campanhas que tinham gasto no anterior mas nao no atual
    Object.keys(prevMap).forEach(function(id) {
        if (currentMap[id]) return;
        var p = prevMap[id];
        var meta = campaignMeta[id] || {};
        var objective = meta.objective || '';
        var metric = getMainMetric(objective, p.actions);

        results.push({
            id: id,
            name: p.name,
            objective: objective,
            objectiveLabel: getObjectiveLabel(objective),
            status: (meta.effective_status || meta.status || 'PAUSED').toUpperCase(),
            metricLabel: metric.label,
            costLabel: metric.costLabel,
            current: { spend: 0, impressions: 0, result: 0, costPerResult: 0 },
            prev: { spend: p.totalSpend, impressions: p.totalImpressions, result: metric.value, costPerResult: metric.value > 0 ? p.totalSpend / metric.value : 0 },
            changes: null,
            verdict: 'pausada'
        });
    });

    results.sort(function(a, b) { return b.current.spend - a.current.spend; });
    return results;
}

function getVerdict(changes) {
    if (!changes) return 'nova';
    var cpr = changes.costPerResult;
    var res = changes.result;
    var spe = changes.spend;

    if (res > 10 && cpr < -10) return 'melhorando';
    if (res > 10 && cpr >= -10 && cpr <= 10) return 'escalando_bem';
    if (spe > 20 && cpr > 20) return 'escalando_mal';
    if (cpr > 20 || res < -20) return 'piorando';
    if (Math.abs(cpr) <= 10 && Math.abs(res) <= 10) return 'estavel';
    if (res > 10) return 'melhorando';
    if (cpr < -10) return 'melhorando';
    return 'estavel';
}

// ==========================================
// SECAO 4: CICLO DE VIDA
// ==========================================

function buildLifecycle(currentMap, prevMap, campaigns) {
    var campaignMeta = {};
    campaigns.forEach(function(c) { campaignMeta[c.id] = c; });

    var newCampaigns = [];
    var stoppedCampaigns = [];

    Object.keys(currentMap).forEach(function(id) {
        if (!prevMap[id]) {
            var c = currentMap[id];
            var meta = campaignMeta[id] || {};
            var metric = getMainMetric(meta.objective || '', c.actions);
            newCampaigns.push({ name: c.name, objective: getObjectiveLabel(meta.objective || ''), spend: c.totalSpend, result: metric.value, resultLabel: metric.label });
        }
    });

    Object.keys(prevMap).forEach(function(id) {
        if (!currentMap[id]) {
            var p = prevMap[id];
            var meta = campaignMeta[id] || {};
            var metric = getMainMetric(meta.objective || '', p.actions);
            stoppedCampaigns.push({ name: p.name, objective: getObjectiveLabel(meta.objective || ''), spend: p.totalSpend, result: metric.value, resultLabel: metric.label });
        }
    });

    return { newCampaigns: newCampaigns, stoppedCampaigns: stoppedCampaigns };
}

// ==========================================
// SECAO 5: CRIATIVOS
// ==========================================

function buildCreativeAnalysis(ads) {
    if (!ads || ads.length === 0) return { top: [], bottom: [] };

    var leadTypes = ['onsite_conversion.lead_grouped', 'offsite_conversion.fb_pixel_lead', 'lead',
                     'onsite_conversion.messaging_conversation_started_7d', 'messaging_conversation_started_7d'];

    var processed = ads.map(function(ad) {
        var spend = parseFloat(ad.spend || 0);
        var impressions = parseInt(ad.impressions || 0);
        var clicks = parseInt(ad.clicks || 0);
        var results = 0;
        (ad.actions || []).forEach(function(a) {
            if (leadTypes.indexOf(a.action_type) !== -1) results += parseInt(a.value || 0);
        });
        return {
            id: ad.ad_id,
            name: ad.ad_name,
            campaignName: ad.campaign_name || '',
            spend: spend,
            impressions: impressions,
            clicks: clicks,
            results: results,
            cpr: results > 0 ? spend / results : (spend > 0 ? Infinity : 0)
        };
    }).filter(function(a) { return a.spend > 0 && a.impressions > 100; });

    var withResults = processed.filter(function(a) { return a.results > 0; });
    withResults.sort(function(a, b) { return a.cpr - b.cpr; });

    var top = withResults.slice(0, 3);
    var bottom = processed.filter(function(a) { return a.results === 0 && a.spend > 0; })
        .sort(function(a, b) { return b.spend - a.spend; })
        .slice(0, 3);

    // Se nao houver sem resultado, pegar os piores CPR
    if (bottom.length === 0 && withResults.length > 3) {
        bottom = withResults.slice(-3).reverse();
    }

    return { top: top, bottom: bottom };
}

// ==========================================
// SECAO 6: DIAGNOSTICO
// ==========================================

function buildDiagnostic(overview, campaignPerformance, lifecycle, creatives) {
    var items = [];
    var curr = overview.current;
    var changes = overview.changes;

    // Concentracao de investimento
    var activeCampaigns = campaignPerformance.filter(function(c) { return c.current.spend > 0; });
    if (activeCampaigns.length > 0 && curr.spend > 0) {
        var topSpend = activeCampaigns[0];
        var pct = (topSpend.current.spend / curr.spend) * 100;
        if (pct > 70 && activeCampaigns.length > 1) {
            items.push({ type: 'warning', icon: 'pie_chart', text: 'A conta concentra ' + Math.round(pct) + '% do investimento na campanha "' + topSpend.name + '" — risco de dependencia.' });
        }
    }

    // Campanhas sem resultado
    var noResults = activeCampaigns.filter(function(c) { return c.current.result === 0 && c.current.spend > 10; });
    if (noResults.length > 0) {
        var totalWaste = noResults.reduce(function(s, c) { return s + c.current.spend; }, 0);
        items.push({ type: 'danger', icon: 'money_off', text: noResults.length + ' campanha(s) gastaram ' + fmtCur(totalWaste) + ' sem gerar nenhum resultado — revisar ou pausar.' });
    }

    // CPL geral subiu
    if (changes.cpl > 15 && curr.leads > 0) {
        var worstCampaigns = campaignPerformance
            .filter(function(c) { return c.changes && c.changes.costPerResult > 20 && c.current.result > 0; })
            .map(function(c) { return c.name; }).slice(0, 2);
        var detail = worstCampaigns.length > 0 ? ' — impactado por: ' + worstCampaigns.join(', ') : '';
        items.push({ type: 'warning', icon: 'trending_up', text: 'Custo por resultado geral subiu ' + Math.round(changes.cpl) + '% em relacao ao periodo anterior' + detail + '.' });
    }

    // CPL geral caiu
    if (changes.cpl < -15 && curr.leads > 0) {
        items.push({ type: 'success', icon: 'trending_down', text: 'Custo por resultado geral caiu ' + Math.round(Math.abs(changes.cpl)) + '% — boa performance no periodo.' });
    }

    // Campanhas novas performando bem
    if (lifecycle.newCampaigns.length > 0) {
        var goodNew = lifecycle.newCampaigns.filter(function(c) { return c.result > 0; });
        if (goodNew.length > 0) {
            items.push({ type: 'success', icon: 'new_releases', text: goodNew.length + ' campanha(s) nova(s) ja geraram resultados — acompanhe a escalabilidade.' });
        }
    }

    // Campanhas piorando
    var worsening = campaignPerformance.filter(function(c) { return c.verdict === 'piorando'; });
    if (worsening.length > 0) {
        items.push({ type: 'warning', icon: 'warning', text: worsening.length + ' campanha(s) com piora significativa: ' + worsening.map(function(c) { return c.name; }).slice(0, 2).join(', ') + '. Considere revisar criativos e segmentacao.' });
    }

    // Criativos sem resultado
    if (creatives.bottom.length > 0) {
        var bottomSpend = creatives.bottom.reduce(function(s, c) { return s + c.spend; }, 0);
        items.push({ type: 'info', icon: 'image_not_supported', text: creatives.bottom.length + ' anuncio(s) com gasto de ' + fmtCur(bottomSpend) + ' sem resultados — considere substituir criativos.' });
    }

    if (items.length === 0) {
        items.push({ type: 'success', icon: 'check_circle', text: 'Conta operando dentro dos parametros normais no periodo analisado.' });
    }

    return items;
}

// ==========================================
// HELPERS DE FORMATACAO
// ==========================================

function fmtCur(value) {
    return 'R$ ' + value.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function fmtNum(value) {
    return value.toLocaleString('pt-BR');
}

function fmtPct(value) {
    var prefix = value > 0 ? '+' : '';
    return prefix + Math.round(value) + '%';
}

// ==========================================
// RENDERIZACAO
// ==========================================

function renderMacroAnalysis(data) {
    var container = document.getElementById('macroAnalysisResult');
    var analysis = data.analysis;
    var period = data.period;

    var html = '';

    // Header com acoes
    html += '<div class="bg-surface-dark border border-border-dark rounded-xl sm:rounded-2xl p-4 sm:p-6 shadow-sm">';
    html += '<div class="flex items-center justify-between mb-4">';
    html += '<div>';
    html += '<h2 class="text-lg font-bold text-white flex items-center gap-2"><span class="material-symbols-outlined text-amber-400">query_stats</span> Analise Macro</h2>';
    html += '<p class="text-xs text-slate-500 mt-1">' + data.clientName + ' — ' + formatDateBR(period.since) + ' a ' + formatDateBR(period.until) + '</p>';
    html += '</div>';
    html += '<button onclick="exportMacroAnalysisPDF()" class="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-bold transition-colors">';
    html += '<span class="material-symbols-outlined text-base">picture_as_pdf</span> Exportar PDF</button>';
    html += '</div>';

    // Secao 1: Visao Geral
    html += renderOverviewSection(analysis.overview);
    html += '</div>';

    // Secao 2: Timeline
    if (analysis.timeline.length > 0) {
        html += renderTimelineSection(analysis.timeline);
    }

    // Secao 3: Performance por Campanha
    html += renderCampaignPerformanceSection(analysis.campaignPerformance);

    // Secao 4: Ciclo de Vida
    if (analysis.lifecycle.newCampaigns.length > 0 || analysis.lifecycle.stoppedCampaigns.length > 0) {
        html += renderLifecycleSection(analysis.lifecycle);
    }

    // Secao 5: Criativos
    if (analysis.creatives.top.length > 0 || analysis.creatives.bottom.length > 0) {
        html += renderCreativesSection(analysis.creatives);
    }

    // Secao 6: Diagnostico
    html += renderDiagnosticSection(analysis.diagnostic);

    container.innerHTML = html;
}

function renderOverviewSection(overview) {
    var curr = overview.current;
    var ch = overview.changes;

    function kpiCard(label, value, change, invertColor) {
        var color = change > 0 ? (invertColor ? 'text-red-400' : 'text-emerald-400') : (change < 0 ? (invertColor ? 'text-emerald-400' : 'text-red-400') : 'text-slate-400');
        var arrow = change > 0 ? 'arrow_upward' : (change < 0 ? 'arrow_downward' : 'remove');
        return '<div class="bg-background-dark border border-border-dark rounded-xl p-4">' +
            '<span class="text-[10px] font-bold text-slate-500 uppercase">' + label + '</span>' +
            '<p class="text-xl font-bold text-white mt-1">' + value + '</p>' +
            '<div class="flex items-center gap-1 mt-2 ' + color + ' text-xs font-bold">' +
            '<span class="material-symbols-outlined text-xs">' + arrow + '</span>' +
            '<span>' + fmtPct(change) + ' vs anterior</span></div></div>';
    }

    var html = '<div class="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-4">';
    html += kpiCard('Investimento Total', fmtCur(curr.spend), ch.spend, false);
    html += kpiCard('Impressoes', fmtNum(curr.impressions), ch.impressions, false);
    html += kpiCard('Resultados (Leads/Conversas)', fmtNum(curr.leads), ch.leads, false);
    html += kpiCard('Custo por Resultado', curr.cpl > 0 ? fmtCur(curr.cpl) : '--', ch.cpl, true);
    html += '</div>';
    html += '<p class="text-xs text-slate-500 mt-3"><span class="font-semibold text-white">' + curr.activeCampaigns + '</span> campanhas ativas no periodo';
    if (ch.campaigns !== 0) {
        html += ' (' + (ch.campaigns > 0 ? '+' : '') + ch.campaigns + ' vs anterior)';
    }
    html += '</p>';
    return html;
}

function renderTimelineSection(timeline) {
    var html = '<div class="bg-surface-dark border border-border-dark rounded-xl sm:rounded-2xl p-4 sm:p-6 shadow-sm">';
    html += '<h3 class="text-sm font-bold text-white flex items-center gap-2 mb-4"><span class="material-symbols-outlined text-amber-400 text-base">timeline</span> Timeline de Mudancas</h3>';
    html += '<div class="space-y-2">';
    timeline.forEach(function(event) {
        var colorMap = { emerald: 'text-emerald-400 bg-emerald-500/10', red: 'text-red-400 bg-red-500/10', blue: 'text-blue-400 bg-blue-500/10', amber: 'text-amber-400 bg-amber-500/10' };
        var colors = colorMap[event.color] || 'text-slate-400 bg-slate-500/10';
        html += '<div class="flex items-start gap-3 p-3 rounded-lg ' + colors.split(' ')[1] + ' border border-' + event.color + '-500/10">';
        html += '<span class="material-symbols-outlined ' + colors.split(' ')[0] + ' text-lg shrink-0 mt-0.5">' + event.icon + '</span>';
        html += '<div class="flex-1 min-w-0">';
        html += '<p class="text-sm text-white">' + event.text + '</p>';
        html += '<p class="text-[10px] text-slate-500 mt-0.5">' + formatDateBR(event.date) + '</p>';
        html += '</div></div>';
    });
    html += '</div></div>';
    return html;
}

function renderCampaignPerformanceSection(campaigns) {
    var html = '<div class="bg-surface-dark border border-border-dark rounded-xl sm:rounded-2xl p-4 sm:p-6 shadow-sm">';
    html += '<h3 class="text-sm font-bold text-white flex items-center gap-2 mb-4"><span class="material-symbols-outlined text-amber-400 text-base">leaderboard</span> Performance por Campanha</h3>';

    if (campaigns.length === 0) {
        html += '<p class="text-sm text-slate-500">Nenhuma campanha com gasto no periodo.</p>';
        html += '</div>';
        return html;
    }

    // Tabela responsiva
    html += '<div class="overflow-x-auto">';
    html += '<table class="w-full text-xs">';
    html += '<thead><tr class="text-slate-500 border-b border-border-dark">';
    html += '<th class="text-left py-2 pr-3 font-semibold">Campanha</th>';
    html += '<th class="text-left py-2 px-2 font-semibold hidden sm:table-cell">Tipo</th>';
    html += '<th class="text-right py-2 px-2 font-semibold">Invest.</th>';
    html += '<th class="text-right py-2 px-2 font-semibold">Resultado</th>';
    html += '<th class="text-right py-2 px-2 font-semibold">Custo/Res.</th>';
    html += '<th class="text-right py-2 px-2 font-semibold hidden sm:table-cell">Var.</th>';
    html += '<th class="text-right py-2 pl-2 font-semibold">Status</th>';
    html += '</tr></thead><tbody>';

    campaigns.forEach(function(c) {
        var verdictConfig = getVerdictConfig(c.verdict);
        var cprText = c.current.costPerResult > 0 ? fmtCur(c.current.costPerResult) : '--';
        var changeText = c.changes ? fmtPct(c.changes.costPerResult) : '--';
        var changeColor = c.changes ? (c.changes.costPerResult > 10 ? 'text-red-400' : (c.changes.costPerResult < -10 ? 'text-emerald-400' : 'text-slate-400')) : 'text-slate-500';

        html += '<tr class="border-b border-border-dark/50 hover:bg-background-dark/50">';
        html += '<td class="py-2.5 pr-3"><span class="text-white font-medium truncate block max-w-[200px]" title="' + c.name + '">' + c.name + '</span></td>';
        html += '<td class="py-2.5 px-2 text-slate-400 hidden sm:table-cell">' + c.objectiveLabel + '</td>';
        html += '<td class="py-2.5 px-2 text-right text-white font-medium">' + fmtCur(c.current.spend) + '</td>';
        html += '<td class="py-2.5 px-2 text-right text-white">' + fmtNum(c.current.result) + ' <span class="text-slate-500">' + c.metricLabel + '</span></td>';
        html += '<td class="py-2.5 px-2 text-right text-white">' + cprText + '</td>';
        html += '<td class="py-2.5 px-2 text-right ' + changeColor + ' hidden sm:table-cell">' + changeText + '</td>';
        html += '<td class="py-2.5 pl-2 text-right"><span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ' + verdictConfig.classes + '">';
        html += '<span class="material-symbols-outlined text-[10px]">' + verdictConfig.icon + '</span>' + verdictConfig.label + '</span></td>';
        html += '</tr>';
    });

    html += '</tbody></table></div></div>';
    return html;
}

function getVerdictConfig(verdict) {
    var configs = {
        melhorando: { label: 'Melhorando', icon: 'trending_up', classes: 'text-emerald-400 bg-emerald-500/10' },
        escalando_bem: { label: 'Escalando', icon: 'rocket_launch', classes: 'text-blue-400 bg-blue-500/10' },
        escalando_mal: { label: 'Escalando mal', icon: 'warning', classes: 'text-red-400 bg-red-500/10' },
        piorando: { label: 'Piorando', icon: 'trending_down', classes: 'text-red-400 bg-red-500/10' },
        estavel: { label: 'Estavel', icon: 'check_circle', classes: 'text-slate-400 bg-slate-500/10' },
        nova: { label: 'Nova', icon: 'add_circle', classes: 'text-emerald-400 bg-emerald-500/10' },
        pausada: { label: 'Pausada', icon: 'pause_circle', classes: 'text-red-400 bg-red-500/10' }
    };
    return configs[verdict] || configs.estavel;
}

function renderLifecycleSection(lifecycle) {
    var html = '<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">';

    if (lifecycle.newCampaigns.length > 0) {
        html += '<div class="bg-surface-dark border border-emerald-500/20 rounded-xl p-4 sm:p-6">';
        html += '<h3 class="text-sm font-bold text-emerald-400 flex items-center gap-2 mb-3"><span class="material-symbols-outlined text-base">add_circle</span> Campanhas Novas (' + lifecycle.newCampaigns.length + ')</h3>';
        html += '<div class="space-y-2">';
        lifecycle.newCampaigns.forEach(function(c) {
            html += '<div class="flex items-center justify-between text-xs p-2 bg-emerald-500/5 rounded-lg">';
            html += '<div><span class="text-white font-medium">' + c.name + '</span><span class="text-slate-500 ml-2">' + c.objective + '</span></div>';
            html += '<div class="text-right text-slate-400">' + fmtCur(c.spend) + ' | ' + c.result + ' ' + c.resultLabel + '</div>';
            html += '</div>';
        });
        html += '</div></div>';
    }

    if (lifecycle.stoppedCampaigns.length > 0) {
        html += '<div class="bg-surface-dark border border-red-500/20 rounded-xl p-4 sm:p-6">';
        html += '<h3 class="text-sm font-bold text-red-400 flex items-center gap-2 mb-3"><span class="material-symbols-outlined text-base">pause_circle</span> Campanhas Pausadas (' + lifecycle.stoppedCampaigns.length + ')</h3>';
        html += '<div class="space-y-2">';
        lifecycle.stoppedCampaigns.forEach(function(c) {
            html += '<div class="flex items-center justify-between text-xs p-2 bg-red-500/5 rounded-lg">';
            html += '<div><span class="text-white font-medium">' + c.name + '</span><span class="text-slate-500 ml-2">' + c.objective + '</span></div>';
            html += '<div class="text-right text-slate-400">Gastava ' + fmtCur(c.spend) + '/periodo</div>';
            html += '</div>';
        });
        html += '</div></div>';
    }

    html += '</div>';
    return html;
}

function renderCreativesSection(creatives) {
    var html = '<div class="bg-surface-dark border border-border-dark rounded-xl sm:rounded-2xl p-4 sm:p-6 shadow-sm">';
    html += '<h3 class="text-sm font-bold text-white flex items-center gap-2 mb-4"><span class="material-symbols-outlined text-amber-400 text-base">ads_click</span> Analise de Criativos</h3>';
    html += '<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">';

    if (creatives.top.length > 0) {
        html += '<div>';
        html += '<h4 class="text-xs font-bold text-emerald-400 mb-2 flex items-center gap-1"><span class="material-symbols-outlined text-xs">emoji_events</span> Melhores por Eficiencia</h4>';
        html += '<div class="space-y-1.5">';
        creatives.top.forEach(function(ad, i) {
            var medals = ['🥇', '🥈', '🥉'];
            html += '<div class="flex items-center gap-2 text-xs p-2 bg-emerald-500/5 rounded-lg">';
            html += '<span>' + (medals[i] || '') + '</span>';
            html += '<div class="flex-1 min-w-0"><span class="text-white font-medium truncate block max-w-[180px]" title="' + ad.name + '">' + ad.name + '</span>';
            html += '<span class="text-slate-500">' + ad.results + ' res. | ' + fmtCur(ad.cpr) + '/res.</span></div>';
            html += '<span class="text-slate-400 shrink-0">' + fmtCur(ad.spend) + '</span></div>';
        });
        html += '</div></div>';
    }

    if (creatives.bottom.length > 0) {
        html += '<div>';
        html += '<h4 class="text-xs font-bold text-red-400 mb-2 flex items-center gap-1"><span class="material-symbols-outlined text-xs">thumb_down</span> Revisar / Sem Resultado</h4>';
        html += '<div class="space-y-1.5">';
        creatives.bottom.forEach(function(ad) {
            html += '<div class="flex items-center gap-2 text-xs p-2 bg-red-500/5 rounded-lg">';
            html += '<span class="material-symbols-outlined text-red-400 text-sm">close</span>';
            html += '<div class="flex-1 min-w-0"><span class="text-white font-medium truncate block max-w-[180px]" title="' + ad.name + '">' + ad.name + '</span>';
            html += '<span class="text-slate-500">' + ad.results + ' res. | ' + fmtNum(ad.impressions) + ' impr.</span></div>';
            html += '<span class="text-slate-400 shrink-0">' + fmtCur(ad.spend) + '</span></div>';
        });
        html += '</div></div>';
    }

    html += '</div></div>';
    return html;
}

function renderDiagnosticSection(items) {
    var html = '<div class="bg-surface-dark border border-border-dark rounded-xl sm:rounded-2xl p-4 sm:p-6 shadow-sm">';
    html += '<h3 class="text-sm font-bold text-white flex items-center gap-2 mb-4"><span class="material-symbols-outlined text-amber-400 text-base">psychology</span> Diagnostico e Recomendacoes</h3>';
    html += '<div class="space-y-2">';

    items.forEach(function(item) {
        var colorMap = { success: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/10', warning: 'text-amber-400 bg-amber-500/10 border-amber-500/10', danger: 'text-red-400 bg-red-500/10 border-red-500/10', info: 'text-blue-400 bg-blue-500/10 border-blue-500/10' };
        var colors = colorMap[item.type] || colorMap.info;
        var parts = colors.split(' ');
        html += '<div class="flex items-start gap-3 p-3 rounded-lg ' + parts[1] + ' border ' + parts[2] + '">';
        html += '<span class="material-symbols-outlined ' + parts[0] + ' text-lg shrink-0 mt-0.5">' + item.icon + '</span>';
        html += '<p class="text-sm text-white">' + item.text + '</p>';
        html += '</div>';
    });

    html += '</div></div>';
    return html;
}

// ==========================================
// EXPORTACAO PDF
// ==========================================

function exportMacroAnalysisPDF() {
    if (!macroAnalysisData) return;

    var data = macroAnalysisData;
    var analysis = data.analysis;
    var doc = new jspdf.jsPDF('p', 'mm', 'a4');
    var pageWidth = 210;
    var margin = 15;
    var contentWidth = pageWidth - 2 * margin;
    var y = margin;

    function checkPage(needed) {
        if (y + needed > 280) {
            doc.addPage();
            y = margin;
        }
    }

    function drawSectionTitle(title, iconColor) {
        checkPage(15);
        doc.setFillColor(30, 30, 40);
        doc.roundedRect(margin, y, contentWidth, 10, 2, 2, 'F');
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(iconColor[0], iconColor[1], iconColor[2]);
        doc.text(title, margin + 4, y + 7);
        y += 14;
    }

    // Header
    doc.setFillColor(20, 20, 30);
    doc.rect(0, 0, pageWidth, 35, 'F');
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255, 191, 0);
    doc.text('ANALISE MACRO', margin, 15);
    doc.setFontSize(10);
    doc.setTextColor(180, 180, 200);
    doc.text(data.clientName, margin, 23);
    doc.text(formatDateBR(data.period.since) + ' a ' + formatDateBR(data.period.until), margin, 29);
    y = 42;

    // Secao 1: Visao Geral
    drawSectionTitle('VISAO GERAL DA CONTA', [255, 191, 0]);
    var curr = analysis.overview.current;
    var ch = analysis.overview.changes;

    var kpis = [
        { label: 'Investimento', value: fmtCur(curr.spend), change: fmtPct(ch.spend) },
        { label: 'Impressoes', value: fmtNum(curr.impressions), change: fmtPct(ch.impressions) },
        { label: 'Resultados', value: fmtNum(curr.leads), change: fmtPct(ch.leads) },
        { label: 'Custo/Resultado', value: curr.cpl > 0 ? fmtCur(curr.cpl) : '--', change: fmtPct(ch.cpl) }
    ];
    var kpiWidth = contentWidth / 4;
    kpis.forEach(function(kpi, i) {
        var x = margin + i * kpiWidth;
        doc.setFillColor(25, 25, 35);
        doc.roundedRect(x + 1, y, kpiWidth - 2, 18, 2, 2, 'F');
        doc.setFontSize(7);
        doc.setTextColor(120, 120, 140);
        doc.text(kpi.label.toUpperCase(), x + 4, y + 6);
        doc.setFontSize(11);
        doc.setTextColor(255, 255, 255);
        doc.text(kpi.value, x + 4, y + 13);
        doc.setFontSize(7);
        var chVal = parseFloat(kpi.change);
        doc.setTextColor(chVal > 0 ? 74 : (chVal < 0 ? 248 : 150), chVal > 0 ? 222 : (chVal < 0 ? 113 : 150), chVal > 0 ? 128 : (chVal < 0 ? 113 : 160));
        doc.text(kpi.change + ' vs anterior', x + 4, y + 17);
    });
    y += 24;

    // Secao 2: Timeline
    if (analysis.timeline.length > 0) {
        drawSectionTitle('TIMELINE DE MUDANCAS', [255, 191, 0]);
        analysis.timeline.forEach(function(event) {
            checkPage(8);
            doc.setFontSize(8);
            doc.setTextColor(120, 120, 140);
            doc.text(formatDateBR(event.date), margin + 2, y + 5);
            doc.setTextColor(220, 220, 230);
            doc.text(event.text, margin + 25, y + 5);
            y += 7;
        });
        y += 4;
    }

    // Secao 3: Performance por Campanha
    drawSectionTitle('PERFORMANCE POR CAMPANHA', [255, 191, 0]);
    // Table header
    doc.setFontSize(7);
    doc.setTextColor(120, 120, 140);
    doc.text('Campanha', margin + 2, y + 4);
    doc.text('Invest.', margin + 80, y + 4);
    doc.text('Result.', margin + 105, y + 4);
    doc.text('Custo/Res.', margin + 125, y + 4);
    doc.text('Status', margin + 155, y + 4);
    y += 7;
    doc.setDrawColor(50, 50, 60);
    doc.line(margin, y, margin + contentWidth, y);
    y += 2;

    analysis.campaignPerformance.forEach(function(c) {
        checkPage(7);
        doc.setFontSize(7);
        doc.setTextColor(220, 220, 230);
        var name = c.name.length > 40 ? c.name.substring(0, 37) + '...' : c.name;
        doc.text(name, margin + 2, y + 4);
        doc.text(fmtCur(c.current.spend), margin + 80, y + 4);
        doc.text(fmtNum(c.current.result), margin + 105, y + 4);
        doc.text(c.current.costPerResult > 0 ? fmtCur(c.current.costPerResult) : '--', margin + 125, y + 4);
        var vc = getVerdictConfig(c.verdict);
        doc.setTextColor(c.verdict === 'melhorando' || c.verdict === 'escalando_bem' || c.verdict === 'nova' ? 74 : (c.verdict === 'piorando' || c.verdict === 'escalando_mal' || c.verdict === 'pausada' ? 248 : 150),
                         c.verdict === 'melhorando' || c.verdict === 'escalando_bem' || c.verdict === 'nova' ? 222 : (c.verdict === 'piorando' || c.verdict === 'escalando_mal' || c.verdict === 'pausada' ? 113 : 150),
                         c.verdict === 'melhorando' || c.verdict === 'escalando_bem' || c.verdict === 'nova' ? 128 : (c.verdict === 'piorando' || c.verdict === 'escalando_mal' || c.verdict === 'pausada' ? 113 : 160));
        doc.text(vc.label, margin + 155, y + 4);
        y += 6;
    });
    y += 4;

    // Secao 6: Diagnostico
    drawSectionTitle('DIAGNOSTICO E RECOMENDACOES', [255, 191, 0]);
    analysis.diagnostic.forEach(function(item) {
        checkPage(12);
        doc.setFillColor(25, 25, 35);
        doc.roundedRect(margin, y, contentWidth, 8, 1, 1, 'F');
        doc.setFontSize(8);
        doc.setTextColor(220, 220, 230);
        var text = item.text.length > 100 ? item.text.substring(0, 97) + '...' : item.text;
        doc.text(text, margin + 4, y + 5.5);
        y += 10;
    });

    // Footer
    y += 6;
    doc.setFontSize(7);
    doc.setTextColor(100, 100, 120);
    doc.text('Gerado automaticamente por MILO Dashboard | ' + new Date().toLocaleDateString('pt-BR'), margin, y);

    // Salvar
    var presetLabels = {
        'last_7d': 'ULTIMOS 7 DIAS', 'last_14d': 'ULTIMOS 14 DIAS',
        'last_28d': 'ULTIMOS 28 DIAS', 'last_30d': 'ULTIMOS 30 DIAS',
        'this_week': 'ESTA SEMANA', 'last_week': 'SEMANA PASSADA',
        'this_month': 'ESTE MES', 'last_month': 'MES PASSADO'
    };
    var periodLabel = presetLabels[data.period.preset] || data.period.label;
    var clientName = data.clientName.toUpperCase();
    doc.save('[MILO][' + clientName + '][ANALISE MACRO][' + periodLabel + '].pdf');
}
