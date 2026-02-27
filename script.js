// ==========================================
// CONFIGURAÇÃO DO TAILWIND
// ==========================================
tailwind.config = {
  darkMode: "class",
  theme: {
    screens: {
      'xs': '480px',
      'sm': '640px',
      'md': '768px',
      'lg': '1024px',
      'xl': '1280px',
      '2xl': '1536px'
    },
    extend: {
      colors: {
        "primary": "#137fec",
        "background-light": "#f6f7f8",
        "background-dark": "#0a0f14",
        "surface-dark": "#161c24",
        "border-dark": "#2d343d"
      },
      fontFamily: {
        "display": ["Inter", "sans-serif"]
      },
      borderRadius: {
        "DEFAULT": "0.25rem",
        "lg": "0.5rem",
        "xl": "0.75rem",
        "2xl": "1rem",
        "full": "9999px"
      }
    }
  }
};

// ==========================================
// FUNÇÕES DE LOGIN
// ==========================================

// Usuários cadastrados
const USERS = [
    {
        email: 'alisson@milomkt.com.br',
        password: 'milomkt',
        name: 'Alisson',
        isAdmin: true
    },
    {
        email: 'carlos@milomkt.com.br',
        password: 'milomkt',
        name: 'Carlos',
        isAdmin: false
    }
];

// Usuário atual
let currentUser = null;

// Painel ativo ('visao-geral' ou 'metricas')
let currentPanel = 'visao-geral';

// Verificar se usuário está logado ao carregar a página
function checkLoginStatus() {
    const savedUser = sessionStorage.getItem('currentUser');

    if (savedUser) {
        currentUser = JSON.parse(savedUser);
        if (currentUser.isAdmin) {
            currentAdminPassword = ADMIN_PASSWORD;
        }
        updateUserInfo(currentUser);
        showDashboard();
        populateClientFilter();
        loadOverviewData();
    } else {
        showLoginScreen();
    }
}

// Processar login
function handleLogin(event) {
    event.preventDefault();

    const email = document.getElementById('loginEmail').value.trim().toLowerCase();
    const password = document.getElementById('loginPassword').value;
    const errorElement = document.getElementById('loginError');

    // Buscar usuário
    const user = USERS.find(u => u.email.toLowerCase() === email && u.password === password);

    if (user) {
        // Login bem-sucedido
        currentUser = user;
        sessionStorage.setItem('currentUser', JSON.stringify(user));

        // Se for admin, já configura a senha para operações admin
        if (user.isAdmin) {
            currentAdminPassword = ADMIN_PASSWORD;
        }

        // Resetar estado do dashboard para o novo usuário
        resetFullDashboardState();

        // Atualizar UI
        updateUserInfo(user);
        showDashboard();
        populateClientFilter();
        switchPanel('visao-geral');
        loadOverviewData();

        // Verificar se tem auto-report pendente (link do Google Chat)
        handleAutoReportLink();

        // Limpar formulário
        document.getElementById('loginEmail').value = '';
        document.getElementById('loginPassword').value = '';
        errorElement.classList.add('hidden');

        showToast('Bem-vindo, ' + user.name + '!');
    } else {
        // Login falhou
        errorElement.classList.remove('hidden');
        document.getElementById('loginPassword').value = '';
        document.getElementById('loginPassword').focus();
    }
}

// Toggle visibilidade da senha no login
function toggleLoginPasswordVisibility() {
    const input = document.getElementById('loginPassword');
    const icon = document.getElementById('loginPasswordToggleIcon');

    if (input.type === 'password') {
        input.type = 'text';
        icon.textContent = 'visibility_off';
    } else {
        input.type = 'password';
        icon.textContent = 'visibility';
    }
}

// Atualizar informações do usuário na sidebar
function updateUserInfo(user) {
    const userName = document.getElementById('userName');
    const userRole = document.getElementById('userRole');
    const userAvatar = document.getElementById('userAvatar');

    if (userName) userName.textContent = user.name;
    if (userRole) userRole.textContent = user.isAdmin ? 'Administrador' : 'Usuario';
    if (userAvatar) userAvatar.textContent = user.name.charAt(0).toUpperCase();
}

// Verificar se usuário atual é admin
function isCurrentUserAdmin() {
    return currentUser && currentUser.isAdmin;
}

// Mostrar tela de login
function showLoginScreen() {
    document.getElementById('loginScreen').classList.remove('hidden');
    document.getElementById('dashboardContainer').classList.add('hidden');
    document.getElementById('dashboardContainer').classList.remove('contents');
}

// Mostrar dashboard
function showDashboard() {
    document.getElementById('loginScreen').classList.add('hidden');
    document.getElementById('dashboardContainer').classList.remove('hidden');
    document.getElementById('dashboardContainer').classList.add('contents');
}

// Fazer logout
function handleLogout() {
    currentUser = null;
    currentAdminPassword = null;
    sessionStorage.removeItem('currentUser');

    // Resetar todo o estado do dashboard
    resetFullDashboardState();

    showLoginScreen();
    showToast('Logout realizado com sucesso!');
}

// Resetar completamente o estado do dashboard (para logout/novo login)
function resetFullDashboardState() {
    // Resetar variáveis globais
    currentAdAccountId = null;
    currentCurrency = 'BRL';
    currentDashboardData = null;
    cachedCampaigns = [];
    cachedAdsets = [];
    currentDatePreset = 'last_7d';
    currentDateRange = null;
    currentPanel = 'visao-geral';
    overviewDataCache = null;

    // Resetar filtros visuais
    const clientFilter = document.getElementById('clientFilter');
    if (clientFilter) clientFilter.value = '';

    resetCampaignFilter();
    resetAdsetFilter();

    // Resetar label do período
    const dateFilterLabel = document.getElementById('dateFilterLabel');
    const dateFilterLabelMobile = document.getElementById('dateFilterLabelMobile');
    if (dateFilterLabel) dateFilterLabel.textContent = 'Ultimos 7 dias';
    if (dateFilterLabelMobile) dateFilterLabelMobile.textContent = '7 dias';

    // Resetar nome do cliente selecionado
    const selectedClientName = document.getElementById('selectedClientName');
    if (selectedClientName) selectedClientName.textContent = 'Selecione um cliente';

    // Resetar valores do dashboard
    resetDashboard();
}

// ==========================================
// CONSTANTES
// ==========================================

// Senha padrão
const ADMIN_PASSWORD = '123456789';

// Chave do LocalStorage
const STORAGE_KEY = 'dashboard_clients';

// Período selecionado atualmente
let currentDatePreset = 'last_7d';
let currentDateRange = null; // { start: 'YYYY-MM-DD', end: 'YYYY-MM-DD' }

// ==========================================
// FUNÇÕES DO FILTRO DE PERÍODO
// ==========================================

function openDateFilterModal() {
    const modal = document.getElementById('dateFilterModal');
    modal.classList.remove('hidden');
    modal.classList.add('flex');

    // Marcar o período atual como ativo
    updateActiveDatePreset();

    // Preencher datas do período personalizado com valores atuais
    const today = new Date();
    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setDate(today.getDate() - 30);

    document.getElementById('customDateEnd').value = formatDateForInput(today);
    document.getElementById('customDateStart').value = formatDateForInput(thirtyDaysAgo);
}

function closeDateFilterModal() {
    const modal = document.getElementById('dateFilterModal');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
}

function updateActiveDatePreset() {
    // Remover classe active de todos os botões
    document.querySelectorAll('.date-preset-btn').forEach(btn => {
        btn.classList.remove('active', 'border-primary', 'text-white');
        btn.classList.add('border-border-dark', 'text-slate-300');
    });

    // Encontrar e marcar o botão ativo (se não for período personalizado)
    if (!currentDateRange) {
        const presetMap = {
            'today': 'Hoje',
            'yesterday': 'Ontem',
            'last_7d': 'Ultimos 7 dias',
            'last_14d': 'Ultimos 14 dias',
            'last_28d': 'Ultimos 28 dias',
            'last_30d': 'Ultimos 30 dias',
            'this_week': 'Esta semana',
            'last_week': 'Semana passada',
            'this_month': 'Este mes',
            'last_month': 'Mes passado',
            'maximum': 'Maximo'
        };

        document.querySelectorAll('.date-preset-btn').forEach(btn => {
            if (btn.textContent.trim().includes(presetMap[currentDatePreset]?.split(' ')[0])) {
                btn.classList.add('active', 'border-primary', 'text-white');
                btn.classList.remove('border-border-dark', 'text-slate-300');
            }
        });
    }
}

function selectDatePreset(preset, label) {
    currentDatePreset = preset;
    currentDateRange = null;

    // Atualizar labels no header
    document.getElementById('dateFilterLabel').textContent = label;
    document.getElementById('dateFilterLabelMobile').textContent = getShortLabel(preset);
    const overviewLabel = document.getElementById('overviewDateLabel');
    if (overviewLabel) overviewLabel.textContent = label;

    // Fechar modal
    closeDateFilterModal();

    // Recarregar dados conforme painel ativo
    if (currentPanel === 'visao-geral') {
        loadOverviewData();
    } else {
        reloadDataWithCurrentFilter();
    }
}

function applyCustomDateRange() {
    const startDate = document.getElementById('customDateStart').value;
    const endDate = document.getElementById('customDateEnd').value;

    if (!startDate || !endDate) {
        showToast('Selecione as datas de inicio e fim');
        return;
    }

    if (new Date(startDate) > new Date(endDate)) {
        showToast('A data de inicio deve ser anterior a data de fim');
        return;
    }

    currentDateRange = { start: startDate, end: endDate };
    currentDatePreset = 'custom';

    // Formatar label
    const startFormatted = formatDateForDisplay(startDate);
    const endFormatted = formatDateForDisplay(endDate);
    const label = `${startFormatted} - ${endFormatted}`;

    // Atualizar labels no header
    document.getElementById('dateFilterLabel').textContent = label;
    document.getElementById('dateFilterLabelMobile').textContent = 'Personalizado';
    const overviewLabel = document.getElementById('overviewDateLabel');
    if (overviewLabel) overviewLabel.textContent = label;

    // Fechar modal
    closeDateFilterModal();

    // Recarregar dados conforme painel ativo
    if (currentPanel === 'visao-geral') {
        loadOverviewData();
    } else {
        reloadDataWithCurrentFilter();
    }
}

function getShortLabel(preset) {
    const shortLabels = {
        'today': 'Hoje',
        'yesterday': 'Ontem',
        'last_7d': '7 dias',
        'last_14d': '14 dias',
        'last_28d': '28 dias',
        'last_30d': '30 dias',
        'this_week': 'Semana',
        'last_week': 'Sem. passada',
        'this_month': 'Mes',
        'last_month': 'Mes passado',
        'maximum': 'Maximo',
        'custom': 'Personalizado'
    };
    return shortLabels[preset] || preset;
}

function formatDateForInput(date) {
    return date.toISOString().split('T')[0];
}

function formatDateForDisplay(dateStr) {
    const date = new Date(dateStr + 'T00:00:00');
    return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}

// Calcular intervalo de datas explícito para cada período
function getDateRangeForAPI() {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);

    let startDate, endDate;

    switch (currentDatePreset) {
        case 'today':
            // Apenas hoje
            startDate = today;
            endDate = today;
            break;

        case 'yesterday':
            // Apenas ontem
            startDate = yesterday;
            endDate = yesterday;
            break;

        case 'last_7d':
            // Últimos 7 dias (não inclui hoje): ontem até 7 dias atrás
            endDate = yesterday;
            startDate = new Date(yesterday);
            startDate.setDate(yesterday.getDate() - 6);
            break;

        case 'last_14d':
            // Últimos 14 dias (não inclui hoje)
            endDate = yesterday;
            startDate = new Date(yesterday);
            startDate.setDate(yesterday.getDate() - 13);
            break;

        case 'last_28d':
            // Últimos 28 dias (não inclui hoje)
            endDate = yesterday;
            startDate = new Date(yesterday);
            startDate.setDate(yesterday.getDate() - 27);
            break;

        case 'last_30d':
            // Últimos 30 dias (não inclui hoje)
            endDate = yesterday;
            startDate = new Date(yesterday);
            startDate.setDate(yesterday.getDate() - 29);
            break;

        case 'this_week':
            // Esta semana: domingo até ontem (ou hoje se quiser incluir)
            endDate = yesterday;
            startDate = new Date(yesterday);
            const dayOfWeek = startDate.getDay(); // 0 = domingo
            startDate.setDate(startDate.getDate() - dayOfWeek);
            break;

        case 'last_week':
            // Semana passada: domingo a sábado
            const lastSaturday = new Date(today);
            lastSaturday.setDate(today.getDate() - today.getDay() - 1);
            endDate = lastSaturday;
            startDate = new Date(lastSaturday);
            startDate.setDate(lastSaturday.getDate() - 6);
            break;

        case 'this_month':
            // Este mês: dia 1 até ontem
            endDate = yesterday;
            startDate = new Date(yesterday.getFullYear(), yesterday.getMonth(), 1);
            break;

        case 'last_month':
            // Mês passado completo
            const lastDayPrevMonth = new Date(today.getFullYear(), today.getMonth(), 0);
            endDate = lastDayPrevMonth;
            startDate = new Date(lastDayPrevMonth.getFullYear(), lastDayPrevMonth.getMonth(), 1);
            break;

        case 'maximum':
            // Máximo: usar preset da API
            return { usePreset: true, preset: 'maximum' };

        default:
            // Padrão: últimos 30 dias
            endDate = yesterday;
            startDate = new Date(yesterday);
            startDate.setDate(yesterday.getDate() - 29);
    }

    return {
        usePreset: false,
        since: formatDateForAPI(startDate),
        until: formatDateForAPI(endDate)
    };
}

// Formatar data para API (YYYY-MM-DD)
function formatDateForAPI(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// Recarregar quando o PERÍODO muda (reseta filtros de campanha/conjunto)
async function reloadDataWithCurrentFilter() {
    if (!currentAdAccountId) return;

    // Recarregar campanhas com o novo período (resetar filtros)
    resetCampaignFilter();
    resetAdsetFilter();

    // Limpar cache de análise (período mudou)
    campaignsDataCache = [];

    // Carregar campanhas que tiveram veiculação no período selecionado
    await loadCampaigns(currentAdAccountId);

    // Buscar dados gerais (sem filtro de campanha/conjunto)
    fetchClientData(currentAdAccountId, null, null);

    // Se uma aba de análise está ativa, recarregar
    if (analysisTab) {
        switchAnalysisTab(analysisTab);
    }
}

// Aplicar filtros de campanha/conjunto selecionados (sem resetar)
function applyCurrentFilters() {
    if (!currentAdAccountId) return;

    const campaignId = document.getElementById('campaignFilter').value || null;
    const adsetId = document.getElementById('adsetFilter').value || null;

    fetchClientData(currentAdAccountId, campaignId, adsetId);
}

// Cores disponíveis para os ícones
const ICON_COLORS = ['blue', 'purple', 'orange', 'green', 'pink', 'cyan', 'red', 'yellow', 'indigo', 'teal'];

// Dados atuais do dashboard
let currentDashboardData = null;

// ==========================================
// FUNÇÕES DE API DE CLIENTES
// ==========================================

// Cache local dos clientes
let clientsCache = [];

// Obter faixas de CPL do cliente atualmente selecionado
function getCurrentClientCplTargets() {
    const clientId = document.getElementById('clientFilter')?.value;
    if (!clientId) return null;
    const client = clientsCache.find(c => c.id === clientId);
    return client?.cplTargets || null;
}

// Classificar CPL com base nas faixas do cliente
function classifyCpl(cplValue, cplTargets) {
    if (!cplTargets || cplValue <= 0) return null;
    if (cplValue <= cplTargets.excellent) return { label: 'Excelente', color: 'emerald', icon: 'trending_down' };
    if (cplValue <= cplTargets.healthy) return { label: 'Saudavel', color: 'blue', icon: 'check_circle' };
    if (cplValue <= cplTargets.warning) return { label: 'Atencao', color: 'amber', icon: 'warning' };
    return { label: 'Critico', color: 'red', icon: 'error' };
}

// Carregar clientes da API
async function loadClients() {
    try {
        const baseUrl = window.location.hostname === 'localhost' ? 'http://localhost:8888' : '';
        const response = await fetch(`${baseUrl}/.netlify/functions/clients`);
        const result = await response.json();

        if (result.success) {
            clientsCache = result.clients || [];
            return clientsCache;
        }
        return [];
    } catch (error) {
        console.error('Erro ao carregar clientes:', error);
        return clientsCache; // Retorna cache em caso de erro
    }
}

// Adicionar cliente via API (requer senha admin)
async function addClientAPI(clientData, adminPassword) {
    try {
        const baseUrl = window.location.hostname === 'localhost' ? 'http://localhost:8888' : '';
        const response = await fetch(`${baseUrl}/.netlify/functions/clients`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                password: adminPassword,
                client: clientData
            })
        });

        const result = await response.json();
        return result;
    } catch (error) {
        console.error('Erro ao adicionar cliente:', error);
        return { error: true, message: error.message };
    }
}

// Atualizar cliente via API (requer senha admin)
async function updateClientAPI(clientId, updates, adminPassword) {
    try {
        const baseUrl = window.location.hostname === 'localhost' ? 'http://localhost:8888' : '';
        const response = await fetch(`${baseUrl}/.netlify/functions/clients`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                password: adminPassword,
                clientId: clientId,
                updates: updates
            })
        });

        const result = await response.json();
        return result;
    } catch (error) {
        console.error('Erro ao atualizar cliente:', error);
        return { error: true, message: error.message };
    }
}

// Remover cliente via API (requer senha admin)
async function removeClientAPI(clientId, adminPassword) {
    try {
        const baseUrl = window.location.hostname === 'localhost' ? 'http://localhost:8888' : '';
        const response = await fetch(`${baseUrl}/.netlify/functions/clients`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                password: adminPassword,
                clientId: clientId
            })
        });

        const result = await response.json();
        return result;
    } catch (error) {
        console.error('Erro ao remover cliente:', error);
        return { error: true, message: error.message };
    }
}

// ==========================================
// FUNÇÕES DO MODAL DE SENHA
// ==========================================

function openPasswordModal() {
    // Se o usuário é admin, vai direto para o modal de clientes
    if (isCurrentUserAdmin()) {
        currentAdminPassword = ADMIN_PASSWORD;

        // Fechar sidebar no mobile
        if (window.innerWidth < 1024) {
            toggleSidebar();
        }

        openClientsModal();
        return;
    }

    // Se não é admin, pede senha
    const modal = document.getElementById('passwordModal');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    document.getElementById('passwordInput').focus();
    document.getElementById('passwordError').classList.add('hidden');
    document.getElementById('passwordInput').value = '';

    // Fechar sidebar no mobile ao abrir modal
    if (window.innerWidth < 1024) {
        toggleSidebar();
    }
}

function closePasswordModal() {
    const modal = document.getElementById('passwordModal');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    document.getElementById('passwordInput').value = '';
    document.getElementById('passwordError').classList.add('hidden');
}

function togglePasswordVisibility() {
    const input = document.getElementById('passwordInput');
    const icon = document.getElementById('passwordToggleIcon');

    if (input.type === 'password') {
        input.type = 'text';
        icon.textContent = 'visibility_off';
    } else {
        input.type = 'password';
        icon.textContent = 'visibility';
    }
}

function validatePassword(event) {
    event.preventDefault();
    const password = document.getElementById('passwordInput').value;
    const input = document.getElementById('passwordInput');

    // Verificar se é admin OU senha correta
    if (password === ADMIN_PASSWORD || isCurrentUserAdmin()) {
        // Armazenar senha para operações admin
        currentAdminPassword = ADMIN_PASSWORD;
        closePasswordModal();
        openClientsModal();
    } else {
        document.getElementById('passwordError').classList.remove('hidden');
        input.classList.add('border-red-500', 'shake');
        input.select();

        setTimeout(() => {
            input.classList.remove('border-red-500', 'shake');
        }, 2000);
    }
}

// ==========================================
// FUNÇÕES DO MODAL DE CLIENTES
// ==========================================

async function openClientsModal() {
    const modal = document.getElementById('clientsModal');
    modal.classList.remove('hidden');
    modal.classList.add('flex');

    // Renderizar lista de clientes ao abrir o modal
    await renderClientsList();
}

function closeClientsModal() {
    const modal = document.getElementById('clientsModal');
    modal.classList.add('hidden');
    modal.classList.remove('flex');

    // Resetar estado de edição ao fechar
    if (editingClientId) {
        editingClientId = null;
        document.getElementById('clientName').value = '';
        document.getElementById('adAccountId').value = '';
        document.getElementById('cplExcellent').value = '';
        document.getElementById('cplHealthy').value = '';
        document.getElementById('cplWarning').value = '';
        document.getElementById('cplBandsSection').classList.add('hidden');
        document.getElementById('cplBandsArrow').style.transform = '';
        document.getElementById('googleChatWebhook').value = '';
        updateFormMode();
        document.querySelectorAll('.client-card').forEach(c => c.classList.remove('ring-2', 'ring-primary/50'));
    }
}

// Renderizar lista de clientes a partir da API
async function renderClientsList() {
    const clientsList = document.getElementById('clientsList');
    const noClientsMessage = document.getElementById('noClientsMessage');

    // Limpar lista atual (exceto a mensagem de "nenhum cliente")
    const existingCards = clientsList.querySelectorAll('.client-card');
    existingCards.forEach(card => card.remove());

    // Mostrar loading
    noClientsMessage.innerHTML = `
        <div class="flex items-center justify-center py-8">
            <div class="w-8 h-8 border-2 border-primary/20 border-t-primary rounded-full animate-spin"></div>
        </div>
    `;
    noClientsMessage.classList.remove('hidden');

    const clients = await loadClients();

    // Restaurar mensagem padrão
    noClientsMessage.innerHTML = `
        <div class="w-16 h-16 bg-surface-dark rounded-full flex items-center justify-center mx-auto mb-4">
            <span class="material-symbols-outlined text-slate-600 text-3xl">person_off</span>
        </div>
        <p class="text-slate-500 text-sm">Nenhum cliente cadastrado</p>
        <p class="text-slate-600 text-xs mt-1">Adicione seu primeiro cliente acima</p>
    `;

    if (clients.length === 0) {
        noClientsMessage.classList.remove('hidden');
        return;
    }

    noClientsMessage.classList.add('hidden');

    // Renderizar cada cliente
    clients.forEach(client => {
        const clientHTML = createClientHTML(client);
        noClientsMessage.insertAdjacentHTML('beforebegin', clientHTML);
    });
}

// Toggle seção de faixas de CPL
function toggleCplBands() {
    const section = document.getElementById('cplBandsSection');
    const arrow = document.getElementById('cplBandsArrow');
    section.classList.toggle('hidden');
    arrow.style.transform = section.classList.contains('hidden') ? '' : 'rotate(180deg)';
}

// Atualizar preview visual das faixas de CPL
function updateCplPreview() {
    const excellent = parseFloat(document.getElementById('cplExcellent').value);
    const healthy = parseFloat(document.getElementById('cplHealthy').value);
    const warning = parseFloat(document.getElementById('cplWarning').value);
    const preview = document.getElementById('cplPreview');

    if (!isNaN(excellent) && !isNaN(healthy) && !isNaN(warning) && excellent > 0) {
        preview.classList.remove('hidden');
        var sym = currentCurrency === 'BRL' ? 'R$' : '$';
        document.getElementById('cplPreviewExcellent').textContent = `${sym}${excellent}`;
        document.getElementById('cplPreviewHealthy').textContent = `${sym}${healthy}`;
        document.getElementById('cplPreviewWarning').textContent = `${sym}${warning}`;
    } else {
        preview.classList.add('hidden');
    }
}

// Attach listeners ao carregar modal
document.addEventListener('DOMContentLoaded', () => {
    ['cplExcellent', 'cplHealthy', 'cplWarning'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('input', updateCplPreview);
    });
});

// Criar HTML de um cliente
function createClientHTML(client) {
    const cplBadge = client.cplTargets
        ? `<span class="inline-flex items-center gap-1 text-[10px] text-emerald-400/70 bg-emerald-400/5 px-1.5 py-0.5 rounded ml-1">
            <span class="w-1 h-1 bg-emerald-400 rounded-full"></span>CPL
           </span>`
        : '';
    const whatsappBadge = client.whatsappNumber
        ? `<span class="inline-flex items-center gap-1 text-[10px] text-green-400/70 bg-green-400/5 px-1.5 py-0.5 rounded ml-1" title="${client.whatsappNumber}">
            <span class="material-symbols-outlined" style="font-size:10px">chat</span>WhatsApp
           </span>`
        : '';
    const webhookBadge = client.googleChatWebhook
        ? `<span class="inline-flex items-center gap-1 text-[10px] text-primary/70 bg-primary/5 px-1.5 py-0.5 rounded ml-1">
            <span class="material-symbols-outlined" style="font-size:10px">forum</span>Chat
           </span>`
        : '';
    return `
        <div class="client-card bg-background-dark border border-border-dark rounded-xl p-4 flex items-center justify-between gap-4 group hover:border-slate-600 transition-colors" data-id="${client.id}">
            <div class="flex items-center gap-3 min-w-0">
                <div class="w-10 h-10 bg-${client.color}-500/10 rounded-lg flex items-center justify-center text-${client.color}-500 shrink-0">
                    <span class="material-symbols-outlined">store</span>
                </div>
                <div class="min-w-0">
                    <p class="text-sm font-medium text-white truncate">${client.name}${cplBadge}${whatsappBadge}${webhookBadge}</p>
                    <p class="text-xs text-slate-500 truncate font-mono">${client.adAccountId}</p>
                </div>
            </div>
            <div class="flex items-center gap-2 shrink-0">
                <button onclick="editClient('${client.id}')" class="p-2 text-slate-500 hover:text-primary hover:bg-primary/10 rounded-lg transition-colors" title="Editar">
                    <span class="material-symbols-outlined text-lg">edit</span>
                </button>
                <button onclick="removeClient('${client.id}')" class="p-2 text-slate-500 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors" title="Remover">
                    <span class="material-symbols-outlined text-lg">delete</span>
                </button>
            </div>
        </div>
    `;
}

// Senha admin da sessão atual (armazenada após login no modal de ajustes)
let currentAdminPassword = null;

// Estado de edição de cliente
let editingClientId = null;

// Adicionar ou atualizar cliente
async function addClient(event) {
    event.preventDefault();

    if (!currentAdminPassword) {
        showToast('Erro: Sessão expirada. Faça login novamente.');
        return;
    }

    const clientName = document.getElementById('clientName').value.trim();
    const adAccountId = document.getElementById('adAccountId').value.trim();

    if (!clientName || !adAccountId) return;

    // Coletar faixas de CPL (opcionais)
    const cplExcellent = parseFloat(document.getElementById('cplExcellent').value);
    const cplHealthy = parseFloat(document.getElementById('cplHealthy').value);
    const cplWarning = parseFloat(document.getElementById('cplWarning').value);

    let cplTargets = null;
    if (!isNaN(cplExcellent) && !isNaN(cplHealthy) && !isNaN(cplWarning)) {
        if (cplExcellent >= cplHealthy || cplHealthy >= cplWarning) {
            showToast('Erro: As faixas de CPL devem ser em ordem crescente (Excelente < Saudável < Atenção).');
            return;
        }
        cplTargets = { excellent: cplExcellent, healthy: cplHealthy, warning: cplWarning };
    }

    // Mostrar loading no botão
    const submitBtn = document.getElementById('formSubmitBtn');
    const originalText = submitBtn.innerHTML;
    submitBtn.innerHTML = '<span class="material-symbols-outlined animate-spin">progress_activity</span> Salvando...';
    submitBtn.disabled = true;

    let result;

    // Coletar campos opcionais
    const whatsappNumber = document.getElementById('clientWhatsapp').value.trim() || null;
    const googleChatWebhook = document.getElementById('googleChatWebhook').value.trim() || null;

    if (editingClientId) {
        // Modo edição: atualizar cliente existente
        const updates = { name: clientName, adAccountId: adAccountId, cplTargets: cplTargets, whatsappNumber: whatsappNumber, googleChatWebhook: googleChatWebhook };
        result = await updateClientAPI(editingClientId, updates, currentAdminPassword);
    } else {
        // Modo criação: adicionar novo cliente
        const clientData = { name: clientName, adAccountId: adAccountId };
        if (cplTargets) clientData.cplTargets = cplTargets;
        if (whatsappNumber) clientData.whatsappNumber = whatsappNumber;
        if (googleChatWebhook) clientData.googleChatWebhook = googleChatWebhook;
        result = await addClientAPI(clientData, currentAdminPassword);
    }

    // Restaurar botão
    submitBtn.innerHTML = originalText;
    submitBtn.disabled = false;

    if (result.success) {
        const wasEditing = !!editingClientId;

        // Resetar estado de edição
        editingClientId = null;
        updateFormMode();

        // Re-renderizar a lista e atualizar filtro
        await renderClientsList();
        await populateClientFilter();

        // Limpar formulário
        document.getElementById('clientName').value = '';
        document.getElementById('adAccountId').value = '';
        document.getElementById('cplExcellent').value = '';
        document.getElementById('cplHealthy').value = '';
        document.getElementById('cplWarning').value = '';
        document.getElementById('cplBandsSection').classList.add('hidden');
        document.getElementById('cplBandsArrow').style.transform = '';
        document.getElementById('cplPreview').classList.add('hidden');
        document.getElementById('clientWhatsapp').value = '';
        document.getElementById('googleChatWebhook').value = '';

        showToast(wasEditing ? 'Cliente atualizado com sucesso!' : 'Cliente adicionado com sucesso!');
    } else {
        showToast('Erro: ' + (result.message || result.error));
    }
}

// Remover cliente
async function removeClient(clientId) {
    if (!confirm('Tem certeza que deseja remover este cliente?')) return;

    if (!currentAdminPassword) {
        showToast('Erro: Sessão expirada. Faça login novamente.');
        return;
    }

    const result = await removeClientAPI(clientId, currentAdminPassword);

    if (result.success) {
        await renderClientsList();
        await populateClientFilter();
        showToast('Cliente removido com sucesso!');
    } else {
        showToast('Erro: ' + (result.message || result.error));
    }
}

// Editar cliente (remove e preenche formulário)
async function editClient(clientId) {
    const clients = await loadClients();
    const client = clients.find(c => c.id === clientId);

    if (!client) return;

    // Entrar em modo de edição
    editingClientId = clientId;

    // Preencher formulário com dados do cliente
    document.getElementById('clientName').value = client.name;
    document.getElementById('adAccountId').value = client.adAccountId;

    // Preencher faixas de CPL se existirem
    if (client.cplTargets) {
        document.getElementById('cplExcellent').value = client.cplTargets.excellent || '';
        document.getElementById('cplHealthy').value = client.cplTargets.healthy || '';
        document.getElementById('cplWarning').value = client.cplTargets.warning || '';
        document.getElementById('cplBandsSection').classList.remove('hidden');
        document.getElementById('cplBandsArrow').style.transform = 'rotate(180deg)';
    } else {
        document.getElementById('cplExcellent').value = '';
        document.getElementById('cplHealthy').value = '';
        document.getElementById('cplWarning').value = '';
    }

    // Preencher WhatsApp
    document.getElementById('clientWhatsapp').value = client.whatsappNumber || '';

    // Preencher webhook
    document.getElementById('googleChatWebhook').value = client.googleChatWebhook || '';

    updateCplPreview();
    updateFormMode();

    // Scroll e foco no formulário
    document.getElementById('clientName').scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => document.getElementById('clientName').focus(), 300);

    // Highlight no card sendo editado
    document.querySelectorAll('.client-card').forEach(c => c.classList.remove('ring-2', 'ring-primary/50'));
    const card = document.querySelector(`.client-card[data-id="${clientId}"]`);
    if (card) card.classList.add('ring-2', 'ring-primary/50');
}

function cancelEditClient() {
    editingClientId = null;

    // Limpar formulário
    document.getElementById('clientName').value = '';
    document.getElementById('adAccountId').value = '';
    document.getElementById('cplExcellent').value = '';
    document.getElementById('cplHealthy').value = '';
    document.getElementById('cplWarning').value = '';
    document.getElementById('cplBandsSection').classList.add('hidden');
    document.getElementById('cplBandsArrow').style.transform = '';
    document.getElementById('cplPreview').classList.add('hidden');
    document.getElementById('clientWhatsapp').value = '';
    document.getElementById('googleChatWebhook').value = '';

    updateFormMode();

    // Remover highlight dos cards
    document.querySelectorAll('.client-card').forEach(c => c.classList.remove('ring-2', 'ring-primary/50'));
}

function updateFormMode() {
    const titleEl = document.getElementById('formTitle');
    const titleIcon = document.getElementById('formTitleIcon');
    const submitBtn = document.getElementById('formSubmitBtn');
    const cancelBtn = document.getElementById('formCancelBtn');

    if (editingClientId) {
        titleEl.textContent = 'Editar Cliente';
        titleIcon.textContent = 'edit';
        submitBtn.innerHTML = '<span class="material-symbols-outlined text-lg">save</span> Salvar Alteracoes';
        cancelBtn.classList.remove('hidden');
    } else {
        titleEl.textContent = 'Adicionar Novo Cliente';
        titleIcon.textContent = 'add_circle';
        submitBtn.innerHTML = '<span class="material-symbols-outlined text-lg">add</span> Adicionar Cliente';
        cancelBtn.classList.add('hidden');
    }
}

// Mostrar mensagem de feedback (toast)
function showToast(message, type) {
    // Remover toast existente se houver
    const existingToast = document.getElementById('toast');
    if (existingToast) existingToast.remove();

    const icons = { success: 'check_circle', error: 'error', info: 'info' };
    const colors = { success: 'text-emerald-400', error: 'text-red-400', info: 'text-blue-400' };
    const icon = icons[type] || 'check_circle';
    const color = colors[type] || 'text-primary';

    // Criar toast
    const toast = document.createElement('div');
    toast.id = 'toast';
    toast.className = 'fixed bottom-4 right-4 bg-surface-dark border border-border-dark text-white px-4 py-3 rounded-lg shadow-2xl z-50 flex items-center gap-2 animate-slide-up';
    toast.innerHTML = `
        <span class="material-symbols-outlined ${color}">${icon}</span>
        <span class="text-sm">${message}</span>
    `;

    document.body.appendChild(toast);

    // Remover após 3 segundos
    setTimeout(() => {
        toast.classList.add('animate-fade-out');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// ==========================================
// FUNÇÕES DOS FILTROS HIERÁRQUICOS
// ==========================================

// Dados dos filtros em cache
let cachedCampaigns = [];
let cachedAdsets = [];
let currentAdAccountId = null;
let currentCurrency = 'BRL';
let lastMetricsSummary = null;

// Popular o select de clientes no header
async function populateClientFilter() {
    const select = document.getElementById('clientFilter');
    const selectMobile = document.getElementById('clientFilterMobile');
    const currentValue = select.value;

    select.innerHTML = '<option value="">Carregando...</option>';
    if (selectMobile) selectMobile.innerHTML = '<option value="">Carregando...</option>';

    const clients = await loadClients();

    select.innerHTML = '<option value="">Selecione um Cliente</option>';
    if (selectMobile) selectMobile.innerHTML = '<option value="">Cliente</option>';

    clients.forEach(client => {
        const option = document.createElement('option');
        option.value = client.id;
        option.textContent = client.name;
        option.dataset.adAccountId = client.adAccountId;
        select.appendChild(option);

        if (selectMobile) selectMobile.appendChild(option.cloneNode(true));
    });

    if (currentValue && clients.some(c => c.id === currentValue)) {
        select.value = currentValue;
        if (selectMobile) selectMobile.value = currentValue;
    }

    updateSelectedClientName();
}

// Atualizar o nome do cliente selecionado no header
function updateSelectedClientName() {
    const select = document.getElementById('clientFilter');
    const nameElement = document.getElementById('selectedClientName');
    const selectedOption = select.options[select.selectedIndex];

    if (select.value && selectedOption) {
        nameElement.textContent = selectedOption.textContent;
    } else {
        nameElement.textContent = 'Selecione um cliente';
    }
}

// Callback quando o filtro de cliente muda
async function onClientFilterChange() {
    updateSelectedClientName();
    updateSendReportButton();
    updateAdsManagerLink();

    const select = document.getElementById('clientFilter');
    const clientMobile = document.getElementById('clientFilterMobile');
    if (clientMobile && clientMobile.value !== select.value) clientMobile.value = select.value;
    const selectedOption = select.options[select.selectedIndex];

    // Resetar filtros dependentes
    resetCampaignFilter();
    resetAdsetFilter();

    if (select.value && selectedOption) {
        const adAccountId = selectedOption.dataset.adAccountId;
        currentAdAccountId = adAccountId;

        // Carregar campanhas do cliente
        await loadCampaigns(adAccountId);

        // Buscar dados do cliente
        fetchClientData(adAccountId);
    } else {
        currentAdAccountId = null;
        resetDashboard();
    }
}

// Atualizar link do Gerenciador de Anuncios (gerado automaticamente pelo adAccountId)
function updateAdsManagerLink() {
    const link = document.getElementById('adsManagerLink');
    const banner = document.getElementById('platformBanner');
    if (!link || !banner) return;
    const select = document.getElementById('clientFilter');
    if (!select.value) { banner.classList.add('hidden'); banner.classList.remove('flex'); return; }
    const client = clientsCache.find(c => c.id === select.value);
    const btnUploadCreative = document.getElementById('btnUploadCreative');
    if (client && client.adAccountId) {
        const actId = client.adAccountId.replace(/^act_/, '');
        link.href = 'https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=' + actId;
        banner.classList.remove('hidden');
        banner.classList.add('flex');
        // Mostrar botão Nova Campanha para admins
        if (btnUploadCreative && isCurrentUserAdmin()) {
            btnUploadCreative.classList.remove('hidden');
            btnUploadCreative.classList.add('flex');
        }
        updateWhatsAppButton();
    } else {
        banner.classList.add('hidden');
        banner.classList.remove('flex');
        if (btnUploadCreative) {
            btnUploadCreative.classList.add('hidden');
            btnUploadCreative.classList.remove('flex');
        }
        updateWhatsAppButton();
    }
}

function updateSendReportButton() {
    const btn = document.getElementById('sendReportBtn');
    if (!btn) return;
    const select = document.getElementById('clientFilter');
    if (!select.value) { btn.classList.add('hidden'); return; }
    const client = clientsCache.find(c => c.id === select.value);
    if (client && client.googleChatWebhook) {
        btn.classList.remove('hidden');
    } else {
        btn.classList.add('hidden');
    }
}

async function sendManualReport() {
    const select = document.getElementById('clientFilter');
    if (!select.value) return;

    const client = clientsCache.find(c => c.id === select.value);
    if (!client || !client.googleChatWebhook) {
        showToast('Cliente nao possui webhook configurado', 'error');
        return;
    }

    // Determinar periodo ativo
    let period = 'last_7d';
    if (currentDateRange) {
        const start = new Date(currentDateRange.start);
        const end = new Date(currentDateRange.end);
        const diffDays = Math.round((end - start) / (1000 * 60 * 60 * 24)) + 1;
        if (diffDays <= 1) period = 'yesterday';
        else if (diffDays <= 7) period = 'last_7d';
        else if (diffDays <= 14) period = 'last_14d';
        else period = 'last_30d';
    }

    showToast('Enviando relatorio...', 'info');

    try {
        const baseUrl = window.location.hostname === 'localhost' ? 'http://localhost:8888' : '';
        const resp = await fetch(`${baseUrl}/.netlify/functions/send-report?clientId=${client.id}&period=${period}`);
        const data = await resp.json();
        if (data.success) {
            showToast('Relatorio enviado para o Google Chat!', 'success');
        } else {
            showToast(data.error || 'Erro ao enviar', 'error');
        }
    } catch (err) {
        showToast('Erro ao enviar: ' + err.message, 'error');
    }
}

// Carregar campanhas do cliente (apenas as que tiveram veiculação no período)
async function loadCampaigns(adAccountId) {
    const select = document.getElementById('campaignFilter');
    select.disabled = true;
    select.innerHTML = '<option value="">Carregando...</option>';

    try {
        const baseUrl = window.location.hostname === 'localhost' ? 'http://localhost:8888' : '';

        // Montar URL com período
        let url = `${baseUrl}/.netlify/functions/meta-ads?adAccountId=${adAccountId}&action=campaigns`;

        // Adicionar período para filtrar apenas campanhas com veiculação
        if (currentDateRange) {
            const timeRange = JSON.stringify({
                since: currentDateRange.start,
                until: currentDateRange.end
            });
            url += `&timeRange=${encodeURIComponent(timeRange)}`;
        } else {
            const dateRange = getDateRangeForAPI();
            if (dateRange.usePreset) {
                url += `&datePreset=${dateRange.preset}`;
            } else {
                const timeRange = JSON.stringify({
                    since: dateRange.since,
                    until: dateRange.until
                });
                url += `&timeRange=${encodeURIComponent(timeRange)}`;
            }
        }

        const response = await fetch(url);
        const result = await response.json();

        if (result.success && result.campaigns) {
            cachedCampaigns = result.campaigns;
            populateCampaignFilter(result.campaigns);
        }
    } catch (error) {
        console.error('Erro ao carregar campanhas:', error);
        select.innerHTML = '<option value="">Erro ao carregar</option>';
    }
}

// Popular filtro de campanhas
function populateCampaignFilter(campaigns) {
    const select = document.getElementById('campaignFilter');
    const selectMobile = document.getElementById('campaignFilterMobile');
    select.innerHTML = '<option value="">Todas as Campanhas</option>';
    if (selectMobile) selectMobile.innerHTML = '<option value="">Campanha</option>';

    campaigns.forEach(campaign => {
        const option = document.createElement('option');
        option.value = campaign.id;
        option.innerHTML = formatOptionWithStatus(campaign.name, campaign.status);
        option.dataset.status = campaign.status;
        select.appendChild(option);

        if (selectMobile) selectMobile.appendChild(option.cloneNode(true));
    });

    select.disabled = false;
    if (selectMobile) selectMobile.disabled = false;
}

// Callback quando o filtro de campanha muda
async function onCampaignFilterChange() {
    const select = document.getElementById('campaignFilter');
    const campMobile = document.getElementById('campaignFilterMobile');
    if (campMobile && campMobile.value !== select.value) campMobile.value = select.value;

    // Resetar filtro de conjuntos
    resetAdsetFilter();

    if (select.value) {
        // Carregar conjuntos da campanha
        await loadAdsets(select.value);
    }

    // Aplicar filtro selecionado
    applyCurrentFilters();

    // Se aba analista está ativa, re-analisar com novo filtro
    if (analysisTab === 'analyst') {
        loadAnalystReport();
    }
}

// Carregar conjuntos de anúncios (apenas os que tiveram veiculação no período)
async function loadAdsets(campaignId) {
    const select = document.getElementById('adsetFilter');
    select.disabled = true;
    select.innerHTML = '<option value="">Carregando...</option>';

    try {
        const baseUrl = window.location.hostname === 'localhost' ? 'http://localhost:8888' : '';

        // Montar URL com período
        let url = `${baseUrl}/.netlify/functions/meta-ads?adAccountId=${currentAdAccountId}&action=adsets&campaignId=${campaignId}`;

        // Adicionar período para filtrar apenas conjuntos com veiculação
        if (currentDateRange) {
            const timeRange = JSON.stringify({
                since: currentDateRange.start,
                until: currentDateRange.end
            });
            url += `&timeRange=${encodeURIComponent(timeRange)}`;
        } else {
            const dateRange = getDateRangeForAPI();
            if (dateRange.usePreset) {
                url += `&datePreset=${dateRange.preset}`;
            } else {
                const timeRange = JSON.stringify({
                    since: dateRange.since,
                    until: dateRange.until
                });
                url += `&timeRange=${encodeURIComponent(timeRange)}`;
            }
        }

        const response = await fetch(url);
        const result = await response.json();

        if (result.success && result.adsets) {
            cachedAdsets = result.adsets;
            populateAdsetFilter(result.adsets);
        }
    } catch (error) {
        console.error('Erro ao carregar conjuntos:', error);
        select.innerHTML = '<option value="">Erro ao carregar</option>';
    }
}

// Popular filtro de conjuntos
function populateAdsetFilter(adsets) {
    const select = document.getElementById('adsetFilter');
    const selectMobile = document.getElementById('adsetFilterMobile');
    select.innerHTML = '<option value="">Todos os Conjuntos</option>';
    if (selectMobile) selectMobile.innerHTML = '<option value="">Conjunto</option>';

    adsets.forEach(adset => {
        const option = document.createElement('option');
        option.value = adset.id;
        option.innerHTML = formatOptionWithStatus(adset.name, adset.status);
        option.dataset.status = adset.status;
        select.appendChild(option);

        if (selectMobile) selectMobile.appendChild(option.cloneNode(true));
    });

    select.disabled = false;
    if (selectMobile) selectMobile.disabled = false;
}

// Callback quando o filtro de conjunto muda
function onAdsetFilterChange() {
    const select = document.getElementById('adsetFilter');
    const adsetMobile = document.getElementById('adsetFilterMobile');
    if (adsetMobile && adsetMobile.value !== select.value) adsetMobile.value = select.value;
    applyCurrentFilters();
}

// Formatar opção com indicador de status
function formatOptionWithStatus(name, status) {
    const statusIndicator = getStatusIndicator(status);
    return `${statusIndicator} ${name}`;
}

// Obter indicador de status
function getStatusIndicator(status) {
    const activeStatuses = ['ACTIVE', 'CAMPAIGN_PAUSED', 'ADSET_PAUSED'];
    const pausedStatuses = ['PAUSED'];

    if (activeStatuses.includes(status)) {
        return '🟢'; // Verde para ativo
    } else if (pausedStatuses.includes(status)) {
        return '🟡'; // Amarelo para pausado
    } else {
        return '⚪'; // Cinza para outros (arquivado, etc)
    }
}

// Resetar filtro de campanhas
function resetCampaignFilter() {
    const select = document.getElementById('campaignFilter');
    const selectMobile = document.getElementById('campaignFilterMobile');
    select.innerHTML = '<option value="">Todas as Campanhas</option>';
    select.disabled = true;
    if (selectMobile) { selectMobile.innerHTML = '<option value="">Campanha</option>'; selectMobile.disabled = true; }
    cachedCampaigns = [];
}

// Resetar filtro de conjuntos
function resetAdsetFilter() {
    const select = document.getElementById('adsetFilter');
    const selectMobile = document.getElementById('adsetFilterMobile');
    select.innerHTML = '<option value="">Todos os Conjuntos</option>';
    select.disabled = true;
    if (selectMobile) { selectMobile.innerHTML = '<option value="">Conjunto</option>'; selectMobile.disabled = true; }
    cachedAdsets = [];
}

// Limpar todos os filtros
function clearAllFilters() {
    document.getElementById('clientFilter').value = '';
    const clientMobile = document.getElementById('clientFilterMobile');
    if (clientMobile) clientMobile.value = '';
    resetCampaignFilter();
    resetAdsetFilter();
    updateSelectedClientName();
    resetDashboard();
    currentAdAccountId = null;
}

// Sincronizar filtros mobile com desktop
function syncMobileFilter(type) {
    const map = {
        client: { mobile: 'clientFilterMobile', desktop: 'clientFilter', callback: onClientFilterChange },
        campaign: { mobile: 'campaignFilterMobile', desktop: 'campaignFilter', callback: onCampaignFilterChange },
        adset: { mobile: 'adsetFilterMobile', desktop: 'adsetFilter', callback: onAdsetFilterChange }
    };
    const cfg = map[type];
    if (!cfg) return;
    const mobileEl = document.getElementById(cfg.mobile);
    const desktopEl = document.getElementById(cfg.desktop);
    if (mobileEl && desktopEl) {
        desktopEl.value = mobileEl.value;
        cfg.callback();
    }
}

// ==========================================
// FUNÇÕES DE ESTADOS DO DASHBOARD
// ==========================================

function showLoadingState() {
    document.getElementById('loadingState').classList.remove('hidden');
    document.getElementById('loadingState').classList.add('flex');
}

function hideLoadingState() {
    document.getElementById('loadingState').classList.add('hidden');
    document.getElementById('loadingState').classList.remove('flex');
}

// Resetar dashboard para valores vazios
function resetDashboard() {
    // Resetar valores dos cards
    document.getElementById('spendValue').textContent = '--';
    document.getElementById('impressionsValue').textContent = '--';
    document.getElementById('leadsValue').textContent = '--';
    document.getElementById('cplValue').textContent = '--';

    // Resetar trends para neutro
    const trendIds = ['spendTrend', 'impressionsTrend', 'leadsTrend', 'cplTrend'];
    trendIds.forEach(id => {
        const el = document.getElementById(id);
        el.className = 'flex items-center gap-1 text-slate-500 bg-slate-500/10 px-1.5 sm:px-2 py-0.5 rounded text-[10px] sm:text-xs font-bold';
        el.innerHTML = `
            <span class="material-symbols-outlined text-[10px] sm:text-xs">remove</span>
            <span>--</span>
        `;
    });

    // Resetar funil
    resetFunnel();

    // Resetar gráfico
    const chartContainer = document.getElementById('chartContainer');
    chartContainer.innerHTML = `
        <div id="chartPlaceholder" class="flex flex-col items-center justify-center h-full text-slate-600">
            <span class="material-symbols-outlined text-5xl sm:text-6xl mb-3 opacity-50">show_chart</span>
            <span class="text-sm">Selecione um cliente para visualizar o gráfico</span>
        </div>
    `;

    // Resetar labels
    document.getElementById('chartLabels').innerHTML = '';

    // Esconder abas e seção de análise
    const tabBar = document.getElementById('analysisTabBar');
    if (tabBar) tabBar.classList.add('hidden');
    const analysisSection = document.getElementById('analysisSection');
    if (analysisSection) analysisSection.classList.add('hidden');
    analysisTab = null;
    creativesCampaignFilter = null;

    // Esconder banner de plataforma
    const platformBanner = document.getElementById('platformBanner');
    if (platformBanner) { platformBanner.classList.add('hidden'); platformBanner.classList.remove('flex'); }

    // Limpar donut
    hideDonutChart();

    // Limpar dados atuais
    currentDashboardData = null;
}

// ==========================================
// FUNÇÕES DE API - NETLIFY FUNCTIONS
// ==========================================

// Buscar dados do cliente via Netlify Function
async function fetchClientData(adAccountId, campaignId = null, adsetId = null) {
    showLoadingState();

    try {
        // URL da função Netlify (funciona tanto local quanto em produção)
        const baseUrl = window.location.hostname === 'localhost'
            ? 'http://localhost:8888'
            : '';

        // Montar URL com parâmetros
        let url = `${baseUrl}/.netlify/functions/meta-ads?adAccountId=${encodeURIComponent(adAccountId)}`;

        // Adicionar filtros hierárquicos
        if (campaignId) url += `&campaignId=${encodeURIComponent(campaignId)}`;
        if (adsetId) url += `&adsetId=${encodeURIComponent(adsetId)}`;

        // Adicionar período (sempre com datas explícitas para maior precisão)
        if (currentDateRange) {
            // Período personalizado
            const timeRange = JSON.stringify({
                since: currentDateRange.start,
                until: currentDateRange.end
            });
            url += `&timeRange=${encodeURIComponent(timeRange)}`;
        } else {
            // Período predefinido - calcular datas explícitas
            const dateRange = getDateRangeForAPI();
            if (dateRange.usePreset) {
                url += `&datePreset=${dateRange.preset}`;
            } else {
                const timeRange = JSON.stringify({
                    since: dateRange.since,
                    until: dateRange.until
                });
                url += `&timeRange=${encodeURIComponent(timeRange)}`;
            }
        }

        const response = await fetch(url);

        const result = await response.json();

        if (!response.ok || result.error) {
            throw new Error(result.message || 'Erro ao buscar dados');
        }

        console.log('Dados recebidos:', result);

        // Armazenar currency e dados
        currentCurrency = result.currency || 'BRL';
        currentDashboardData = result.data;

        // Atualizar símbolos de moeda na UI
        var currSymbol = currentCurrency === 'BRL' ? 'R$' : '$';
        document.querySelectorAll('.cpl-currency-symbol').forEach(function(el) { el.textContent = currSymbol; });

        // Atualizar dashboard
        updateDashboard(result.data);

        // Esconder loading
        hideLoadingState();

        showToast('Dados carregados com sucesso!');

    } catch (error) {
        console.error('Erro ao buscar dados:', error);
        hideLoadingState();
        resetDashboard();
        showToast(`Erro: ${error.message}`);
    }
}

// Atualizar dashboard com os dados
function updateDashboard(data) {
    if (!data || !data.summary) return;

    const { summary, trends, daily, campaigns } = data;
    lastMetricsSummary = summary;

    // Atualizar cards
    updateMetricCard('spend', summary.spend, trends.spend, formatCurrency);
    updateMetricCard('impressions', summary.impressions, trends.impressions, formatNumber);
    updateMetricCard('leads', summary.leads, trends.leads, formatNumber);
    updateMetricCard('cpl', summary.cpl, trends.cpl, formatCurrency, true); // CPL: menor é melhor

    // Atualizar funil de conversão
    updateFunnel(summary);

    // Badge de classificação CPL no card de métricas
    const cplBadgeEl = document.getElementById('cplClassBadge');
    const cplTargets = getCurrentClientCplTargets();
    if (cplBadgeEl) {
        if (cplTargets && summary.cpl > 0) {
            const cls = classifyCpl(summary.cpl, cplTargets);
            cplBadgeEl.className = `inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-${cls.color}-500/10 text-${cls.color}-400`;
            cplBadgeEl.innerHTML = `<span class="material-symbols-outlined" style="font-size:11px">${cls.icon}</span>${cls.label}`;
            cplBadgeEl.classList.remove('hidden');
        } else {
            cplBadgeEl.classList.add('hidden');
        }
    }

    // Donut de distribuição por campanha
    if (campaigns && campaigns.length > 0) {
        renderDonutChart(campaigns);
    } else {
        hideDonutChart();
    }

    // Atualizar gráfico
    if (daily && daily.length > 0) {
        updateChart(daily, 'cpl');
    }

    // Mostrar barra de abas
    const tabBar = document.getElementById('analysisTabBar');
    if (tabBar) tabBar.classList.remove('hidden');

    // Esconder seção de análise (usuário precisa clicar novamente)
    const analysisSection = document.getElementById('analysisSection');
    if (analysisSection) analysisSection.classList.add('hidden');
    analysisTab = null;
    creativesCampaignFilter = null;
}

// Atualizar card de métrica
function updateMetricCard(metric, value, trend, formatter, invertTrend = false) {
    const valueElement = document.getElementById(`${metric}Value`);
    const trendElement = document.getElementById(`${metric}Trend`);

    if (valueElement) {
        valueElement.textContent = formatter(value);
    }

    if (trendElement) {
        const trendValue = parseFloat(trend);
        const isPositive = invertTrend ? trendValue < 0 : trendValue > 0;
        const icon = isPositive ? 'trending_up' : 'trending_down';
        const colorClass = isPositive ? 'text-[#0bda5b] bg-[#0bda5b]/10' : 'text-red-500 bg-red-500/10';

        trendElement.className = `flex items-center gap-1 ${colorClass} px-1.5 sm:px-2 py-0.5 rounded text-[10px] sm:text-xs font-bold`;
        trendElement.innerHTML = `
            <span class="material-symbols-outlined text-[10px] sm:text-xs">${icon}</span>
            <span>${trendValue > 0 ? '+' : ''}${trendValue}%</span>
        `;
    }
}

// Formatar moeda (usa currentCurrency ou currency explícita)
function formatCurrency(value, currency) {
    var cur = currency || currentCurrency || 'BRL';
    var locale = cur === 'BRL' ? 'pt-BR' : 'en-US';
    return new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: cur
    }).format(value);
}

// Formatar número
function formatNumber(value) {
    return new Intl.NumberFormat('pt-BR').format(Math.round(value));
}

// ==========================================
// UPLOAD DE CRIATIVO
// ==========================================

let ucMediaFile = null;
let ucMediaType = null; // 'IMAGE' ou 'VIDEO'
let ucMediaBase64 = null;

function openUploadCreativeModal() {
    const clientFilter = document.getElementById('clientFilter');
    if (!clientFilter || !clientFilter.value) {
        showToast('Selecione um cliente primeiro', 'warning');
        return;
    }

    // Resetar
    ucMediaFile = null;
    ucMediaType = null;
    ucMediaBase64 = null;
    clearUcMedia();

    // Mostrar nome da conta
    const client = clientsCache.find(c => c.id === clientFilter.value);
    const accountLabel = document.getElementById('uploadCreativeAccount');
    if (accountLabel && client) {
        accountLabel.textContent = `Conta: ${client.name} (${client.adAccountId})`;
    }

    // Esconder mensagens
    document.getElementById('ucError').classList.add('hidden');
    document.getElementById('ucSuccess').classList.add('hidden');

    // Abrir modal
    const modal = document.getElementById('uploadCreativeModal');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

function closeUploadCreativeModal() {
    const modal = document.getElementById('uploadCreativeModal');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
}

// --- Drag & drop e seleção de arquivo ---
function handleUcDrop(e) {
    e.preventDefault();
    e.currentTarget.classList.remove('border-emerald-500', 'bg-emerald-500/5');
    const file = e.dataTransfer.files[0];
    if (file) handleUcFileSelect(file);
}

function handleUcFileSelect(file) {
    if (!file) return;

    const isImage = file.type.startsWith('image/');
    const isVideo = file.type.startsWith('video/');

    if (!isImage && !isVideo) {
        showUcError('Formato nao suportado. Use JPG, PNG, MP4 ou MOV.');
        return;
    }
    if (isImage && file.size > 30 * 1024 * 1024) {
        showUcError('Imagem muito grande. Maximo: 30MB.');
        return;
    }
    if (isVideo && file.size > 500 * 1024 * 1024) {
        showUcError('Video muito grande. Maximo: 500MB.');
        return;
    }

    ucMediaFile = file;
    ucMediaType = isImage ? 'IMAGE' : 'VIDEO';

    // Show preview
    document.getElementById('ucPlaceholder').classList.add('hidden');
    document.getElementById('ucPreview').classList.remove('hidden');
    document.getElementById('ucFileName').textContent = `${file.name} (${(file.size / 1024 / 1024).toFixed(1)} MB)`;
    document.getElementById('ucError').classList.add('hidden');

    if (isImage) {
        const reader = new FileReader();
        reader.onload = (e) => {
            document.getElementById('ucPreviewImg').src = e.target.result;
            document.getElementById('ucPreviewImg').classList.remove('hidden');
            ucMediaBase64 = e.target.result.split(',')[1];
        };
        reader.readAsDataURL(file);
        document.getElementById('ucPreviewVid').classList.add('hidden');
    } else {
        const url = URL.createObjectURL(file);
        document.getElementById('ucPreviewVid').src = url;
        document.getElementById('ucPreviewVid').classList.remove('hidden');
        document.getElementById('ucPreviewImg').classList.add('hidden');
        ucMediaBase64 = null;
    }
}

function clearUcMedia() {
    ucMediaFile = null;
    ucMediaType = null;
    ucMediaBase64 = null;
    const fileInput = document.getElementById('ucFileInput');
    if (fileInput) fileInput.value = '';
    const placeholder = document.getElementById('ucPlaceholder');
    if (placeholder) placeholder.classList.remove('hidden');
    const preview = document.getElementById('ucPreview');
    if (preview) preview.classList.add('hidden');
    const img = document.getElementById('ucPreviewImg');
    if (img) img.classList.add('hidden');
    const vid = document.getElementById('ucPreviewVid');
    if (vid) vid.classList.add('hidden');
    const progress = document.getElementById('ucProgress');
    if (progress) progress.classList.add('hidden');
}

function showUcError(msg) {
    const el = document.getElementById('ucError');
    el.textContent = msg;
    el.classList.remove('hidden');
}

// --- Upload chunked de vídeo ---
async function uploadVideoToAccount(file, adAccountId) {
    const baseUrl = window.location.hostname === 'localhost' ? 'http://localhost:8888' : '';
    const CHUNK_SIZE = 3 * 1024 * 1024;

    const startResp = await fetch(`${baseUrl}/.netlify/functions/meta-ads-write`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'upload-video-chunk', password: currentAdminPassword, adAccountId, phase: 'start', fileSize: file.size })
    });
    const startData = await startResp.json();
    if (!startData.success) throw new Error(startData.error || 'Falha ao iniciar upload');

    const { uploadSessionId } = startData;
    let offset = 0;
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
    let chunksSent = 0;

    document.getElementById('ucProgress').classList.remove('hidden');

    while (offset < file.size) {
        const end = Math.min(offset + CHUNK_SIZE, file.size);
        const chunk = file.slice(offset, end);
        const base64 = await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result.split(',')[1]);
            reader.readAsDataURL(chunk);
        });

        const transferResp = await fetch(`${baseUrl}/.netlify/functions/meta-ads-write`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'upload-video-chunk', password: currentAdminPassword, adAccountId, phase: 'transfer', uploadSessionId, startOffset: offset, videoData: base64 })
        });
        const transferData = await transferResp.json();
        if (!transferData.success) throw new Error(transferData.error || 'Falha ao enviar chunk');

        chunksSent++;
        const pct = Math.round((chunksSent / totalChunks) * 100);
        document.getElementById('ucProgressBar').style.width = `${pct}%`;
        document.getElementById('ucProgressText').textContent = `Enviando video... ${pct}%`;
        offset = end;
    }

    const finishResp = await fetch(`${baseUrl}/.netlify/functions/meta-ads-write`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'upload-video-chunk', password: currentAdminPassword, adAccountId, phase: 'finish', uploadSessionId })
    });
    const finishData = await finishResp.json();
    if (!finishData.success) throw new Error(finishData.error || 'Falha ao finalizar upload');

    document.getElementById('ucProgressText').textContent = 'Video enviado!';
    return finishData.videoId;
}

// --- Submit upload ---
async function submitUploadCreative() {
    if (!ucMediaFile) return showUcError('Selecione uma imagem ou video');

    const btnText = document.getElementById('ucBtnText');
    const btnSpinner = document.getElementById('ucBtnSpinner');
    const btn = document.getElementById('ucBtnSubmit');
    btnText.textContent = 'Enviando...';
    btnSpinner.classList.remove('hidden');
    btn.disabled = true;
    document.getElementById('ucError').classList.add('hidden');
    document.getElementById('ucSuccess').classList.add('hidden');

    try {
        const clientFilter = document.getElementById('clientFilter');
        const client = clientsCache.find(c => c.id === clientFilter.value);
        if (!client) throw new Error('Cliente nao encontrado');

        const baseUrl = window.location.hostname === 'localhost' ? 'http://localhost:8888' : '';

        if (ucMediaType === 'IMAGE') {
            // Upload de imagem via meta-ads-write
            const resp = await fetch(`${baseUrl}/.netlify/functions/meta-ads-write`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'upload-image',
                    password: currentAdminPassword,
                    adAccountId: client.adAccountId,
                    imageData: ucMediaBase64
                })
            });
            const data = await resp.json();
            if (!data.success) throw new Error(data.error || 'Erro ao enviar imagem');

            const successEl = document.getElementById('ucSuccess');
            successEl.textContent = `Imagem enviada com sucesso! Hash: ${data.imageHash}`;
            successEl.classList.remove('hidden');
        } else {
            // Upload de vídeo chunked
            const videoId = await uploadVideoToAccount(ucMediaFile, client.adAccountId);

            const successEl = document.getElementById('ucSuccess');
            successEl.textContent = `Video enviado com sucesso! ID: ${videoId}`;
            successEl.classList.remove('hidden');
        }

        showToast('Criativo enviado para a conta de anuncios!', 'success');
        setTimeout(() => closeUploadCreativeModal(), 3000);

    } catch (error) {
        showUcError(error.message);
    } finally {
        btnText.textContent = 'Enviar para a Conta';
        btnSpinner.classList.add('hidden');
        btn.disabled = false;
    }
}

// ==========================================
// WHATSAPP — PAINEL + ENVIO
// ==========================================

let waQrPollingInterval = null;
let waQrCountdownInterval = null;

async function callWhatsAppAPI(action, data = {}) {
    const baseUrl = window.location.hostname === 'localhost' ? 'http://localhost:8888' : '';
    const password = sessionStorage.getItem('adminPassword') || '';
    const resp = await fetch(`${baseUrl}/.netlify/functions/whatsapp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, password, ...data })
    });
    const result = await resp.json();
    if (!resp.ok || result.error) throw new Error(result.error || 'Erro na API WhatsApp');
    return result;
}

async function loadWhatsAppStatus() {
    const loading = document.getElementById('waStatusLoading');
    const connected = document.getElementById('waStatusConnected');
    const disconnected = document.getElementById('waStatusDisconnected');
    const errorEl = document.getElementById('waStatusError');
    const qrSection = document.getElementById('waQrCodeSection');

    if (!loading) return;

    // Carregar configuracoes salvas nos campos
    await loadWhatsAppConfig();

    loading.classList.remove('hidden');
    connected.classList.add('hidden');
    disconnected.classList.add('hidden');
    errorEl.classList.add('hidden');

    try {
        const result = await callWhatsAppAPI('test-connection');
        loading.classList.add('hidden');

        if (result.connected) {
            connected.classList.remove('hidden');
            document.getElementById('waInstanceName').textContent = result.instance || '—';
            if (qrSection) qrSection.classList.add('hidden');
            stopQrPolling();
        } else {
            disconnected.classList.remove('hidden');
        }
    } catch (err) {
        loading.classList.add('hidden');
        errorEl.classList.remove('hidden');
        document.getElementById('waStatusErrorMsg').textContent = err.message;
    }
}

async function loadWhatsAppConfig() {
    try {
        const result = await callWhatsAppAPI('get-config');
        if (result.config) {
            document.getElementById('waConfigUrl').value = result.config.apiUrl || '';
            document.getElementById('waConfigInstance').value = result.config.instanceName || 'dashboard-milo';
            // Chave: mostrar placeholder se existe
            const keyInput = document.getElementById('waConfigKey');
            if (result.config.hasApiKey) {
                keyInput.placeholder = '••••••••  (chave salva)';
            }
            // Status
            const statusEl = document.getElementById('waConfigStatus');
            if (result.config.apiUrl) {
                statusEl.innerHTML = '<span class="text-green-400 flex items-center gap-1"><span class="material-symbols-outlined text-sm">check_circle</span> Configurado</span>';
            } else {
                statusEl.innerHTML = '<span class="text-amber-400 flex items-center gap-1"><span class="material-symbols-outlined text-sm">warning</span> Nao configurado</span>';
            }
        }
    } catch (err) {
        // Se falhar, campos ficam vazios — normal na primeira vez
        const statusEl = document.getElementById('waConfigStatus');
        if (statusEl) statusEl.innerHTML = '<span class="text-slate-500">Preencha os campos abaixo</span>';
    }
}

async function saveWhatsAppConfig() {
    const apiUrl = document.getElementById('waConfigUrl').value.trim();
    const apiKey = document.getElementById('waConfigKey').value.trim();
    const instanceName = document.getElementById('waConfigInstance').value.trim();
    const btn = document.getElementById('waConfigSaveBtn');
    const statusEl = document.getElementById('waConfigStatus');

    if (!apiUrl) {
        showToast('Informe a URL da Evolution API', 'error');
        return;
    }

    // Se chave esta vazia e ja tem uma salva, nao exigir nova
    if (!apiKey) {
        // Verificar se ja tem chave salva
        try {
            const configResult = await callWhatsAppAPI('get-config');
            if (!configResult.config?.hasApiKey) {
                showToast('Informe a Chave da API', 'error');
                return;
            }
        } catch (e) {
            showToast('Informe a Chave da API', 'error');
            return;
        }
    }

    btn.disabled = true;
    btn.innerHTML = '<div class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> Salvando...';

    try {
        const data = { apiUrl, instanceName: instanceName || 'dashboard-milo' };
        if (apiKey) data.apiKey = apiKey;

        await callWhatsAppAPI('save-config', data);

        statusEl.innerHTML = '<span class="text-green-400 flex items-center gap-1"><span class="material-symbols-outlined text-sm">check_circle</span> Salvo!</span>';
        showToast('Configuracoes salvas com sucesso!', 'success');

        // Limpar campo de chave e atualizar placeholder
        document.getElementById('waConfigKey').value = '';
        document.getElementById('waConfigKey').placeholder = '••••••••  (chave salva)';

        // Recarregar status
        setTimeout(() => loadWhatsAppStatus(), 500);
    } catch (err) {
        statusEl.innerHTML = `<span class="text-red-400">${err.message}</span>`;
        showToast('Erro ao salvar: ' + err.message, 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<span class="material-symbols-outlined text-lg">save</span> Salvar Configuracoes';
    }
}

function toggleWaKeyVisibility() {
    const input = document.getElementById('waConfigKey');
    const icon = document.getElementById('waKeyToggleIcon');
    if (input.type === 'password') {
        input.type = 'text';
        icon.textContent = 'visibility_off';
    } else {
        input.type = 'password';
        icon.textContent = 'visibility';
    }
}

async function connectWhatsApp() {
    const qrSection = document.getElementById('waQrCodeSection');
    qrSection.classList.remove('hidden');
    await refreshQrCode();

    // Polling para detectar conexao
    stopQrPolling();
    waQrPollingInterval = setInterval(async () => {
        try {
            const result = await callWhatsAppAPI('test-connection');
            if (result.connected) {
                stopQrPolling();
                qrSection.classList.add('hidden');
                showToast('WhatsApp conectado com sucesso!', 'success');
                loadWhatsAppStatus();
            }
        } catch (e) { /* ignora erros durante polling */ }
    }, 3000);
}

async function refreshQrCode() {
    const container = document.getElementById('waQrCodeContainer');
    container.innerHTML = '<div class="w-8 h-8 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin"></div>';

    try {
        const result = await callWhatsAppAPI('get-qrcode');
        if (result.qrcode) {
            container.innerHTML = `<img src="${result.qrcode}" alt="QR Code" class="w-48 h-48" style="image-rendering: pixelated;">`;
        } else {
            container.innerHTML = '<p class="text-xs text-slate-500 text-center">QR code nao disponivel.<br>Tente novamente.</p>';
        }
    } catch (err) {
        container.innerHTML = `<p class="text-xs text-red-400 text-center">${err.message}</p>`;
    }

    // Countdown
    startQrCountdown(45);
}

function startQrCountdown(seconds) {
    const timerEl = document.getElementById('waQrTimer');
    if (!timerEl) return;
    clearInterval(waQrCountdownInterval);

    let remaining = seconds;
    timerEl.textContent = `${remaining}s`;

    waQrCountdownInterval = setInterval(() => {
        remaining--;
        timerEl.textContent = `${remaining}s`;
        if (remaining <= 0) {
            clearInterval(waQrCountdownInterval);
            timerEl.textContent = 'Expirado';
        }
    }, 1000);
}

function stopQrPolling() {
    if (waQrPollingInterval) { clearInterval(waQrPollingInterval); waQrPollingInterval = null; }
    if (waQrCountdownInterval) { clearInterval(waQrCountdownInterval); waQrCountdownInterval = null; }
}

async function disconnectWhatsApp() {
    if (!confirm('Deseja desconectar o WhatsApp?')) return;

    try {
        await callWhatsAppAPI('logout-instance');
        showToast('WhatsApp desconectado', 'info');
        loadWhatsAppStatus();
    } catch (err) {
        showToast('Erro ao desconectar: ' + err.message, 'error');
    }
}

async function sendWhatsAppTest() {
    const number = document.getElementById('waTestNumber').value.trim();
    const message = document.getElementById('waTestMessage').value.trim();
    const btn = document.getElementById('waTestSendBtn');
    const resultEl = document.getElementById('waTestResult');

    if (!number || number.length < 12) {
        showToast('Informe um numero valido (ex: 5511999999999)', 'error');
        return;
    }
    if (!message) {
        showToast('Informe uma mensagem', 'error');
        return;
    }

    btn.disabled = true;
    btn.innerHTML = '<div class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> Enviando...';

    try {
        await callWhatsAppAPI('send-text', { number, text: message });
        resultEl.classList.remove('hidden');
        resultEl.className = 'text-sm text-green-400';
        resultEl.textContent = 'Mensagem enviada com sucesso!';
        showToast('Mensagem de teste enviada!', 'success');
    } catch (err) {
        resultEl.classList.remove('hidden');
        resultEl.className = 'text-sm text-red-400';
        resultEl.textContent = err.message;
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<span class="material-symbols-outlined text-lg">send</span> Enviar Mensagem de Teste';
    }
}

// --- Envio de relatorio via WhatsApp ---

function openWhatsAppSendModal() {
    const clientFilter = document.getElementById('clientFilter');
    if (!clientFilter || !clientFilter.value) {
        showToast('Selecione um cliente primeiro', 'error');
        return;
    }

    const client = clientsCache.find(c => c.id === clientFilter.value);
    if (!client || !client.whatsappNumber) {
        showToast('Este cliente nao tem WhatsApp cadastrado', 'error');
        return;
    }

    // Preencher modal
    document.getElementById('waSendClientName').textContent = client.name;
    const num = client.whatsappNumber;
    document.getElementById('waSendClientNumber').textContent = `+${num.slice(0,2)} ${num.slice(2,4)} ${num.slice(4,9)}-${num.slice(9)}`;

    // Periodo atual
    const dateRange = getDateRangeForAPI();
    if (dateRange) {
        document.getElementById('waSendPeriod').textContent = `${formatDateForDisplay(dateRange.since)} a ${formatDateForDisplay(dateRange.until)}`;
    }

    // Reset radio
    const radios = document.querySelectorAll('input[name="waSendType"]');
    if (radios.length) radios[0].checked = true;

    const modal = document.getElementById('whatsappSendModal');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

function closeWhatsAppSendModal() {
    const modal = document.getElementById('whatsappSendModal');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
}

async function sendWhatsAppReport() {
    const clientFilter = document.getElementById('clientFilter');
    const client = clientsCache.find(c => c.id === clientFilter.value);
    if (!client || !client.whatsappNumber) return;

    const sendType = document.querySelector('input[name="waSendType"]:checked')?.value || 'text';
    const btn = document.getElementById('waSendBtn');
    btn.disabled = true;
    btn.innerHTML = '<div class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> Enviando...';

    try {
        // Coletar metricas do painel atual
        if (!lastMetricsSummary) {
            throw new Error('Nenhuma metrica carregada. Selecione um cliente e periodo primeiro.');
        }
        const spend = lastMetricsSummary.spend || 0;
        const impressions = lastMetricsSummary.impressions || 0;
        const clicks = lastMetricsSummary.clicks || 0;
        const leads = lastMetricsSummary.leads || 0;
        const cpl = lastMetricsSummary.cpl || 0;

        const dateRange = getDateRangeForAPI();
        const period = dateRange ? {
            start: formatDateForDisplay(dateRange.since),
            end: formatDateForDisplay(dateRange.until)
        } : {};

        // Enviar resumo em texto
        await callWhatsAppAPI('send-report', {
            number: client.whatsappNumber,
            clientName: client.name,
            metrics: { spend, impressions, clicks, leads, cpl },
            period
        });

        // Se PDF, enviar tambem
        if (sendType === 'pdf' && typeof buildReportPDF === 'function') {
            try {
                const pdfData = await buildReportPDF();
                if (pdfData) {
                    await callWhatsAppAPI('send-media', {
                        number: client.whatsappNumber,
                        mediaBase64: pdfData,
                        fileName: `[MILO][${client.name}][RELATORIO].pdf`,
                        caption: `Relatorio ${client.name}`
                    });
                }
            } catch (pdfErr) {
                console.warn('Erro ao enviar PDF:', pdfErr);
            }
        }

        showToast(`Relatorio enviado para ${client.name}!`, 'success');
        closeWhatsAppSendModal();
    } catch (err) {
        showToast('Erro ao enviar: ' + err.message, 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<span class="material-symbols-outlined text-lg">send</span> Enviar WhatsApp';
    }
}

function updateWhatsAppButton() {
    const btn = document.getElementById('btnSendWhatsApp');
    if (!btn) return;

    const clientFilter = document.getElementById('clientFilter');
    if (!clientFilter || !clientFilter.value || !isCurrentUserAdmin()) {
        btn.classList.add('hidden');
        btn.classList.remove('flex');
        return;
    }

    const client = clientsCache.find(c => c.id === clientFilter.value);
    if (client && client.whatsappNumber) {
        btn.classList.remove('hidden');
        btn.classList.add('flex');
    } else {
        btn.classList.add('hidden');
        btn.classList.remove('flex');
    }
}

// ==========================================
// FUNIL DE CONVERSÃO
// ==========================================

function updateFunnel(summary) {
    const container = document.getElementById('funnelContainer');
    if (!container) return;

    const { impressions, clicks, leads, spend } = summary;

    // Se não há dados, mostrar placeholder
    if (!impressions || impressions === 0) {
        container.innerHTML = `
            <div id="funnelPlaceholder" class="flex flex-col items-center justify-center py-8 sm:py-12 text-slate-600">
                <span class="material-symbols-outlined text-4xl sm:text-5xl mb-3 opacity-50">filter_alt</span>
                <span class="text-xs sm:text-sm">Selecione um cliente para visualizar o funil</span>
            </div>`;
        return;
    }

    // Calcular taxas
    const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
    const convRate = clicks > 0 ? (leads / clicks) * 100 : 0;
    const cpl = leads > 0 ? spend / leads : 0;

    // Proporções para largura dos trapézios (impressions = 100%)
    const clicksRatio = impressions > 0 ? Math.max(0.25, clicks / impressions) : 0.5;
    const leadsRatio = impressions > 0 ? Math.max(0.15, leads / impressions) : 0.25;

    // Dimensões SVG
    const W = 480, H = 320;
    const centerX = W / 2;
    const stageH = 58;
    const gapH = 38;
    const startY = 16;

    // Larguras de cada estágio (topo e base do trapézio)
    const s1TopW = W * 0.82;
    const s1BotW = W * Math.max(0.45, clicksRatio * 0.85);
    const s2TopW = s1BotW;
    const s2BotW = W * Math.max(0.25, leadsRatio * 0.85);
    const s3TopW = s2BotW;
    const s3BotW = s3TopW * 0.7;

    // Y positions
    const s1Y = startY;
    const gap1Y = s1Y + stageH;
    const s2Y = gap1Y + gapH;
    const gap2Y = s2Y + stageH;
    const s3Y = gap2Y + gapH;

    function trapezoid(topW, botW, y, h) {
        const tl = centerX - topW / 2, tr = centerX + topW / 2;
        const bl = centerX - botW / 2, br = centerX + botW / 2;
        return `M${tl},${y} L${tr},${y} L${br},${y + h} L${bl},${y + h} Z`;
    }

    // Conector visual: trapézio translúcido entre estágios (conecta base do de cima com topo do de baixo)
    function connector(topW, botW, y, h) {
        const tl = centerX - topW / 2, tr = centerX + topW / 2;
        const bl = centerX - botW / 2, br = centerX + botW / 2;
        return `M${tl},${y} L${tr},${y} L${br},${y + h} L${bl},${y + h} Z`;
    }

    // Badge centralizado sobre o conector
    function rateBadge(y, h, label, value, color, bgColor, delay) {
        const badgeMidY = y + h / 2;
        const text = `${label} ${value}`;
        const textLen = text.length;
        const pillW = Math.max(82, textLen * 7.5 + 20);
        const pillH = 22;
        return `
            <g class="funnel-stage" style="--delay:${delay}">
                <rect x="${centerX - pillW / 2}" y="${badgeMidY - pillH / 2}" width="${pillW}" height="${pillH}" rx="${pillH / 2}" fill="${bgColor}" stroke="${color}" stroke-width="1"/>
                <text x="${centerX}" y="${badgeMidY + 4}" text-anchor="middle" fill="${color}" font-size="11" font-weight="700">${text}</text>
            </g>`;
    }

    const svg = `
        <svg viewBox="0 0 ${W} ${H}" class="w-full" preserveAspectRatio="xMidYMid meet" style="max-height:340px">
            <defs>
                <linearGradient id="funnelGrad1" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stop-color="rgba(59,130,246,0.2)"/>
                    <stop offset="100%" stop-color="rgba(59,130,246,0.08)"/>
                </linearGradient>
                <linearGradient id="funnelGrad2" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stop-color="rgba(6,182,212,0.2)"/>
                    <stop offset="100%" stop-color="rgba(6,182,212,0.08)"/>
                </linearGradient>
                <linearGradient id="funnelGrad3" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stop-color="rgba(16,185,129,0.2)"/>
                    <stop offset="100%" stop-color="rgba(16,185,129,0.08)"/>
                </linearGradient>
            </defs>

            <!-- Stage 1: Impressões -->
            <g class="funnel-stage" style="--delay:0">
                <path d="${trapezoid(s1TopW, s1BotW, s1Y, stageH)}" fill="url(#funnelGrad1)" stroke="rgba(59,130,246,0.35)" stroke-width="1.5"/>
                <text x="${centerX}" y="${s1Y + stageH / 2 - 8}" text-anchor="middle" fill="rgba(148,163,184,0.8)" font-size="10" font-weight="600" letter-spacing="0.05em">IMPRESSÕES</text>
                <text x="${centerX}" y="${s1Y + stageH / 2 + 12}" text-anchor="middle" fill="white" font-size="18" font-weight="700">${formatNumber(impressions)}</text>
            </g>

            <!-- Conector 1 + CTR badge -->
            <path d="${connector(s1BotW, s2TopW, gap1Y, gapH)}" fill="rgba(59,130,246,0.04)" class="funnel-stage" style="--delay:1"/>
            ${rateBadge(gap1Y, gapH, 'CTR', ctr.toFixed(1) + '%', 'rgb(96,165,250)', 'rgba(59,130,246,0.12)', 1)}

            <!-- Stage 2: Cliques -->
            <g class="funnel-stage" style="--delay:2">
                <path d="${trapezoid(s2TopW, s2BotW, s2Y, stageH)}" fill="url(#funnelGrad2)" stroke="rgba(6,182,212,0.35)" stroke-width="1.5"/>
                <text x="${centerX}" y="${s2Y + stageH / 2 - 8}" text-anchor="middle" fill="rgba(148,163,184,0.8)" font-size="10" font-weight="600" letter-spacing="0.05em">CLIQUES</text>
                <text x="${centerX}" y="${s2Y + stageH / 2 + 12}" text-anchor="middle" fill="white" font-size="18" font-weight="700">${formatNumber(clicks)}</text>
            </g>

            <!-- Conector 2 + Conversão badge -->
            <path d="${connector(s2BotW, s3TopW, gap2Y, gapH)}" fill="rgba(16,185,129,0.04)" class="funnel-stage" style="--delay:3"/>
            ${rateBadge(gap2Y, gapH, 'Conv', convRate.toFixed(1) + '%', 'rgb(52,211,153)', 'rgba(16,185,129,0.12)', 3)}

            <!-- Stage 3: Leads -->
            <g class="funnel-stage" style="--delay:4">
                <path d="${trapezoid(s3TopW, s3BotW, s3Y, stageH)}" fill="url(#funnelGrad3)" stroke="rgba(16,185,129,0.35)" stroke-width="1.5"/>
                <text x="${centerX}" y="${s3Y + stageH / 2 - 8}" text-anchor="middle" fill="rgba(148,163,184,0.8)" font-size="10" font-weight="600" letter-spacing="0.05em">LEADS</text>
                <text x="${centerX}" y="${s3Y + stageH / 2 + 12}" text-anchor="middle" fill="white" font-size="18" font-weight="700">${formatNumber(leads)}</text>
            </g>

            <!-- CPL integrado ao estágio de Leads -->
            <g class="funnel-stage" style="--delay:5">
                <rect x="${centerX - 55}" y="${s3Y + stageH + 8}" width="110" height="24" rx="12" fill="rgba(168,85,247,0.12)" stroke="rgba(168,85,247,0.3)" stroke-width="1"/>
                <text x="${centerX}" y="${s3Y + stageH + 24}" text-anchor="middle" fill="rgb(192,132,252)" font-size="11" font-weight="700">CPL ${leads > 0 ? formatCurrency(cpl) : '—'}</text>
            </g>
        </svg>`;

    container.innerHTML = svg;
}

function resetFunnel() {
    const container = document.getElementById('funnelContainer');
    if (!container) return;
    container.innerHTML = `
        <div id="funnelPlaceholder" class="flex flex-col items-center justify-center py-8 sm:py-12 text-slate-600">
            <span class="material-symbols-outlined text-4xl sm:text-5xl mb-3 opacity-50">filter_alt</span>
            <span class="text-xs sm:text-sm">Selecione um cliente para visualizar o funil</span>
        </div>`;
}

// ==========================================
// FUNÇÕES DO GRÁFICO
// ==========================================

function updateChart(dailyData, metric) {
    const container = document.getElementById('chartContainer');
    const labelsContainer = document.getElementById('chartLabels');

    if (!container || !dailyData || dailyData.length === 0) return;

    // Esconder labels externas (agora ficam dentro do SVG)
    labelsContainer.innerHTML = '';

    // Extrair valores da métrica
    const values = dailyData.map(d => d[metric] || 0);
    const rawMax = Math.max(...values);
    const rawMin = Math.min(...values);

    // Calcular escala Y com ticks legíveis
    const yTicks = calcNiceYTicks(rawMin, rawMax, 5);
    const yMin = yTicks[0];
    const yMax = yTicks[yTicks.length - 1];
    const yRange = yMax - yMin || 1;

    // Determinar formatador baseado na métrica
    const isMoneyMetric = (metric === 'spend' || metric === 'cpl');
    const tooltipFormatter = isMoneyMetric ? formatCurrency : formatNumber;
    const axisFormatter = isMoneyMetric ? formatAxisCurrency : formatAxisNumber;

    // Dimensões do SVG
    const width = 860;
    const height = 420;
    const padTop = 20;
    const padRight = 20;
    const padBottom = 50;
    const padLeft = 60;
    const chartWidth = width - padLeft - padRight;
    const chartHeight = height - padTop - padBottom;

    // Calcular pontos
    const points = values.map((value, index) => {
        const x = padLeft + (values.length === 1 ? chartWidth / 2 : (index / (values.length - 1)) * chartWidth);
        const y = padTop + chartHeight - ((value - yMin) / yRange) * chartHeight;
        return { x, y, value, date: dailyData[index].date };
    });

    // Criar path suavizado (curva)
    const linePath = buildSmoothPath(points);

    // Criar path para a área
    const areaPath = linePath + ` L${points[points.length - 1].x},${padTop + chartHeight} L${padLeft},${padTop + chartHeight} Z`;

    // Selecionar labels de data para exibir (máximo ~7, espaçadas uniformemente)
    const maxDateLabels = Math.min(7, dailyData.length);
    const dateIndices = pickEvenIndices(dailyData.length, maxDateLabels);

    // Gerar linhas-guia horizontais e labels do eixo Y
    const gridLinesHTML = yTicks.map(tick => {
        const y = padTop + chartHeight - ((tick - yMin) / yRange) * chartHeight;
        return `
            <line x1="${padLeft}" x2="${width - padRight}" y1="${y}" y2="${y}" stroke="#2d343d" stroke-width="1" stroke-dasharray="4 4" opacity="0.5"/>
            <text x="${padLeft - 10}" y="${y + 4}" text-anchor="end" fill="#64748b" font-size="11" font-family="Inter, sans-serif">${axisFormatter(tick)}</text>
        `;
    }).join('');

    // Gerar labels de data (eixo X) dentro do SVG
    const dateLabelsHTML = dateIndices.map(i => {
        const p = points[i];
        const date = new Date(dailyData[i].date + 'T00:00:00');
        const label = date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
        return `<text x="${p.x}" y="${height - 10}" text-anchor="middle" fill="#64748b" font-size="11" font-family="Inter, sans-serif" class="uppercase">${label}</text>`;
    }).join('');

    // Linha vertical pontilhada de referência (hover)
    const verticalLineHTML = `<line id="chartVerticalLine" x1="0" x2="0" y1="${padTop}" y2="${padTop + chartHeight}" stroke="#137fec" stroke-width="1" stroke-dasharray="3 3" opacity="0" class="transition-opacity"/>`;

    // Renderizar SVG + tooltip
    container.innerHTML = `
        <div id="chartTooltip" class="absolute hidden pointer-events-none bg-surface-dark border border-border-dark rounded-lg px-3 py-2 shadow-2xl z-10 whitespace-nowrap transition-opacity duration-150" style="opacity:0;">
            <div class="absolute w-2 h-2 bg-surface-dark border-border-dark rotate-45" id="chartTooltipArrow"></div>
            <p id="chartTooltipDate" class="text-[10px] text-slate-400 mb-0.5"></p>
            <p id="chartTooltipValue" class="text-sm font-bold text-white"></p>
        </div>
        <svg class="w-full h-full" preserveAspectRatio="xMidYMid meet" viewBox="0 0 ${width} ${height}">
            <defs>
                <linearGradient id="chartGradient" x1="0%" x2="0%" y1="0%" y2="100%">
                    <stop offset="0%" stop-color="#137fec" stop-opacity="0.3"></stop>
                    <stop offset="100%" stop-color="#137fec" stop-opacity="0"></stop>
                </linearGradient>
            </defs>
            <!-- Grid e eixos -->
            ${gridLinesHTML}
            <!-- Área -->
            <path d="${areaPath}" fill="url(#chartGradient)"></path>
            <!-- Linha -->
            <path d="${linePath}" fill="none" stroke="#137fec" stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5"></path>
            <!-- Linha vertical de hover -->
            ${verticalLineHTML}
            <!-- Pontos -->
            ${points.map((p, i) => `
                <circle cx="${p.x}" cy="${p.y}" r="3.5" fill="#137fec" stroke="#161c24" stroke-width="2" class="chart-point" style="transition: r 0.15s, stroke-width 0.15s;" data-index="${i}"/>
                <circle cx="${p.x}" cy="${p.y}" r="18" fill="transparent" class="cursor-pointer chart-hit-area" data-index="${i}"/>
            `).join('')}
            <!-- Labels de data -->
            ${dateLabelsHTML}
        </svg>
    `;

    // Garantir position relative e overflow visible no container
    container.style.position = 'relative';
    container.style.overflow = 'visible';

    // Referências para interatividade
    const svg = container.querySelector('svg');
    const tooltip = document.getElementById('chartTooltip');
    const tooltipArrow = document.getElementById('chartTooltipArrow');
    const tooltipDate = document.getElementById('chartTooltipDate');
    const tooltipValue = document.getElementById('chartTooltipValue');
    const verticalLine = document.getElementById('chartVerticalLine');

    container.querySelectorAll('.chart-hit-area').forEach(hitArea => {
        const index = parseInt(hitArea.dataset.index);
        const point = points[index];
        const visibleCircle = container.querySelector(`.chart-point[data-index="${index}"]`);

        hitArea.addEventListener('mouseenter', () => {
            // Destacar ponto
            visibleCircle.setAttribute('r', '6');
            visibleCircle.setAttribute('stroke-width', '3');

            // Mostrar linha vertical
            verticalLine.setAttribute('x1', point.x);
            verticalLine.setAttribute('x2', point.x);
            verticalLine.setAttribute('opacity', '0.5');

            // Formatar data
            const date = new Date(point.date + 'T00:00:00');
            const formattedDate = date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });

            // Preencher conteúdo antes de medir
            tooltipDate.textContent = formattedDate;
            tooltipValue.textContent = tooltipFormatter(point.value);
            tooltip.classList.remove('hidden');
            tooltip.style.opacity = '0';

            // Coordenadas do ponto relativas ao container
            const svgRect = svg.getBoundingClientRect();
            const containerRect = container.getBoundingClientRect();
            const scaleX = svgRect.width / width;
            const scaleY = svgRect.height / height;
            const pointX = (svgRect.left - containerRect.left) + point.x * scaleX;
            const pointY = (svgRect.top - containerRect.top) + point.y * scaleY;

            // Medir tooltip
            const tipW = tooltip.offsetWidth;
            const tipH = tooltip.offsetHeight;
            const gap = 10;

            // Decidir se mostra acima ou abaixo
            const showBelow = pointY - tipH - gap < 0;

            let top;
            let arrowTop;
            if (showBelow) {
                top = pointY + gap;
                arrowTop = -4;
            } else {
                top = pointY - tipH - gap;
                arrowTop = tipH - 4;
            }

            // Ajustar horizontalmente para não cortar nas bordas
            let left = pointX - tipW / 2;
            const maxLeft = containerRect.width - tipW;
            left = Math.max(0, Math.min(left, maxLeft));

            // Posição da seta (segue o ponto real)
            const arrowLeft = Math.max(8, Math.min(pointX - left - 4, tipW - 12));

            // Aplicar posição
            tooltip.style.left = left + 'px';
            tooltip.style.top = top + 'px';
            tooltip.style.transform = 'none';

            // Estilizar seta
            tooltipArrow.style.left = arrowLeft + 'px';
            tooltipArrow.style.top = arrowTop + 'px';
            tooltipArrow.className = `absolute w-2 h-2 bg-surface-dark rotate-45 ${showBelow ? 'border-t border-l border-border-dark' : 'border-b border-r border-border-dark'}`;

            // Fade in
            tooltip.style.opacity = '1';
        });

        hitArea.addEventListener('mouseleave', () => {
            visibleCircle.setAttribute('r', '3.5');
            visibleCircle.setAttribute('stroke-width', '2');
            verticalLine.setAttribute('opacity', '0');
            tooltip.style.opacity = '0';
            setTimeout(() => tooltip.classList.add('hidden'), 150);
        });
    });
}

// Construir path suavizado (catmull-rom → cubic bezier)
function buildSmoothPath(points) {
    if (points.length < 2) return `M${points[0].x},${points[0].y}`;
    if (points.length === 2) return `M${points[0].x},${points[0].y} L${points[1].x},${points[1].y}`;

    const tension = 0.3;
    let path = `M${points[0].x},${points[0].y}`;

    for (let i = 0; i < points.length - 1; i++) {
        const p0 = points[Math.max(0, i - 1)];
        const p1 = points[i];
        const p2 = points[i + 1];
        const p3 = points[Math.min(points.length - 1, i + 2)];

        const cp1x = p1.x + (p2.x - p0.x) * tension;
        const cp1y = p1.y + (p2.y - p0.y) * tension;
        const cp2x = p2.x - (p3.x - p1.x) * tension;
        const cp2y = p2.y - (p3.y - p1.y) * tension;

        path += ` C${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`;
    }
    return path;
}

// Calcular ticks "bonitos" para o eixo Y
function calcNiceYTicks(rawMin, rawMax, targetCount) {
    if (rawMin === rawMax) {
        const v = rawMin || 1;
        return [0, Math.ceil(v * 1.2)];
    }

    const rawRange = rawMax - rawMin;
    const roughStep = rawRange / (targetCount - 1);
    const magnitude = Math.pow(10, Math.floor(Math.log10(roughStep)));
    const residual = roughStep / magnitude;

    let niceStep;
    if (residual <= 1.5) niceStep = 1 * magnitude;
    else if (residual <= 3) niceStep = 2 * magnitude;
    else if (residual <= 7) niceStep = 5 * magnitude;
    else niceStep = 10 * magnitude;

    const niceMin = Math.floor(rawMin / niceStep) * niceStep;
    const niceMax = Math.ceil(rawMax / niceStep) * niceStep;

    const ticks = [];
    for (let v = niceMin; v <= niceMax + niceStep * 0.5; v += niceStep) {
        ticks.push(Math.round(v * 100) / 100);
    }
    return ticks;
}

// Selecionar índices uniformemente espaçados
function pickEvenIndices(total, count) {
    if (total <= count) return Array.from({ length: total }, (_, i) => i);
    const indices = [0];
    const step = (total - 1) / (count - 1);
    for (let i = 1; i < count - 1; i++) {
        indices.push(Math.round(step * i));
    }
    indices.push(total - 1);
    return indices;
}

// Formatadores compactos para eixo Y
function formatAxisCurrency(value) {
    var symbol = currentCurrency === 'BRL' ? 'R$' : '$';
    if (value >= 1000) return symbol + (value / 1000).toFixed(value % 1000 === 0 ? 0 : 1) + 'k';
    return symbol + formatAxisNumber(value);
}

function formatAxisNumber(value) {
    if (value >= 1000000) return (value / 1000000).toFixed(1) + 'M';
    if (value >= 1000) return (value / 1000).toFixed(value % 1000 === 0 ? 0 : 1) + 'k';
    return String(Math.round(value));
}

// ==========================================
// DONUT CHART (distribuição de investimento)
// ==========================================

const DONUT_COLORS = ['#3b82f6', '#a855f7', '#f97316', '#22c55e', '#ec4899', '#06b6d4', '#ef4444', '#eab308'];

function renderDonutChart(campaigns) {
    const section = document.getElementById('investmentDonutSection');
    const container = document.getElementById('investmentDonutContainer');
    if (!section || !container) return;

    // Filtrar campanhas com spend > 0
    let items = (campaigns || []).filter(c => c.spend > 0).sort((a, b) => b.spend - a.spend);

    // Esconder se 0 ou 1 campanha
    if (items.length < 2) {
        section.classList.add('hidden');
        return;
    }

    // Agrupar menores em "Outras" se > 6
    if (items.length > 6) {
        const top5 = items.slice(0, 5);
        const others = items.slice(5);
        const othersSpend = others.reduce((s, c) => s + c.spend, 0);
        items = [...top5, { name: 'Outras', spend: othersSpend, _isOther: true }];
    }

    const totalSpend = items.reduce((s, c) => s + c.spend, 0);
    if (totalSpend === 0) {
        section.classList.add('hidden');
        return;
    }

    section.classList.remove('hidden');

    // Donut SVG params
    const size = 180;
    const cx = size / 2;
    const cy = size / 2;
    const radius = 65;
    const strokeWidth = 22;
    const circumference = 2 * Math.PI * radius;

    // Build segments
    let segments = '';
    let offset = 0;
    items.forEach((item, i) => {
        const pct = item.spend / totalSpend;
        const dash = pct * circumference;
        const gap = circumference - dash;
        const color = DONUT_COLORS[i % DONUT_COLORS.length];
        const rotation = (offset / circumference) * 360 - 90;

        segments += `<circle
            cx="${cx}" cy="${cy}" r="${radius}"
            fill="none" stroke="${color}" stroke-width="${strokeWidth}"
            stroke-dasharray="${dash} ${gap}"
            transform="rotate(${rotation} ${cx} ${cy})"
            class="transition-opacity duration-200"
            data-donut-index="${i}"
            style="cursor:pointer"
            onmouseenter="highlightDonutSegment(${i})"
            onmouseleave="unhighlightDonutSegment()"
        />`;
        offset += dash;
    });

    // Center text
    const centerText = `
        <text x="${cx}" y="${cy - 6}" text-anchor="middle" fill="#94a3b8" font-size="10" font-weight="600">TOTAL</text>
        <text x="${cx}" y="${cy + 12}" text-anchor="middle" fill="#ffffff" font-size="14" font-weight="700">${formatCurrency(totalSpend)}</text>
    `;

    // Legend
    const legendItems = items.map((item, i) => {
        const pct = ((item.spend / totalSpend) * 100).toFixed(1);
        const color = DONUT_COLORS[i % DONUT_COLORS.length];
        return `
            <div class="flex items-center gap-3 py-1.5 donut-legend-item" data-donut-index="${i}"
                 onmouseenter="highlightDonutSegment(${i})" onmouseleave="unhighlightDonutSegment()">
                <div class="w-3 h-3 rounded-full flex-shrink-0" style="background:${color}"></div>
                <div class="flex-1 min-w-0">
                    <p class="text-xs text-slate-300 font-medium truncate">${item.name}</p>
                </div>
                <div class="text-right flex-shrink-0">
                    <span class="text-xs font-bold text-white">${pct}%</span>
                    <span class="text-[10px] text-slate-500 ml-1">${formatCurrency(item.spend)}</span>
                </div>
            </div>
        `;
    }).join('');

    container.innerHTML = `
        <div class="flex-shrink-0">
            <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
                ${segments}
                ${centerText}
            </svg>
        </div>
        <div class="flex-1 w-full sm:w-auto space-y-0.5">
            ${legendItems}
        </div>
    `;
}

function highlightDonutSegment(index) {
    document.querySelectorAll('[data-donut-index]').forEach(el => {
        const i = parseInt(el.getAttribute('data-donut-index'));
        if (el.tagName === 'circle') {
            el.style.opacity = i === index ? '1' : '0.3';
        }
        if (el.classList.contains('donut-legend-item')) {
            el.style.opacity = i === index ? '1' : '0.4';
        }
    });
}

function unhighlightDonutSegment() {
    document.querySelectorAll('[data-donut-index]').forEach(el => {
        el.style.opacity = '1';
    });
}

function hideDonutChart() {
    const section = document.getElementById('investmentDonutSection');
    if (section) section.classList.add('hidden');
}

// ==========================================
// PAINEL SWITCHING (VISÃO GERAL / MÉTRICAS)
// ==========================================

function switchPanel(panel) {
    currentPanel = panel;

    const panelVisaoGeral = document.getElementById('panelVisaoGeral');
    const panelMetricas = document.getElementById('panelMetricas');
    const panelRelatorios = document.getElementById('panelRelatorios');
    const panelWhatsApp = document.getElementById('panelWhatsApp');
    const headerVisaoGeral = document.getElementById('headerVisaoGeral');
    const headerMetricas = document.getElementById('headerMetricas');
    const headerRelatorios = document.getElementById('headerRelatorios');
    const headerWhatsApp = document.getElementById('headerWhatsApp');
    const navVisaoGeral = document.getElementById('navVisaoGeral');
    const navMetricas = document.getElementById('navMetricas');
    const navRelatorios = document.getElementById('navRelatorios');
    const navWhatsApp = document.getElementById('navWhatsApp');

    // Esconder todos os paineis e headers
    panelVisaoGeral.classList.add('hidden');
    panelMetricas.classList.add('hidden');
    panelRelatorios.classList.add('hidden');
    if (panelWhatsApp) panelWhatsApp.classList.add('hidden');
    headerVisaoGeral.classList.add('hidden');
    headerMetricas.classList.add('hidden');
    headerRelatorios.classList.add('hidden');
    if (headerWhatsApp) headerWhatsApp.classList.add('hidden');

    // Resetar todos os navs
    [navVisaoGeral, navMetricas, navRelatorios].filter(Boolean).forEach(nav => {
        nav.classList.remove('sidebar-item-active');
        nav.classList.add('text-slate-400', 'hover:text-white');
        nav.querySelector('.material-symbols-outlined').style.fontVariationSettings = '';
    });
    if (navWhatsApp) {
        navWhatsApp.classList.remove('sidebar-item-active');
        navWhatsApp.classList.add('text-slate-400', 'hover:text-white');
        navWhatsApp.querySelector('.material-symbols-outlined').style.fontVariationSettings = '';
    }

    // Ativar o painel selecionado
    if (panel === 'visao-geral') {
        panelVisaoGeral.classList.remove('hidden');
        headerVisaoGeral.classList.remove('hidden');
        navVisaoGeral.classList.add('sidebar-item-active');
        navVisaoGeral.classList.remove('text-slate-400', 'hover:text-white');
        navVisaoGeral.querySelector('.material-symbols-outlined').style.fontVariationSettings = "'FILL' 1";
        // Forcar cards no mobile
        if (window.innerWidth < 640) setOverviewView('cards');
    } else if (panel === 'metricas') {
        panelMetricas.classList.remove('hidden');
        headerMetricas.classList.remove('hidden');
        navMetricas.classList.add('sidebar-item-active');
        navMetricas.classList.remove('text-slate-400', 'hover:text-white');
        navMetricas.querySelector('.material-symbols-outlined').style.fontVariationSettings = "'FILL' 1";
    } else if (panel === 'relatorios') {
        panelRelatorios.classList.remove('hidden');
        headerRelatorios.classList.remove('hidden');
        navRelatorios.classList.add('sidebar-item-active');
        navRelatorios.classList.remove('text-slate-400', 'hover:text-white');
        navRelatorios.querySelector('.material-symbols-outlined').style.fontVariationSettings = "'FILL' 1";
        if (typeof populateReportClientFilter === 'function') {
            populateReportClientFilter();
        }
        populateScheduleClientFilter();
    } else if (panel === 'whatsapp') {
        if (panelWhatsApp) panelWhatsApp.classList.remove('hidden');
        if (headerWhatsApp) headerWhatsApp.classList.remove('hidden');
        if (navWhatsApp) {
            navWhatsApp.classList.add('sidebar-item-active');
            navWhatsApp.classList.remove('text-slate-400', 'hover:text-white');
            navWhatsApp.querySelector('.material-symbols-outlined').style.fontVariationSettings = "'FILL' 1";
        }
        loadWhatsAppStatus();
    }

    // Fechar sidebar no mobile
    if (window.innerWidth < 1024) {
        const sidebar = document.getElementById('sidebar');
        if (sidebar.classList.contains('open')) {
            toggleSidebar();
        }
    }
}

// ==========================================
// VISÃO GERAL - DADOS E BOARD
// ==========================================

let overviewDataCache = null;
let overviewSortField = null;
let overviewSortAsc = true;
let overviewViewMode = 'board';

// Inicializar sort por clique nos headers (event delegation)
document.addEventListener('DOMContentLoaded', function() {
    const header = document.getElementById('overviewBoardHeader');
    if (header) {
        header.addEventListener('click', function(e) {
            const col = e.target.closest('.board-sort-col');
            if (!col) return;
            const field = col.getAttribute('data-sort');
            if (field) sortOverviewBoard(field);
        });
    }
});

// Acumuladores para KPIs da visao geral
var overviewMetricsAccum = { totalSpend: 0, totalLeads: 0, currencies: [] };

async function loadOverviewData() {
    const rowsContainer = document.getElementById('overviewBoardRows');
    const loading = document.getElementById('overviewLoading');

    // Reset acumuladores
    overviewMetricsAccum = { totalSpend: 0, totalLeads: 0, currencies: [] };

    // No mobile, forçar view de cards (board tem min-w-[780px])
    if (window.innerWidth < 640) {
        setOverviewView('cards');
    }

    // Limpar rows e cards existentes, resetar ordenacao
    rowsContainer.querySelectorAll('.overview-board-row').forEach(r => r.remove());
    const cardsEl = document.getElementById('overviewCards');
    if (cardsEl) cardsEl.innerHTML = '';
    overviewSortField = null;
    overviewSortAsc = true;
    document.querySelectorAll('.board-sort-icon').forEach(i => i.textContent = 'unfold_more');
    document.querySelectorAll('.board-sort-col').forEach(c => c.classList.remove('text-white'));

    // Reset KPIs visuais
    updateOverviewKPIs(null);

    // Mostrar loading
    if (loading) {
        loading.classList.remove('hidden');
        loading.innerHTML = `
            <div class="w-10 h-10 border-3 border-primary/20 border-t-primary rounded-full animate-spin mb-4"></div>
            <span class="text-sm text-slate-500">Carregando dados dos clientes...</span>
        `;
    }

    const clients = await loadClients();

    if (clients.length === 0) {
        if (loading) {
            loading.classList.remove('hidden');
            loading.innerHTML = `
                <span class="material-symbols-outlined text-5xl sm:text-6xl mb-3 opacity-50 text-slate-600">person_off</span>
                <span class="text-sm text-slate-500">Nenhum cliente cadastrado</span>
                <span class="text-xs text-slate-600 mt-1">Acesse Ajustes para adicionar clientes</span>
            `;
        }
        updateOverviewSummary(0, 0, 0);
        return;
    }

    // FASE 1: Buscar status de todas as contas em batch
    const accountIds = clients.map(c => c.adAccountId).join(',');
    const baseUrl = window.location.hostname === 'localhost' ? 'http://localhost:8888' : '';

    try {
        const response = await fetch(`${baseUrl}/.netlify/functions/meta-ads?action=account-status&accountIds=${encodeURIComponent(accountIds)}`);
        const result = await response.json();

        if (!result.success) {
            throw new Error(result.message || 'Erro ao buscar status das contas');
        }

        const statusMap = new Map();
        (result.accounts || []).forEach(account => {
            statusMap.set(account.accountId, account);
        });

        if (loading) loading.classList.add('hidden');

        let activeCount = 0;
        let problemCount = 0;

        // Renderizar linhas com status/saldo + placeholders nas metricas
        clients.forEach(client => {
            const formattedId = client.adAccountId.startsWith('act_')
                ? client.adAccountId
                : `act_${client.adAccountId}`;
            const statusData = statusMap.get(formattedId) || { error: true };
            const cardState = getClientCardState(statusData);

            if (cardState.isActive) activeCount++;
            if (cardState.hasError) problemCount++;

            const rowHTML = renderOverviewRow(client, statusData, cardState);
            rowsContainer.insertAdjacentHTML('beforeend', rowHTML);
        });

        updateOverviewSummary(clients.length, activeCount, problemCount);
        overviewDataCache = { clients, statusMap, timestamp: Date.now() };

        // Render cards view (always render so metrics can update both views)
        renderOverviewCards();

        // FASE 2: Buscar metricas de cada cliente em paralelo
        const insightPromises = clients.map(client => {
            return fetchOverviewInsights(client.adAccountId, baseUrl)
                .then(metrics => {
                    updateRowMetrics(client.id, metrics);
                    // Acumular para KPIs agregados
                    if (metrics && metrics.spend > 0) {
                        overviewMetricsAccum.totalSpend += metrics.spend;
                        overviewMetricsAccum.totalLeads += (metrics.leads || 0);
                        var metricsCur = metrics._currency || 'BRL';
                        if (!overviewMetricsAccum.currencies.includes(metricsCur)) {
                            overviewMetricsAccum.currencies.push(metricsCur);
                        }
                    }
                    updateOverviewKPIs(overviewMetricsAccum);
                })
                .catch(err => {
                    console.warn(`Insights error for ${client.name}:`, err);
                    updateRowMetrics(client.id, null);
                });
        });

        await Promise.allSettled(insightPromises);

    } catch (error) {
        console.error('Erro ao carregar visao geral:', error);
        if (loading) {
            loading.classList.remove('hidden');
            loading.innerHTML = `
                <span class="material-symbols-outlined text-5xl text-red-500/50 mb-3">error</span>
                <span class="text-sm text-slate-500">Erro ao carregar dados</span>
                <span class="text-xs text-slate-600 mt-1">${error.message}</span>
                <button onclick="loadOverviewData()" class="mt-4 px-4 py-2 bg-primary text-white rounded-lg text-xs font-bold hover:bg-primary/90">Tentar novamente</button>
            `;
        }
    }
}

async function fetchOverviewInsights(adAccountId, baseUrl) {
    const formattedId = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`;
    let url = `${baseUrl}/.netlify/functions/meta-ads?adAccountId=${encodeURIComponent(formattedId)}`;

    if (currentDateRange) {
        const timeRange = JSON.stringify({ since: currentDateRange.start, until: currentDateRange.end });
        url += `&timeRange=${encodeURIComponent(timeRange)}`;
    } else {
        const dateRange = getDateRangeForAPI();
        if (dateRange.usePreset) {
            url += `&datePreset=${dateRange.preset}`;
        } else {
            const timeRange = JSON.stringify({ since: dateRange.since, until: dateRange.until });
            url += `&timeRange=${encodeURIComponent(timeRange)}`;
        }
    }

    const response = await fetch(url);
    const result = await response.json();

    if (!response.ok || result.error || !result.data || !result.data.summary) {
        return null;
    }

    var summary = result.data.summary;
    summary._currency = result.currency || 'BRL';
    return summary;
}

function updateRowMetrics(clientId, metrics) {
    const row = document.querySelector(`.overview-board-row[data-client-id="${clientId}"]`);
    const spendEl = document.getElementById(`row-spend-${clientId}`);
    const leadsEl = document.getElementById(`row-leads-${clientId}`);
    const cplEl = document.getElementById(`row-cpl-${clientId}`);

    // Salvar valores nos data attributes do row para ordenacao
    if (row) {
        row.setAttribute('data-spend', metrics ? metrics.spend : 0);
        row.setAttribute('data-leads', metrics ? metrics.leads : 0);
        row.setAttribute('data-cpl', metrics ? metrics.cpl : 0);
    }

    if (!metrics) {
        if (spendEl) spendEl.innerHTML = '<span class="text-sm text-slate-500">--</span>';
        if (leadsEl) leadsEl.innerHTML = '<span class="text-sm text-slate-500">--</span>';
        if (cplEl) cplEl.innerHTML = '<span class="text-sm text-slate-500">--</span>';
        updateCardMetrics(clientId, null);
        return;
    }

    var rowCurrency = metrics._currency || 'BRL';
    if (spendEl) spendEl.innerHTML = `<span class="text-sm font-bold text-white">${formatCurrency(metrics.spend, rowCurrency)}</span>`;
    if (leadsEl) leadsEl.innerHTML = `<span class="text-sm font-bold text-white">${formatNumber(metrics.leads)}</span>`;

    if (cplEl) {
        if (metrics.cpl <= 0) {
            cplEl.innerHTML = '<span class="text-sm text-slate-500">--</span>';
        } else {
            const client = clientsCache.find(c => c.id === clientId);
            const classification = client?.cplTargets ? classifyCpl(metrics.cpl, client.cplTargets) : null;

            if (classification) {
                cplEl.innerHTML = `
                    <div class="flex flex-col items-end gap-0.5">
                        <span class="text-sm font-bold text-${classification.color}-400">${formatCurrency(metrics.cpl, rowCurrency)}</span>
                        <span class="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold bg-${classification.color}-500/10 text-${classification.color}-400">
                            <span class="material-symbols-outlined" style="font-size:10px">${classification.icon}</span>
                            ${classification.label}
                        </span>
                    </div>`;
            } else {
                cplEl.innerHTML = `<span class="text-sm font-bold text-white">${formatCurrency(metrics.cpl, rowCurrency)}</span>`;
            }
        }
    }

    // Also update card view
    updateCardMetrics(clientId, metrics);
}

function sortOverviewBoard(field) {
    const container = document.getElementById('overviewBoardRows');
    const rows = Array.from(container.querySelectorAll('.overview-board-row'));
    if (rows.length === 0) return;

    // Alternar direcao
    if (overviewSortField === field) {
        overviewSortAsc = !overviewSortAsc;
    } else {
        overviewSortField = field;
        overviewSortAsc = true;
    }

    // Atualizar icones visuais
    document.querySelectorAll('.board-sort-col').forEach(col => {
        const icon = col.querySelector('.board-sort-icon');
        if (col.getAttribute('data-sort') === field) {
            icon.textContent = overviewSortAsc ? 'arrow_upward' : 'arrow_downward';
            col.classList.add('text-white');
        } else {
            icon.textContent = 'unfold_more';
            col.classList.remove('text-white');
        }
    });

    // Ordenar rows pelo data attribute
    rows.sort((a, b) => {
        let valA, valB;
        if (field === 'name') {
            valA = (a.getAttribute('data-name') || '').toLowerCase();
            valB = (b.getAttribute('data-name') || '').toLowerCase();
            return overviewSortAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
        }
        valA = parseFloat(a.getAttribute('data-' + field) || '0');
        valB = parseFloat(b.getAttribute('data-' + field) || '0');
        return overviewSortAsc ? valA - valB : valB - valA;
    });

    // Reordenar no DOM
    rows.forEach(row => container.appendChild(row));
}

function getClientCardState(statusData) {
    if (statusData.error) {
        return {
            isActive: false, hasError: true,
            label: 'Erro', dotColor: 'bg-slate-400',
            labelClass: 'text-slate-400 bg-slate-400/10',
            borderClass: 'border-border-dark',
            pulseAnimation: false
        };
    }

    const accountStatus = statusData.account_status;
    const hasActiveCampaigns = statusData.hasActiveCampaigns;

    // Conta desativada ou sem pagamento → sinalizar como Inativo com borda vermelha
    if (accountStatus === 2 || accountStatus === 3) {
        return {
            isActive: false, hasError: true,
            label: 'Inativo',
            dotColor: 'bg-red-500',
            labelClass: 'text-red-500 bg-red-500/10',
            borderClass: 'border-red-500',
            pulseAnimation: true
        };
    }

    // Conta em revisão ou fechada
    if (accountStatus === 7 || accountStatus === 9 || accountStatus === 101) {
        const labels = { 7: 'Em Revisao', 9: 'Periodo de Graca', 101: 'Fechada' };
        return {
            isActive: false, hasError: true,
            label: labels[accountStatus] || 'Pendente',
            dotColor: 'bg-yellow-500',
            labelClass: 'text-yellow-500 bg-yellow-500/10',
            borderClass: 'border-yellow-500',
            pulseAnimation: false
        };
    }

    // Conta ativa (status 1)
    if (accountStatus === 1) {
        // Conta pré-paga com saldo zerado → inativo
        const remainingCents = getPrepaidRemainingCents(statusData);
        if (statusData.is_prepay_account && remainingCents <= 0) {
            return {
                isActive: false, hasError: true,
                label: 'Inativo',
                dotColor: 'bg-red-500',
                labelClass: 'text-red-500 bg-red-500/10',
                borderClass: 'border-red-500',
                pulseAnimation: true
            };
        }

        if (hasActiveCampaigns) {
            return {
                isActive: true, hasError: false,
                label: 'Ativo',
                dotColor: 'bg-[#0bda5b]',
                labelClass: 'text-[#0bda5b] bg-[#0bda5b]/10',
                borderClass: 'border-[#0bda5b]',
                pulseAnimation: false
            };
        }
        return {
            isActive: false, hasError: false,
            label: 'Sem Campanhas',
            dotColor: 'bg-slate-400',
            labelClass: 'text-slate-400 bg-slate-400/10',
            borderClass: 'border-border-dark',
            pulseAnimation: false
        };
    }

    return {
        isActive: false, hasError: false,
        label: 'Desconhecido',
        dotColor: 'bg-slate-400',
        labelClass: 'text-slate-400 bg-slate-400/10',
        borderClass: 'border-border-dark',
        pulseAnimation: false
    };
}

function renderOverviewRow(client, statusData, cardState) {
    const isPrepay = statusData.is_prepay_account;
    const pulseClass = cardState.pulseAnimation ? 'overview-row-pulse' : '';

    // Calcular saldo para display e ordenacao
    let balanceCents = 0;
    let balanceDisplay;
    if (statusData.error) {
        balanceDisplay = '<span class="text-slate-500">--</span>';
    } else if (isPrepay) {
        balanceCents = getPrepaidRemainingCents(statusData);
        const balanceColor = balanceCents <= 0 ? 'text-red-400' : 'text-white';
        balanceDisplay = `<span class="${balanceColor} font-bold">${formatOverviewBalance(balanceCents, statusData.currency)}</span>`;
    } else {
        balanceCents = 999999999; // pos-pago no topo quando ordena por saldo
        balanceDisplay = '<span class="text-slate-400 flex items-center justify-end gap-1.5"><span class="material-symbols-outlined text-lg">credit_card</span><span class="text-xs font-medium">Cartao</span></span>';
    }

    return `
        <div class="overview-board-row grid grid-cols-[20px_1fr_110px_70px_140px_110px_110px] gap-x-4 items-center px-6 py-4 border-b border-border-dark/50 cursor-pointer hover:bg-white/[0.04] transition-colors group ${pulseClass}"
             data-client-id="${client.id}" data-name="${client.name}" data-spend="0" data-leads="0" data-cpl="0" data-balance="${balanceCents}"
             onclick="navigateToClient('${client.id}')">
            <div class="flex items-center justify-center">
                <span class="w-3 h-3 rounded-full ${cardState.dotColor} shrink-0"></span>
            </div>
            <div class="flex items-center gap-3 min-w-0">
                <div class="w-10 h-10 bg-${client.color}-500/15 rounded-xl flex items-center justify-center text-${client.color}-500 shrink-0">
                    <span class="material-symbols-outlined text-xl">store</span>
                </div>
                <p class="text-[13px] font-bold text-white truncate group-hover:text-primary transition-colors">${client.name}</p>
            </div>
            <div class="text-right" id="row-spend-${client.id}">
                <span class="inline-block w-20 h-5 bg-slate-700/30 rounded animate-pulse"></span>
            </div>
            <div class="text-right" id="row-leads-${client.id}">
                <span class="inline-block w-10 h-5 bg-slate-700/30 rounded animate-pulse"></span>
            </div>
            <div class="text-right" id="row-cpl-${client.id}">
                <span class="inline-block w-16 h-5 bg-slate-700/30 rounded animate-pulse"></span>
            </div>
            <div class="text-right text-[13px]">${balanceDisplay}</div>
            <div class="flex justify-center">
                <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold ${cardState.labelClass}">
                    <span class="w-2 h-2 rounded-full ${cardState.dotColor}"></span>
                    ${cardState.label}
                </span>
            </div>
        </div>
    `;
}

// Calcular saldo restante de conta pré-paga (em centavos)
// Prioridade: funding_balance (saldo real da fonte de pagamento)
// Fallback: spend_cap - amount_spent
function getPrepaidRemainingCents(statusData) {
    // funding_balance é o saldo real extraído de funding_source_details
    if (statusData.funding_balance != null && statusData.funding_balance > 0) {
        return statusData.funding_balance;
    }

    const spendCap = parseInt(statusData.spend_cap || '0');
    const amountSpent = parseInt(statusData.amount_spent || '0');

    // spend_cap - amount_spent é a melhor estimativa para pré-pago
    // IMPORTANTE: spend_cap = 0 significa "sem limite" (NÃO "zero reais")
    if (spendCap > 0) {
        return Math.max(0, spendCap - amountSpent);
    }

    // Ultimo fallback: balance (bill amount due)
    const balance = parseInt(statusData.balance || '0');
    if (balance !== 0) {
        return Math.abs(balance);
    }

    return 0;
}

function formatOverviewBalance(valueCents, currency) {
    if (valueCents === undefined || valueCents === null) return 'N/D';
    const value = Math.max(0, parseInt(valueCents)) / 100;
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: currency || 'BRL'
    }).format(value);
}

// ==========================================
// VISAO GERAL - TOGGLE BOARD/CARDS
// ==========================================

function setOverviewView(mode) {
    // Forcar cards view no mobile (board nao funciona em telas pequenas)
    const isMobile = window.innerWidth < 640;
    if (isMobile && mode === 'board') mode = 'cards';

    overviewViewMode = mode;

    const btnBoard = document.getElementById('viewBoard');
    const btnCards = document.getElementById('viewCards');
    const boardWrapper = document.getElementById('overviewBoard')?.closest('.bg-surface-dark');
    const cardsContainer = document.getElementById('overviewCardsContainer');

    // Toggle button states
    if (btnBoard && btnCards) {
        if (mode === 'board') {
            btnBoard.className = 'p-1.5 rounded-md transition-colors text-white bg-primary/20';
            btnCards.className = 'p-1.5 rounded-md transition-colors text-slate-500 hover:text-slate-300';
        } else {
            btnBoard.className = 'p-1.5 rounded-md transition-colors text-slate-500 hover:text-slate-300';
            btnCards.className = 'p-1.5 rounded-md transition-colors text-white bg-primary/20';
        }
    }

    // Toggle containers
    if (boardWrapper && cardsContainer) {
        if (mode === 'board') {
            boardWrapper.classList.remove('hidden');
            cardsContainer.classList.add('hidden');
        } else {
            boardWrapper.classList.add('hidden');
            cardsContainer.classList.remove('hidden');
            // Render cards if cache exists and cards container is empty
            if (overviewDataCache && document.getElementById('overviewCards').children.length === 0) {
                renderOverviewCards();
            }
        }
    }
}

function renderOverviewCards() {
    const container = document.getElementById('overviewCards');
    if (!container || !overviewDataCache) return;

    container.innerHTML = '';
    const { clients, statusMap } = overviewDataCache;

    clients.forEach((client, idx) => {
        const formattedId = client.adAccountId.startsWith('act_') ? client.adAccountId : `act_${client.adAccountId}`;
        const statusData = statusMap.get(formattedId) || { error: true };
        const cardState = getClientCardState(statusData);

        const isPrepay = statusData.is_prepay_account;
        const pulseClass = cardState.pulseAnimation ? 'overview-card-pulse' : '';

        // Balance
        let balanceHTML;
        if (statusData.error) {
            balanceHTML = '<span class="text-slate-500 text-sm">--</span>';
        } else if (isPrepay) {
            const balanceCents = getPrepaidRemainingCents(statusData);
            const balanceColor = balanceCents <= 0 ? 'text-red-400' : 'text-white';
            balanceHTML = `<span class="${balanceColor} text-sm font-bold">${formatOverviewBalance(balanceCents, statusData.currency)}</span>`;
        } else {
            balanceHTML = '<span class="text-slate-400 flex items-center gap-1"><span class="material-symbols-outlined text-sm">credit_card</span><span class="text-xs">Cartao</span></span>';
        }

        // Status border color
        const borderColor = cardState.dotColor.replace('bg-', 'border-l-');

        container.insertAdjacentHTML('beforeend', `
            <div class="overview-client-card overview-card-enter bg-surface-dark border border-border-dark rounded-xl overflow-hidden cursor-pointer group ${pulseClass}"
                 data-client-id="${client.id}" style="--delay:${idx}"
                 onclick="navigateToClient('${client.id}')">
                <!-- Status accent -->
                <div class="h-1 ${cardState.dotColor}"></div>

                <div class="p-4">
                    <!-- Header: Avatar + Name + Badge -->
                    <div class="flex items-center gap-3 mb-4">
                        <div class="w-10 h-10 bg-${client.color}-500/15 rounded-xl flex items-center justify-center text-${client.color}-500 shrink-0">
                            <span class="material-symbols-outlined text-xl">store</span>
                        </div>
                        <div class="flex-1 min-w-0">
                            <p class="text-sm font-bold text-white truncate group-hover:text-primary transition-colors">${client.name}</p>
                        </div>
                        <span class="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-bold ${cardState.labelClass} shrink-0">
                            <span class="w-1.5 h-1.5 rounded-full ${cardState.dotColor}"></span>
                            ${cardState.label}
                        </span>
                    </div>

                    <!-- Metrics 2x2 Grid -->
                    <div class="grid grid-cols-2 gap-2">
                        <div class="bg-background-dark rounded-lg p-2.5" id="card-spend-${client.id}">
                            <p class="text-[9px] text-slate-500 uppercase tracking-wider mb-1">Investido</p>
                            <span class="inline-block w-16 h-4 bg-slate-700/30 rounded animate-pulse"></span>
                        </div>
                        <div class="bg-background-dark rounded-lg p-2.5" id="card-leads-${client.id}">
                            <p class="text-[9px] text-slate-500 uppercase tracking-wider mb-1">Leads</p>
                            <span class="inline-block w-10 h-4 bg-slate-700/30 rounded animate-pulse"></span>
                        </div>
                        <div class="bg-background-dark rounded-lg p-2.5" id="card-cpl-${client.id}">
                            <p class="text-[9px] text-slate-500 uppercase tracking-wider mb-1">CPL</p>
                            <span class="inline-block w-14 h-4 bg-slate-700/30 rounded animate-pulse"></span>
                        </div>
                        <div class="bg-background-dark rounded-lg p-2.5">
                            <p class="text-[9px] text-slate-500 uppercase tracking-wider mb-1">Saldo</p>
                            ${balanceHTML}
                        </div>
                    </div>
                </div>
            </div>
        `);
    });
}

function updateCardMetrics(clientId, metrics) {
    const cardSpend = document.getElementById(`card-spend-${clientId}`);
    const cardLeads = document.getElementById(`card-leads-${clientId}`);
    const cardCpl = document.getElementById(`card-cpl-${clientId}`);

    if (!cardSpend && !cardLeads && !cardCpl) return;

    if (!metrics) {
        if (cardSpend) cardSpend.innerHTML = '<p class="text-[9px] text-slate-500 uppercase tracking-wider mb-1">Investido</p><span class="text-sm text-slate-500">--</span>';
        if (cardLeads) cardLeads.innerHTML = '<p class="text-[9px] text-slate-500 uppercase tracking-wider mb-1">Leads</p><span class="text-sm text-slate-500">--</span>';
        if (cardCpl) cardCpl.innerHTML = '<p class="text-[9px] text-slate-500 uppercase tracking-wider mb-1">CPL</p><span class="text-sm text-slate-500">--</span>';
        return;
    }

    var cardCurrency = metrics._currency || 'BRL';
    if (cardSpend) {
        cardSpend.innerHTML = `<p class="text-[9px] text-slate-500 uppercase tracking-wider mb-1">Investido</p><p class="text-sm font-bold text-white">${formatCurrency(metrics.spend, cardCurrency)}</p>`;
    }
    if (cardLeads) {
        cardLeads.innerHTML = `<p class="text-[9px] text-slate-500 uppercase tracking-wider mb-1">Leads</p><p class="text-sm font-bold text-white">${formatNumber(metrics.leads)}</p>`;
    }
    if (cardCpl) {
        if (metrics.cpl <= 0) {
            cardCpl.innerHTML = '<p class="text-[9px] text-slate-500 uppercase tracking-wider mb-1">CPL</p><span class="text-sm text-slate-500">--</span>';
        } else {
            const client = clientsCache.find(c => c.id === clientId);
            const classification = client?.cplTargets ? classifyCpl(metrics.cpl, client.cplTargets) : null;
            if (classification) {
                cardCpl.innerHTML = `
                    <p class="text-[9px] text-slate-500 uppercase tracking-wider mb-1">CPL</p>
                    <p class="text-sm font-bold text-${classification.color}-400">${formatCurrency(metrics.cpl, cardCurrency)}</p>
                    <span class="inline-flex items-center gap-0.5 px-1 py-px rounded text-[8px] font-bold bg-${classification.color}-500/10 text-${classification.color}-400 mt-0.5">
                        <span class="material-symbols-outlined" style="font-size:9px">${classification.icon}</span>
                        ${classification.label}
                    </span>`;
            } else {
                cardCpl.innerHTML = `<p class="text-[9px] text-slate-500 uppercase tracking-wider mb-1">CPL</p><p class="text-sm font-bold text-white">${formatCurrency(metrics.cpl, cardCurrency)}</p>`;
            }
        }
    }
}

function updateOverviewSummary(total, active, problems) {
    const totalEl = document.getElementById('overviewTotalClients');
    const activeEl = document.getElementById('overviewActiveClients');
    const problemEl = document.getElementById('overviewProblemClients');

    if (totalEl) totalEl.textContent = total;
    if (activeEl) activeEl.textContent = active;
    if (problemEl) problemEl.textContent = problems;
}

function updateOverviewKPIs(accum) {
    const spendEl = document.getElementById('overviewTotalSpend');
    const leadsEl = document.getElementById('overviewTotalLeads');
    const cplEl = document.getElementById('overviewAvgCpl');

    if (!accum) {
        if (spendEl) spendEl.textContent = '--';
        if (leadsEl) leadsEl.textContent = '--';
        if (cplEl) cplEl.textContent = '--';
        return;
    }

    // Se todas as contas usam a mesma moeda, formatar com ela; senão, usar BRL como default
    var overviewCur = (accum.currencies && accum.currencies.length === 1) ? accum.currencies[0] : 'BRL';
    if (spendEl) spendEl.textContent = formatCurrency(accum.totalSpend, overviewCur);
    if (leadsEl) leadsEl.textContent = formatNumber(accum.totalLeads);
    if (cplEl) {
        if (accum.totalLeads > 0) {
            cplEl.textContent = formatCurrency(accum.totalSpend / accum.totalLeads, overviewCur);
        } else {
            cplEl.textContent = accum.totalSpend > 0 ? '--' : '--';
        }
    }
}

function navigateToClient(clientId) {
    // Mudar para painel de métricas
    switchPanel('metricas');

    // Selecionar o cliente no dropdown
    const clientFilter = document.getElementById('clientFilter');
    if (clientFilter) {
        clientFilter.value = clientId;
        onClientFilterChange();
    }
}

// ==========================================
// FUNÇÕES DA SIDEBAR
// ==========================================

function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    sidebar.classList.toggle('open');
    overlay.classList.toggle('open');
    document.body.classList.toggle('overflow-hidden', sidebar.classList.contains('open'));
}

// ==========================================
// EVENT LISTENERS
// ==========================================

// Event listener para botões de filtro do gráfico
document.addEventListener('click', function(e) {
    if (e.target.classList.contains('chart-filter-btn')) {
        // Remover active de todos
        document.querySelectorAll('.chart-filter-btn').forEach(btn => {
            btn.classList.remove('bg-primary', 'text-white', 'shadow-lg');
            btn.classList.add('text-slate-500');
        });

        // Adicionar active ao clicado
        e.target.classList.add('bg-primary', 'text-white', 'shadow-lg');
        e.target.classList.remove('text-slate-500');

        // Atualizar gráfico
        const metric = e.target.dataset.metric;
        if (currentDashboardData && currentDashboardData.daily) {
            updateChart(currentDashboardData.daily, metric);
        }
    }
});

// Inicializar ao carregar a página
document.addEventListener('DOMContentLoaded', function() {
    // Verificar status de login
    checkLoginStatus();

    // Verificar deep link para auto-report (?autoReport=clientId&period=last_7d)
    handleAutoReportLink();
});

function handleAutoReportLink() {
    const params = new URLSearchParams(window.location.search);
    const clientId = params.get('autoReport');
    const period = params.get('period');

    if (!clientId) {
        // Verificar se tem pendente no sessionStorage (apos login)
        const pending = sessionStorage.getItem('pendingAutoReport');
        if (pending) {
            sessionStorage.removeItem('pendingAutoReport');
            const data = JSON.parse(pending);
            executeAutoReport(data.clientId, data.period);
        }
        return;
    }

    // Limpar URL
    window.history.replaceState({}, '', window.location.pathname);

    if (currentUser) {
        // Ja logado — executar direto
        executeAutoReport(clientId, period);
    } else {
        // Nao logado — salvar para executar apos login
        sessionStorage.setItem('pendingAutoReport', JSON.stringify({ clientId, period }));
    }
}

async function executeAutoReport(clientId, period) {
    // Esperar clientes carregarem
    let attempts = 0;
    while (clientsCache.length === 0 && attempts < 30) {
        await new Promise(r => setTimeout(r, 500));
        attempts++;
    }

    const client = clientsCache.find(c => c.id === clientId);
    if (!client) {
        showToast('Cliente nao encontrado para gerar relatorio', 'error');
        return;
    }

    // Navegar para aba Relatorios
    switchPanel('relatorios');

    // Popular o filtro de clientes do relatorio e aguardar
    if (typeof populateReportClientFilter === 'function') {
        await populateReportClientFilter();
    }

    await new Promise(r => setTimeout(r, 300));

    // Selecionar cliente
    const reportClientFilter = document.getElementById('reportClientFilter');
    if (!reportClientFilter) return;

    reportClientFilter.value = clientId;
    if (typeof onReportClientChange === 'function') onReportClientChange();

    // Selecionar periodo
    if (period) {
        const reportPeriodFilter = document.getElementById('reportPeriodFilter');
        if (reportPeriodFilter) {
            reportPeriodFilter.value = period;
            if (typeof onReportPeriodChange === 'function') onReportPeriodChange();
        }
    }

    // Gerar relatorio
    await new Promise(r => setTimeout(r, 300));
    if (typeof generateReport !== 'function') return;

    showToast('Gerando relatorio PDF...', 'info');
    await generateReport();

    // Exportar PDF automaticamente
    await new Promise(r => setTimeout(r, 500));
    if (typeof exportReportPDF === 'function' && reportPreviewData) {
        await exportReportPDF();
    }
}

// Fechar modais com ESC
document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape') {
        closePasswordModal();
        closeClientsModal();
    }
});

// Fechar sidebar ao redimensionar para desktop
window.addEventListener('resize', function() {
    if (window.innerWidth >= 1024) {
        const sidebar = document.getElementById('sidebar');
        const overlay = document.getElementById('sidebarOverlay');
        sidebar.classList.remove('open');
        overlay.classList.remove('open');
        document.body.classList.remove('overflow-hidden');
    }
});

// Efeito de sombra no header ao rolar
document.addEventListener('DOMContentLoaded', function() {
    const mainContent = document.querySelector('main');
    const header = document.querySelector('header');

    if (mainContent && header) {
        mainContent.addEventListener('scroll', function() {
            if (mainContent.scrollTop > 10) {
                header.classList.add('scrolled');
            } else {
                header.classList.remove('scrolled');
            }
        });
    }
});

// Forcar cards view no mobile ao redimensionar
window.addEventListener('resize', function() {
    if (window.innerWidth < 640 && overviewViewMode === 'board') {
        setOverviewView('cards');
    }
});

// ==========================================
// ANÁLISE DE CRIATIVOS
// ==========================================

let creativesDataCache = [];
let campaignsDataCache = [];
let analysisTab = null;
let creativesOffset = 0;
let creativesTotal = 0;
let creativesCampaignFilter = null;
let creativesCampaignName = null;

// ---- Abas de análise ----

function switchAnalysisTab(tab) {
    if (analysisTab === tab && !creativesCampaignFilter) return;

    analysisTab = tab;
    creativesCampaignFilter = null;
    creativesCampaignName = null;

    // Atualizar visual das abas
    const tabCampaigns = document.getElementById('tabCampaigns');
    const tabCreatives = document.getElementById('tabCreatives');
    const tabAnalyst = document.getElementById('tabAnalyst');
    const activeClass = 'bg-primary/10 text-white';
    const inactiveClass = 'text-slate-400 hover:text-white';
    const base = 'analysis-tab-btn flex items-center justify-center gap-1.5 px-2.5 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-semibold rounded-md transition-colors flex-1 sm:flex-initial';
    tabCampaigns.className = `${base} ${tab === 'campaigns' ? activeClass : inactiveClass}`;
    tabCreatives.className = `${base} ${tab === 'creatives' ? activeClass : inactiveClass}`;
    tabAnalyst.className = `${base} ${tab === 'analyst' ? activeClass : inactiveClass}`;

    // Mostrar seção
    document.getElementById('analysisSection').classList.remove('hidden');

    if (tab === 'campaigns') {
        updateBreadcrumb([{ label: 'Campanhas' }]);
        loadCampaignAnalysis();
    } else if (tab === 'creatives') {
        updateBreadcrumb([{ label: 'Criativos' }]);
        creativesOffset = 0;
        loadCreatives();
    } else if (tab === 'analyst') {
        updateBreadcrumb([{ label: 'Analista' }]);
        loadAnalystReport();
    }
}

function updateBreadcrumb(items) {
    const bc = document.getElementById('analysisBreadcrumb');
    bc.innerHTML = items.map((item, i) => {
        const isLast = i === items.length - 1;
        if (item.onClick && !isLast) {
            return `<span class="text-slate-400 hover:text-white cursor-pointer transition-colors" onclick="${item.onClick}">${item.label}</span>
                    <span class="material-symbols-outlined text-slate-600 text-sm">chevron_right</span>`;
        }
        return `<h3 class="font-bold text-white">${item.label}</h3>`;
    }).join('');
}

function closeAnalysis() {
    document.getElementById('analysisSection').classList.add('hidden');
    analysisTab = null;
    creativesCampaignFilter = null;
    // Resetar visual das abas
    document.getElementById('tabCampaigns').className = 'flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-md transition-colors text-slate-400 hover:text-white';
    document.getElementById('tabCreatives').className = 'flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-md transition-colors text-slate-400 hover:text-white';
}

// ---- Análise de Campanhas ----

async function loadCampaignAnalysis() {
    if (!currentAdAccountId) return;

    const loading = document.getElementById('analysisLoading');
    const content = document.getElementById('analysisContent');
    loading.classList.remove('hidden');
    content.innerHTML = '';

    try {
        const baseUrl = window.location.hostname === 'localhost' ? 'http://localhost:8888' : '';
        let url = `${baseUrl}/.netlify/functions/meta-ads?adAccountId=${encodeURIComponent(currentAdAccountId)}&action=campaign-analysis`;
        url += buildPeriodParam();

        const response = await fetch(url);
        const result = await response.json();

        if (!response.ok || result.error) {
            throw new Error(result.message || 'Erro ao buscar campanhas');
        }

        loading.classList.add('hidden');
        campaignsDataCache = result.campaigns || [];
        renderCampaignList(campaignsDataCache);

    } catch (error) {
        console.error('Erro ao carregar campanhas:', error);
        loading.classList.add('hidden');
        content.innerHTML = `
            <div class="flex flex-col items-center justify-center py-8 text-slate-500">
                <span class="material-symbols-outlined text-4xl mb-2">error_outline</span>
                <p class="text-sm">${error.message}</p>
            </div>
        `;
    }
}

function renderCampaignList(campaigns) {
    const content = document.getElementById('analysisContent');

    if (campaigns.length === 0) {
        content.innerHTML = `
            <div class="flex flex-col items-center justify-center py-12 text-slate-500">
                <span class="material-symbols-outlined text-5xl mb-3 opacity-50">campaign</span>
                <p class="text-sm">Nenhuma campanha encontrada no período</p>
            </div>
        `;
        return;
    }

    const totalSpend = campaigns.reduce((s, c) => s + c.metrics.spend, 0);
    const totalLeads = campaigns.reduce((s, c) => s + c.metrics.leads, 0);
    const avgCpl = totalLeads > 0 ? totalSpend / totalLeads : 0;
    const activeCount = campaigns.filter(c => c.status === 'ACTIVE').length;

    content.innerHTML = `
        <div class="flex flex-wrap items-center gap-3 mb-5 text-xs text-slate-400">
            <span class="font-semibold text-slate-300">${campaigns.length} campanhas</span>
            <span class="w-px h-3.5 bg-slate-700"></span>
            <span>${activeCount} ativas</span>
            <span class="w-px h-3.5 bg-slate-700"></span>
            <span>Investimento: <strong class="text-white">${formatCurrency(totalSpend)}</strong></span>
            <span class="w-px h-3.5 bg-slate-700"></span>
            <span>CPL médio: <strong class="text-white">${totalLeads > 0 ? formatCurrency(avgCpl) : '—'}</strong></span>
        </div>
        <div class="space-y-3">
            ${campaigns.map(c => renderCampaignCard(c)).join('')}
        </div>
    `;
}

function renderCampaignCard(campaign) {
    const { id, name, objective, status, metrics, createdTime, activeAdsCount, conversionType } = campaign;

    const isActive = status === 'ACTIVE';
    const statusDot = isActive ? 'bg-emerald-400' : 'bg-slate-500';

    const objLabel = (objective === 'OUTCOME_LEADS' || objective === 'LEAD_GENERATION')
        ? 'Leads' : 'Mensagens';
    const objBadge = objLabel === 'Leads'
        ? '<span class="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 leading-none">LEADS</span>'
        : '<span class="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 leading-none">MENSAGENS</span>';

    const activeDays = getActiveDays(createdTime);
    const activeDaysText = activeDays !== null ? `${activeDays}d` : '—';
    const frequency = metrics.reach > 0 ? (metrics.impressions / metrics.reach).toFixed(1) : '—';

    const cplValue = metrics.leads > 0 ? formatCurrency(metrics.cpl) : '—';
    const cplColor = metrics.leads > 0 ? 'text-white' : 'text-slate-500';
    const ctrClass = classifyMetric('ctr', metrics.ctr);

    return `
        <div class="bg-background-dark border border-border-dark rounded-xl p-4 hover:border-slate-600 transition-colors cursor-pointer" onclick="viewCampaignCreatives('${id}', '${name.replace(/'/g, "\\'")}')">
            <div class="flex items-start gap-3.5">
                <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2 mb-1.5 flex-wrap">
                        <span class="w-1.5 h-1.5 rounded-full ${statusDot} shrink-0"></span>
                        ${objBadge}
                        <span class="text-[10px] text-slate-500 shrink-0">
                            <span class="material-symbols-outlined text-[11px] align-middle">schedule</span>
                            ${activeDaysText}
                        </span>
                        <span class="text-[10px] text-slate-500 shrink-0">
                            <span class="material-symbols-outlined text-[11px] align-middle">repeat</span>
                            ${frequency}x
                        </span>
                        <span class="text-[10px] text-slate-500 shrink-0">
                            <span class="material-symbols-outlined text-[11px] align-middle">photo_library</span>
                            ${activeAdsCount} criativos
                        </span>
                    </div>
                    <p class="text-[13px] font-semibold text-slate-200 leading-snug line-clamp-2 mb-2">${name}</p>
                    <div class="flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
                        <div>
                            <span class="text-slate-500">Gasto</span>
                            <span class="text-white font-semibold ml-1">${formatCurrency(metrics.spend)}</span>
                        </div>
                        <div>
                            <span class="text-slate-500">Leads</span>
                            <span class="text-white font-semibold ml-1">${formatNumber(metrics.leads)}</span>
                        </div>
                        <div>
                            <span class="text-slate-500">Impr.</span>
                            <span class="text-slate-300 font-medium ml-1">${formatNumber(metrics.impressions)}</span>
                        </div>
                        <div>
                            <span class="text-slate-500">CTR</span>
                            <span class="font-semibold ml-1 ${ctrClass.colorClass}">${metrics.ctr.toFixed(2)}%</span>
                        </div>
                    </div>
                </div>
                <div class="shrink-0 text-right pl-2">
                    <span class="text-[10px] text-slate-500 block mb-0.5">CPL</span>
                    <span class="text-lg font-bold ${cplColor} leading-none">${cplValue}</span>
                </div>
            </div>
        </div>
    `;
}

function viewCampaignCreatives(campaignId, campaignName) {
    creativesCampaignFilter = campaignId;
    creativesCampaignName = campaignName;
    creativesOffset = 0;
    updateBreadcrumb([
        { label: 'Campanhas', onClick: 'backToCampaigns()' },
        { label: campaignName }
    ]);
    loadCreatives();
}

function backToCampaigns() {
    creativesCampaignFilter = null;
    creativesCampaignName = null;
    updateBreadcrumb([{ label: 'Campanhas' }]);
    renderCampaignList(campaignsDataCache);
}

// ---- Análise de Criativos (com paginação) ----

function buildPeriodParam() {
    if (currentDateRange) {
        const timeRange = JSON.stringify({ since: currentDateRange.start, until: currentDateRange.end });
        return `&timeRange=${encodeURIComponent(timeRange)}`;
    } else {
        const dateRange = getDateRangeForAPI();
        if (dateRange.usePreset) {
            return `&datePreset=${dateRange.preset}`;
        } else {
            const timeRange = JSON.stringify({ since: dateRange.since, until: dateRange.until });
            return `&timeRange=${encodeURIComponent(timeRange)}`;
        }
    }
}

async function loadCreatives() {
    if (!currentAdAccountId) return;

    const loading = document.getElementById('analysisLoading');
    const content = document.getElementById('analysisContent');

    if (creativesOffset === 0) {
        loading.classList.remove('hidden');
        content.innerHTML = '';
    }

    try {
        const baseUrl = window.location.hostname === 'localhost' ? 'http://localhost:8888' : '';
        let url = `${baseUrl}/.netlify/functions/meta-ads?adAccountId=${encodeURIComponent(currentAdAccountId)}&action=ad-creatives`;
        url += `&limit=10&offset=${creativesOffset}`;

        if (creativesCampaignFilter) {
            url += `&campaignId=${encodeURIComponent(creativesCampaignFilter)}`;
        } else {
            const campaignFilter = document.getElementById('campaignFilter');
            const adsetFilter = document.getElementById('adsetFilter');
            if (campaignFilter?.value) url += `&campaignId=${encodeURIComponent(campaignFilter.value)}`;
            if (adsetFilter?.value) url += `&adsetId=${encodeURIComponent(adsetFilter.value)}`;
        }

        url += buildPeriodParam();

        const response = await fetch(url);
        const result = await response.json();

        if (!response.ok || result.error) {
            throw new Error(result.message || 'Erro ao buscar criativos');
        }

        loading.classList.add('hidden');
        const newCreatives = result.creatives || [];
        creativesTotal = result.total || newCreatives.length;
        const hasMore = result.hasMore || false;

        if (creativesOffset === 0) {
            creativesDataCache = newCreatives;
        } else {
            creativesDataCache = [...creativesDataCache, ...newCreatives];
        }

        renderCreatives(creativesDataCache, creativesTotal, hasMore);

    } catch (error) {
        console.error('Erro ao carregar criativos:', error);
        loading.classList.add('hidden');
        if (creativesOffset === 0) {
            content.innerHTML = `
                <div class="flex flex-col items-center justify-center py-8 text-slate-500">
                    <span class="material-symbols-outlined text-4xl mb-2">error_outline</span>
                    <p class="text-sm">${error.message}</p>
                </div>
            `;
        }
    }
}

function loadMoreCreatives() {
    creativesOffset += 10;
    loadCreatives();
}

function renderCreatives(creatives, total, hasMore) {
    const content = document.getElementById('analysisContent');

    if (creatives.length === 0) {
        content.innerHTML = `
            <div class="flex flex-col items-center justify-center py-12 text-slate-500">
                <span class="material-symbols-outlined text-5xl mb-3 opacity-50">image_not_supported</span>
                <p class="text-sm">Nenhum criativo encontrado no período</p>
            </div>
        `;
        return;
    }

    const videoCount = creatives.filter(c => c.isVideo).length;
    const imageCount = creatives.length - videoCount;

    content.innerHTML = `
        <div class="flex flex-wrap items-center gap-3 mb-5 text-xs text-slate-400">
            <span class="font-semibold text-slate-300">Exibindo ${creatives.length} de ${total} criativos</span>
            <span class="w-px h-3.5 bg-slate-700"></span>
            <span>${videoCount} vídeos</span>
            <span class="w-px h-3.5 bg-slate-700"></span>
            <span>${imageCount} imagens</span>
        </div>
        <div class="space-y-3">
            ${creatives.map(creative => renderCreativeCard(creative)).join('')}
        </div>
        ${hasMore ? `
            <div class="flex justify-center mt-4">
                <button onclick="loadMoreCreatives()" class="flex items-center gap-2 px-5 py-2.5 bg-background-dark border border-border-dark text-slate-300 rounded-lg text-sm font-semibold hover:bg-slate-800 hover:text-white hover:border-slate-600 transition-colors">
                    <span class="material-symbols-outlined text-base">expand_more</span>
                    Carregar mais
                </button>
            </div>
        ` : ''}
    `;
}

function getActiveDays(createdTime) {
    if (!createdTime) return null;
    const created = new Date(createdTime);
    const now = new Date();
    const diffMs = now - created;
    return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

function renderCreativeCard(creative) {
    const { name, isVideo, thumbnailUrl, metrics, videoMetrics, status, createdTime } = creative;

    // Dias ativo
    const activeDays = getActiveDays(createdTime);
    const activeDaysText = activeDays !== null ? `${activeDays}d` : '—';

    // Status
    const isActive = status === 'ACTIVE';
    const statusDot = isActive
        ? 'bg-emerald-400'
        : 'bg-slate-500';
    const statusText = isActive ? 'Ativo' : 'Inativo';

    // Tipo badge
    const typeBadge = isVideo
        ? '<span class="text-[10px] font-bold px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400 leading-none">VIDEO</span>'
        : '<span class="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 leading-none">IMG</span>';

    // CPL destaque
    const cplValue = metrics.leads > 0 ? formatCurrency(metrics.cpl) : '—';
    const cplColor = metrics.leads > 0 ? 'text-white' : 'text-slate-500';

    // Thumbnail compacto
    const thumb = thumbnailUrl
        ? `<img src="${thumbnailUrl}" alt="" class="w-14 h-14 sm:w-16 sm:h-16 object-cover rounded-lg shrink-0">`
        : `<div class="w-14 h-14 sm:w-16 sm:h-16 bg-slate-800/60 rounded-lg flex items-center justify-center shrink-0">
             <span class="material-symbols-outlined text-xl text-slate-600">${isVideo ? 'videocam' : 'image'}</span>
           </div>`;

    // Métricas de vídeo (barra horizontal com badges de classificação)
    let videoSection = '';
    if (isVideo && videoMetrics) {
        const hookClass = classifyMetric('hookRate', videoMetrics.hookRate);
        const retentionClass = classifyMetric('retention', videoMetrics.retention);
        const holdClass = classifyMetric('holdRate', videoMetrics.holdRate);
        const avgTimeClass = classifyMetric('avgWatchTime', videoMetrics.avgWatchTime);

        videoSection = `
            <div class="mt-2.5 pt-2.5 border-t border-slate-800/80">
                <div class="flex flex-wrap gap-x-5 gap-y-1.5 text-[11px]">
                    <div class="flex items-center gap-1.5">
                        <span class="text-slate-500">Hook</span>
                        <span class="font-bold ${hookClass.colorClass}">${videoMetrics.hookRate.toFixed(1)}%</span>
                        <span class="text-[9px] font-bold ${hookClass.badgeBg} px-1 py-px rounded leading-none">${hookClass.label}</span>
                    </div>
                    <div class="flex items-center gap-1.5">
                        <span class="text-slate-500">Retenção</span>
                        <span class="font-bold ${retentionClass.colorClass}">${videoMetrics.retention.toFixed(1)}%</span>
                        <span class="text-[9px] font-bold ${retentionClass.badgeBg} px-1 py-px rounded leading-none">${retentionClass.label}</span>
                    </div>
                    <div class="flex items-center gap-1.5">
                        <span class="text-slate-500">Tempo</span>
                        <span class="font-bold ${avgTimeClass.colorClass}">${videoMetrics.avgWatchTime.toFixed(1)}s</span>
                        <span class="text-[9px] font-bold ${avgTimeClass.badgeBg} px-1 py-px rounded leading-none">${avgTimeClass.label}</span>
                    </div>
                    <div class="flex items-center gap-1.5">
                        <span class="text-slate-500">Hold</span>
                        <span class="font-bold ${holdClass.colorClass}">${videoMetrics.holdRate.toFixed(1)}%</span>
                        <span class="text-[9px] font-bold ${holdClass.badgeBg} px-1 py-px rounded leading-none">${holdClass.label}</span>
                    </div>
                </div>
            </div>
        `;
    }

    const ctrClass = classifyMetric('ctr', metrics.ctr);

    return `
        <div class="bg-background-dark border border-border-dark rounded-xl p-4 hover:border-slate-600 transition-colors cursor-pointer" onclick="openCreativeModal('${creative.id}')">
            <!-- Linha principal: thumb + nome + métricas -->
            <div class="flex items-start gap-3.5">
                ${thumb}
                <div class="flex-1 min-w-0">
                    <!-- Nome + badges -->
                    <div class="flex items-center gap-2 mb-1.5">
                        <span class="w-1.5 h-1.5 rounded-full ${statusDot} shrink-0"></span>
                        ${typeBadge}
                        <span class="text-[10px] text-slate-500 shrink-0">
                            <span class="material-symbols-outlined text-[11px] align-middle">schedule</span>
                            ${activeDaysText}
                        </span>
                        <span class="text-[10px] text-slate-500 shrink-0">
                            <span class="material-symbols-outlined text-[11px] align-middle">repeat</span>
                            ${metrics.reach > 0 ? (metrics.impressions / metrics.reach).toFixed(1) : '—'}x
                        </span>
                    </div>
                    <p class="text-[13px] font-semibold text-slate-200 leading-snug line-clamp-2 mb-2">${name}</p>

                    <!-- Métricas em linha compacta -->
                    <div class="flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
                        <div>
                            <span class="text-slate-500">Gasto</span>
                            <span class="text-white font-semibold ml-1">${formatCurrency(metrics.spend)}</span>
                        </div>
                        <div>
                            <span class="text-slate-500">Leads</span>
                            <span class="text-white font-semibold ml-1">${formatNumber(metrics.leads)}</span>
                        </div>
                        <div>
                            <span class="text-slate-500">Impr.</span>
                            <span class="text-slate-300 font-medium ml-1">${formatNumber(metrics.impressions)}</span>
                        </div>
                        <div>
                            <span class="text-slate-500">Cliques</span>
                            <span class="text-slate-300 font-medium ml-1">${formatNumber(metrics.linkClicks)}</span>
                        </div>
                        <div>
                            <span class="text-slate-500">CTR</span>
                            <span class="font-semibold ml-1 ${ctrClass.colorClass}">${metrics.ctr.toFixed(2)}%</span>
                        </div>
                    </div>
                </div>

                <!-- CPL em destaque -->
                <div class="shrink-0 text-right pl-2">
                    <span class="text-[10px] text-slate-500 block mb-0.5">CPL</span>
                    <span class="text-lg font-bold ${cplColor} leading-none">${cplValue}</span>
                </div>
            </div>

            ${videoSection}
        </div>
    `;
}

function classifyMetric(indicator, value) {
    const thresholds = {
        hookRate: { bad: 17, ok: 35 },
        retention: { bad: 15, ok: 30 },
        holdRate: { bad: 60, ok: 75 },
        ctr: { bad: 0.7, ok: 1.5 },
        avgWatchTime: { bad: 2, ok: 4 }
    };

    const t = thresholds[indicator];
    if (!t) return { label: '', colorClass: 'text-white', badgeBg: '' };

    if (value < t.bad) {
        return { label: 'Ruim', colorClass: 'text-red-400', badgeBg: 'bg-red-400/10 text-red-400' };
    } else if (value <= t.ok) {
        return { label: 'Razoável', colorClass: 'text-yellow-400', badgeBg: 'bg-yellow-400/10 text-yellow-400' };
    } else {
        return { label: 'Bom', colorClass: 'text-emerald-400', badgeBg: 'bg-emerald-400/10 text-emerald-400' };
    }
}

// ==========================================
// AGENTE ANALISTA (MOTOR DE REGRAS)
// ==========================================

async function loadAnalystReport() {
    if (!currentAdAccountId) return;

    const loading = document.getElementById('analysisLoading');
    const content = document.getElementById('analysisContent');
    loading.classList.remove('hidden');
    content.innerHTML = '';

    try {
        // Reutilizar cache ou buscar dados de campanhas
        if (campaignsDataCache.length === 0) {
            const baseUrl = window.location.hostname === 'localhost' ? 'http://localhost:8888' : '';
            let url = `${baseUrl}/.netlify/functions/meta-ads?adAccountId=${encodeURIComponent(currentAdAccountId)}&action=campaign-analysis`;
            url += buildPeriodParam();

            const response = await fetch(url);
            const result = await response.json();

            if (!response.ok || result.error) {
                throw new Error(result.message || 'Erro ao buscar campanhas');
            }
            campaignsDataCache = result.campaigns || [];
        }

        // Aplicar filtros ativos (campanha/conjunto) sobre o cache
        const campaignFilterEl = document.getElementById('campaignFilter');
        const adsetFilterEl = document.getElementById('adsetFilter');
        const selectedCampaignId = campaignFilterEl ? campaignFilterEl.value : '';
        const selectedAdsetId = adsetFilterEl ? adsetFilterEl.value : '';

        let filteredCampaigns = campaignsDataCache;
        let filterScope = null; // null = conta inteira

        if (selectedCampaignId) {
            filteredCampaigns = campaignsDataCache.filter(c => c.id === selectedCampaignId);
            const campaignName = campaignFilterEl.options[campaignFilterEl.selectedIndex]?.textContent || '';
            filterScope = { type: 'campaign', label: campaignName };
        }

        loading.classList.add('hidden');

        const cplTargets = getCurrentClientCplTargets();
        const diagnostics = runAnalysisEngine(filteredCampaigns, cplTargets);
        renderAnalystReport(diagnostics, cplTargets, filteredCampaigns, filterScope);

    } catch (error) {
        console.error('Erro ao gerar analise:', error);
        loading.classList.add('hidden');
        content.innerHTML = `
            <div class="flex flex-col items-center justify-center py-8 text-slate-500">
                <span class="material-symbols-outlined text-4xl mb-2">error_outline</span>
                <p class="text-sm">${error.message}</p>
            </div>
        `;
    }
}

function runAnalysisEngine(campaigns, cplTargets) {
    const result = { diagnostics: [], scenario: [], strategy: [], scaling: [] };
    if (campaigns.length === 0) return result;

    const totalSpend = campaigns.reduce((s, c) => s + c.metrics.spend, 0);
    const totalLeads = campaigns.reduce((s, c) => s + c.metrics.leads, 0);
    const totalImpressions = campaigns.reduce((s, c) => s + c.metrics.impressions, 0);
    const totalReach = campaigns.reduce((s, c) => s + c.metrics.reach, 0);
    const avgCpl = totalLeads > 0 ? totalSpend / totalLeads : 0;
    const avgCtr = totalImpressions > 0 ? campaigns.reduce((s, c) => s + c.metrics.ctr * c.metrics.impressions, 0) / totalImpressions : 0;
    const avgFreq = totalReach > 0 ? totalImpressions / totalReach : 0;
    const activeCampaigns = campaigns.filter(c => c.status === 'ACTIVE');
    const withLeads = campaigns.filter(c => c.metrics.leads > 0 && c.metrics.spend > 0);
    withLeads.sort((a, b) => a.metrics.cpl - b.metrics.cpl);

    // ==================================================
    // SECAO 1: ANALISE DO CENARIO ATUAL
    // ==================================================

    // Resumo executivo
    result.scenario.push({
        icon: 'summarize',
        title: 'Resumo executivo',
        text: `Investimento total de ${formatCurrency(totalSpend)} distribuido em ${campaigns.length} campanha(s) (${activeCampaigns.length} ativa(s)), gerando ${formatNumber(totalLeads)} lead(s) com CPL medio de ${totalLeads > 0 ? formatCurrency(avgCpl) : '—'}. CTR medio ponderado: ${avgCtr.toFixed(2)}%. Frequencia geral: ${avgFreq.toFixed(1)}x.`
    });

    // Eficiencia do investimento
    if (totalLeads > 0 && totalSpend > 0) {
        const costPerImpression = (totalSpend / totalImpressions) * 1000;
        result.scenario.push({
            icon: 'speed',
            title: 'Eficiencia do investimento',
            text: `CPM (custo por mil impressoes) de ${formatCurrency(costPerImpression)}. Para cada ${formatCurrency(1)} investido, foram gerados ${(totalLeads / totalSpend * 100).toFixed(1)} leads por ${formatCurrency(100)}. ${avgCtr >= 1.5 ? 'A taxa de cliques esta acima da media do mercado, indicando boa atratividade dos anuncios.' : avgCtr >= 0.7 ? 'A taxa de cliques esta dentro da media aceitavel.' : 'A taxa de cliques esta abaixo do ideal, indicando necessidade de revisar criativos e segmentacao.'}`
        });
    }

    // Analise de frequencia geral
    if (avgFreq > 0) {
        const freqText = avgFreq <= 2.0
            ? `Frequencia media de ${avgFreq.toFixed(1)}x esta saudavel. O publico ainda nao esta saturado.`
            : avgFreq <= 3.5
            ? `Frequencia media de ${avgFreq.toFixed(1)}x esta moderada. Comece a monitorar sinais de fadiga nos criativos.`
            : `Frequencia media de ${avgFreq.toFixed(1)}x esta elevada. Ha risco significativo de fadiga do publico, o que tende a aumentar o CPL e reduzir a taxa de conversao.`;
        result.scenario.push({ icon: 'groups', title: 'Saturacao do publico', text: freqText });
    }

    // ==================================================
    // SECAO 2: DIAGNOSTICO ESTRATEGICO (cards com severidade)
    // ==================================================

    // CPL Critico
    if (cplTargets) {
        const criticalCpls = campaigns.filter(c => c.metrics.leads > 0 && c.metrics.cpl > cplTargets.warning);
        if (criticalCpls.length > 0) {
            result.diagnostics.push({
                severity: 'critical', icon: 'error',
                title: 'CPL em nivel critico',
                description: `${criticalCpls.length} campanha(s) com CPL acima de ${formatCurrency(cplTargets.warning)}, o limite maximo aceitavel.`,
                campaigns: criticalCpls.map(c => ({ name: c.name, detail: `CPL ${formatCurrency(c.metrics.cpl)}` })),
                action: 'Pause ou reestruture essas campanhas. Revise publicos, criativos e ofertas. Redistribua o orcamento para campanhas com CPL saudavel. Considere testar novos angulos de comunicacao antes de reativar.'
            });
        }

        const warningCpls = campaigns.filter(c => c.metrics.leads > 0 && c.metrics.cpl > cplTargets.healthy && c.metrics.cpl <= cplTargets.warning);
        if (warningCpls.length > 0) {
            result.diagnostics.push({
                severity: 'warning', icon: 'warning',
                title: 'CPL requer atencao',
                description: `${warningCpls.length} campanha(s) com CPL entre ${formatCurrency(cplTargets.healthy)} e ${formatCurrency(cplTargets.warning)}. Ainda aceitavel, mas proximo do limite.`,
                campaigns: warningCpls.map(c => ({ name: c.name, detail: `CPL ${formatCurrency(c.metrics.cpl)}` })),
                action: 'Monitore diariamente. Teste novos criativos (minimo 2-3 variacoes) e refine a segmentacao. Avalie se o publico-alvo esta alinhado com a oferta. Considere criar publicos lookalike a partir dos leads ja convertidos.'
            });
        }
    }

    // Campanhas sem leads
    const noLeadsCampaigns = campaigns.filter(c => c.metrics.spend > 10 && c.metrics.leads === 0);
    if (noLeadsCampaigns.length > 0) {
        const wastedSpend = noLeadsCampaigns.reduce((s, c) => s + c.metrics.spend, 0);
        result.diagnostics.push({
            severity: 'critical', icon: 'money_off',
            title: 'Campanhas sem conversoes',
            description: `${noLeadsCampaigns.length} campanha(s) consumiram ${formatCurrency(wastedSpend)} sem gerar nenhum lead. Possíveis causas: formulario com erro, publico desalinhado, oferta fraca ou pagina de destino lenta.`,
            campaigns: noLeadsCampaigns.map(c => ({ name: c.name, detail: `Gasto ${formatCurrency(c.metrics.spend)}` })),
            action: 'Pause imediatamente. Antes de reativar: (1) teste o formulario/pagina de destino manualmente, (2) verifique se o pixel esta disparando corretamente, (3) revise se o publico tem intencao real de conversao, (4) avalie se a oferta e clara e atrativa no criativo.'
        });
    }

    // Frequencia alta
    const highFreqCampaigns = campaigns.filter(c => {
        const freq = c.metrics.reach > 0 ? c.metrics.impressions / c.metrics.reach : 0;
        return freq > 3.0 && c.status === 'ACTIVE';
    });
    if (highFreqCampaigns.length > 0) {
        result.diagnostics.push({
            severity: 'warning', icon: 'repeat',
            title: 'Frequencia alta — fadiga de publico',
            description: `${highFreqCampaigns.length} campanha(s) ativa(s) com frequencia acima de 3x. O mesmo publico esta vendo os anuncios repetidamente, reduzindo o impacto e aumentando o custo.`,
            campaigns: highFreqCampaigns.map(c => {
                const freq = (c.metrics.impressions / c.metrics.reach).toFixed(1);
                return { name: c.name, detail: `Freq. ${freq}x` };
            }),
            action: 'Acoes imediatas: (1) adicione novos criativos com angulos diferentes, (2) expanda o publico-alvo (aumente lookalike de 1% para 3-5%), (3) exclua quem ja converteu, (4) considere ativar campanhas de remarketing separadas para quem ja interagiu.'
        });
    }

    // CTR baixo
    const lowCtrCampaigns = campaigns.filter(c => c.metrics.ctr < 0.7 && c.metrics.impressions > 1000 && c.status === 'ACTIVE');
    if (lowCtrCampaigns.length > 0) {
        result.diagnostics.push({
            severity: 'warning', icon: 'ads_click',
            title: 'CTR abaixo do ideal',
            description: `${lowCtrCampaigns.length} campanha(s) com CTR inferior a 0.7%. Os anuncios estao sendo exibidos mas nao geram cliques suficientes — o publico nao esta sendo atraido pela comunicacao.`,
            campaigns: lowCtrCampaigns.map(c => ({ name: c.name, detail: `CTR ${c.metrics.ctr.toFixed(2)}%` })),
            action: 'Revise o alinhamento criativo-publico-oferta: (1) teste videos curtos (ate 15s) com hook nos primeiros 3 segundos, (2) use carroseis com storytelling, (3) revise o copy — o beneficio principal deve estar claro na primeira linha, (4) teste CTAs mais diretos, (5) verifique se o publico-alvo realmente tem interesse na oferta.'
        });
    }

    // Poucos criativos
    const fewCreativesCampaigns = campaigns.filter(c => c.activeAdsCount < 3 && c.status === 'ACTIVE');
    if (fewCreativesCampaigns.length > 0) {
        result.diagnostics.push({
            severity: 'info', icon: 'photo_library',
            title: 'Diversidade de criativos baixa',
            description: `${fewCreativesCampaigns.length} campanha(s) ativa(s) com menos de 3 criativos. O algoritmo precisa de variedade para otimizar a entrega e encontrar a melhor combinacao de criativo + publico.`,
            campaigns: fewCreativesCampaigns.map(c => ({ name: c.name, detail: `${c.activeAdsCount} criativo(s)` })),
            action: 'Adicione 3-5 variacoes por campanha. Diversifique: (1) formatos (imagem estatica, video, carrossel), (2) angulos de comunicacao (dor, beneficio, prova social, urgencia), (3) CTAs diferentes. Mantenha o publico fixo e varie apenas o criativo para identificar o que performa melhor.'
        });
    }

    // Concentracao de gasto
    if (campaigns.length > 1 && totalSpend > 0) {
        const concentrated = campaigns.filter(c => (c.metrics.spend / totalSpend) > 0.6);
        if (concentrated.length > 0) {
            result.diagnostics.push({
                severity: 'warning', icon: 'pie_chart',
                title: 'Orcamento concentrado',
                description: `Uma unica campanha consome mais de 60% do investimento total. Se essa campanha perder performance, o impacto sera significativo em toda a operacao.`,
                campaigns: concentrated.map(c => {
                    const pct = ((c.metrics.spend / totalSpend) * 100).toFixed(0);
                    return { name: c.name, detail: `${pct}% do total` };
                }),
                action: 'Diversifique: (1) crie campanhas paralelas com publicos diferentes (lookalike, interesses, remarketing), (2) teste novos objetivos (mensagens vs formulario), (3) distribua o orcamento de forma que nenhuma campanha tenha mais de 40% do total.'
            });
        }
    }

    // Disparidade de CPL entre campanhas
    if (withLeads.length >= 2) {
        const best = withLeads[0];
        const worst = withLeads[withLeads.length - 1];
        if (worst.metrics.cpl > best.metrics.cpl * 2.5) {
            result.diagnostics.push({
                severity: 'warning', icon: 'swap_vert',
                title: 'Grande disparidade de CPL entre campanhas',
                description: `A campanha mais eficiente tem CPL de ${formatCurrency(best.metrics.cpl)} enquanto a menos eficiente opera a ${formatCurrency(worst.metrics.cpl)} (${(worst.metrics.cpl / best.metrics.cpl).toFixed(1)}x mais cara).`,
                campaigns: [
                    { name: best.name, detail: `Melhor: ${formatCurrency(best.metrics.cpl)}` },
                    { name: worst.name, detail: `Pior: ${formatCurrency(worst.metrics.cpl)}` }
                ],
                action: 'Realoque orcamento da campanha mais cara para a mais eficiente. Analise o que diferencia as duas: publico, criativo, horario de veiculacao, posicionamento. Aplique os aprendizados da campanha vencedora nas demais.'
            });
        }
    }

    // Saude geral
    if (cplTargets && totalLeads > 0) {
        const healthyCampaigns = campaigns.filter(c => c.metrics.leads > 0 && c.metrics.cpl <= cplTargets.healthy);
        if (healthyCampaigns.length > 0 && avgCpl <= cplTargets.healthy) {
            result.diagnostics.push({
                severity: 'success', icon: 'check_circle',
                title: 'Desempenho geral saudavel',
                description: `CPL medio de ${formatCurrency(avgCpl)} esta dentro da faixa saudavel. ${healthyCampaigns.length} de ${campaigns.length} campanha(s) com CPL ideal.`,
                campaigns: healthyCampaigns.map(c => ({ name: c.name, detail: `CPL ${formatCurrency(c.metrics.cpl)}` })),
                action: 'Mantenha a estrategia atual e evite mudancas bruscas. Considere escalar gradualmente (aumento de 15-20% no orcamento a cada 3-5 dias) nas campanhas com melhor CPL.'
            });
        }
    }

    // Ordenar diagnosticos
    const severityOrder = { critical: 0, warning: 1, info: 2, success: 3 };
    result.diagnostics.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

    // ==================================================
    // SECAO 3: PLANO DE ACAO (estrategias condicionais)
    // ==================================================

    // Remarketing
    if (highFreqCampaigns.length > 0 || (avgFreq > 2.5 && activeCampaigns.length > 0)) {
        result.strategy.push({
            icon: 'conversion_path', title: 'Implementar funil de remarketing',
            text: `Com frequencia elevada, parte do publico ja demonstrou interesse mas nao converteu. Crie campanhas de remarketing segmentando: (1) quem visitou a pagina mas nao preencheu o formulario (ultimos 7-14 dias), (2) quem interagiu com os anuncios (curtiu, comentou, clicou), (3) quem assistiu mais de 75% dos videos. Use criativos com prova social, depoimentos e ofertas com urgencia.`
        });
    }

    // Testes A/B
    if (fewCreativesCampaigns.length > 0 || lowCtrCampaigns.length > 0) {
        result.strategy.push({
            icon: 'science', title: 'Estrutura de testes A/B',
            text: `Para otimizar resultados, implemente testes A/B sistematicos: (1) teste uma variavel por vez (copy, imagem, CTA, publico), (2) mantenha orcamento minimo de ${formatCurrency(20)}-${formatCurrency(30)}/dia por variacao, (3) aguarde pelo menos 3-5 dias ou 1.000 impressoes antes de concluir, (4) desative o perdedor e crie nova variacao contra o vencedor. Priorize testar: ${lowCtrCampaigns.length > 0 ? 'criativos e hooks (CTR baixo)' : 'variacoes de copy e formatos'}.`
        });
    }

    // Realocacao de orcamento
    if (withLeads.length >= 2 && noLeadsCampaigns.length > 0) {
        const wastedSpend = noLeadsCampaigns.reduce((s, c) => s + c.metrics.spend, 0);
        const bestCampaign = withLeads[0];
        const potentialLeads = Math.floor(wastedSpend / bestCampaign.metrics.cpl);
        result.strategy.push({
            icon: 'account_balance', title: 'Realocacao de orcamento',
            text: `${formatCurrency(wastedSpend)} estao sendo gastos em campanhas sem conversao. Se realocados para "${bestCampaign.name}" (CPL de ${formatCurrency(bestCampaign.metrics.cpl)}), potencial de gerar aproximadamente ${potentialLeads} leads adicionais. Recomendacao: pause as campanhas improdutivas e redistribua de forma gradual (nao aumente mais de 30% de uma vez para nao desestabilizar o algoritmo).`
        });
    }

    // Otimizacao de copy e CTA
    if (lowCtrCampaigns.length > 0) {
        result.strategy.push({
            icon: 'edit_note', title: 'Otimizacao de copy e CTA',
            text: `Campanhas com CTR baixo precisam de revisao na comunicacao. Checklist: (1) a primeira linha do copy deve conter o principal beneficio ou uma pergunta que gere identificacao, (2) use numeros e dados concretos ("Economize 40%", "Em apenas 7 dias"), (3) CTA claro e direto ("Quero meu orcamento gratis", "Agendar agora"), (4) teste emojis estrategicos no copy, (5) a imagem/video deve ter contraste alto e ser legivel em tela pequena.`
        });
    }

    // ==================================================
    // SECAO 4: DIRECIONAMENTO AVANCADO (escala)
    // ==================================================

    // Campanhas prontas para escalar
    if (cplTargets && withLeads.length > 0) {
        const scalable = withLeads.filter(c => c.metrics.cpl <= cplTargets.excellent && c.status === 'ACTIVE');
        if (scalable.length > 0) {
            result.scaling.push({
                icon: 'rocket_launch', title: 'Campanhas prontas para escalar',
                text: `${scalable.length} campanha(s) com CPL excelente (abaixo de ${formatCurrency(cplTargets.excellent)}) e ativa(s). Estas sao candidatas a escala: ${scalable.map(c => `"${c.name}" (CPL ${formatCurrency(c.metrics.cpl)})`).join(', ')}. Para escalar com seguranca: aumente o orcamento em 15-20% a cada 3-5 dias. Monitore o CPL — se subir mais de 25%, pause o aumento e estabilize por uma semana.`
            });
        }
    }

    // Sugestao de alocacao
    if (totalSpend > 0 && activeCampaigns.length > 0) {
        result.scaling.push({
            icon: 'donut_large', title: 'Sugestao de alocacao de orcamento',
            text: `Distribuicao recomendada do investimento: 70% para campanhas de conversao validadas (as que ja geram leads com CPL aceitavel), 20% para remarketing (publico quente que ja interagiu), 10% para testes de novos criativos e publicos. Revise esta distribuicao semanalmente com base nos resultados.`
        });
    }

    // Visao de medio/longo prazo
    if (totalLeads > 0) {
        const leadsPerReal = totalLeads / totalSpend;
        result.scaling.push({
            icon: 'trending_up', title: 'Visao estrategica de medio prazo',
            text: `Com a eficiencia atual (${(leadsPerReal * 100).toFixed(1)} leads a cada ${formatCurrency(100)} investidos), um aumento de 30% no orcamento poderia gerar aproximadamente ${Math.round(totalLeads * 1.3)} leads no proximo periodo equivalente (estimativa conservadora, considerando possivel aumento de CPL na escala). Foque em: (1) construir um banco de criativos validados (minimo 10 variacoes), (2) mapear os 3 melhores publicos por campanha, (3) implementar automacao de follow-up (CRM/chatbot) para aumentar a taxa de conversao dos leads gerados.`
        });
    }

    return result;
}

function formatAnalystSteps(text) {
    // Detect (1) ... (2) ... patterns and render as structured list
    if (!/\(\d+\)/.test(text)) return `<p class="text-[11px] text-slate-400 leading-relaxed">${text}</p>`;
    const parts = text.split(/(?=\(\d+\))/);
    const intro = parts[0].replace(/[:\s]+$/, '').trim();
    const steps = parts.slice(1).map(s => s.replace(/^\(\d+\)\s*/, '').replace(/[,.\s]+$/, '').trim()).filter(s => s.length > 0);
    if (steps.length === 0) return `<p class="text-[11px] text-slate-400 leading-relaxed">${text}</p>`;
    let html = '';
    if (intro) html += `<p class="text-[11px] text-slate-400 leading-relaxed mb-1.5">${intro}:</p>`;
    html += '<div class="space-y-1 ml-0.5">';
    steps.forEach((step, i) => {
        html += `<div class="flex items-start gap-2 text-[11px] text-slate-400 leading-relaxed">
            <span class="text-[9px] font-bold text-slate-500 bg-slate-500/10 rounded px-1 py-px mt-px shrink-0">${i + 1}</span>
            <span>${step}</span>
        </div>`;
    });
    html += '</div>';
    return html;
}

function toggleAnalystSection(sectionId) {
    const body = document.getElementById('analyst-body-' + sectionId);
    const icon = document.getElementById('analyst-chevron-' + sectionId);
    if (!body) return;
    if (body.classList.contains('hidden')) {
        body.classList.remove('hidden');
        body.style.maxHeight = '0px';
        body.style.opacity = '0';
        requestAnimationFrame(() => {
            body.style.transition = 'max-height 0.35s ease, opacity 0.25s ease';
            body.style.maxHeight = body.scrollHeight + 'px';
            body.style.opacity = '1';
            setTimeout(() => { body.style.maxHeight = 'none'; body.style.transition = ''; }, 350);
        });
        if (icon) icon.style.transform = 'rotate(0deg)';
    } else {
        body.style.maxHeight = body.scrollHeight + 'px';
        body.style.transition = 'max-height 0.3s ease, opacity 0.2s ease';
        requestAnimationFrame(() => {
            body.style.maxHeight = '0px';
            body.style.opacity = '0';
        });
        setTimeout(() => { body.classList.add('hidden'); body.style.transition = ''; }, 300);
        if (icon) icon.style.transform = 'rotate(-90deg)';
    }
}

function scrollToAnalystSection(sectionId) {
    const el = document.getElementById('analyst-section-' + sectionId);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderAnalystReport(analysisResult, cplTargets, campaigns, filterScope) {
    const content = document.getElementById('analysisContent');
    const totalSpend = campaigns.reduce((s, c) => s + c.metrics.spend, 0);
    const totalLeads = campaigns.reduce((s, c) => s + c.metrics.leads, 0);
    const totalImpressions = campaigns.reduce((s, c) => s + c.metrics.impressions, 0);
    const avgCpl = totalLeads > 0 ? totalSpend / totalLeads : 0;
    const avgCtr = totalImpressions > 0 ? campaigns.reduce((s, c) => s + c.metrics.ctr * c.metrics.impressions, 0) / totalImpressions : 0;
    const activeCampaigns = campaigns.filter(c => c.status === 'ACTIVE');
    const { diagnostics, scenario, strategy, scaling } = analysisResult;

    const severityConfig = {
        critical: { bg: 'bg-red-500/5', border: 'border-red-500/20', iconColor: 'text-red-400', badgeBg: 'bg-red-500/10', badgeText: 'text-red-400', label: 'Critico' },
        warning: { bg: 'bg-amber-500/5', border: 'border-amber-500/20', iconColor: 'text-amber-400', badgeBg: 'bg-amber-500/10', badgeText: 'text-amber-400', label: 'Atencao' },
        info: { bg: 'bg-blue-500/5', border: 'border-blue-500/20', iconColor: 'text-blue-400', badgeBg: 'bg-blue-500/10', badgeText: 'text-blue-400', label: 'Info' },
        success: { bg: 'bg-emerald-500/5', border: 'border-emerald-500/20', iconColor: 'text-emerald-400', badgeBg: 'bg-emerald-500/10', badgeText: 'text-emerald-400', label: 'Saudavel' }
    };

    const criticalCount = diagnostics.filter(d => d.severity === 'critical').length;
    const warningCount = diagnostics.filter(d => d.severity === 'warning').length;
    const infoCount = diagnostics.filter(d => d.severity === 'info').length;
    const successCount = diagnostics.filter(d => d.severity === 'success').length;

    // Health score (0-100)
    let healthScore = 100;
    healthScore -= criticalCount * 22;
    healthScore -= warningCount * 10;
    healthScore -= infoCount * 3;
    healthScore += successCount * 5;
    healthScore = Math.max(0, Math.min(100, healthScore));

    let healthLabel, healthColor, healthIcon;
    if (healthScore >= 75) { healthLabel = 'Saudavel'; healthColor = 'emerald'; healthIcon = 'check_circle'; }
    else if (healthScore >= 45) { healthLabel = 'Atencao'; healthColor = 'amber'; healthIcon = 'warning'; }
    else { healthLabel = 'Critico'; healthColor = 'red'; healthIcon = 'error'; }

    // SVG ring progress
    const ringR = 28;
    const ringCirc = 2 * Math.PI * ringR;
    const ringOffset = ringCirc - (healthScore / 100) * ringCirc;

    // Section nav items
    const sections = [];
    if (scenario.length > 0) sections.push({ id: 'cenario', label: 'Cenario', icon: 'analytics', count: scenario.length });
    sections.push({ id: 'diagnostico', label: 'Diagnostico', icon: 'diagnosis', count: diagnostics.length, badge: criticalCount > 0 ? 'red' : warningCount > 0 ? 'amber' : null });
    if (strategy.length > 0) sections.push({ id: 'plano', label: 'Plano de Acao', icon: 'target', count: strategy.length });
    if (scaling.length > 0) sections.push({ id: 'escala', label: 'Escala', icon: 'rocket_launch', count: scaling.length });

    // ======= HEADER =======
    let html = `
        <div class="analyst-report">
            <!-- Header: Health Ring + Title + PDF -->
            <div class="flex flex-wrap sm:flex-nowrap items-start gap-3 sm:gap-4 mb-5">
                <div class="shrink-0 relative" title="Score de saude: ${healthScore}/100">
                    <svg width="72" height="72" viewBox="0 0 72 72" class="transform -rotate-90">
                        <circle cx="36" cy="36" r="${ringR}" fill="none" stroke="rgba(255,255,255,0.05)" stroke-width="5"/>
                        <circle cx="36" cy="36" r="${ringR}" fill="none"
                            stroke="${healthColor === 'emerald' ? '#10b981' : healthColor === 'amber' ? '#f59e0b' : '#ef4444'}"
                            stroke-width="5" stroke-linecap="round"
                            stroke-dasharray="${ringCirc}" stroke-dashoffset="${ringOffset}"
                            class="analyst-ring-animate"/>
                    </svg>
                    <div class="absolute inset-0 flex flex-col items-center justify-center">
                        <span class="text-lg font-bold text-white leading-none">${healthScore}</span>
                        <span class="text-[8px] text-slate-500 uppercase tracking-wider">score</span>
                    </div>
                </div>
                <div class="flex-1 min-w-0 pt-1">
                    <div class="flex items-center gap-2 mb-1">
                        <h3 class="text-base font-bold text-white">Analise Estrategica</h3>
                        <span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-${healthColor}-500/10 text-${healthColor}-400 uppercase">${healthLabel}</span>
                    </div>
                    <p class="text-[11px] text-slate-500 leading-relaxed">${campaigns.length} campanha(s) analisada(s) &middot; ${activeCampaigns.length} ativa(s) &middot; ${diagnostics.length} ponto(s) identificado(s)</p>
                </div>
                <button onclick="generateAnalystPDF()" class="shrink-0 flex items-center gap-1.5 px-2.5 sm:px-3.5 py-1.5 sm:py-2 bg-primary/10 hover:bg-primary/20 text-primary rounded-lg text-[10px] sm:text-xs font-semibold transition-all hover:scale-[1.02] active:scale-95">
                    <span class="material-symbols-outlined text-sm">picture_as_pdf</span>
                    <span class="hidden sm:inline">Exportar</span> PDF
                </button>
            </div>

            ${filterScope ? `
                <div class="flex items-center gap-2 mb-4 px-3 py-2 rounded-lg bg-primary/5 border border-primary/15">
                    <span class="material-symbols-outlined text-primary text-sm">filter_alt</span>
                    <p class="text-[11px] text-slate-400">Analise filtrada: <strong class="text-white">${filterScope.label}</strong></p>
                    <button onclick="document.getElementById('campaignFilter').value=''; resetAdsetFilter(); applyCurrentFilters(); loadAnalystReport();" class="ml-auto text-[10px] text-slate-500 hover:text-white transition-colors flex items-center gap-1">
                        <span class="material-symbols-outlined text-xs">close</span>
                        Analisar toda a conta
                    </button>
                </div>
            ` : ''}

            <!-- KPI Cards -->
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
                <div class="bg-background-dark border border-border-dark rounded-lg p-3 analyst-card-enter" style="--delay:0">
                    <p class="text-[9px] text-slate-500 uppercase tracking-wider mb-1">Investimento</p>
                    <p class="text-base font-bold text-white">${formatCurrency(totalSpend)}</p>
                </div>
                <div class="bg-background-dark border border-border-dark rounded-lg p-3 analyst-card-enter" style="--delay:1">
                    <p class="text-[9px] text-slate-500 uppercase tracking-wider mb-1">Leads</p>
                    <p class="text-base font-bold text-white">${formatNumber(totalLeads)}</p>
                </div>
                <div class="bg-background-dark border border-border-dark rounded-lg p-3 analyst-card-enter" style="--delay:2">
                    <p class="text-[9px] text-slate-500 uppercase tracking-wider mb-1">CPL Medio</p>
                    <p class="text-base font-bold text-white">${totalLeads > 0 ? formatCurrency(avgCpl) : '—'}
                        ${cplTargets && totalLeads > 0 ? (() => { const cls = classifyCpl(avgCpl, cplTargets); return ` <span class="text-[9px] font-bold text-${cls.color}-400">${cls.label}</span>`; })() : ''}
                    </p>
                </div>
                <div class="bg-background-dark border border-border-dark rounded-lg p-3 analyst-card-enter" style="--delay:3">
                    <p class="text-[9px] text-slate-500 uppercase tracking-wider mb-1">CTR Medio</p>
                    <p class="text-base font-bold text-white">${avgCtr.toFixed(2)}%</p>
                </div>
            </div>

            <!-- Alert Summary -->
            ${criticalCount > 0 || warningCount > 0 ? `
                <div class="flex flex-wrap items-center gap-2 mb-4">
                    ${criticalCount > 0 ? `<span class="inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full bg-red-500/10 text-red-400 font-semibold"><span class="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse"></span>${criticalCount} critico(s)</span>` : ''}
                    ${warningCount > 0 ? `<span class="inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-400 font-semibold"><span class="w-1.5 h-1.5 rounded-full bg-amber-400"></span>${warningCount} atencao</span>` : ''}
                    ${successCount > 0 ? `<span class="inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 font-semibold"><span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>${successCount} saudavel</span>` : ''}
                </div>
            ` : ''}

            ${!cplTargets ? `
                <div class="flex items-center gap-3 p-3 rounded-lg bg-amber-500/5 border border-amber-500/15 mb-5">
                    <span class="material-symbols-outlined text-amber-400 text-base">info</span>
                    <p class="text-[11px] text-slate-400"><strong class="text-amber-300">Faixas de CPL nao configuradas</strong> — Defina no cadastro do cliente para obter diagnosticos de CPL e recomendacoes de escala.</p>
                </div>
            ` : ''}

            <!-- Section Navigation -->
            <div class="flex flex-wrap gap-1.5 mb-5 pb-4 border-b border-border-dark/50">
                ${sections.map(s => `
                    <button onclick="scrollToAnalystSection('${s.id}')" class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium bg-surface-dark border border-border-dark text-slate-400 hover:text-white hover:border-slate-600 transition-colors">
                        <span class="material-symbols-outlined text-xs">${s.icon}</span>
                        ${s.label}
                        <span class="text-[9px] px-1.5 py-px rounded-full ${s.badge === 'red' ? 'bg-red-500/15 text-red-400' : s.badge === 'amber' ? 'bg-amber-500/15 text-amber-400' : 'bg-slate-500/15 text-slate-500'}">${s.count}</span>
                    </button>
                `).join('')}
            </div>
    `;

    // ======= SECAO 1: CENARIO ATUAL =======
    if (scenario.length > 0) {
        html += `
            <div id="analyst-section-cenario" class="mb-6 scroll-mt-4">
                <button onclick="toggleAnalystSection('cenario')" class="w-full flex items-center gap-3 mb-3 group cursor-pointer">
                    <span class="text-[10px] font-bold text-primary/40 tabular-nums">01</span>
                    <span class="material-symbols-outlined text-sm text-primary">analytics</span>
                    <h4 class="text-xs font-bold text-slate-300 uppercase tracking-widest">Analise do Cenario Atual</h4>
                    <div class="flex-1 h-px bg-border-dark/50 ml-2"></div>
                    <span id="analyst-chevron-cenario" class="material-symbols-outlined text-base text-slate-600 transition-transform duration-200">expand_more</span>
                </button>
                <div id="analyst-body-cenario" class="space-y-2 overflow-hidden">
                    ${scenario.map((s, i) => `
                        <div class="bg-background-dark/50 border border-border-dark/50 rounded-xl p-3.5 analyst-card-enter" style="--delay:${i}">
                            <div class="flex items-start gap-3">
                                <div class="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                                    <span class="material-symbols-outlined text-primary text-sm">${s.icon}</span>
                                </div>
                                <div class="flex-1 min-w-0">
                                    <p class="text-xs font-semibold text-white mb-1.5">${s.title}</p>
                                    ${formatAnalystSteps(s.text)}
                                </div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    // ======= SECAO 2: DIAGNOSTICO =======
    html += `
        <div id="analyst-section-diagnostico" class="mb-6 scroll-mt-4">
            <button onclick="toggleAnalystSection('diagnostico')" class="w-full flex items-center gap-3 mb-3 group cursor-pointer">
                <span class="text-[10px] font-bold text-primary/40 tabular-nums">${scenario.length > 0 ? '02' : '01'}</span>
                <span class="material-symbols-outlined text-sm text-primary">diagnosis</span>
                <h4 class="text-xs font-bold text-slate-300 uppercase tracking-widest">Diagnostico Estrategico</h4>
                <div class="flex-1 h-px bg-border-dark/50 ml-2"></div>
                <span id="analyst-chevron-diagnostico" class="material-symbols-outlined text-base text-slate-600 transition-transform duration-200">expand_more</span>
            </button>
            <div id="analyst-body-diagnostico" class="overflow-hidden">
    `;

    if (diagnostics.length === 0) {
        html += `
            <div class="flex flex-col items-center justify-center py-8 text-slate-500">
                <div class="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center mb-3">
                    <span class="material-symbols-outlined text-emerald-400 text-xl">task_alt</span>
                </div>
                <p class="text-xs font-medium text-slate-400">Nenhum ponto critico identificado</p>
                <p class="text-[10px] text-slate-600 mt-1">Todas as campanhas dentro dos parametros</p>
            </div>
        `;
    } else {
        html += '<div class="space-y-3">';
        diagnostics.forEach((d, idx) => {
            const cfg = severityConfig[d.severity];
            html += `
                <div class="${cfg.bg} border ${cfg.border} rounded-xl p-4 analyst-card-enter" style="--delay:${idx}">
                    <div class="flex items-start gap-3">
                        <div class="w-8 h-8 rounded-lg ${cfg.badgeBg} flex items-center justify-center shrink-0 mt-0.5">
                            <span class="material-symbols-outlined ${cfg.iconColor} text-base">${d.icon}</span>
                        </div>
                        <div class="flex-1 min-w-0">
                            <div class="flex items-center gap-2 mb-1.5">
                                <h4 class="text-sm font-bold text-white">${d.title}</h4>
                                <span class="text-[9px] font-bold px-1.5 py-0.5 rounded-full ${cfg.badgeBg} ${cfg.badgeText} uppercase tracking-wide">${cfg.label}</span>
                            </div>
                            <p class="text-[11px] text-slate-400 leading-relaxed mb-3">${d.description}</p>

                            <!-- Campanhas afetadas -->
                            <div class="flex flex-wrap gap-1.5 mb-3">
                                ${d.campaigns.map(c => `
                                    <span class="inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded-lg bg-background-dark border border-border-dark/80 text-slate-300 transition-colors hover:border-slate-600">
                                        <span class="font-medium truncate max-w-[140px]">${c.name}</span>
                                        <span class="text-slate-600">|</span>
                                        <span class="${cfg.badgeText} font-semibold">${c.detail}</span>
                                    </span>
                                `).join('')}
                            </div>

                            <!-- Plano de acao formatado -->
                            <div class="p-3 rounded-lg bg-background-dark/60 border border-border-dark/50">
                                <div class="flex items-center gap-1.5 mb-2">
                                    <span class="material-symbols-outlined text-primary text-xs">lightbulb</span>
                                    <span class="text-[10px] font-bold text-white uppercase tracking-wider">Plano de acao</span>
                                </div>
                                ${formatAnalystSteps(d.action)}
                            </div>
                        </div>
                    </div>
                </div>
            `;
        });
        html += '</div>';
    }
    html += '</div></div>';

    // ======= SECAO 3: PLANO DE ACAO =======
    if (strategy.length > 0) {
        const sectionNum = (scenario.length > 0 ? 2 : 1) + 1;
        html += `
            <div id="analyst-section-plano" class="mb-6 scroll-mt-4">
                <button onclick="toggleAnalystSection('plano')" class="w-full flex items-center gap-3 mb-3 group cursor-pointer">
                    <span class="text-[10px] font-bold text-primary/40 tabular-nums">0${sectionNum}</span>
                    <span class="material-symbols-outlined text-sm text-primary">target</span>
                    <h4 class="text-xs font-bold text-slate-300 uppercase tracking-widest">Plano de Acao Detalhado</h4>
                    <div class="flex-1 h-px bg-border-dark/50 ml-2"></div>
                    <span id="analyst-chevron-plano" class="material-symbols-outlined text-base text-slate-600 transition-transform duration-200">expand_more</span>
                </button>
                <div id="analyst-body-plano" class="space-y-2 overflow-hidden">
                    ${strategy.map((s, i) => `
                        <div class="bg-primary/[0.03] border border-primary/10 rounded-xl p-3.5 analyst-card-enter" style="--delay:${i}">
                            <div class="flex items-start gap-3">
                                <div class="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                                    <span class="material-symbols-outlined text-primary text-sm">${s.icon}</span>
                                </div>
                                <div class="flex-1 min-w-0">
                                    <p class="text-xs font-semibold text-white mb-1.5">${s.title}</p>
                                    ${formatAnalystSteps(s.text)}
                                </div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    // ======= SECAO 4: DIRECIONAMENTO AVANCADO =======
    if (scaling.length > 0) {
        const sectionNum = (scenario.length > 0 ? 1 : 0) + 1 + (strategy.length > 0 ? 1 : 0) + 1;
        html += `
            <div id="analyst-section-escala" class="mb-4 scroll-mt-4">
                <button onclick="toggleAnalystSection('escala')" class="w-full flex items-center gap-3 mb-3 group cursor-pointer">
                    <span class="text-[10px] font-bold text-primary/40 tabular-nums">0${sectionNum}</span>
                    <span class="material-symbols-outlined text-sm text-emerald-400">rocket_launch</span>
                    <h4 class="text-xs font-bold text-slate-300 uppercase tracking-widest">Direcionamento Avancado</h4>
                    <div class="flex-1 h-px bg-border-dark/50 ml-2"></div>
                    <span id="analyst-chevron-escala" class="material-symbols-outlined text-base text-slate-600 transition-transform duration-200">expand_more</span>
                </button>
                <div id="analyst-body-escala" class="space-y-2 overflow-hidden">
                    ${scaling.map((s, i) => `
                        <div class="bg-emerald-500/[0.03] border border-emerald-500/10 rounded-xl p-3.5 analyst-card-enter" style="--delay:${i}">
                            <div class="flex items-start gap-3">
                                <div class="w-7 h-7 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0 mt-0.5">
                                    <span class="material-symbols-outlined text-emerald-400 text-sm">${s.icon}</span>
                                </div>
                                <div class="flex-1 min-w-0">
                                    <p class="text-xs font-semibold text-white mb-1.5">${s.title}</p>
                                    ${formatAnalystSteps(s.text)}
                                </div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    html += '</div>'; // close .analyst-report
    content.innerHTML = html;
}

// ==========================================
// MODAL DE DETALHES DO CRIATIVO
// ==========================================

async function openCreativeModal(adId) {
    const creative = creativesDataCache.find(c => c.id === adId);
    if (!creative) return;

    const modal = document.getElementById('creativeDetailModal');
    modal.classList.remove('hidden');
    document.body.classList.add('overflow-hidden');

    // Preencher header
    const thumbEl = document.getElementById('creativeModalThumb');
    thumbEl.innerHTML = creative.thumbnailUrl
        ? `<img src="${creative.thumbnailUrl}" alt="" class="w-full h-full object-cover">`
        : `<div class="w-full h-full bg-slate-800 flex items-center justify-center"><span class="material-symbols-outlined text-sm text-slate-600">${creative.isVideo ? 'videocam' : 'image'}</span></div>`;

    document.getElementById('creativeModalName').textContent = creative.name;

    const activeDays = getActiveDays(creative.createdTime);
    const typeLbl = creative.isVideo ? 'Vídeo' : 'Imagem';
    const statusLbl = creative.status === 'ACTIVE' ? 'Ativo' : 'Inativo';
    const frequency = creative.metrics.reach > 0 ? (creative.metrics.impressions / creative.metrics.reach).toFixed(1) : '—';
    document.getElementById('creativeModalMeta').textContent = `${typeLbl} · ${statusLbl}${activeDays !== null ? ` · ${activeDays} dias` : ''} · Freq. ${frequency}`;

    // KPIs
    const m = creative.metrics;
    const cplVal = m.leads > 0 ? formatCurrency(m.cpl) : '—';
    document.getElementById('creativeModalKpis').innerHTML = `
        <div class="bg-background-dark rounded-lg p-3 text-center">
            <p class="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Gasto</p>
            <p class="text-sm font-bold text-white">${formatCurrency(m.spend)}</p>
        </div>
        <div class="bg-background-dark rounded-lg p-3 text-center">
            <p class="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Leads</p>
            <p class="text-sm font-bold text-white">${formatNumber(m.leads)}</p>
        </div>
        <div class="bg-background-dark rounded-lg p-3 text-center border border-primary/30">
            <p class="text-[10px] text-primary uppercase tracking-wider font-bold mb-1">CPL</p>
            <p class="text-lg font-bold text-white">${cplVal}</p>
        </div>
        <div class="bg-background-dark rounded-lg p-3 text-center">
            <p class="text-[10px] text-slate-500 uppercase tracking-wider mb-1">CTR</p>
            <p class="text-sm font-bold ${classifyMetric('ctr', m.ctr).colorClass}">${m.ctr.toFixed(2)}%</p>
        </div>
    `;

    // Loading nos gráficos
    const chartsContainer = document.getElementById('creativeModalCharts');
    chartsContainer.innerHTML = `
        <div class="flex items-center justify-center py-12">
            <div class="w-8 h-8 border-[3px] border-blue-500/20 border-t-blue-500 rounded-full animate-spin"></div>
        </div>
    `;

    // Buscar dados diários
    try {
        const baseUrl = window.location.hostname === 'localhost' ? 'http://localhost:8888' : '';
        let url = `${baseUrl}/.netlify/functions/meta-ads?adAccountId=${encodeURIComponent(currentAdAccountId)}&action=ad-daily&adId=${encodeURIComponent(adId)}`;

        if (currentDateRange) {
            const timeRange = JSON.stringify({ since: currentDateRange.start, until: currentDateRange.end });
            url += `&timeRange=${encodeURIComponent(timeRange)}`;
        } else {
            const dateRange = getDateRangeForAPI();
            if (dateRange.usePreset) {
                url += `&datePreset=${dateRange.preset}`;
            } else {
                const timeRange = JSON.stringify({ since: dateRange.since, until: dateRange.until });
                url += `&timeRange=${encodeURIComponent(timeRange)}`;
            }
        }

        const response = await fetch(url);
        const result = await response.json();

        if (!response.ok || result.error) {
            throw new Error(result.message || 'Erro ao buscar dados diários');
        }

        renderCreativeModalCharts(result.daily || [], creative);

    } catch (error) {
        chartsContainer.innerHTML = `
            <div class="flex flex-col items-center justify-center py-8 text-slate-500">
                <span class="material-symbols-outlined text-3xl mb-2">error_outline</span>
                <p class="text-xs">${error.message}</p>
            </div>
        `;
    }
}

function closeCreativeModal() {
    const modal = document.getElementById('creativeDetailModal');
    modal.classList.add('hidden');
    document.body.classList.remove('overflow-hidden');
}

function renderCreativeModalCharts(daily, creative) {
    const container = document.getElementById('creativeModalCharts');

    if (daily.length === 0) {
        container.innerHTML = `
            <div class="flex flex-col items-center justify-center py-8 text-slate-500">
                <span class="material-symbols-outlined text-3xl mb-2">show_chart</span>
                <p class="text-xs">Sem dados diários no período</p>
            </div>
        `;
        return;
    }

    // Definir métricas a exibir
    const charts = [
        { key: 'leads', label: 'Leads', format: 'number', color: '#0bda5b' },
        { key: 'cpl', label: 'CPL', format: 'currency', color: '#f59e0b' },
        { key: 'impressions', label: 'Impressões', format: 'number', color: '#8b5cf6' },
        { key: 'ctr', label: 'CTR (%)', format: 'percent', color: '#ec4899' }
    ];

    container.innerHTML = `
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            ${charts.map(chart => {
                const values = daily.map(d => d[chart.key] || 0);
                const hasData = values.some(v => v > 0);
                if (!hasData) {
                    return `
                        <div class="bg-background-dark rounded-xl p-4 border border-border-dark/50">
                            <p class="text-xs font-semibold text-slate-400 mb-3">${chart.label}</p>
                            <div class="flex items-center justify-center h-[120px] text-slate-600 text-xs">Sem dados</div>
                        </div>
                    `;
                }
                const svg = buildMiniChart(daily, chart.key, chart.color, chart.format);
                return `
                    <div class="bg-background-dark rounded-xl p-4 border border-border-dark/50">
                        <p class="text-xs font-semibold text-slate-400 mb-3">${chart.label}</p>
                        <div class="w-full">${svg}</div>
                    </div>
                `;
            }).join('')}
        </div>
    `;
}

function buildMiniChart(daily, key, color, format) {
    const values = daily.map(d => d[key] || 0);
    const dates = daily.map(d => d.date);

    const W = 380, H = 140;
    const padTop = 15, padRight = 10, padBottom = 25, padLeft = 45;
    const chartW = W - padLeft - padRight;
    const chartH = H - padTop - padBottom;

    const rawMax = Math.max(...values);
    const rawMin = Math.min(...values);
    const ticks = calcNiceYTicks(rawMin, rawMax, 4);
    const yMin = ticks[0];
    const yMax = ticks[ticks.length - 1];
    const yRange = yMax - yMin || 1;

    // Formatter
    const fmtAxis = format === 'currency' ? formatAxisCurrency
        : format === 'percent' ? (v) => v.toFixed(1) + '%'
        : formatAxisNumber;

    // Pontos
    const points = values.map((v, i) => ({
        x: padLeft + (values.length === 1 ? chartW / 2 : (i / (values.length - 1)) * chartW),
        y: padTop + chartH - ((v - yMin) / yRange) * chartH
    }));

    // Grid + Y labels
    let gridSvg = '';
    ticks.forEach(tick => {
        const y = padTop + chartH - ((tick - yMin) / yRange) * chartH;
        gridSvg += `<line x1="${padLeft}" y1="${y}" x2="${W - padRight}" y2="${y}" stroke="rgba(255,255,255,0.06)" stroke-width="1"/>`;
        gridSvg += `<text x="${padLeft - 6}" y="${y + 3}" text-anchor="end" fill="#64748b" font-size="9" font-family="Inter,sans-serif">${fmtAxis(tick)}</text>`;
    });

    // X labels (first, mid, last)
    const dateIndices = values.length <= 3
        ? values.map((_, i) => i)
        : [0, Math.floor(values.length / 2), values.length - 1];
    let dateSvg = '';
    dateIndices.forEach(i => {
        const d = new Date(dates[i] + 'T00:00:00');
        const label = d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', '');
        dateSvg += `<text x="${points[i].x}" y="${H - 4}" text-anchor="middle" fill="#64748b" font-size="9" font-family="Inter,sans-serif">${label}</text>`;
    });

    // Path
    const path = points.length === 1
        ? ''
        : buildSmoothPath(points);

    // Area
    const areaPath = points.length < 2 ? '' :
        `${path} L${points[points.length - 1].x},${padTop + chartH} L${points[0].x},${padTop + chartH} Z`;

    // Dots
    let dotsSvg = '';
    points.forEach((p, i) => {
        dotsSvg += `<circle cx="${p.x}" cy="${p.y}" r="2.5" fill="${color}" opacity="0.8"/>`;
    });

    const gradId = `miniGrad_${key}_${Math.random().toString(36).slice(2, 7)}`;

    return `
        <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" class="w-full" style="height:140px">
            <defs>
                <linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stop-color="${color}" stop-opacity="0.2"/>
                    <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
                </linearGradient>
            </defs>
            ${gridSvg}
            ${areaPath ? `<path d="${areaPath}" fill="url(#${gradId})"/>` : ''}
            ${path ? `<path d="${path}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>` : ''}
            ${points.length === 1 ? `<circle cx="${points[0].x}" cy="${points[0].y}" r="4" fill="${color}"/>` : ''}
            ${dotsSvg}
            ${dateSvg}
        </svg>
    `;
}

// ==========================================
// ENVIO AUTOMATICO - SCHEDULE MANAGEMENT
// ==========================================

let scheduleSelectedClientId = null;

function populateScheduleClientFilter() {
    const sel = document.getElementById('scheduleClientFilter');
    if (!sel) return;
    const prev = sel.value;
    sel.innerHTML = '<option value="">Selecione um Cliente</option>';
    (clientsCache || []).forEach(c => {
        sel.innerHTML += `<option value="${c.id}">${c.name}</option>`;
    });
    if (prev && clientsCache.some(c => c.id === prev)) {
        sel.value = prev;
    }
}

function onScheduleClientChange() {
    const clientId = document.getElementById('scheduleClientFilter').value;
    const container = document.getElementById('scheduleRulesContainer');
    const noWebhook = document.getElementById('scheduleNoWebhook');
    const rulesDiv = document.getElementById('scheduleRules');
    const addBtn = document.getElementById('scheduleAddRuleBtn');
    const actions = document.getElementById('scheduleActions');

    if (!clientId) {
        container.classList.add('hidden');
        scheduleSelectedClientId = null;
        return;
    }

    scheduleSelectedClientId = clientId;
    container.classList.remove('hidden');

    const client = clientsCache.find(c => c.id === clientId);
    if (!client || !client.googleChatWebhook) {
        noWebhook.classList.remove('hidden');
        rulesDiv.classList.add('hidden');
        addBtn.classList.add('hidden');
        actions.classList.add('hidden');
        return;
    }

    noWebhook.classList.add('hidden');
    rulesDiv.classList.remove('hidden');
    addBtn.classList.remove('hidden');
    addBtn.style.display = 'flex';
    actions.classList.remove('hidden');
    actions.style.display = 'flex';

    // Render existing schedules
    rulesDiv.innerHTML = '';
    const schedules = client.reportSchedules || [];
    if (schedules.length === 0) {
        // Add one default rule
        addScheduleRule();
    } else {
        schedules.forEach(sched => addScheduleRule(sched));
    }
}

function addScheduleRule(existingData) {
    const rulesDiv = document.getElementById('scheduleRules');
    const data = existingData || {
        id: 'sched_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
        enabled: true,
        days: ['mon', 'tue', 'wed', 'thu', 'fri'],
        time: '08:00',
        period: 'yesterday',
        includePdfLink: false
    };

    const dayLabels = {
        mon: 'Seg', tue: 'Ter', wed: 'Qua', thu: 'Qui', fri: 'Sex', sat: 'Sab', dom: 'Dom'
    };
    const dayKeys = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'dom'];

    const daysHtml = dayKeys.map(d => {
        const active = (data.days || []).includes(d);
        return `<button type="button" data-day="${d}" onclick="toggleScheduleDay(this)"
            class="schedule-day-btn px-2.5 py-1.5 text-[11px] font-semibold rounded-md border transition-colors ${
                active
                    ? 'bg-primary/20 border-primary text-primary'
                    : 'bg-background-dark border-border-dark text-slate-500 hover:border-slate-500 hover:text-slate-300'
            }">${dayLabels[d]}</button>`;
    }).join('');

    const periods = [
        { value: 'yesterday', label: 'Dia anterior' },
        { value: 'last_7d', label: 'Ultimos 7 dias' },
        { value: 'last_14d', label: 'Ultimos 14 dias' },
        { value: 'last_30d', label: 'Ultimos 30 dias' },
        { value: 'this_week', label: 'Semana corrente' },
        { value: 'this_month', label: 'Mes corrente' }
    ];
    const periodOptions = periods.map(p =>
        `<option value="${p.value}" ${data.period === p.value ? 'selected' : ''}>${p.label}</option>`
    ).join('');

    const ruleHtml = `
        <div class="schedule-rule bg-background-dark border border-border-dark rounded-xl p-4" data-rule-id="${data.id}">
            <div class="flex items-center justify-between mb-3">
                <label class="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" ${data.enabled ? 'checked' : ''} class="schedule-enabled w-4 h-4 rounded border-border-dark text-primary focus:ring-primary cursor-pointer accent-[#137fec]">
                    <span class="text-xs font-semibold text-slate-300">${data.enabled ? 'Ativa' : 'Inativa'}</span>
                </label>
                <button onclick="removeScheduleRule('${data.id}')" class="text-slate-600 hover:text-red-400 transition-colors p-1" title="Remover regra">
                    <span class="material-symbols-outlined text-base">delete</span>
                </button>
            </div>

            <div class="space-y-3">
                <!-- Dias da semana -->
                <div>
                    <label class="block text-[10px] font-medium text-slate-500 mb-1.5 uppercase tracking-wider">Dias</label>
                    <div class="flex flex-wrap gap-1.5">${daysHtml}</div>
                </div>

                <div class="flex flex-wrap gap-3">
                    <!-- Horario -->
                    <div class="flex-1 min-w-[100px]">
                        <label class="block text-[10px] font-medium text-slate-500 mb-1.5 uppercase tracking-wider">Horario (BRT)</label>
                        <input type="time" value="${data.time || '08:00'}" class="schedule-time w-full bg-surface-dark border border-border-dark text-slate-300 rounded-lg py-2 px-3 text-sm focus:border-primary">
                    </div>

                    <!-- Periodo -->
                    <div class="flex-[2] min-w-[140px]">
                        <label class="block text-[10px] font-medium text-slate-500 mb-1.5 uppercase tracking-wider">Periodo</label>
                        <select class="schedule-period w-full bg-surface-dark border border-border-dark text-slate-300 rounded-lg py-2 px-3 text-sm appearance-none focus:border-primary cursor-pointer">
                            ${periodOptions}
                        </select>
                    </div>
                </div>

                <!-- Incluir link PDF -->
                <label class="flex items-center gap-2 cursor-pointer pt-1">
                    <input type="checkbox" ${data.includePdfLink ? 'checked' : ''} class="schedule-pdf w-4 h-4 rounded border-border-dark text-primary focus:ring-primary cursor-pointer accent-[#137fec]">
                    <span class="text-xs text-slate-400">Incluir link para relatorio PDF</span>
                </label>
            </div>
        </div>
    `;

    rulesDiv.insertAdjacentHTML('beforeend', ruleHtml);

    // Enable checkbox label update
    const ruleEl = rulesDiv.querySelector(`[data-rule-id="${data.id}"]`);
    const enabledCb = ruleEl.querySelector('.schedule-enabled');
    enabledCb.addEventListener('change', () => {
        enabledCb.nextElementSibling.textContent = enabledCb.checked ? 'Ativa' : 'Inativa';
    });
}

function toggleScheduleDay(btn) {
    const isActive = btn.classList.contains('bg-primary/20');
    if (isActive) {
        btn.classList.remove('bg-primary/20', 'border-primary', 'text-primary');
        btn.classList.add('bg-background-dark', 'border-border-dark', 'text-slate-500');
    } else {
        btn.classList.remove('bg-background-dark', 'border-border-dark', 'text-slate-500');
        btn.classList.add('bg-primary/20', 'border-primary', 'text-primary');
    }
}

function removeScheduleRule(ruleId) {
    const el = document.querySelector(`[data-rule-id="${ruleId}"]`);
    if (el) el.remove();
}

function collectScheduleRules() {
    const rules = [];
    document.querySelectorAll('.schedule-rule').forEach(el => {
        const days = [];
        el.querySelectorAll('.schedule-day-btn').forEach(btn => {
            if (btn.classList.contains('bg-primary/20')) {
                days.push(btn.dataset.day);
            }
        });
        rules.push({
            id: el.dataset.ruleId,
            enabled: el.querySelector('.schedule-enabled').checked,
            days,
            time: el.querySelector('.schedule-time').value || '08:00',
            period: el.querySelector('.schedule-period').value || 'yesterday',
            includePdfLink: el.querySelector('.schedule-pdf').checked
        });
    });
    return rules;
}

async function saveScheduleConfig() {
    if (!scheduleSelectedClientId) return;

    const rules = collectScheduleRules();

    try {
        const result = await updateClientAPI(scheduleSelectedClientId, { reportSchedules: rules }, currentAdminPassword);
        if (result.success) {
            // Update local client data
            const idx = clientsCache.findIndex(c => c.id === scheduleSelectedClientId);
            if (idx !== -1) clientsCache[idx].reportSchedules = rules;
            showToast('Configuracao de envio salva com sucesso', 'success');
        } else {
            showToast(result.error || 'Erro ao salvar configuracao', 'error');
        }
    } catch (err) {
        showToast('Erro ao salvar configuracao', 'error');
    }
}

async function sendTestReport() {
    if (!scheduleSelectedClientId) return;

    const client = clientsCache.find(c => c.id === scheduleSelectedClientId);
    if (!client || !client.googleChatWebhook) {
        showToast('Cliente nao possui webhook configurado', 'error');
        return;
    }

    const rules = collectScheduleRules();
    const period = rules.length > 0 ? rules[0].period : 'yesterday';
    const includePdf = rules.length > 0 && rules[0].includePdfLink ? '1' : '0';

    showToast('Enviando relatorio de teste...', 'info');

    try {
        const resp = await fetch(`/.netlify/functions/send-report?clientId=${scheduleSelectedClientId}&period=${period}&includePdfLink=${includePdf}`);
        const data = await resp.json();
        if (data.success) {
            showToast('Relatorio enviado para o Google Chat!', 'success');
        } else {
            showToast(data.error || 'Erro ao enviar relatorio', 'error');
        }
    } catch (err) {
        showToast('Erro ao enviar relatorio: ' + err.message, 'error');
    }
}
