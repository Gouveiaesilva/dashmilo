// ==========================================
// RELATORIOS - GERADOR DE RELATORIOS
// ==========================================

// Dados do preview para export PDF posterior
var reportPreviewData = null;

// ==========================================
// INICIALIZACAO E UI
// ==========================================

async function populateReportClientFilter() {
    const select = document.getElementById('reportClientFilter');
    const clients = await loadClients();

    const currentValue = select.value;
    while (select.options.length > 1) select.remove(1);

    clients.forEach(client => {
        const option = document.createElement('option');
        option.value = client.id;
        option.textContent = client.name;
        option.dataset.adAccountId = client.adAccountId;
        select.appendChild(option);
    });

    if (currentValue) select.value = currentValue;

    onReportClientChange();
}

function onReportClientChange() {
    updateReportPeriodInfo();
}

function onReportPeriodChange() {
    updateReportPeriodInfo();
}

function updateReportPeriodInfo() {
    const clientSelect = document.getElementById('reportClientFilter');
    const btn = document.getElementById('generateReportBtn');
    const macroBtn = document.getElementById('generateMacroBtn');
    const periodInfo = document.getElementById('reportPeriodInfo');
    const periodText = document.getElementById('reportPeriodText');

    if (clientSelect.value) {
        btn.disabled = false;
        if (macroBtn) macroBtn.disabled = false;
        periodInfo.classList.remove('hidden');

        const period = getReportPeriod();
        const prevPeriod = getPreviousPeriod(period.since, period.until);

        periodText.innerHTML =
            '<strong>Periodo do relatorio:</strong> ' + formatDateBR(period.since) + ' a ' + formatDateBR(period.until) +
            '<br><strong>Comparacao:</strong> periodo anterior (' + formatDateBR(prevPeriod.since) + ' a ' + formatDateBR(prevPeriod.until) + ')';
    } else {
        btn.disabled = true;
        if (macroBtn) macroBtn.disabled = true;
        periodInfo.classList.add('hidden');
    }
}

// ==========================================
// CALCULO DE DATAS (mesma logica do dashboard)
// ==========================================

function formatDateForReport(date) {
    var y = date.getFullYear();
    var m = String(date.getMonth() + 1).padStart(2, '0');
    var d = String(date.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + d;
}

function formatDateBR(dateStr) {
    var parts = dateStr.split('-');
    return parts[2] + '/' + parts[1] + '/' + parts[0];
}

function getReportPeriod() {
    var select = document.getElementById('reportPeriodFilter');
    var preset = select ? select.value : 'last_7d';

    var today = new Date();
    today.setHours(0, 0, 0, 0);
    var yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);

    var startDate, endDate;

    switch (preset) {
        case 'last_7d':
            endDate = new Date(yesterday);
            startDate = new Date(yesterday);
            startDate.setDate(yesterday.getDate() - 6);
            break;

        case 'last_14d':
            endDate = new Date(yesterday);
            startDate = new Date(yesterday);
            startDate.setDate(yesterday.getDate() - 13);
            break;

        case 'last_28d':
            endDate = new Date(yesterday);
            startDate = new Date(yesterday);
            startDate.setDate(yesterday.getDate() - 27);
            break;

        case 'last_30d':
            endDate = new Date(yesterday);
            startDate = new Date(yesterday);
            startDate.setDate(yesterday.getDate() - 29);
            break;

        case 'this_week':
            endDate = new Date(yesterday);
            startDate = new Date(yesterday);
            startDate.setDate(startDate.getDate() - startDate.getDay());
            break;

        case 'last_week':
            var lastSaturday = new Date(today);
            lastSaturday.setDate(today.getDate() - today.getDay() - 1);
            endDate = new Date(lastSaturday);
            startDate = new Date(lastSaturday);
            startDate.setDate(lastSaturday.getDate() - 6);
            break;

        case 'this_month':
            endDate = new Date(yesterday);
            startDate = new Date(yesterday.getFullYear(), yesterday.getMonth(), 1);
            break;

        case 'last_month':
            var lastDayPrevMonth = new Date(today.getFullYear(), today.getMonth(), 0);
            endDate = new Date(lastDayPrevMonth);
            startDate = new Date(lastDayPrevMonth.getFullYear(), lastDayPrevMonth.getMonth(), 1);
            break;

        default:
            endDate = new Date(yesterday);
            startDate = new Date(yesterday);
            startDate.setDate(yesterday.getDate() - 6);
    }

    var since = formatDateForReport(startDate);
    var until = formatDateForReport(endDate);

    return {
        preset: preset,
        since: since,
        until: until,
        label: formatDateBR(since) + ' a ' + formatDateBR(until),
        days: Math.round((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1
    };
}

function getPreviousPeriod(sinceStr, untilStr) {
    var sinceParts = sinceStr.split('-').map(Number);
    var untilParts = untilStr.split('-').map(Number);

    var sinceDate = new Date(sinceParts[0], sinceParts[1] - 1, sinceParts[2]);
    var untilDate = new Date(untilParts[0], untilParts[1] - 1, untilParts[2]);

    // Calcular duracao em dias
    var durationMs = untilDate.getTime() - sinceDate.getTime();
    var durationDays = Math.round(durationMs / (1000 * 60 * 60 * 24));

    // Periodo anterior: mesma duracao imediatamente antes
    var prevEnd = new Date(sinceDate);
    prevEnd.setDate(sinceDate.getDate() - 1);

    var prevStart = new Date(prevEnd);
    prevStart.setDate(prevEnd.getDate() - durationDays);

    return {
        since: formatDateForReport(prevStart),
        until: formatDateForReport(prevEnd)
    };
}

// ==========================================
// BUSCA DE DADOS
// ==========================================

async function fetchReportData(adAccountId, since, until) {
    var baseUrl = window.location.hostname === 'localhost' ? 'http://localhost:8888' : '';
    var timeRange = JSON.stringify({ since: since, until: until });
    var formattedId = adAccountId.startsWith('act_') ? adAccountId : 'act_' + adAccountId;

    var url = baseUrl + '/.netlify/functions/meta-ads?adAccountId=' + encodeURIComponent(formattedId) + '&timeRange=' + encodeURIComponent(timeRange);

    var response = await fetch(url);
    var result = await response.json();

    if (!response.ok || result.error) {
        throw new Error(result.message || 'Erro ao buscar dados do relatorio');
    }

    // A API sempre retorna { success, accountId, data: { summary, daily, trends, campaigns } }
    var data = result.data || {};

    return {
        summary: data.summary || { spend: 0, impressions: 0, leads: 0, cpl: 0 },
        daily: data.daily || [],
        trends: data.trends || { spend: 0, impressions: 0, leads: 0, cpl: 0 },
        campaigns: data.campaigns || []
    };
}

// Buscar top criativos para o relatorio
async function fetchReportCreatives(adAccountId, since, until) {
    try {
        var baseUrl = window.location.hostname === 'localhost' ? 'http://localhost:8888' : '';
        var formattedId = adAccountId.startsWith('act_') ? adAccountId : 'act_' + adAccountId;
        var timeRange = JSON.stringify({ since: since, until: until });

        var url = baseUrl + '/.netlify/functions/meta-ads?adAccountId=' + encodeURIComponent(formattedId)
            + '&action=ad-creatives&limit=10&timeRange=' + encodeURIComponent(timeRange);

        var response = await fetch(url);
        var result = await response.json();

        if (!response.ok || result.error) return [];
        return result.creatives || [];
    } catch (e) {
        console.error('Erro ao buscar criativos para relatorio:', e);
        return [];
    }
}

// ==========================================
// COMPARACOES E INSIGHTS
// ==========================================

function calcChange(current, previous) {
    if (previous === 0) {
        if (current === 0) return 0;
        return 100;
    }
    return ((current - previous) / previous) * 100;
}

function generateInsights(data) {
    var current = data.current;
    var prev = data.prev;
    var campaigns = data.campaigns || [];
    var daily = data.daily || [];
    var creatives = data.creatives || [];

    var result = {
        summary: '',
        analysis: [],        // Insights de analise geral (antigo array)
        topCampaigns: [],     // Melhores campanhas
        topCreatives: [],     // Melhores criativos
        replicar: [],         // O que funcionou
        melhorar: [],         // Oportunidades de melhoria
        ajustar: []           // Ajustes necessarios
    };

    // --- Variacoes ---
    var cplChange = calcChange(current.cpl, prev.cpl);
    var leadsChange = calcChange(current.leads, prev.leads);
    var spendChange = calcChange(current.spend, prev.spend);
    var impressionsChange = calcChange(current.impressions, prev.impressions);

    var currentCR = current.impressions > 0 ? (current.leads / current.impressions) * 1000 : 0;
    var prevCR = prev.impressions > 0 ? (prev.leads / prev.impressions) * 1000 : 0;
    var crChange = calcChange(currentCR, prevCR);

    // ==========================================
    // RESUMO EXECUTIVO
    // ==========================================

    if (current.leads === 0 && current.spend === 0) {
        result.summary = 'Nenhum investimento e nenhum lead registrado neste periodo. Verifique se as campanhas estao ativas e se ha orcamento configurado.';
        return result;
    }

    if (current.leads === 0 && current.spend > 0) {
        result.summary = 'Foram investidos ' + fmtCur(current.spend) + ' no periodo sem gerar leads. Recomenda-se revisar o funil completo.';
        result.ajustar.push({ icon: 'error', title: 'Investimento sem retorno', text: 'Foram investidos ' + fmtCur(current.spend) + ' mas nenhum lead foi registrado. Possíveis causas: problemas no formulario, segmentacao inadequada ou criativos sem conversao. Pause campanhas sem resultado e revise o funil.' });
        return result;
    }

    result.summary = 'Investimento de ' + fmtCur(current.spend) + ' (' + fmtVar(spendChange) + ' vs anterior), '
        + Math.round(current.leads) + ' leads (' + fmtVar(leadsChange) + ') com CPL de '
        + fmtCur(current.cpl) + ' (' + fmtVar(cplChange) + ').';

    // ==========================================
    // ANALISE DE EFICIENCIA
    // ==========================================

    if (spendChange > 5 && leadsChange < -5) {
        result.ajustar.push({ icon: 'trending_down', title: 'Eficiencia em queda', text: 'O investimento cresceu ' + Math.abs(spendChange).toFixed(1) + '% mas os leads cairam ' + Math.abs(leadsChange).toFixed(1) + '%. O orcamento adicional nao esta se convertendo. Pause conjuntos com CPL acima de ' + fmtCur(current.cpl * 1.5) + ' e redistribua verba para campanhas eficientes.' });
    } else if (spendChange > 10 && leadsChange > 10 && cplChange > 10) {
        result.melhorar.push({ icon: 'speed', title: 'Escala com CPL elevado', text: 'O aumento de ' + Math.abs(spendChange).toFixed(1) + '% gerou +' + Math.abs(leadsChange).toFixed(1) + '% de leads, mas o CPL subiu ' + Math.abs(cplChange).toFixed(1) + '%. Mantenha o orcamento estavel por 3-5 dias para reotimizacao.' });
    } else if (spendChange > 10 && leadsChange > 10 && cplChange <= 5) {
        result.replicar.push({ icon: 'rocket_launch', title: 'Escala eficiente', text: 'Investimento cresceu ' + Math.abs(spendChange).toFixed(1) + '% com +' + Math.abs(leadsChange).toFixed(1) + '% de leads sem impacto no CPL. Ha espaco para continuar escalando gradualmente (10-20% a cada 3 dias).' });
    } else if (cplChange < -15) {
        result.replicar.push({ icon: 'savings', title: 'CPL em queda', text: 'O CPL caiu ' + Math.abs(cplChange).toFixed(1) + '% (de ' + fmtCur(prev.cpl) + ' para ' + fmtCur(current.cpl) + '). Janela favoravel para aumentar investimento e capturar mais leads com custo otimizado.' });
    } else if (cplChange > 20) {
        result.ajustar.push({ icon: 'price_change', title: 'CPL em alta', text: 'O CPL aumentou ' + Math.abs(cplChange).toFixed(1) + '% (de ' + fmtCur(prev.cpl) + ' para ' + fmtCur(current.cpl) + '). Renove criativos, teste novos publicos lookalike e revise a estrategia de lance.' });
    }

    if (currentCR > 0 && crChange < -15) {
        result.melhorar.push({ icon: 'conversion_path', title: 'Taxa de conversao em queda', text: 'A taxa de conversao caiu ' + Math.abs(crChange).toFixed(1) + '%. Revise criativos, pagina de destino e segmentacao.' });
    } else if (currentCR > 0 && crChange > 15) {
        result.replicar.push({ icon: 'trending_up', title: 'Conversao melhorando', text: 'A taxa de conversao melhorou ' + crChange.toFixed(1) + '%. Mantenha os criativos atuais e considere ampliar o alcance com publicos semelhantes.' });
    }

    // ==========================================
    // TOP CAMPANHAS
    // ==========================================

    var campWithLeads = campaigns.filter(function(c) { return c.leads > 0 && c.spend > 0; });
    campWithLeads.sort(function(a, b) { return a.cpl - b.cpl; });

    var totalLeads = current.leads || campaigns.reduce(function(s, c) { return s + (c.leads || 0); }, 0);
    var avgCpl = totalLeads > 0 ? current.spend / totalLeads : 0;

    result.topCampaigns = campWithLeads.slice(0, 5).map(function(c) {
        var share = totalLeads > 0 ? ((c.leads / totalLeads) * 100).toFixed(0) : 0;
        return { name: c.name, spend: c.spend, leads: c.leads, cpl: c.cpl, share: share };
    });

    // Campanhas com CPL abaixo da media → replicar
    campWithLeads.forEach(function(c) {
        if (c.cpl < avgCpl * 0.8 && c.leads >= 3) {
            result.replicar.push({ icon: 'star', title: '"' + truncName(c.name, 40) + '" e referencia', text: 'CPL de ' + fmtCur(c.cpl) + ' (' + ((1 - c.cpl / avgCpl) * 100).toFixed(0) + '% abaixo da media). Replique o publico e os criativos desta campanha em novas variações.' });
        }
    });

    // Campanhas com gasto e sem leads → ajustar
    var noLeadCampaigns = campaigns.filter(function(c) { return c.leads === 0 && c.spend > 10; });
    if (noLeadCampaigns.length > 0) {
        var wastedSpend = noLeadCampaigns.reduce(function(sum, c) { return sum + c.spend; }, 0);
        noLeadCampaigns.forEach(function(c) {
            result.ajustar.push({ icon: 'money_off', title: '"' + truncName(c.name, 40) + '" sem leads', text: 'Gastou ' + fmtCur(c.spend) + ' sem gerar leads. Pause ou reestruture esta campanha.' });
        });
    }

    // Disparidade entre campanhas
    if (campWithLeads.length >= 2) {
        var best = campWithLeads[0];
        var worst = campWithLeads[campWithLeads.length - 1];
        if (worst.cpl > best.cpl * 2) {
            result.melhorar.push({ icon: 'swap_vert', title: 'Disparidade de CPL entre campanhas', text: '"' + truncName(best.name, 30) + '" tem CPL de ' + fmtCur(best.cpl) + ' enquanto "' + truncName(worst.name, 30) + '" opera a ' + fmtCur(worst.cpl) + ' (' + (worst.cpl / best.cpl).toFixed(1) + 'x mais caro). Considere realocar orcamento.' });
        }
    }

    // Concentracao de leads
    if (campWithLeads.length >= 3 && totalLeads > 0) {
        var topByLeads = campWithLeads.slice().sort(function(a, b) { return b.leads - a.leads; })[0];
        var leadShare = (topByLeads.leads / totalLeads) * 100;
        if (leadShare > 70) {
            result.ajustar.push({ icon: 'warning', title: 'Concentracao de leads', text: leadShare.toFixed(0) + '% dos leads vem de "' + truncName(topByLeads.name, 35) + '". Diversifique com novos angulos de comunicacao e publicos diferentes.' });
        }
    }

    // ==========================================
    // TOP CRIATIVOS
    // ==========================================

    var creativesWithLeads = creatives.filter(function(c) {
        return c.metrics && c.metrics.leads > 0 && c.metrics.spend > 0;
    });
    creativesWithLeads.sort(function(a, b) { return a.metrics.cpl - b.metrics.cpl; });

    var avgCreativeCtr = creatives.length > 0
        ? creatives.reduce(function(s, c) { return s + (c.metrics ? c.metrics.ctr : 0); }, 0) / creatives.length
        : 0;

    result.topCreatives = creativesWithLeads.slice(0, 5).map(function(c) {
        return {
            name: c.name,
            spend: c.metrics.spend,
            leads: c.metrics.leads,
            cpl: c.metrics.cpl,
            ctr: c.metrics.ctr,
            impressions: c.metrics.impressions,
            thumbnailUrl: c.thumbnailUrl || null,
            isVideo: c.isVideo || false
        };
    });

    // Criativos com bom CTR → replicar
    creativesWithLeads.forEach(function(c) {
        if (c.metrics.ctr > avgCreativeCtr * 1.3 && c.metrics.leads >= 2) {
            result.replicar.push({ icon: 'thumb_up', title: 'Criativo com alto engajamento', text: '"' + truncName(c.name, 40) + '" tem CTR de ' + c.metrics.ctr.toFixed(2) + '% (acima da media). Replique o formato e o angulo de comunicacao deste criativo.' });
        }
    });

    // Criativos com muitas impressoes mas poucos leads → melhorar
    creatives.forEach(function(c) {
        if (c.metrics && c.metrics.impressions > 1000 && c.metrics.leads === 0 && c.metrics.spend > 10) {
            result.melhorar.push({ icon: 'visibility', title: 'Criativo com alcance sem conversao', text: '"' + truncName(c.name, 40) + '" teve ' + Math.round(c.metrics.impressions).toLocaleString('pt-BR') + ' impressoes mas 0 leads. Ajuste o CTA ou a oferta.' });
        }
    });

    // Criativos com CPL > 2x da media → ajustar
    if (avgCpl > 0) {
        creativesWithLeads.forEach(function(c) {
            if (c.metrics.cpl > avgCpl * 2 && c.metrics.spend > 20) {
                result.ajustar.push({ icon: 'swap_horiz', title: 'Criativo com CPL elevado', text: '"' + truncName(c.name, 40) + '" opera com CPL de ' + fmtCur(c.metrics.cpl) + ' (' + (c.metrics.cpl / avgCpl).toFixed(1) + 'x a media). Substitua este criativo.' });
            }
        });
    }

    // ==========================================
    // TENDENCIA DIARIA
    // ==========================================

    if (daily.length >= 4) {
        var halfIdx = Math.floor(daily.length / 2);
        var firstHalf = daily.slice(0, halfIdx);
        var secondHalf = daily.slice(halfIdx);
        var firstHalfCPL = calcDailyAvgCPL(firstHalf);
        var secondHalfCPL = calcDailyAvgCPL(secondHalf);

        if (firstHalfCPL > 0 && secondHalfCPL > 0) {
            var trendCPL = calcChange(secondHalfCPL, firstHalfCPL);
            if (trendCPL > 20) {
                result.ajustar.push({ icon: 'show_chart', title: 'Tendencia de piora no periodo', text: 'O CPL da segunda metade (' + fmtCur(secondHalfCPL) + ') esta ' + Math.abs(trendCPL).toFixed(0) + '% acima da primeira metade (' + fmtCur(firstHalfCPL) + '). Possível fadiga de criativo.' });
            } else if (trendCPL < -20) {
                result.replicar.push({ icon: 'auto_graph', title: 'Tendencia de melhora', text: 'O CPL da segunda metade (' + fmtCur(secondHalfCPL) + ') caiu ' + Math.abs(trendCPL).toFixed(0) + '% vs primeira metade. O algoritmo esta otimizando bem. Evite alteracoes bruscas.' });
            }
        }

        var zeroLeadDays = daily.filter(function(d) { return (d.leads || 0) === 0 && (d.spend || 0) > 0; }).length;
        if (zeroLeadDays > 0 && daily.length >= 7) {
            var pct = ((zeroLeadDays / daily.length) * 100).toFixed(0);
            result.melhorar.push({ icon: 'calendar_today', title: 'Dias sem conversao', text: 'Em ' + zeroLeadDays + ' de ' + daily.length + ' dias (' + pct + '%) houve investimento sem leads. Estabeleca regras de orcamento minimo e desative conjuntos com 2+ dias sem conversao.' });
        }
    }

    // IMPRESSOES
    if (impressionsChange < -25) {
        result.melhorar.push({ icon: 'visibility_off', title: 'Queda de impressoes', text: 'Impressoes cairam ' + Math.abs(impressionsChange).toFixed(1) + '%. Revise limite de gasto diario e amplie segmentacao.' });
    } else if (impressionsChange > 30 && leadsChange < 5) {
        result.melhorar.push({ icon: 'group_off', title: 'Alcance sem conversao', text: 'Impressoes cresceram ' + impressionsChange.toFixed(1) + '% mas leads nao acompanharam. Refine segmentacao priorizando conversao.' });
    }

    // Compatibilidade: gerar array analysis para o PDF antigo
    result.analysis = [];
    result.analysis.push(result.summary);
    result.replicar.forEach(function(item) { result.analysis.push(item.text); });
    result.melhorar.forEach(function(item) { result.analysis.push(item.text); });
    result.ajustar.forEach(function(item) { result.analysis.push(item.text); });

    return result;
}

// Auxiliares de formatacao para insights
function fmtCur(value) {
    var cur = (typeof currentCurrency !== 'undefined') ? currentCurrency : 'BRL';
    var locale = cur === 'BRL' ? 'pt-BR' : 'en-US';
    return new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: cur,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(Number(value));
}

function fmtVar(change) {
    if (Math.abs(change) < 1) return 'estavel';
    var arrow = change > 0 ? '+' : '';
    return arrow + change.toFixed(1) + '%';
}

function truncName(name, maxLen) {
    if (!name) return '';
    maxLen = maxLen || 45;
    return name.length > maxLen ? name.substring(0, maxLen - 3) + '...' : name;
}

function calcDailyAvgCPL(days) {
    var totalSpend = 0;
    var totalLeads = 0;
    days.forEach(function(d) {
        totalSpend += d.spend || 0;
        totalLeads += d.leads || 0;
    });
    return totalLeads > 0 ? totalSpend / totalLeads : 0;
}

// ==========================================
// CARREGAMENTO DE IMAGEM
// ==========================================

function loadLogoAsBase64() {
    return new Promise(function(resolve) {
        var img = new Image();
        img.onload = function() {
            var canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            var ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);
            resolve({ dataUrl: canvas.toDataURL('image/jpeg'), width: img.width, height: img.height });
        };
        img.onerror = function() {
            resolve(null);
        };
        img.src = 'img/logo.jpg';
    });
}

// ==========================================
// ORQUESTRADOR PRINCIPAL
// ==========================================

async function generateReport() {
    var clientSelect = document.getElementById('reportClientFilter');
    var selectedOption = clientSelect.options[clientSelect.selectedIndex];

    if (!clientSelect.value || !selectedOption) {
        showToast('Selecione um cliente para gerar o relatorio');
        return;
    }

    var clientName = selectedOption.textContent;
    var adAccountId = selectedOption.dataset.adAccountId;

    var period = getReportPeriod();

    var progressEl = document.getElementById('reportProgress');
    var progressBar = document.getElementById('reportProgressBar');
    var progressText = document.getElementById('reportProgressText');
    var generateBtn = document.getElementById('generateReportBtn');
    var previewEl = document.getElementById('reportPreview');

    // Esconder preview anterior
    previewEl.classList.add('hidden');
    previewEl.innerHTML = '';

    progressEl.classList.remove('hidden');
    generateBtn.disabled = true;

    try {
        // 1. Calcular periodo de comparacao
        progressText.textContent = 'Calculando periodos...';
        progressBar.style.width = '5%';
        var prevPeriod = getPreviousPeriod(period.since, period.until);

        // 2. Buscar dados em paralelo
        progressText.textContent = 'Buscando dados do periodo...';
        progressBar.style.width = '15%';

        var [reportData, prevData, creatives] = await Promise.all([
            fetchReportData(adAccountId, period.since, period.until),
            fetchReportData(adAccountId, prevPeriod.since, prevPeriod.until),
            fetchReportCreatives(adAccountId, period.since, period.until)
        ]);

        progressBar.style.width = '70%';

        // 3. Gerar insights expandidos
        progressText.textContent = 'Analisando performance...';
        progressBar.style.width = '80%';
        var insights = generateInsights({
            current: reportData.summary,
            prev: prevData.summary,
            campaigns: reportData.campaigns || [],
            daily: reportData.daily || [],
            creatives: creatives,
            period: period
        });

        // 4. Guardar dados para export PDF posterior
        progressBar.style.width = '90%';
        var versionSelect = document.getElementById('reportVersionFilter');
        var version = versionSelect ? versionSelect.value : 'complete';
        reportPreviewData = {
            clientName: clientName,
            period: period,
            periodPreset: period.preset,
            prevPeriod: prevPeriod,
            reportData: reportData,
            prevData: prevData,
            insights: insights,
            creatives: creatives,
            version: version
        };

        // 5. Renderizar preview em tela
        progressText.textContent = 'Preparando visualizacao...';
        progressBar.style.width = '95%';
        renderReportPreview(reportPreviewData);

        progressBar.style.width = '100%';
        progressText.textContent = 'Relatorio pronto!';

    } catch (error) {
        console.error('Erro ao gerar relatorio:', error);
        showToast('Erro ao gerar relatorio: ' + error.message);
        progressText.textContent = 'Erro: ' + error.message;
    } finally {
        generateBtn.disabled = false;
        setTimeout(function() {
            progressEl.classList.add('hidden');
            progressBar.style.width = '0%';
        }, 2000);
    }
}

// Exportar PDF a partir do preview
async function exportReportPDF() {
    if (!reportPreviewData) {
        showToast('Gere o relatorio primeiro.');
        return;
    }

    var btn = document.getElementById('reportExportPDFBtn');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span class="material-symbols-outlined animate-spin text-sm">progress_activity</span> Gerando...';
    }

    try {
        var logoData = await loadLogoAsBase64();
        buildReportPDF({
            clientName: reportPreviewData.clientName,
            period: reportPreviewData.period,
            periodPreset: reportPreviewData.periodPreset,
            prevPeriod: reportPreviewData.prevPeriod,
            reportData: reportPreviewData.reportData,
            prevData: reportPreviewData.prevData,
            insights: reportPreviewData.insights,
            logoData: logoData,
            version: reportPreviewData.version || 'complete'
        });
        showToast('PDF exportado com sucesso!');
    } catch (error) {
        showToast('Erro ao exportar PDF: ' + error.message);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<span class="material-symbols-outlined text-sm">picture_as_pdf</span> Exportar PDF';
        }
    }
}

// ==========================================
// PREVIEW EM TELA (estilo analista)
// ==========================================

function renderReportPreview(data) {
    var container = document.getElementById('reportPreview');
    var current = data.reportData.summary;
    var prev = data.prevData.summary;
    var insights = data.insights;

    var spendChange = calcChange(current.spend, prev.spend);
    var leadsChange = calcChange(current.leads, prev.leads);
    var cplChange = calcChange(current.cpl, prev.cpl);
    var impressionsChange = calcChange(current.impressions, prev.impressions);

    function changeClass(val, invert) {
        if (Math.abs(val) < 1) return 'text-slate-400';
        var good = invert ? val < 0 : val > 0;
        return good ? 'text-emerald-400' : 'text-red-400';
    }

    function changeArrow(val) {
        if (Math.abs(val) < 1) return '';
        return val > 0 ? 'arrow_upward' : 'arrow_downward';
    }

    // Secoes dinâmicas
    var isComplete = data.version !== 'simplified';
    var sections = [];
    sections.push({ id: 'resumo', num: '01', label: 'Resumo Executivo', icon: 'summarize', color: 'primary' });
    if (insights.topCampaigns.length > 0) sections.push({ id: 'campanhas', num: String(sections.length + 1).padStart(2, '0'), label: 'Melhores Campanhas', icon: 'military_tech', color: 'amber' });
    if (insights.topCreatives.length > 0) sections.push({ id: 'criativos', num: String(sections.length + 1).padStart(2, '0'), label: 'Melhores Criativos', icon: 'palette', color: 'violet' });
    if (isComplete && insights.replicar.length > 0) sections.push({ id: 'replicar', num: String(sections.length + 1).padStart(2, '0'), label: 'O Que Funcionou', icon: 'check_circle', color: 'emerald' });
    if (isComplete && insights.melhorar.length > 0) sections.push({ id: 'melhorar', num: String(sections.length + 1).padStart(2, '0'), label: 'Oportunidades de Melhoria', icon: 'trending_up', color: 'amber' });
    if (isComplete && insights.ajustar.length > 0) sections.push({ id: 'ajustar', num: String(sections.length + 1).padStart(2, '0'), label: 'Ajustes Necessarios', icon: 'warning', color: 'red' });

    var html = '<div class="report-preview">';

    // ======= HEADER =======
    html += '\
        <div class="bg-surface-dark border border-border-dark rounded-xl p-4 sm:p-6">\
            <div class="flex items-start justify-between gap-4 mb-5">\
                <div class="flex-1 min-w-0">\
                    <div class="flex items-center gap-2 mb-1">\
                        <span class="material-symbols-outlined text-primary text-xl">assessment</span>\
                        <h3 class="text-base font-bold text-white">Relatorio de Performance</h3>\
                    </div>\
                    <p class="text-[11px] text-slate-500">' + data.clientName + ' &middot; '
                        + formatDateBR(data.period.since) + ' a ' + formatDateBR(data.period.until)
                        + ' &middot; vs periodo anterior</p>\
                </div>\
                <button id="reportExportPDFBtn" onclick="exportReportPDF()" class="shrink-0 flex items-center gap-1.5 px-3.5 py-2 bg-primary/10 hover:bg-primary/20 text-primary rounded-lg text-xs font-semibold transition-all hover:scale-[1.02] active:scale-95">\
                    <span class="material-symbols-outlined text-sm">picture_as_pdf</span>\
                    Exportar PDF\
                </button>\
            </div>';

    // ======= KPIs =======
    html += '\
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">\
                <div class="bg-background-dark border border-border-dark rounded-lg p-3 analyst-card-enter" style="--delay:0">\
                    <p class="text-[9px] text-slate-500 uppercase tracking-wider mb-1">Investimento</p>\
                    <p class="text-base font-bold text-white">' + fmtCur(current.spend) + '</p>\
                    <div class="flex items-center gap-1 mt-0.5">\
                        <span class="material-symbols-outlined text-xs ' + changeClass(spendChange) + '">' + changeArrow(spendChange) + '</span>\
                        <span class="text-[10px] ' + changeClass(spendChange) + '">' + fmtVar(spendChange) + '</span>\
                    </div>\
                </div>\
                <div class="bg-background-dark border border-border-dark rounded-lg p-3 analyst-card-enter" style="--delay:1">\
                    <p class="text-[9px] text-slate-500 uppercase tracking-wider mb-1">Leads</p>\
                    <p class="text-base font-bold text-white">' + Math.round(current.leads) + '</p>\
                    <div class="flex items-center gap-1 mt-0.5">\
                        <span class="material-symbols-outlined text-xs ' + changeClass(leadsChange) + '">' + changeArrow(leadsChange) + '</span>\
                        <span class="text-[10px] ' + changeClass(leadsChange) + '">' + fmtVar(leadsChange) + '</span>\
                    </div>\
                </div>\
                <div class="bg-background-dark border border-border-dark rounded-lg p-3 analyst-card-enter" style="--delay:2">\
                    <p class="text-[9px] text-slate-500 uppercase tracking-wider mb-1">CPL</p>\
                    <p class="text-base font-bold text-white">' + fmtCur(current.cpl) + '</p>\
                    <div class="flex items-center gap-1 mt-0.5">\
                        <span class="material-symbols-outlined text-xs ' + changeClass(cplChange, true) + '">' + changeArrow(cplChange) + '</span>\
                        <span class="text-[10px] ' + changeClass(cplChange, true) + '">' + fmtVar(cplChange) + '</span>\
                    </div>\
                </div>\
                <div class="bg-background-dark border border-border-dark rounded-lg p-3 analyst-card-enter" style="--delay:3">\
                    <p class="text-[9px] text-slate-500 uppercase tracking-wider mb-1">Impressoes</p>\
                    <p class="text-base font-bold text-white">' + Number(current.impressions).toLocaleString('pt-BR') + '</p>\
                    <div class="flex items-center gap-1 mt-0.5">\
                        <span class="material-symbols-outlined text-xs ' + changeClass(impressionsChange) + '">' + changeArrow(impressionsChange) + '</span>\
                        <span class="text-[10px] ' + changeClass(impressionsChange) + '">' + fmtVar(impressionsChange) + '</span>\
                    </div>\
                </div>\
            </div>';

    // ======= SECTION NAV PILLS =======
    html += '<div class="flex flex-wrap gap-1.5 mb-4">';
    sections.forEach(function(s) {
        html += '<button onclick="scrollToReportSection(\'' + s.id + '\')" class="flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-medium bg-' + s.color + '-500/5 text-' + s.color + '-400 border border-' + s.color + '-500/10 hover:bg-' + s.color + '-500/10 transition-colors">\
            <span class="material-symbols-outlined" style="font-size:12px">' + s.icon + '</span>' + s.label + '</button>';
    });
    html += '</div>';

    html += '</div>';

    // ======= SECTIONS =======
    var sIdx = 0;

    // 01. Resumo
    html += buildReportSection('resumo', sections[sIdx].num, 'Resumo Executivo', 'summarize', 'primary',
        '<p class="text-sm text-slate-300 leading-relaxed">' + insights.summary + '</p>', true);
    sIdx++;

    // 02. Melhores Campanhas
    if (insights.topCampaigns.length > 0) {
        var campHTML = '<div class="space-y-2">';
        insights.topCampaigns.forEach(function(c, i) {
            var medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '<span class="text-slate-500 text-xs font-bold">#' + (i + 1) + '</span>';
            campHTML += '\
                <div class="flex items-center gap-3 p-3 bg-background-dark border border-border-dark rounded-lg analyst-card-enter" style="--delay:' + i + '">\
                    <span class="text-lg shrink-0 w-6 text-center">' + medal + '</span>\
                    <div class="flex-1 min-w-0">\
                        <p class="text-sm font-medium text-white truncate">' + c.name + '</p>\
                        <div class="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1">\
                            <span class="text-[10px] text-slate-500">Invest: <strong class="text-slate-300">' + fmtCur(c.spend) + '</strong></span>\
                            <span class="text-[10px] text-slate-500">Leads: <strong class="text-slate-300">' + c.leads + '</strong></span>\
                            <span class="text-[10px] text-slate-500">CPL: <strong class="text-emerald-400">' + fmtCur(c.cpl) + '</strong></span>\
                            <span class="text-[10px] text-slate-500">' + c.share + '% dos leads</span>\
                        </div>\
                    </div>\
                </div>';
        });
        campHTML += '</div>';
        html += buildReportSection('campanhas', sections[sIdx].num, 'Melhores Campanhas', 'military_tech', 'amber', campHTML, true);
        sIdx++;
    }

    // 03. Melhores Criativos
    if (insights.topCreatives.length > 0) {
        var crHTML = '<div class="space-y-2">';
        insights.topCreatives.forEach(function(c, i) {
            var thumbHTML = c.thumbnailUrl
                ? '<img src="' + c.thumbnailUrl + '" class="w-12 h-12 rounded-lg object-cover shrink-0" onerror="this.style.display=\'none\'" />'
                : '<div class="w-12 h-12 bg-slate-700/30 rounded-lg flex items-center justify-center shrink-0"><span class="material-symbols-outlined text-slate-600 text-lg">' + (c.isVideo ? 'videocam' : 'image') + '</span></div>';

            crHTML += '\
                <div class="flex items-center gap-3 p-3 bg-background-dark border border-border-dark rounded-lg analyst-card-enter" style="--delay:' + i + '">\
                    ' + thumbHTML + '\
                    <div class="flex-1 min-w-0">\
                        <p class="text-sm font-medium text-white truncate">' + (c.name || 'Criativo #' + (i + 1)) + '</p>\
                        <div class="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1">\
                            <span class="text-[10px] text-slate-500">CPL: <strong class="text-emerald-400">' + fmtCur(c.cpl) + '</strong></span>\
                            <span class="text-[10px] text-slate-500">Leads: <strong class="text-slate-300">' + c.leads + '</strong></span>\
                            <span class="text-[10px] text-slate-500">CTR: <strong class="text-slate-300">' + c.ctr.toFixed(2) + '%</strong></span>\
                            <span class="text-[10px] text-slate-500">Invest: <strong class="text-slate-300">' + fmtCur(c.spend) + '</strong></span>\
                        </div>\
                    </div>\
                </div>';
        });
        crHTML += '</div>';
        html += buildReportSection('criativos', sections[sIdx].num, 'Melhores Criativos', 'palette', 'violet', crHTML, true);
        sIdx++;
    }

    // 04. O Que Funcionou (replicar) — somente versao completa
    if (isComplete && insights.replicar.length > 0) {
        html += buildReportSection('replicar', sections[sIdx].num, 'O Que Funcionou', 'check_circle', 'emerald',
            buildInsightCards(insights.replicar, 'emerald'), true);
        sIdx++;
    }

    // 05. Oportunidades de Melhoria — somente versao completa
    if (isComplete && insights.melhorar.length > 0) {
        html += buildReportSection('melhorar', sections[sIdx].num, 'Oportunidades de Melhoria', 'trending_up', 'amber',
            buildInsightCards(insights.melhorar, 'amber'), true);
        sIdx++;
    }

    // 06. Ajustes Necessarios — somente versao completa
    if (isComplete && insights.ajustar.length > 0) {
        html += buildReportSection('ajustar', sections[sIdx].num, 'Ajustes Necessarios', 'warning', 'red',
            buildInsightCards(insights.ajustar, 'red'), true);
        sIdx++;
    }

    html += '</div>';

    container.innerHTML = html;
    container.classList.remove('hidden');

    // Scroll suave ate o preview
    setTimeout(function() {
        container.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 300);
}

function buildReportSection(id, num, title, icon, color, content, open) {
    var bodyStyle = open ? 'max-height:2000px;opacity:1' : 'max-height:0;opacity:0';
    var chevronRotate = open ? 'transform:rotate(90deg)' : '';

    return '\
        <div id="report-section-' + id + '" class="bg-surface-dark border border-border-dark rounded-xl overflow-hidden scroll-mt-4">\
            <button class="w-full flex items-center gap-3 px-4 py-3 group" onclick="toggleReportSection(\'' + id + '\')">\
                <span class="text-[10px] font-bold text-' + color + '-400 bg-' + color + '-500/10 w-6 h-6 rounded-md flex items-center justify-center shrink-0">' + num + '</span>\
                <div class="w-7 h-7 rounded-lg bg-' + color + '-500/10 flex items-center justify-center shrink-0">\
                    <span class="material-symbols-outlined text-' + color + '-400 text-base">' + icon + '</span>\
                </div>\
                <h4 class="flex-1 text-left text-sm font-semibold text-slate-300 group-hover:text-white transition-colors">' + title + '</h4>\
                <span id="report-chevron-' + id + '" class="material-symbols-outlined text-slate-600 text-base transition-transform" style="' + chevronRotate + '">chevron_right</span>\
            </button>\
            <div id="report-body-' + id + '" class="overflow-hidden transition-all duration-300" style="' + bodyStyle + '">\
                <div class="px-4 pb-4">' + content + '</div>\
            </div>\
        </div>';
}

function buildInsightCards(items, color) {
    var html = '<div class="space-y-2">';
    items.forEach(function(item, i) {
        html += '\
            <div class="flex gap-3 p-3 bg-' + color + '-500/5 border border-' + color + '-500/10 rounded-lg analyst-card-enter" style="--delay:' + i + '">\
                <div class="w-7 h-7 rounded-lg bg-' + color + '-500/10 flex items-center justify-center shrink-0 mt-0.5">\
                    <span class="material-symbols-outlined text-' + color + '-400 text-base">' + item.icon + '</span>\
                </div>\
                <div class="flex-1 min-w-0">\
                    <p class="text-xs font-bold text-' + color + '-400 mb-0.5">' + item.title + '</p>\
                    <p class="text-[11px] text-slate-400 leading-relaxed">' + item.text + '</p>\
                </div>\
            </div>';
    });
    html += '</div>';
    return html;
}

function toggleReportSection(sectionId) {
    var body = document.getElementById('report-body-' + sectionId);
    var chevron = document.getElementById('report-chevron-' + sectionId);
    if (!body) return;

    var isOpen = body.style.maxHeight !== '0px';
    if (isOpen) {
        body.style.maxHeight = '0px';
        body.style.opacity = '0';
        if (chevron) chevron.style.transform = '';
    } else {
        body.style.maxHeight = '2000px';
        body.style.opacity = '1';
        if (chevron) chevron.style.transform = 'rotate(90deg)';
    }
}

function scrollToReportSection(sectionId) {
    var el = document.getElementById('report-section-' + sectionId);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    // Open section if collapsed
    var body = document.getElementById('report-body-' + sectionId);
    if (body && body.style.maxHeight === '0px') {
        toggleReportSection(sectionId);
    }
}

// ==========================================
// CONSTRUTOR DO PDF
// ==========================================

function buildReportPDF(params) {
    var jsPDF = window.jspdf.jsPDF;
    var doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

    var colors = {
        primary: [19, 127, 236],
        dark: [15, 23, 42],
        text: [30, 41, 59],
        textLight: [100, 116, 139],
        green: [16, 185, 129],
        red: [239, 68, 68],
        bgLight: [248, 250, 252],
        border: [226, 232, 240],
        white: [255, 255, 255]
    };

    var y = 15;

    // HEADER
    y = drawPDFHeader(doc, y, params, colors);

    // SEPARADOR
    doc.setDrawColor.apply(doc, colors.border);
    doc.setLineWidth(0.3);
    doc.line(20, y, 190, y);
    y += 8;

    // KPIs
    y = drawPDFKPISummary(doc, y, params, colors);

    // GRAFICO 1 - Valor Investido (azul)
    y += 4;
    y = drawPDFChart(doc, y, params, colors, {
        title: 'Performance Diaria - Valor Investido',
        field: 'spend',
        lineColor: [19, 127, 236],
        fillColor: [190, 218, 252],
        formatLabel: formatAxisCurrency
    });

    // GRAFICO 2 - Leads (verde)
    if (y > 225) { doc.addPage(); y = 20; }
    y = drawPDFChart(doc, y, params, colors, {
        title: 'Performance Diaria - Leads',
        field: 'leads',
        lineColor: [5, 150, 105],
        fillColor: [180, 240, 210],
        formatLabel: function(v) { return String(Math.round(v)); }
    });

    // GRAFICO 3 - Custo por Lead (roxo)
    if (y > 225) { doc.addPage(); y = 20; }
    y = drawPDFChart(doc, y, params, colors, {
        title: 'Performance Diaria - Custo por Lead',
        field: 'cpl',
        lineColor: [139, 92, 246],
        fillColor: [224, 208, 255],
        formatLabel: formatAxisCurrency
    });

    // CAMPANHAS
    if (y > 205) { doc.addPage(); y = 20; }
    y += 2;
    y = drawPDFCampaignTable(doc, y, params, colors);

    // TOP CRIATIVOS (se disponivel)
    if (params.insights && !Array.isArray(params.insights) && params.insights.topCreatives && params.insights.topCreatives.length > 0) {
        if (y > 205) { doc.addPage(); y = 20; }
        y += 2;
        y = drawPDFCreativesTable(doc, y, params.insights.topCreatives, colors);
    }

    // INSIGHTS (somente versao completa)
    if (params.version !== 'simplified') {
        if (y > 235) { doc.addPage(); y = 20; }
        y += 2;
        y = drawPDFInsights(doc, y, params, colors);
    }

    // FOOTER
    var totalPages = doc.internal.getNumberOfPages();
    for (var i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        drawPDFFooter(doc, i, totalPages, colors);
    }

    // Salvar com nomenclatura padrao
    var presetLabels = {
        'last_7d': 'ULTIMOS 7 DIAS', 'last_14d': 'ULTIMOS 14 DIAS',
        'last_28d': 'ULTIMOS 28 DIAS', 'last_30d': 'ULTIMOS 30 DIAS',
        'this_week': 'ESTA SEMANA', 'last_week': 'SEMANA PASSADA',
        'this_month': 'ESTE MES', 'last_month': 'MES PASSADO'
    };
    var periodLabel = presetLabels[params.periodPreset] || params.period.label;
    var clientName = params.clientName.toUpperCase();
    doc.save('[MILO][' + clientName + '][RELATORIO][' + periodLabel + '].pdf');
}

// ==========================================
// SECOES DO PDF
// ==========================================

function drawPDFHeader(doc, y, params, colors) {
    // Barra superior
    doc.setFillColor.apply(doc, colors.primary);
    doc.rect(0, 0, 210, 3, 'F');

    // Titulo
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.setTextColor.apply(doc, colors.dark);
    doc.text('Relatorio de Performance', 20, y + 3);

    // Subtitulo
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor.apply(doc, colors.textLight);
    doc.text('Analise de Performance - Meta Ads', 20, y + 9);

    // Logo
    if (params.logoData) {
        var logoMaxH = 12;
        var ratio = params.logoData.width / params.logoData.height;
        var logoH = logoMaxH;
        var logoW = logoH * ratio;
        if (logoW > 40) { logoW = 40; logoH = logoW / ratio; }
        doc.addImage(params.logoData.dataUrl, 'JPEG', 190 - logoW, y - 3, logoW, logoH);
    }

    y += 18;

    // Info cards (2 cards: Cliente + Periodo)
    var infoItems = [
        { label: 'Cliente', value: params.clientName },
        { label: 'Periodo', value: params.period.label }
    ];

    var cardW = 82;
    var cardGap = 6;
    var startX = 20;

    infoItems.forEach(function(item, i) {
        var x = startX + i * (cardW + cardGap);
        doc.setFillColor.apply(doc, colors.bgLight);
        doc.roundedRect(x, y, cardW, 14, 2, 2, 'F');

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.setTextColor.apply(doc, colors.textLight);
        doc.text(item.label, x + 3, y + 5);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.setTextColor.apply(doc, colors.text);
        doc.text(truncateText(doc, item.value, cardW - 6), x + 3, y + 11);
    });

    return y + 20;
}

function drawPDFKPISummary(doc, y, params, colors) {
    var current = params.reportData.summary;
    var prev = params.prevData.summary;

    // Titulo
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor.apply(doc, colors.dark);
    doc.text('Indicadores Principais', 20, y);
    y += 6;

    var metrics = [
        { label: 'Valor Investido', value: formatCurrency(current.spend), prevValue: formatCurrency(prev.spend), change: calcChange(current.spend, prev.spend), invert: false },
        { label: 'Impressoes', value: formatNumber(current.impressions), prevValue: formatNumber(prev.impressions), change: calcChange(current.impressions, prev.impressions), invert: false },
        { label: 'Leads', value: String(Math.round(current.leads)), prevValue: String(Math.round(prev.leads)), change: calcChange(current.leads, prev.leads), invert: false },
        { label: 'Custo por Lead', value: formatCurrency(current.cpl), prevValue: formatCurrency(prev.cpl), change: calcChange(current.cpl, prev.cpl), invert: true }
    ];

    var cardW = 40;
    var cardH = 32;
    var gap = 3.3;
    var startX = 20;

    metrics.forEach(function(m, i) {
        var x = startX + i * (cardW + gap);

        // Card background
        doc.setFillColor.apply(doc, colors.bgLight);
        doc.roundedRect(x, y, cardW, cardH, 2, 2, 'F');

        // Borda esquerda colorida
        doc.setFillColor.apply(doc, colors.primary);
        doc.rect(x, y + 2, 1.2, cardH - 4, 'F');

        // Label
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.setTextColor.apply(doc, colors.textLight);
        doc.text(m.label, x + 4, y + 6);

        // Valor principal
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(14);
        doc.setTextColor.apply(doc, colors.dark);
        doc.text(String(m.value), x + 4, y + 14);

        // Comparacao vs periodo anterior
        drawComparisonLine(doc, x + 4, y + 21, m.change, m.invert, 'vs per. anterior', colors);

        // Valor de referencia
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(5.5);
        doc.setTextColor.apply(doc, colors.textLight);
        doc.text('Anterior: ' + String(m.prevValue), x + 4, y + 28);
    });

    return y + cardH + 4;
}

function drawComparisonLine(doc, x, y, change, invertColor, label, colors) {
    var isPositive = change > 0;
    var isGood = invertColor ? !isPositive : isPositive;
    var color = Math.abs(change) < 1 ? colors.textLight : (isGood ? colors.green : colors.red);
    var arrow = isPositive ? '+' : '';
    var changeStr = arrow + change.toFixed(1) + '%';

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor.apply(doc, color);
    doc.text(changeStr, x, y);

    var changeWidth = doc.getTextWidth(changeStr);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6);
    doc.setTextColor.apply(doc, colors.textLight);
    doc.text(label, x + changeWidth + 1.5, y);
}

function drawPDFChart(doc, startY, params, colors, chartConfig) {
    var title = chartConfig.title;
    var field = chartConfig.field;
    var lineColor = chartConfig.lineColor || colors.primary;
    var fillColorRGB = chartConfig.fillColor || [200, 220, 255];
    var formatLabel = chartConfig.formatLabel || formatAxisCurrency;

    // Indicador colorido + Titulo
    doc.setFillColor.apply(doc, lineColor);
    doc.roundedRect(20, startY - 3.5, 3, 5, 1, 1, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor.apply(doc, colors.dark);
    doc.text(title, 25, startY);

    var chartX = 20;
    var chartY = startY + 6;
    var chartW = 170;
    var chartH = 50;
    var padLeft = 18;
    var padBottom = 12;
    var plotW = chartW - padLeft;
    var plotH = chartH - padBottom;

    // Background
    doc.setFillColor.apply(doc, colors.bgLight);
    doc.roundedRect(chartX, chartY, chartW, chartH, 2, 2, 'F');

    // Borda esquerda colorida
    doc.setFillColor.apply(doc, lineColor);
    doc.rect(chartX, chartY + 2, 1.2, chartH - 4, 'F');

    // Preencher dias faltantes
    var dailyData = fillPeriodDays(params.reportData.daily, params.period.since, params.period.until);
    var values = dailyData.map(function(d) { return d[field] || 0; });
    var maxVal = Math.max.apply(null, values.concat([1]));

    // Grid horizontal
    doc.setDrawColor.apply(doc, colors.border);
    doc.setLineWidth(0.15);
    for (var i = 0; i <= 4; i++) {
        var gridLineY = chartY + 2 + (plotH / 4) * i;
        doc.line(chartX + padLeft, gridLineY, chartX + chartW - 2, gridLineY);

        var labelVal = maxVal - (maxVal / 4) * i;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6);
        doc.setTextColor.apply(doc, colors.textLight);
        doc.text(formatLabel(labelVal), chartX + padLeft - 2, gridLineY + 1.5, { align: 'right' });
    }

    // Pontos
    var points = values.map(function(val, idx) {
        return {
            x: chartX + padLeft + 4 + (idx / Math.max(values.length - 1, 1)) * (plotW - 8),
            y: chartY + 2 + plotH - (val / maxVal) * plotH
        };
    });

    // Area preenchida
    if (points.length > 1) {
        for (var i = 0; i < points.length - 1; i++) {
            var baseY = chartY + 2 + plotH;
            var steps = 15;
            for (var s = 0; s <= steps; s++) {
                var t = s / steps;
                var px = points[i].x + (points[i + 1].x - points[i].x) * t;
                var py = points[i].y + (points[i + 1].y - points[i].y) * t;
                doc.setDrawColor.apply(doc, fillColorRGB);
                doc.setLineWidth(1);
                doc.line(px, py, px, baseY);
            }
        }
    }

    // Linha principal
    doc.setDrawColor.apply(doc, lineColor);
    doc.setLineWidth(1.2);
    for (var i = 0; i < points.length - 1; i++) {
        doc.line(points[i].x, points[i].y, points[i + 1].x, points[i + 1].y);
    }

    // Pontos (circulos)
    var totalDays = values.length;
    var showDots = totalDays <= 14;
    if (showDots) {
        points.forEach(function(p) {
            doc.setFillColor.apply(doc, colors.white);
            doc.circle(p.x, p.y, 1.8, 'F');
            doc.setFillColor.apply(doc, lineColor);
            doc.circle(p.x, p.y, 1.2, 'F');
        });
    }

    // Labels eixo X — adaptar frequencia ao numero de dias
    var dayNames = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'];
    var labelStep = 1;
    if (totalDays > 21) labelStep = 5;
    else if (totalDays > 14) labelStep = 3;
    else if (totalDays > 7) labelStep = 2;

    dailyData.forEach(function(d, idx) {
        // Mostrar label apenas nos steps e sempre no primeiro e ultimo
        var showLabel = (idx % labelStep === 0) || (idx === totalDays - 1);
        if (!showLabel) return;

        var x = points[idx].x;
        var date = new Date(d.date + 'T12:00:00');

        // Data dd/mm
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(5.5);
        doc.setTextColor.apply(doc, colors.textLight);
        var dateLabel = String(date.getDate()).padStart(2, '0') + '/' + String(date.getMonth() + 1).padStart(2, '0');
        doc.text(dateLabel, x, chartY + chartH - 1, { align: 'center' });

        // Nome do dia (apenas se cabe)
        if (totalDays <= 14) {
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(5.5);
            doc.setTextColor.apply(doc, colors.text);
            doc.text(dayNames[date.getDay()], x, chartY + chartH - 5, { align: 'center' });
        }

        // Valor acima do ponto (apenas se poucos dias ou nos steps)
        if (totalDays <= 14 || idx % labelStep === 0) {
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(5);
            doc.setTextColor.apply(doc, lineColor);
            doc.text(formatLabel(values[idx]), x, points[idx].y - 3, { align: 'center' });
        }
    });

    return startY + chartH + 12;
}

function drawPDFCampaignTable(doc, startY, params, colors) {
    var campaigns = params.reportData.campaigns || [];
    if (campaigns.length === 0) return startY;

    // Titulo
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor.apply(doc, colors.dark);
    doc.text('Detalhamento por Campanha', 20, startY);
    startY += 6;

    var y = startY;

    // Header
    doc.setFillColor.apply(doc, colors.primary);
    doc.roundedRect(20, y, 170, 7, 1, 1, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor.apply(doc, colors.white);

    doc.text('Campanha', 23, y + 5);
    doc.text('Investido', 120, y + 5, { align: 'right' });
    doc.text('Impressoes', 146, y + 5, { align: 'right' });
    doc.text('Leads', 164, y + 5, { align: 'right' });
    doc.text('CPL', 188, y + 5, { align: 'right' });

    y += 9;

    // Linhas
    var topCampaigns = campaigns
        .sort(function(a, b) { return b.spend - a.spend; })
        .slice(0, 8);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);

    topCampaigns.forEach(function(campaign, i) {
        if (y > 275) { doc.addPage(); y = 20; }

        if (i % 2 === 0) {
            doc.setFillColor.apply(doc, colors.bgLight);
            doc.rect(20, y - 1.5, 170, 7, 'F');
        }

        doc.setTextColor.apply(doc, colors.text);
        doc.text(truncateText(doc, campaign.name, 92), 23, y + 3);
        doc.text(formatCurrency(campaign.spend), 120, y + 3, { align: 'right' });
        doc.text(formatNumber(campaign.impressions), 146, y + 3, { align: 'right' });
        doc.text(String(Math.round(campaign.leads)), 164, y + 3, { align: 'right' });
        doc.text(campaign.leads > 0 ? formatCurrency(campaign.cpl) : '--', 188, y + 3, { align: 'right' });

        y += 7;
    });

    // Total
    doc.setDrawColor.apply(doc, colors.border);
    doc.setLineWidth(0.3);
    doc.line(20, y, 190, y);
    y += 2;

    var summary = params.reportData.summary;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor.apply(doc, colors.dark);
    doc.text('TOTAL', 23, y + 3);
    doc.text(formatCurrency(summary.spend), 120, y + 3, { align: 'right' });
    doc.text(formatNumber(summary.impressions), 146, y + 3, { align: 'right' });
    doc.text(String(Math.round(summary.leads)), 164, y + 3, { align: 'right' });
    doc.text(summary.leads > 0 ? formatCurrency(summary.cpl) : '--', 188, y + 3, { align: 'right' });

    return y + 10;
}

function drawPDFCreativesTable(doc, startY, topCreatives, colors) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor.apply(doc, colors.dark);
    doc.text('Top Criativos por Eficiencia', 20, startY);
    startY += 6;

    var y = startY;

    // Header
    doc.setFillColor(139, 92, 246); // violet
    doc.roundedRect(20, y, 170, 7, 1, 1, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor.apply(doc, colors.white);

    doc.text('Criativo', 23, y + 5);
    doc.text('Investido', 115, y + 5, { align: 'right' });
    doc.text('Leads', 138, y + 5, { align: 'right' });
    doc.text('CPL', 160, y + 5, { align: 'right' });
    doc.text('CTR', 188, y + 5, { align: 'right' });

    y += 9;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);

    topCreatives.forEach(function(cr, i) {
        if (y > 275) { doc.addPage(); y = 20; }

        if (i % 2 === 0) {
            doc.setFillColor.apply(doc, colors.bgLight);
            doc.rect(20, y - 1.5, 170, 7, 'F');
        }

        doc.setTextColor.apply(doc, colors.text);
        doc.text(truncateText(doc, cr.name || 'Criativo #' + (i + 1), 87), 23, y + 3);
        doc.text(formatCurrency(cr.spend), 115, y + 3, { align: 'right' });
        doc.text(String(Math.round(cr.leads)), 138, y + 3, { align: 'right' });
        doc.text(formatCurrency(cr.cpl), 160, y + 3, { align: 'right' });
        doc.text(cr.ctr.toFixed(2) + '%', 188, y + 3, { align: 'right' });

        y += 7;
    });

    return y + 4;
}

function drawPDFInsights(doc, startY, params, colors) {
    var y = startY;
    var pageMaxY = 275;
    var insightsObj = params.insights;

    // Compatibilidade: se insights e array (formato antigo), usar diretamente
    var insightTexts = Array.isArray(insightsObj) ? insightsObj : (insightsObj.analysis || []);

    // Helper para desenhar bloco de insight
    function drawInsightBlock(text, blockColor) {
        doc.setFontSize(7.5);
        var lines = doc.splitTextToSize(text, 152);
        var blockH = lines.length * 3.5 + 8;

        if (y + blockH > pageMaxY) {
            doc.addPage();
            y = 20;
        }

        doc.setFillColor(248, 250, 252);
        doc.roundedRect(20, y, 170, blockH, 2, 2, 'F');

        doc.setFillColor.apply(doc, blockColor || colors.primary);
        doc.rect(20, y + 1.5, 1.2, blockH - 3, 'F');

        doc.setFillColor.apply(doc, blockColor || colors.primary);
        doc.circle(26, y + 5, 1, 'F');

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor.apply(doc, colors.text);
        doc.text(lines, 30, y + 5.5);

        y += blockH + 2;
    }

    // Helper para titulo de secao
    function drawSectionTitle(title, sectionColor) {
        if (y + 12 > pageMaxY) { doc.addPage(); y = 20; }
        y += 4;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.setTextColor.apply(doc, sectionColor || colors.dark);
        doc.text(title, 20, y);
        y += 5;
    }

    // Se formato estruturado
    if (!Array.isArray(insightsObj)) {
        // O Que Funcionou
        if (insightsObj.replicar && insightsObj.replicar.length > 0) {
            drawSectionTitle('O Que Funcionou', [16, 185, 129]);
            insightsObj.replicar.forEach(function(item) {
                drawInsightBlock(item.title + ': ' + item.text, colors.green);
            });
        }

        // Oportunidades de Melhoria
        if (insightsObj.melhorar && insightsObj.melhorar.length > 0) {
            drawSectionTitle('Oportunidades de Melhoria', [245, 158, 11]);
            insightsObj.melhorar.forEach(function(item) {
                drawInsightBlock(item.title + ': ' + item.text, [245, 158, 11]);
            });
        }

        // Ajustes Necessarios
        if (insightsObj.ajustar && insightsObj.ajustar.length > 0) {
            drawSectionTitle('Ajustes Necessarios', colors.red);
            insightsObj.ajustar.forEach(function(item) {
                drawInsightBlock(item.title + ': ' + item.text, colors.red);
            });
        }
    } else {
        // Formato antigo: array simples
        drawSectionTitle('Analise e Recomendacoes', colors.dark);
        insightTexts.forEach(function(text) {
            drawInsightBlock(text, colors.primary);
        });
    }

    return y + 2;
}

function drawPDFFooter(doc, pageNum, totalPages, colors) {
    var y = 290;

    doc.setDrawColor.apply(doc, colors.border);
    doc.setLineWidth(0.2);
    doc.line(20, y - 3, 190, y - 3);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor.apply(doc, colors.textLight);
    doc.text('Milo MKT | Relatorio gerado automaticamente pelo Painel Gerencial Meta Ads', 20, y);
    doc.text('Pagina ' + pageNum + ' de ' + totalPages, 190, y, { align: 'right' });
}

// ==========================================
// UTILIDADES
// ==========================================

function formatAxisCurrency(value) {
    var symbol = (typeof currentCurrency !== 'undefined' && currentCurrency === 'USD') ? '$' : 'R$';
    if (value >= 1000) return symbol + (value / 1000).toFixed(1) + 'k';
    if (value >= 1) return symbol + value.toFixed(0);
    return symbol + value.toFixed(2);
}

function truncateText(doc, text, maxWidth) {
    if (!text) return '';
    text = String(text);
    if (doc.getTextWidth(text) <= maxWidth) return text;
    var truncated = text;
    while (doc.getTextWidth(truncated + '...') > maxWidth && truncated.length > 0) {
        truncated = truncated.slice(0, -1);
    }
    return truncated + '...';
}

function fillPeriodDays(dailyData, sinceStr, untilStr) {
    var sinceParts = sinceStr.split('-').map(Number);
    var untilParts = untilStr.split('-').map(Number);

    var startDate = new Date(sinceParts[0], sinceParts[1] - 1, sinceParts[2]);
    var endDate = new Date(untilParts[0], untilParts[1] - 1, untilParts[2]);

    var filled = [];
    var current = new Date(startDate);

    while (current <= endDate) {
        var dateStr = formatDateForReport(current);
        var existing = dailyData.find(function(dd) { return dd.date === dateStr; });
        if (existing) {
            filled.push(existing);
        } else {
            filled.push({ date: dateStr, spend: 0, impressions: 0, leads: 0, cpl: 0 });
        }
        current.setDate(current.getDate() + 1);
    }

    return filled;
}

// ==========================================
// PDF DO AGENTE ANALISTA
// ==========================================

async function generateAnalystPDF() {
    // Validar dados disponíveis
    if (!campaignsDataCache || campaignsDataCache.length === 0) {
        showToast('Nenhum dado de campanha disponivel para gerar o PDF.');
        return;
    }

    var campaigns = campaignsDataCache;
    var cplTargets = getCurrentClientCplTargets();
    var analysisResult = runAnalysisEngine(campaigns, cplTargets);

    // Obter nome do cliente
    var clientFilter = document.getElementById('clientFilter');
    var clientName = clientFilter ? clientFilter.options[clientFilter.selectedIndex].textContent : 'Cliente';

    // Carregar logo
    var logoData = await loadLogoAsBase64();

    var jsPDF = window.jspdf.jsPDF;
    var doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

    var colors = {
        primary: [19, 127, 236],
        dark: [15, 23, 42],
        text: [30, 41, 59],
        textLight: [100, 116, 139],
        green: [16, 185, 129],
        red: [239, 68, 68],
        amber: [245, 158, 11],
        blue: [59, 130, 246],
        emerald: [16, 185, 129],
        bgLight: [248, 250, 252],
        border: [226, 232, 240],
        white: [255, 255, 255]
    };

    var severityColors = {
        critical: { main: [239, 68, 68], bg: [254, 242, 242] },
        warning: { main: [245, 158, 11], bg: [255, 251, 235] },
        info: { main: [59, 130, 246], bg: [239, 246, 255] },
        success: { main: [16, 185, 129], bg: [236, 253, 245] }
    };

    var severityLabels = {
        critical: 'CRITICO',
        warning: 'ATENCAO',
        info: 'INFO',
        success: 'SAUDAVEL'
    };

    var diagnostics = analysisResult.diagnostics;
    var scenario = analysisResult.scenario;
    var strategy = analysisResult.strategy;
    var scaling = analysisResult.scaling;

    var y = 15;

    // === HEADER ===
    doc.setFillColor.apply(doc, colors.primary);
    doc.rect(0, 0, 210, 3, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.setTextColor.apply(doc, colors.dark);
    doc.text('Analise Estrategica de Campanhas', 20, y + 3);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor.apply(doc, colors.textLight);
    doc.text('Agente Analista - Meta Ads', 20, y + 9);

    if (logoData) {
        var ratio = logoData.width / logoData.height;
        var logoH = 12;
        var logoW = logoH * ratio;
        if (logoW > 40) { logoW = 40; logoH = logoW / ratio; }
        doc.addImage(logoData.dataUrl, 'JPEG', 190 - logoW, y - 3, logoW, logoH);
    }

    y += 18;

    // Info cards
    var periodLabel = (document.getElementById('dateFilterLabel') || {}).textContent || '';
    var infoItems = [
        { label: 'Cliente', value: clientName },
        { label: 'Periodo', value: periodLabel }
    ];

    var cardW = 82;
    var cardGap = 6;

    infoItems.forEach(function(item, i) {
        var x = 20 + i * (cardW + cardGap);
        doc.setFillColor.apply(doc, colors.bgLight);
        doc.roundedRect(x, y, cardW, 14, 2, 2, 'F');

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.setTextColor.apply(doc, colors.textLight);
        doc.text(item.label, x + 3, y + 5);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.setTextColor.apply(doc, colors.text);
        doc.text(truncateText(doc, item.value, cardW - 6), x + 3, y + 11);
    });

    y += 20;

    // Separador
    doc.setDrawColor.apply(doc, colors.border);
    doc.setLineWidth(0.3);
    doc.line(20, y, 190, y);
    y += 8;

    // === RESUMO KPIs ===
    var totalSpend = campaigns.reduce(function(s, c) { return s + c.metrics.spend; }, 0);
    var totalLeads = campaigns.reduce(function(s, c) { return s + c.metrics.leads; }, 0);
    var avgCpl = totalLeads > 0 ? totalSpend / totalLeads : 0;
    var activeCount = campaigns.filter(function(c) { return c.status === 'ACTIVE'; }).length;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor.apply(doc, colors.dark);
    doc.text('Resumo', 20, y);
    y += 6;

    var kpis = [
        { label: 'Campanhas', value: String(campaigns.length) + ' (' + activeCount + ' ativas)' },
        { label: 'Investimento', value: formatCurrency(totalSpend) },
        { label: 'Leads', value: String(Math.round(totalLeads)) },
        { label: 'CPL Medio', value: totalLeads > 0 ? formatCurrency(avgCpl) : '--' }
    ];

    var kpiW = 40;
    var kpiGap = 3.3;
    kpis.forEach(function(kpi, i) {
        var x = 20 + i * (kpiW + kpiGap);
        doc.setFillColor.apply(doc, colors.bgLight);
        doc.roundedRect(x, y, kpiW, 18, 2, 2, 'F');
        doc.setFillColor.apply(doc, colors.primary);
        doc.rect(x, y + 2, 1.2, 14, 'F');

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.setTextColor.apply(doc, colors.textLight);
        doc.text(kpi.label, x + 4, y + 6);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.setTextColor.apply(doc, colors.dark);
        doc.text(kpi.value, x + 4, y + 14);
    });

    y += 26;

    // === SECAO 1: ANALISE DO CENARIO ATUAL ===
    if (scenario.length > 0) {
        y = drawAnalystPDFSectionTitle(doc, y, 'Analise do Cenario Atual', colors);

        scenario.forEach(function(s) {
            doc.setFontSize(7.5);
            var textLines = doc.splitTextToSize(s.text, 152);
            var blockH = 8 + textLines.length * 3.5 + 4;

            if (y + blockH > 275) { doc.addPage(); y = 20; }

            doc.setFillColor.apply(doc, colors.bgLight);
            doc.roundedRect(20, y, 170, blockH, 2, 2, 'F');
            doc.setFillColor.apply(doc, colors.primary);
            doc.rect(20, y + 2, 1.2, blockH - 4, 'F');

            doc.setFont('helvetica', 'bold');
            doc.setFontSize(8);
            doc.setTextColor.apply(doc, colors.dark);
            doc.text(s.title, 25, y + 6);

            doc.setFont('helvetica', 'normal');
            doc.setFontSize(7.5);
            doc.setTextColor.apply(doc, colors.text);
            doc.text(textLines, 25, y + 11);

            y += blockH + 2;
        });

        y += 4;
    }

    // === SECAO 2: DIAGNOSTICO ESTRATEGICO ===
    y = drawAnalystPDFSectionTitle(doc, y, 'Diagnostico Estrategico', colors);

    if (diagnostics.length === 0) {
        doc.setFillColor.apply(doc, colors.bgLight);
        doc.roundedRect(20, y, 170, 16, 2, 2, 'F');
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor.apply(doc, colors.textLight);
        doc.text('Nenhum ponto critico identificado. Todas as campanhas dentro dos parametros.', 28, y + 10);
        y += 22;
    } else {
        diagnostics.forEach(function(d) {
            var sColors = severityColors[d.severity] || severityColors.info;
            var sLabel = severityLabels[d.severity] || 'INFO';

            doc.setFontSize(7.5);
            var descLines = doc.splitTextToSize(d.description, 152);
            var actionLines = doc.splitTextToSize('Plano de acao: ' + d.action, 148);
            var campaignNames = d.campaigns.map(function(c) { return c.name + ' (' + c.detail + ')'; }).join(' | ');
            var campaignLines = doc.splitTextToSize(campaignNames, 152);

            var blockH = 12 + (descLines.length * 3.5) + 4 + (campaignLines.length * 3.2) + 4 + (actionLines.length * 3.5) + 6;

            if (y + blockH > 275) { doc.addPage(); y = 20; }

            doc.setFillColor.apply(doc, sColors.bg);
            doc.roundedRect(20, y, 170, blockH, 2, 2, 'F');
            doc.setFillColor.apply(doc, sColors.main);
            doc.rect(20, y + 2, 1.5, blockH - 4, 'F');

            // Badge de severidade — calcular largura com font correto
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(6);
            var badgeTextW = doc.getTextWidth(sLabel);
            var badgePadX = 2.5;
            var badgeW = badgeTextW + badgePadX * 2;
            var badgeH = 5;
            var badgeX = 25;
            var badgeY = y + 3;

            doc.setFillColor.apply(doc, sColors.main);
            doc.roundedRect(badgeX, badgeY, badgeW, badgeH, 1, 1, 'F');
            doc.setTextColor.apply(doc, colors.white);
            doc.text(sLabel, badgeX + badgePadX, badgeY + badgeH * 0.72);

            doc.setFont('helvetica', 'bold');
            doc.setFontSize(9);
            doc.setTextColor.apply(doc, colors.dark);
            doc.text(d.title, badgeX + badgeW + 3, y + 7);

            var innerY = y + 12;

            doc.setFont('helvetica', 'normal');
            doc.setFontSize(7.5);
            doc.setTextColor.apply(doc, colors.text);
            doc.text(descLines, 25, innerY);
            innerY += descLines.length * 3.5 + 3;

            doc.setFont('helvetica', 'bold');
            doc.setFontSize(6.5);
            doc.setTextColor.apply(doc, sColors.main);
            doc.text(campaignLines, 25, innerY);
            innerY += campaignLines.length * 3.2 + 3;

            doc.setFillColor(245, 248, 252);
            doc.roundedRect(24, innerY - 2, 162, actionLines.length * 3.5 + 5, 1.5, 1.5, 'F');
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(7);
            doc.setTextColor.apply(doc, colors.text);
            doc.text(actionLines, 27, innerY + 2.5);

            y += blockH + 3;
        });
    }

    y += 4;

    // === SECAO 3: PLANO DE ACAO DETALHADO ===
    if (strategy.length > 0) {
        y = drawAnalystPDFSectionTitle(doc, y, 'Plano de Acao Detalhado', colors);

        strategy.forEach(function(s) {
            doc.setFontSize(7.5);
            var textLines = doc.splitTextToSize(s.text, 152);
            var blockH = 8 + textLines.length * 3.5 + 4;

            if (y + blockH > 275) { doc.addPage(); y = 20; }

            // Fundo com tom azulado
            doc.setFillColor(240, 246, 255);
            doc.roundedRect(20, y, 170, blockH, 2, 2, 'F');
            doc.setFillColor.apply(doc, colors.primary);
            doc.rect(20, y + 2, 1.2, blockH - 4, 'F');

            doc.setFont('helvetica', 'bold');
            doc.setFontSize(8);
            doc.setTextColor.apply(doc, colors.primary);
            doc.text(s.title, 25, y + 6);

            doc.setFont('helvetica', 'normal');
            doc.setFontSize(7.5);
            doc.setTextColor.apply(doc, colors.text);
            doc.text(textLines, 25, y + 11);

            y += blockH + 2;
        });

        y += 4;
    }

    // === SECAO 4: DIRECIONAMENTO AVANCADO ===
    if (scaling.length > 0) {
        y = drawAnalystPDFSectionTitle(doc, y, 'Direcionamento Avancado', colors);

        scaling.forEach(function(s) {
            doc.setFontSize(7.5);
            var textLines = doc.splitTextToSize(s.text, 152);
            var blockH = 8 + textLines.length * 3.5 + 4;

            if (y + blockH > 275) { doc.addPage(); y = 20; }

            // Fundo com tom esverdeado
            doc.setFillColor(236, 253, 245);
            doc.roundedRect(20, y, 170, blockH, 2, 2, 'F');
            doc.setFillColor.apply(doc, colors.emerald);
            doc.rect(20, y + 2, 1.2, blockH - 4, 'F');

            doc.setFont('helvetica', 'bold');
            doc.setFontSize(8);
            doc.setTextColor.apply(doc, colors.emerald);
            doc.text(s.title, 25, y + 6);

            doc.setFont('helvetica', 'normal');
            doc.setFontSize(7.5);
            doc.setTextColor.apply(doc, colors.text);
            doc.text(textLines, 25, y + 11);

            y += blockH + 2;
        });

        y += 4;
    }

    // === FAIXAS DE CPL (se configuradas) ===
    if (cplTargets) {
        if (y + 30 > 275) { doc.addPage(); y = 20; }

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.setTextColor.apply(doc, colors.dark);
        doc.text('Faixas de CPL Configuradas', 20, y + 4);
        y += 8;

        var bands = [
            { label: 'Excelente', value: 'CPL <= ' + formatCurrency(cplTargets.excellent), color: colors.green },
            { label: 'Saudavel', value: 'CPL <= ' + formatCurrency(cplTargets.healthy), color: colors.blue },
            { label: 'Atencao', value: 'CPL <= ' + formatCurrency(cplTargets.warning), color: colors.amber },
            { label: 'Critico', value: 'CPL > ' + formatCurrency(cplTargets.warning), color: colors.red }
        ];

        bands.forEach(function(band) {
            doc.setFillColor.apply(doc, band.color);
            doc.circle(25, y + 1.5, 1.5, 'F');
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(7.5);
            doc.setTextColor.apply(doc, colors.dark);
            doc.text(band.label, 29, y + 3);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor.apply(doc, colors.textLight);
            doc.text(band.value, 55, y + 3);
            y += 5.5;
        });
    }

    // === FOOTER ===
    var totalPages = doc.internal.getNumberOfPages();
    for (var p = 1; p <= totalPages; p++) {
        doc.setPage(p);
        drawPDFFooter(doc, p, totalPages, colors);
    }

    // Salvar
    doc.save('[ANALISE] [' + clientName + '] [' + periodLabel + '].pdf');

    showToast('PDF do diagnostico gerado com sucesso!');
}

function drawAnalystPDFSectionTitle(doc, y, title, colors) {
    if (y + 12 > 275) { doc.addPage(); y = 20; }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor.apply(doc, colors.dark);
    doc.text(title, 20, y);

    doc.setDrawColor.apply(doc, colors.border);
    doc.setLineWidth(0.2);
    doc.line(20, y + 2, 190, y + 2);

    return y + 8;
}
