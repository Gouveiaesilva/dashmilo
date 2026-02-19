// ==========================================
// RELATORIOS - GERADOR DE PDF
// ==========================================

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
    const periodInfo = document.getElementById('reportPeriodInfo');
    const periodText = document.getElementById('reportPeriodText');

    if (clientSelect.value) {
        btn.disabled = false;
        periodInfo.classList.remove('hidden');

        const period = getReportPeriod();
        const prevPeriod = getPreviousPeriod(period.since, period.until);

        periodText.innerHTML =
            '<strong>Periodo do relatorio:</strong> ' + formatDateBR(period.since) + ' a ' + formatDateBR(period.until) +
            '<br><strong>Comparacao:</strong> periodo anterior (' + formatDateBR(prevPeriod.since) + ' a ' + formatDateBR(prevPeriod.until) + ')';
    } else {
        btn.disabled = true;
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
    var campaigns = data.campaigns;
    var daily = data.daily;

    var insights = [];

    // --- Variacoes ---
    var cplChange = calcChange(current.cpl, prev.cpl);
    var leadsChange = calcChange(current.leads, prev.leads);
    var spendChange = calcChange(current.spend, prev.spend);
    var impressionsChange = calcChange(current.impressions, prev.impressions);

    // Taxa de conversao (leads por 1000 impressoes)
    var currentCR = current.impressions > 0 ? (current.leads / current.impressions) * 1000 : 0;
    var prevCR = prev.impressions > 0 ? (prev.leads / prev.impressions) * 1000 : 0;
    var crChange = calcChange(currentCR, prevCR);

    // ==========================================
    // 1. DIAGNOSTICO GERAL
    // ==========================================

    if (current.leads === 0 && current.spend === 0) {
        insights.push('Nenhum investimento e nenhum lead registrado neste periodo. Verifique se as campanhas estao ativas, se o metodo de pagamento esta operacional e se ha orcamento configurado.');
        return insights;
    }

    if (current.leads === 0 && current.spend > 0) {
        insights.push('Foram investidos ' + fmtCur(current.spend) + ' no periodo, mas nenhum lead foi registrado. Isso pode indicar: (1) problemas no formulario ou pagina de destino, (2) segmentacao de publico inadequada, (3) criativos que atraem cliques mas nao geram conversao. Recomenda-se revisar o funil completo e pausar campanhas sem resultado imediato.');
        return insights;
    }

    // Resumo executivo
    var resumo = 'Resumo do periodo: investimento de ' + fmtCur(current.spend);
    resumo += ' (' + fmtVar(spendChange) + ' vs anterior)';
    resumo += ', ' + Math.round(current.leads) + ' leads gerados';
    resumo += ' (' + fmtVar(leadsChange) + ')';
    resumo += ' com CPL de ' + fmtCur(current.cpl);
    resumo += ' (' + fmtVar(cplChange) + ').';
    insights.push(resumo);

    // ==========================================
    // 2. ANALISE DE EFICIENCIA
    // ==========================================

    if (spendChange > 5 && leadsChange < -5) {
        // Investiu mais, gerou menos
        insights.push('Alerta de eficiencia: o investimento cresceu ' + Math.abs(spendChange).toFixed(1) + '% mas os leads cairam ' + Math.abs(leadsChange).toFixed(1) + '%. O orcamento adicional nao esta se convertendo em resultados. Recomenda-se: (1) pausar conjuntos de anuncios com CPL acima de ' + fmtCur(current.cpl * 1.5) + ', (2) redistribuir verba para as campanhas mais eficientes, (3) testar novos criativos e copys.');
    } else if (spendChange > 10 && leadsChange > 10 && cplChange > 10) {
        // Escalou mas CPL subiu
        insights.push('O aumento de ' + Math.abs(spendChange).toFixed(1) + '% no investimento gerou mais ' + Math.abs(leadsChange).toFixed(1) + '% de leads, porem o CPL subiu ' + Math.abs(cplChange).toFixed(1) + '%. Isso e natural na escala, mas merece atencao. Considere manter o orcamento estavel por 3-5 dias para o algoritmo se reotimizar antes de novos aumentos.');
    } else if (spendChange > 10 && leadsChange > 10 && cplChange <= 5) {
        // Escala eficiente
        insights.push('Escala eficiente: o investimento cresceu ' + Math.abs(spendChange).toFixed(1) + '% e os leads acompanharam com +' + Math.abs(leadsChange).toFixed(1) + '% sem impacto significativo no CPL. Ha espaco para continuar aumentando o orcamento gradualmente (10-20% a cada 3 dias).');
    } else if (cplChange < -15) {
        // CPL melhorou muito
        insights.push('O Custo por Lead teve queda de ' + Math.abs(cplChange).toFixed(1) + '% (de ' + fmtCur(prev.cpl) + ' para ' + fmtCur(current.cpl) + '). Esta e uma janela favoravel para aumentar o investimento e capturar mais leads com custo otimizado.');
    } else if (cplChange > 20) {
        // CPL piorou muito
        insights.push('O CPL aumentou ' + Math.abs(cplChange).toFixed(1) + '% (de ' + fmtCur(prev.cpl) + ' para ' + fmtCur(current.cpl) + '). Possíveis causas: saturacao do publico, fadiga de criativo ou aumento de concorrencia no leilao. Recomenda-se renovar criativos, testar novos publicos lookalike e revisar a estrategia de lance.');
    }

    // Taxa de conversao
    if (currentCR > 0 && Math.abs(crChange) > 15) {
        if (crChange < -15) {
            insights.push('A taxa de conversao (leads por impressao) caiu ' + Math.abs(crChange).toFixed(1) + '%. As campanhas estao alcancando o publico, mas a conversao esta mais baixa. Recomenda-se revisar: criativos (oferta clara?), pagina de destino (carregamento rapido? formulario simples?) e segmentacao (o publico e qualificado?).');
        } else if (crChange > 15) {
            insights.push('A taxa de conversao melhorou ' + crChange.toFixed(1) + '%. Os anuncios estao mais eficientes em transformar impressoes em leads. Mantenha os criativos atuais e considere ampliar o alcance com publicos semelhantes.');
        }
    }

    // ==========================================
    // 3. ANALISE DE CAMPANHAS
    // ==========================================

    if (campaigns.length > 1) {
        // Ordenar por CPL (melhor para pior)
        var activeCampaigns = campaigns.filter(function(c) { return c.leads > 0 && c.spend > 0; });

        if (activeCampaigns.length > 1) {
            activeCampaigns.sort(function(a, b) { return a.cpl - b.cpl; });

            var best = activeCampaigns[0];
            var worst = activeCampaigns[activeCampaigns.length - 1];

            if (worst.cpl > best.cpl * 2 && activeCampaigns.length >= 2) {
                // Grande disparidade entre campanhas
                insights.push('Disparidade entre campanhas: "' + truncName(best.name) + '" tem CPL de ' + fmtCur(best.cpl) + ' enquanto "' + truncName(worst.name) + '" opera a ' + fmtCur(worst.cpl) + ' (' + (worst.cpl / best.cpl).toFixed(1) + 'x mais caro). Considere realocar orcamento da campanha menos eficiente para a mais eficiente, ou revisar a segmentacao e criativos da campanha com CPL elevado.');
            }

            // Campanhas com custo mas sem leads
            var noLeadCampaigns = campaigns.filter(function(c) { return c.leads === 0 && c.spend > 10; });
            if (noLeadCampaigns.length > 0) {
                var wastedSpend = noLeadCampaigns.reduce(function(sum, c) { return sum + c.spend; }, 0);
                var names = noLeadCampaigns.slice(0, 2).map(function(c) { return '"' + truncName(c.name) + '"'; }).join(' e ');
                insights.push('Atencao: ' + (noLeadCampaigns.length === 1 ? 'a campanha ' : noLeadCampaigns.length + ' campanhas, incluindo ') + names + ', consumiram ' + fmtCur(wastedSpend) + ' sem gerar leads. Avalie pausar ou reestruturar essas campanhas para evitar desperdicio de verba.');
            }

            // Concentracao de leads
            if (activeCampaigns.length >= 3) {
                var topCampaign = activeCampaigns.sort(function(a, b) { return b.leads - a.leads; })[0];
                var leadShare = (topCampaign.leads / current.leads) * 100;
                if (leadShare > 70) {
                    insights.push('Risco de concentracao: ' + leadShare.toFixed(0) + '% dos leads vem de uma unica campanha ("' + truncName(topCampaign.name) + '"). Se essa campanha perder performance, o impacto sera significativo. Recomenda-se diversificar criando novos angulos de comunicacao e testando publicos diferentes em campanhas paralelas.');
                }
            }
        }
    }

    // ==========================================
    // 4. ANALISE DE TENDENCIA DIARIA
    // ==========================================

    if (daily.length >= 4) {
        var halfIdx = Math.floor(daily.length / 2);
        var firstHalf = daily.slice(0, halfIdx);
        var secondHalf = daily.slice(halfIdx);

        var firstHalfCPL = calcDailyAvgCPL(firstHalf);
        var secondHalfCPL = calcDailyAvgCPL(secondHalf);
        var firstHalfLeads = firstHalf.reduce(function(s, d) { return s + (d.leads || 0); }, 0);
        var secondHalfLeads = secondHalf.reduce(function(s, d) { return s + (d.leads || 0); }, 0);

        if (firstHalfCPL > 0 && secondHalfCPL > 0) {
            var trendCPL = calcChange(secondHalfCPL, firstHalfCPL);

            if (trendCPL > 20) {
                insights.push('Tendencia de piora dentro do periodo: o CPL da segunda metade (' + fmtCur(secondHalfCPL) + ') esta ' + Math.abs(trendCPL).toFixed(0) + '% acima da primeira metade (' + fmtCur(firstHalfCPL) + '). Isso pode indicar fadiga de criativo ou saturacao de publico. Providencie novos criativos o quanto antes.');
            } else if (trendCPL < -20) {
                insights.push('Tendencia de melhora dentro do periodo: o CPL da segunda metade (' + fmtCur(secondHalfCPL) + ') caiu ' + Math.abs(trendCPL).toFixed(0) + '% em relacao a primeira metade (' + fmtCur(firstHalfCPL) + '). O algoritmo esta otimizando bem a entrega. Evite fazer alteracoes bruscas neste momento.');
            }
        }

        // Dias sem leads
        var zeroLeadDays = daily.filter(function(d) { return (d.leads || 0) === 0 && (d.spend || 0) > 0; }).length;
        if (zeroLeadDays > 0 && daily.length >= 7) {
            var pct = ((zeroLeadDays / daily.length) * 100).toFixed(0);
            insights.push('Em ' + zeroLeadDays + ' de ' + daily.length + ' dias (' + pct + '%), houve investimento sem gerar nenhum lead. Considere estabelecer regras de orcamento minimo diario e desativar automaticamente conjuntos que passem 2 dias consecutivos sem conversao.');
        }
    }

    // ==========================================
    // 5. IMPRESSOES E ALCANCE
    // ==========================================

    if (impressionsChange < -25) {
        insights.push('As impressoes cairam ' + Math.abs(impressionsChange).toFixed(1) + '% em relacao ao periodo anterior. Possivel causa: restricao orcamentaria, publico muito restrito ou queda no indice de qualidade dos anuncios. Revise o limite de gasto diario e amplie a segmentacao se o publico estiver muito nichado.');
    } else if (impressionsChange > 30 && leadsChange < 5) {
        insights.push('As impressoes cresceram ' + impressionsChange.toFixed(1) + '% mas os leads nao acompanharam (' + fmtVar(leadsChange) + '). O alcance esta maior, porem o publico adicional nao e qualificado. Recomenda-se refinar a segmentacao priorizando conversao sobre alcance.');
    }

    // ==========================================
    // 6. FECHAMENTO — garantir minimo de insights
    // ==========================================

    if (insights.length <= 1) {
        insights.push('A performance do periodo se manteve estavel em relacao ao anterior. Mantenha a estrategia atual e acompanhe os proximos dias para identificar oportunidades de otimizacao incremental.');
    }

    return insights;
}

// Auxiliares de formatacao para insights
function fmtCur(value) {
    return 'R$ ' + Number(value).toFixed(2).replace('.', ',');
}

function fmtVar(change) {
    if (Math.abs(change) < 1) return 'estavel';
    var arrow = change > 0 ? '+' : '';
    return arrow + change.toFixed(1) + '%';
}

function truncName(name) {
    if (!name) return '';
    return name.length > 45 ? name.substring(0, 42) + '...' : name;
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

    progressEl.classList.remove('hidden');
    generateBtn.disabled = true;

    try {
        // 1. Calcular periodo de comparacao
        progressText.textContent = 'Calculando periodos...';
        progressBar.style.width = '5%';

        var prevPeriod = getPreviousPeriod(period.since, period.until);

        // 2. Buscar dados do periodo do relatorio
        progressText.textContent = 'Buscando dados do periodo...';
        progressBar.style.width = '15%';
        var reportData = await fetchReportData(adAccountId, period.since, period.until);

        // 3. Buscar dados do periodo anterior
        progressText.textContent = 'Buscando dados do periodo anterior...';
        progressBar.style.width = '50%';
        var prevData = await fetchReportData(adAccountId, prevPeriod.since, prevPeriod.until);

        // 4. Gerar insights
        progressText.textContent = 'Analisando performance...';
        progressBar.style.width = '75%';
        var insights = generateInsights({
            current: reportData.summary,
            prev: prevData.summary,
            campaigns: reportData.campaigns || [],
            daily: reportData.daily || [],
            period: period
        });

        // 5. Carregar logo
        progressText.textContent = 'Carregando logo...';
        progressBar.style.width = '85%';
        var logoData = await loadLogoAsBase64();

        // 6. Gerar PDF
        progressText.textContent = 'Gerando PDF...';
        progressBar.style.width = '90%';

        buildReportPDF({
            clientName: clientName,
            period: period,
            prevPeriod: prevPeriod,
            reportData: reportData,
            prevData: prevData,
            insights: insights,
            logoData: logoData
        });

        progressBar.style.width = '100%';
        progressText.textContent = 'Relatorio gerado com sucesso!';
        showToast('Relatorio PDF gerado com sucesso!');

    } catch (error) {
        console.error('Erro ao gerar relatorio:', error);
        showToast('Erro ao gerar relatorio: ' + error.message);
        progressText.textContent = 'Erro: ' + error.message;
    } finally {
        generateBtn.disabled = false;
        setTimeout(function() {
            progressEl.classList.add('hidden');
            progressBar.style.width = '0%';
        }, 3000);
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

    // INSIGHTS
    if (y > 235) { doc.addPage(); y = 20; }
    y += 2;
    y = drawPDFInsights(doc, y, params, colors);

    // FOOTER
    var totalPages = doc.internal.getNumberOfPages();
    for (var i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        drawPDFFooter(doc, i, totalPages, colors);
    }

    // Salvar
    var clientSlug = params.clientName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    var dateSlug = params.period.since.replace(/-/g, '');
    doc.save('relatorio-' + clientSlug + '-' + dateSlug + '.pdf');
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

function drawPDFInsights(doc, startY, params, colors) {
    // Titulo
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor.apply(doc, colors.dark);
    doc.text('Analise e Recomendacoes', 20, startY);
    startY += 6;

    // Preparar linhas de cada insight
    doc.setFontSize(7.5);
    var insightBlocks = [];
    params.insights.forEach(function(insight, idx) {
        var lines = doc.splitTextToSize(insight, 152);
        insightBlocks.push({ lines: lines, isFirst: idx === 0 });
    });

    var y = startY;
    var pageMaxY = 275;

    insightBlocks.forEach(function(block) {
        var blockH = block.lines.length * 3.5 + 8;

        // Verificar se cabe na pagina
        if (y + blockH > pageMaxY) {
            doc.addPage();
            y = 20;
        }

        // Background do bloco
        doc.setFillColor(248, 250, 252);
        doc.roundedRect(20, y, 170, blockH, 2, 2, 'F');

        // Borda esquerda colorida
        doc.setFillColor(19, 127, 236);
        doc.rect(20, y + 1.5, 1.2, blockH - 3, 'F');

        // Bullet
        doc.setFillColor(19, 127, 236);
        doc.circle(26, y + 5, 1, 'F');

        // Texto
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor.apply(doc, colors.text);
        doc.text(block.lines, 30, y + 5.5);

        y += blockH + 2;
    });

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
    if (value >= 1000) return 'R$' + (value / 1000).toFixed(1) + 'k';
    if (value >= 1) return 'R$' + value.toFixed(0);
    return 'R$' + value.toFixed(2);
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
    var diagnostics = runAnalysisEngine(campaigns, cplTargets);

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

    var y = 15;

    // === HEADER ===
    doc.setFillColor.apply(doc, colors.primary);
    doc.rect(0, 0, 210, 3, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.setTextColor.apply(doc, colors.dark);
    doc.text('Diagnostico de Campanhas', 20, y + 3);

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
    var today = new Date();
    var dateStr = String(today.getDate()).padStart(2, '0') + '/' + String(today.getMonth() + 1).padStart(2, '0') + '/' + today.getFullYear();

    var infoItems = [
        { label: 'Cliente', value: clientName },
        { label: 'Data da Analise', value: dateStr }
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

    // === DIAGNOSTICOS ===
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor.apply(doc, colors.dark);
    doc.text('Diagnosticos', 20, y);
    y += 6;

    if (diagnostics.length === 0) {
        doc.setFillColor.apply(doc, colors.bgLight);
        doc.roundedRect(20, y, 170, 16, 2, 2, 'F');
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor.apply(doc, colors.textLight);
        doc.text('Nenhum ponto de atencao encontrado. Todas as campanhas dentro dos parametros.', 28, y + 10);
        y += 22;
    } else {
        diagnostics.forEach(function(d) {
            var sColors = severityColors[d.severity] || severityColors.info;
            var sLabel = severityLabels[d.severity] || 'INFO';

            // Calcular altura do bloco
            doc.setFontSize(7.5);
            var descLines = doc.splitTextToSize(d.description, 152);
            var actionLines = doc.splitTextToSize('Plano de acao: ' + d.action, 148);
            var campaignNames = d.campaigns.map(function(c) { return c.name + ' (' + c.detail + ')'; }).join(' | ');
            var campaignLines = doc.splitTextToSize(campaignNames, 152);

            var blockH = 12 + (descLines.length * 3.5) + 4 + (campaignLines.length * 3.2) + 4 + (actionLines.length * 3.5) + 6;

            // Nova pagina se necessario
            if (y + blockH > 275) {
                doc.addPage();
                y = 20;
            }

            // Background
            doc.setFillColor.apply(doc, sColors.bg);
            doc.roundedRect(20, y, 170, blockH, 2, 2, 'F');

            // Borda esquerda colorida
            doc.setFillColor.apply(doc, sColors.main);
            doc.rect(20, y + 2, 1.5, blockH - 4, 'F');

            // Badge de severidade
            doc.setFillColor.apply(doc, sColors.main);
            var badgeW = doc.getTextWidth(sLabel) * 0.52 + 6;
            doc.roundedRect(25, y + 3, badgeW, 5, 1, 1, 'F');
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(6);
            doc.setTextColor.apply(doc, colors.white);
            doc.text(sLabel, 28, y + 6.5);

            // Titulo
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(9);
            doc.setTextColor.apply(doc, colors.dark);
            doc.text(d.title, 25 + badgeW + 3, y + 7);

            var innerY = y + 12;

            // Descricao
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(7.5);
            doc.setTextColor.apply(doc, colors.text);
            doc.text(descLines, 25, innerY);
            innerY += descLines.length * 3.5 + 3;

            // Campanhas afetadas
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(6.5);
            doc.setTextColor.apply(doc, sColors.main);
            doc.text(campaignLines, 25, innerY);
            innerY += campaignLines.length * 3.2 + 3;

            // Plano de acao
            doc.setFillColor(245, 248, 252);
            doc.roundedRect(24, innerY - 2, 162, actionLines.length * 3.5 + 5, 1.5, 1.5, 'F');
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(7);
            doc.setTextColor.apply(doc, colors.text);
            doc.text(actionLines, 27, innerY + 2.5);

            y += blockH + 3;
        });
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
    var clientSlug = clientName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    var dateSlug = today.getFullYear() + String(today.getMonth() + 1).padStart(2, '0') + String(today.getDate()).padStart(2, '0');
    doc.save('diagnostico-' + clientSlug + '-' + dateSlug + '.pdf');

    showToast('PDF do diagnostico gerado com sucesso!');
}
