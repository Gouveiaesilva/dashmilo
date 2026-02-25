# Integracao Google Ads — Tasks

## Fase 1: Setup e Autenticacao

- [ ] Criar conta MCC (Manager) no Google Ads (se ainda nao tiver)
- [ ] Solicitar Developer Token no Google Ads (menu Ferramentas > Centro de API)
- [ ] Criar projeto no Google Cloud Console
- [ ] Ativar Google Ads API no projeto
- [ ] Criar credenciais OAuth 2.0 (Client ID + Client Secret)
- [ ] Gerar Refresh Token via fluxo OAuth
- [ ] Configurar variaveis de ambiente no Netlify:
  - `GOOGLE_ADS_CLIENT_ID`
  - `GOOGLE_ADS_CLIENT_SECRET`
  - `GOOGLE_ADS_REFRESH_TOKEN`
  - `GOOGLE_ADS_DEVELOPER_TOKEN`
  - `GOOGLE_ADS_LOGIN_CUSTOMER_ID`

## Fase 2: Backend

- [ ] Criar `netlify/functions/google-ads.js`
  - [ ] Implementar `getAccessToken()` (troca refresh por access token)
  - [ ] Implementar `googleAdsQuery()` (executa GAQL via REST)
  - [ ] Action default (insights): KPIs agregados + daily + campanhas
  - [ ] Action `campaigns`: lista de campanhas
  - [ ] Action `account-status`: status da conta
  - [ ] Normalizar resposta no mesmo formato do `meta-ads.js`
- [ ] Testar com conta Google Ads real
- [ ] Validar que o formato de resposta e identico ao Meta

## Fase 3: Modelo de Dados

- [ ] Adicionar campo `googleAdsCustomerId` em `clients.js` (POST/PUT)
- [ ] Adicionar campo no formulario de cadastro/edicao em `index.html`
- [ ] Atualizar `addClient()` e `editClient()` em `script.js`

## Fase 4: Frontend

- [ ] Expandir `#platformBanner` com abas (Meta | Google)
  - [ ] Aba unica se cliente tem so uma plataforma
  - [ ] Abas duplas se cliente tem ambas
- [ ] Criar SVG inline do logo Google
- [ ] Rotear `fetchClientData()` para endpoint correto (meta-ads vs google-ads)
- [ ] Alternar badges nos KPI cards ("Meta Ads" vs "Google Ads")
- [ ] Alternar link do gerenciador (Ads Manager vs ads.google.com)
- [ ] Alternar cores accent por plataforma (azul Meta vs verde Google)

## Fase 5: Relatorios

- [ ] Adaptar `fetchReportData()` em `report.js` para rotear por plataforma
- [ ] Adaptar PDF para mostrar logo da plataforma no header
- [ ] Adaptar `send-report.js` para suportar Google Ads
- [ ] Adaptar `weekly-report.js` para suportar Google Ads
- [ ] Header dos Google Chat cards indicar a plataforma

## Fase 6: Testes

- [ ] Testar cliente com so Meta (regressao — nada deve quebrar)
- [ ] Testar cliente com so Google
- [ ] Testar cliente com ambas as plataformas
- [ ] Testar troca de abas no banner
- [ ] Testar relatorio PDF para Google Ads
- [ ] Testar envio Google Chat para Google Ads
- [ ] Testar responsividade mobile
