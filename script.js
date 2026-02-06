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

    // Fechar modal
    closeDateFilterModal();

    // Recarregar dados se houver cliente selecionado
    reloadDataWithCurrentFilter();
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

    // Fechar modal
    closeDateFilterModal();

    // Recarregar dados
    reloadDataWithCurrentFilter();
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

    // Carregar campanhas que tiveram veiculação no período selecionado
    await loadCampaigns(currentAdAccountId);

    // Buscar dados gerais (sem filtro de campanha/conjunto)
    fetchClientData(currentAdAccountId, null, null);
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

// Criar HTML de um cliente
function createClientHTML(client) {
    return `
        <div class="client-card bg-background-dark border border-border-dark rounded-xl p-4 flex items-center justify-between gap-4 group hover:border-slate-600 transition-colors" data-id="${client.id}">
            <div class="flex items-center gap-3 min-w-0">
                <div class="w-10 h-10 bg-${client.color}-500/10 rounded-lg flex items-center justify-center text-${client.color}-500 shrink-0">
                    <span class="material-symbols-outlined">store</span>
                </div>
                <div class="min-w-0">
                    <p class="text-sm font-medium text-white truncate">${client.name}</p>
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

// Adicionar novo cliente
async function addClient(event) {
    event.preventDefault();

    if (!currentAdminPassword) {
        showToast('Erro: Sessão expirada. Faça login novamente.');
        return;
    }

    const clientName = document.getElementById('clientName').value.trim();
    const adAccountId = document.getElementById('adAccountId').value.trim();

    if (!clientName || !adAccountId) return;

    // Mostrar loading no botão
    const submitBtn = event.target.querySelector('button[type="submit"]');
    const originalText = submitBtn.innerHTML;
    submitBtn.innerHTML = '<span class="material-symbols-outlined animate-spin">progress_activity</span> Salvando...';
    submitBtn.disabled = true;

    const result = await addClientAPI(
        { name: clientName, adAccountId: adAccountId },
        currentAdminPassword
    );

    // Restaurar botão
    submitBtn.innerHTML = originalText;
    submitBtn.disabled = false;

    if (result.success) {
        // Re-renderizar a lista e atualizar filtro
        await renderClientsList();
        await populateClientFilter();

        // Limpar formulário
        document.getElementById('clientName').value = '';
        document.getElementById('adAccountId').value = '';
        document.getElementById('clientName').focus();

        showToast('Cliente adicionado com sucesso!');
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

    // Preencher formulário com dados do cliente
    document.getElementById('clientName').value = client.name;
    document.getElementById('adAccountId').value = client.adAccountId;

    // Focar no campo nome
    document.getElementById('clientName').focus();

    // Feedback visual
    showToast('Edite os dados e clique em Adicionar. O cliente antigo será mantido até você salvar.');
}

// Mostrar mensagem de feedback (toast)
function showToast(message) {
    // Remover toast existente se houver
    const existingToast = document.getElementById('toast');
    if (existingToast) existingToast.remove();

    // Criar toast
    const toast = document.createElement('div');
    toast.id = 'toast';
    toast.className = 'fixed bottom-4 right-4 bg-surface-dark border border-border-dark text-white px-4 py-3 rounded-lg shadow-2xl z-50 flex items-center gap-2 animate-slide-up';
    toast.innerHTML = `
        <span class="material-symbols-outlined text-primary">check_circle</span>
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

// Popular o select de clientes no header
async function populateClientFilter() {
    const select = document.getElementById('clientFilter');
    const currentValue = select.value;

    select.innerHTML = '<option value="">Carregando...</option>';

    const clients = await loadClients();

    select.innerHTML = '<option value="">Selecione um Cliente</option>';

    clients.forEach(client => {
        const option = document.createElement('option');
        option.value = client.id;
        option.textContent = client.name;
        option.dataset.adAccountId = client.adAccountId;
        select.appendChild(option);
    });

    if (currentValue && clients.some(c => c.id === currentValue)) {
        select.value = currentValue;
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

    const select = document.getElementById('clientFilter');
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
    select.innerHTML = '<option value="">Todas as Campanhas</option>';

    campaigns.forEach(campaign => {
        const option = document.createElement('option');
        option.value = campaign.id;
        option.innerHTML = formatOptionWithStatus(campaign.name, campaign.status);
        option.dataset.status = campaign.status;
        select.appendChild(option);
    });

    select.disabled = false;
}

// Callback quando o filtro de campanha muda
async function onCampaignFilterChange() {
    const select = document.getElementById('campaignFilter');

    // Resetar filtro de conjuntos
    resetAdsetFilter();

    if (select.value) {
        // Carregar conjuntos da campanha
        await loadAdsets(select.value);
    }

    // Aplicar filtro selecionado
    applyCurrentFilters();
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
    select.innerHTML = '<option value="">Todos os Conjuntos</option>';

    adsets.forEach(adset => {
        const option = document.createElement('option');
        option.value = adset.id;
        option.innerHTML = formatOptionWithStatus(adset.name, adset.status);
        option.dataset.status = adset.status;
        select.appendChild(option);
    });

    select.disabled = false;
}

// Callback quando o filtro de conjunto muda
function onAdsetFilterChange() {
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
    select.innerHTML = '<option value="">Todas as Campanhas</option>';
    select.disabled = true;
    cachedCampaigns = [];
}

// Resetar filtro de conjuntos
function resetAdsetFilter() {
    const select = document.getElementById('adsetFilter');
    select.innerHTML = '<option value="">Todos os Conjuntos</option>';
    select.disabled = true;
    cachedAdsets = [];
}

// Limpar todos os filtros
function clearAllFilters() {
    document.getElementById('clientFilter').value = '';
    resetCampaignFilter();
    resetAdsetFilter();
    updateSelectedClientName();
    resetDashboard();
    currentAdAccountId = null;
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

        // Armazenar dados
        currentDashboardData = result.data;

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

    const { summary, trends, daily } = data;

    // Atualizar cards
    updateMetricCard('spend', summary.spend, trends.spend, formatCurrency);
    updateMetricCard('impressions', summary.impressions, trends.impressions, formatNumber);
    updateMetricCard('leads', summary.leads, trends.leads, formatNumber);
    updateMetricCard('cpl', summary.cpl, trends.cpl, formatCurrency, true); // CPL: menor é melhor

    // Atualizar gráfico
    if (daily && daily.length > 0) {
        updateChart(daily, 'spend');
    }
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

// Formatar moeda
function formatCurrency(value) {
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    }).format(value);
}

// Formatar número
function formatNumber(value) {
    return new Intl.NumberFormat('pt-BR').format(Math.round(value));
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
    if (value >= 1000) return 'R$' + (value / 1000).toFixed(value % 1000 === 0 ? 0 : 1) + 'k';
    return 'R$' + formatAxisNumber(value);
}

function formatAxisNumber(value) {
    if (value >= 1000000) return (value / 1000000).toFixed(1) + 'M';
    if (value >= 1000) return (value / 1000).toFixed(value % 1000 === 0 ? 0 : 1) + 'k';
    return String(Math.round(value));
}

// ==========================================
// PAINEL SWITCHING (VISÃO GERAL / MÉTRICAS)
// ==========================================

function switchPanel(panel) {
    currentPanel = panel;

    const panelVisaoGeral = document.getElementById('panelVisaoGeral');
    const panelMetricas = document.getElementById('panelMetricas');
    const headerVisaoGeral = document.getElementById('headerVisaoGeral');
    const headerMetricas = document.getElementById('headerMetricas');
    const navVisaoGeral = document.getElementById('navVisaoGeral');
    const navMetricas = document.getElementById('navMetricas');

    if (panel === 'visao-geral') {
        panelVisaoGeral.classList.remove('hidden');
        panelMetricas.classList.add('hidden');
        headerVisaoGeral.classList.remove('hidden');
        headerMetricas.classList.add('hidden');

        navVisaoGeral.classList.add('sidebar-item-active');
        navVisaoGeral.classList.remove('text-slate-400', 'hover:text-white');
        navVisaoGeral.querySelector('.material-symbols-outlined').style.fontVariationSettings = "'FILL' 1";
        navMetricas.classList.remove('sidebar-item-active');
        navMetricas.classList.add('text-slate-400', 'hover:text-white');
        navMetricas.querySelector('.material-symbols-outlined').style.fontVariationSettings = '';
    } else if (panel === 'metricas') {
        panelMetricas.classList.remove('hidden');
        panelVisaoGeral.classList.add('hidden');
        headerMetricas.classList.remove('hidden');
        headerVisaoGeral.classList.add('hidden');

        navMetricas.classList.add('sidebar-item-active');
        navMetricas.classList.remove('text-slate-400', 'hover:text-white');
        navMetricas.querySelector('.material-symbols-outlined').style.fontVariationSettings = "'FILL' 1";
        navVisaoGeral.classList.remove('sidebar-item-active');
        navVisaoGeral.classList.add('text-slate-400', 'hover:text-white');
        navVisaoGeral.querySelector('.material-symbols-outlined').style.fontVariationSettings = '';
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
// VISÃO GERAL - DADOS E CARDS
// ==========================================

let overviewDataCache = null;

async function loadOverviewData() {
    const grid = document.getElementById('overviewCardsGrid');
    const loading = document.getElementById('overviewLoading');

    // Limpar cards existentes
    grid.querySelectorAll('.overview-client-card').forEach(card => card.remove());

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

    // Buscar status de todas as contas em uma única chamada
    const accountIds = clients.map(c => c.adAccountId).join(',');

    try {
        const baseUrl = window.location.hostname === 'localhost' ? 'http://localhost:8888' : '';
        const response = await fetch(`${baseUrl}/.netlify/functions/meta-ads?action=account-status&accountIds=${encodeURIComponent(accountIds)}`);
        const result = await response.json();

        if (!result.success) {
            throw new Error(result.message || 'Erro ao buscar status das contas');
        }

        // Mapear por accountId
        const statusMap = new Map();
        (result.accounts || []).forEach(account => {
            statusMap.set(account.accountId, account);
        });

        // Esconder loading
        if (loading) loading.classList.add('hidden');

        // Renderizar cards
        let activeCount = 0;
        let problemCount = 0;

        clients.forEach(client => {
            const formattedId = client.adAccountId.startsWith('act_')
                ? client.adAccountId
                : `act_${client.adAccountId}`;
            const statusData = statusMap.get(formattedId) || { error: true };
            const cardState = getClientCardState(statusData);

            if (cardState.isActive) activeCount++;
            if (cardState.hasError) problemCount++;

            const cardHTML = renderOverviewCard(client, statusData, cardState);
            grid.insertAdjacentHTML('beforeend', cardHTML);
        });

        updateOverviewSummary(clients.length, activeCount, problemCount);
        overviewDataCache = { clients, statusMap, timestamp: Date.now() };

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

    // Conta desativada ou sem pagamento
    if (accountStatus === 2 || accountStatus === 3) {
        return {
            isActive: false, hasError: true,
            label: accountStatus === 3 ? 'Sem saldo' : 'Conta Desativada',
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

function renderOverviewCard(client, statusData, cardState) {
    const isPrepay = statusData.is_prepay_account;
    const pulseClass = cardState.pulseAnimation ? 'overview-card-pulse' : '';
    const balanceColor = cardState.hasError && !cardState.isActive ? 'text-red-400' : 'text-white';

    // Montar seção inferior conforme tipo de conta
    let footerLabel, footerValue;
    if (statusData.error) {
        footerLabel = 'Saldo da Conta';
        footerValue = '--';
    } else if (isPrepay) {
        footerLabel = 'Saldo Pre-pago';
        footerValue = formatOverviewBalance(statusData.balance, statusData.currency);
    } else {
        // Conta com cartão (pós-pago) — não tem saldo
        footerLabel = 'Forma de Pagamento';
        footerValue = `<span class="flex items-center gap-1.5"><span class="material-symbols-outlined text-base">credit_card</span> Cartao de Credito</span>`;
    }

    return `
        <div class="overview-client-card bg-surface-dark ${cardState.borderClass} border-2 rounded-xl sm:rounded-2xl p-4 sm:p-5 cursor-pointer transition-all hover:shadow-lg group ${pulseClass}"
             onclick="navigateToClient('${client.id}')">
            <div class="flex items-center gap-3 mb-4">
                <div class="w-10 h-10 bg-${client.color}-500/10 rounded-lg flex items-center justify-center text-${client.color}-500 shrink-0">
                    <span class="material-symbols-outlined">store</span>
                </div>
                <div class="min-w-0 flex-1">
                    <p class="text-sm font-bold text-white truncate group-hover:text-primary transition-colors">${client.name}</p>
                    <p class="text-[10px] text-slate-500 font-mono truncate">${client.adAccountId}</p>
                </div>
                <span class="material-symbols-outlined text-slate-600 group-hover:text-primary text-lg transition-colors">arrow_forward_ios</span>
            </div>
            <div class="flex items-center gap-2 mb-3">
                <span class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold ${cardState.labelClass}">
                    <span class="w-1.5 h-1.5 rounded-full ${cardState.dotColor}"></span>
                    ${cardState.label}
                </span>
            </div>
            <div class="pt-3 border-t border-border-dark/50">
                <span class="text-[10px] text-slate-500 uppercase tracking-widest">${footerLabel}</span>
                <p class="text-lg font-bold ${balanceColor} mt-0.5">${footerValue}</p>
            </div>
        </div>
    `;
}

function formatOverviewBalance(balanceCents, currency) {
    if (balanceCents === undefined || balanceCents === null) return 'N/D';
    const value = parseInt(balanceCents) / 100;
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: currency || 'BRL'
    }).format(value);
}

function updateOverviewSummary(total, active, problems) {
    const totalEl = document.getElementById('overviewTotalClients');
    const activeEl = document.getElementById('overviewActiveClients');
    const problemEl = document.getElementById('overviewProblemClients');

    if (totalEl) totalEl.textContent = total;
    if (activeEl) activeEl.textContent = active;
    if (problemEl) problemEl.textContent = problems;
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
});

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
