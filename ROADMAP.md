# FlowTrack — Roadmap Completo

> Última atualização: 2026-06-02
> Commit de referência atual: `f83a501`

---

## Contexto do Projeto

**FlowTrack** é um app de controle financeiro pessoal com categorização via IA.
- **Frontend:** React + TypeScript + Vite, Zustand, Dexie.js, @supabase/supabase-js
- **Backend:** FastAPI + Python, Supabase (banco + auth), Railway (hosting), Vercel (frontend)
- **IA:** Claude Haiku para categorização não-bloqueante com merchant cache
- **Objetivo duplo:** uso pessoal + portfólio para mercado europeu (Barcelona)

**Regras não negociáveis:**
- Sem Next.js, Shadcn, TanStack Query, Celery/Redis, Background Sync (iOS)
- Commits SEM co-autoria do Claude (`Co-Authored-By` proibido)
- Design system: accent `#9D2449` (vinho), fonte Outfit, JetBrains Mono apenas para marca AFN e PageFooter
- Cores de destaque são marca do projeto — sem seletor de personalização de tema para o usuário

---

## ✅ PARTE 1 — Correções Imediatas — CONCLUÍDA

Todos os itens implementados no commit `f83a501` (2026-06-02).

| Item | Descrição | Status |
|------|-----------|--------|
| B1 | Saldo das contas atualizado automaticamente em create/update/delete/bulk/import | ✅ |
| B2 | Fila offline populada em `transactionsService.create` ao detectar `ERR_NETWORK` | ✅ |
| B3 | `current_amount` removido de `GoalUpdate` (campo sem efeito) | ✅ |
| U1 | Sistema de toast: `useToastStore` (Zustand) + `ToastContainer` + animação slide-in | ✅ |
| U2 | Debounce de 350ms no campo de busca da FilterBar | ✅ |
| U3 | Filtros colapsáveis no mobile com contador de filtros ativos | ✅ |
| U4 | Endpoint `GET /api/v1/summary/monthly` — Dashboard agora busca 6 objetos em vez de 500 tx | ✅ |
| C1 | `supabase.from('categories')` substituído por `categoriesService.list()` em Transactions, Reports e Dashboard | ✅ |
| C2 | Constantes `blank` movidas para fora dos componentes — ESLint 100% limpo | ✅ |
| C3 | `config.py` migrado de Pydantic V1 `class Config:` para V2 `model_config = SettingsConfigDict(...)` | ✅ |
| A1 | `aria-label` adicionado em todos os botões de ícone (editar/excluir) em todas as páginas | ✅ |
| A2 | Confirmado: `formatCurrency` já inclui `-` para valores negativos via `Intl.NumberFormat` | ✅ |
| S1 | Senha mínima elevada de 6 para 8 caracteres em ResetPassword | ✅ |
| P1 | Check `is_demo` movido para fora do loop em `import_pdf` (N+1 → 1 query) | ✅ |
| P2 | `ErrorBoundary` envolvendo toda a app em App.tsx | ✅ |
| P3 | `parseCsvDate` agora suporta `DD.MM.YYYY` (extratos europeus) | ✅ |

---

## ✅ PARTE 2 — Features Grandes — CONCLUÍDA

Implementadas no mesmo commit `f83a501`.

### F1 — Transferência entre contas ✅

- Backend: `POST /api/v1/transfers` cria duas transações linkadas (`type = 'transfer'`, mesmo `import_batch_id`) e ajusta os balances de ambas as contas atomicamente
- Modelo `TransferCreate` em `models.py`
- Frontend: `TransactionModal` tem terceiro tipo "Transferência" com seletor de conta destino
- `TxnRow` exibe label "transferência" para transações do tipo transfer
- `transfersService.create()` adicionado em `services.ts`

### F2 — Recorrentes automáticos ✅

- Backend: `POST /internal/generate-recurring` (protegido por `verify_internal_token`) gera cópias das transações `is_recurring = true` do mês anterior para o mês atual, com `categorized_by = 'rule'`
- Deduplicação via `dedup_hash` (transações já existentes são ignoradas silenciosamente)
- **Pendente de configuração:** adicionar chamada no cron-job.org no dia 1 de cada mês para `POST /internal/generate-recurring`
- Frontend: ícone de recorrente no `TxnRow` tem tooltip "Recorrente · Próxima: 01/Mmm"

### F3 — Parcelas (installments) ✅

- Backend: campos `installment_current` e `installment_total` já existiam no schema
- Frontend: `TransactionModal` tem toggle "Parcelado?" + campo "Total de parcelas" (apenas em criação)
- Ao criar com N parcelas: loop que cria N transações com datas incrementadas mensalmente e `installment_current` de 1 a N
- `TxnRow` exibe badge "3/6" quando `installment_current` e `installment_total` estão presentes

---

## ✅ PARTE 3 — FASE A — Concluída

> **Status:** Implementada em 2026-06-03. Commit de referência: ver git log.

### Resumo do que foi implementado na Fase A:

| Item | Descrição | Status |
|------|-----------|--------|
| E12 | PWA: `vite-plugin-pwa` + SW cache offline + `theme_color #9D2449` | ✅ |
| E15 | Metas com categoria: seletor no modal (limites mensais) + badge no card | ✅ |
| E11 | Alertas proativos: backend `GET /api/v1/alerts` + sino com badge na sidebar | ✅ |
| N4  | Cashflow projetado: `GET /api/v1/cashflow/projection` + gráfico no Dashboard | ✅ |
| E2  | IA avançada: `POST /api/v1/insights` (cache 24h em memória) + card no Dashboard | ✅ |
| E16 | Comparação período a período: toggle nos Relatórios + Δ% no donut + barras duplas | ✅ |
| N2  | Exportação PDF: html2canvas + jsPDF no botão de Relatórios | ✅ |
| N1  | Orçamento mensal: CRUD `/api/v1/budgets` + alertas integrados | ✅ |
| N3  | Tags livres: campo `tags text[]` nas transações + input no modal + filtro | ✅ |

**Migrations necessárias (executar no Supabase SQL Editor):** ver `supabase_migrations.sql`

---

### FASE A — Itens originais (referência)

---

#### E12 — PWA (Progressive Web App) ✅ CONCLUÍDO

**O que é:** Tornar o FlowTrack instalável como app na tela inicial do celular, com comportamento offline real.

**Confirmado:** Não existe nenhuma configuração de PWA no projeto (`manifest.json` ausente, `vite-plugin-pwa` não instalado).

**O que fazer:**
- Instalar `vite-plugin-pwa` e configurar no `vite.config.ts`
- Criar `manifest.json` com `name`, `short_name`, `icons`, `theme_color: #9D2449`, `display: standalone`
- Registrar Service Worker para cache offline de assets estáticos (JS, CSS, fontes)
- O Service Worker **não deve** cachear requests de API (`/api/v1/...`)
- Junto com B2 (fila offline já implementada via Dexie), o app funcionará 100% offline para consultas

---

#### E15 — Metas com categorias vinculadas 🟢 APROVADO

**Estado atual:** Goals já fazem auto-tracking por `category_id` quando definido no backend. A UI está incompleta.

**O que fazer:**
- No `GoalModal`, quando `period = 'monthly'`, exibir seletor de categoria (campo `category_id`)
- Na `GoalCard`, exibir o nome da categoria vinculada como badge
- No Dashboard, no card de alertas, mostrar categoria + % atingido para metas mensais com categoria

---

#### E16 — Comparação período a período nos Relatórios 🟢 APROVADO

**O que é:** Ver lado a lado: "Este mês vs. mês anterior" ou "Este ano vs. ano anterior".

**O que fazer:**
- Em Reports, adicionar toggle "Comparar com período anterior"
- Buscar dados de dois períodos e exibir colunas duplas no bar chart
- Mostrar `Δ%` ao lado de cada categoria no donut (ex: "Alimentação +15% vs. mês ant.")
- Adicionar linha de "média dos últimos 6 meses" no bar chart como referência

---

#### E2 — IA avançada nos Relatórios 🟢 APROVADO

**Custo estimado:** ~R$0,01/dia com Claude Haiku + cache de 24h por usuário. Negligível.

**O que é:** Substituir o "Insight do mês" estático por texto gerado por Claude com base nos padrões reais do usuário.

**Exemplos de insights:**
- "Seus gastos em restaurantes subiram 40% este mês comparado à sua média. Nos últimos 3 meses você gastou R$1.200 nessa categoria."
- "Com sua taxa de poupança atual (23%), você atingirá a meta 'Viagem Europa' em 8 meses."
- "Você tem 3 assinaturas recorrentes somando R$180/mês. Considere revisar."
- "Este mês você economizou R$150 a mais que no mesmo período do ano passado. +12%."

**Arquitetura:**
- Endpoint `POST /api/v1/insights` que recebe período e retorna texto gerado por Claude
- Usar `claude-haiku-4-5-20251001` (já disponível via `claude_api.py`)
- Prompt com métricas do período: top 5 categorias, comparação mês anterior, metas ativas, recorrentes
- Cache o insight por 24h no banco (tabela `insights` ou campo em `profiles`) — não gerar a cada carregamento
- No Dashboard, substituir o card "Insight do mês" por texto gerado + botão "Atualizar insight"

---

#### E11 — Notificações proativas (alertas inteligentes) 🟢 APROVADO

**O que é:** Alertas in-app preventivos antes que situações problemáticas ocorram.

**Tipos de alerta:**
- "Você gastou 75% do limite de Restaurantes — faltam R$125 para o fim do mês"
- "Conta Nubank ficará negativa se você pagar a fatura de R$450 amanhã"
- "Há 5 transações sem categoria acumuladas esta semana"
- "Recorrente 'Netflix R$55,90' não foi detectado este mês — pode ter cancelado?"

**Implementação — Fase 1 (in-app):**
- Endpoint `GET /api/v1/alerts` que calcula todos os alertas ativos com lógica determinística (sem IA)
- Badge numérico no sino na sidebar com contagem de alertas não lidos
- Painel de alertas ao clicar no sino

**Implementação — Fase 2 (futuro, após PWA):**
- Push notifications via Web Push API (funciona em PWA instalado no Android; iOS 16.4+)

---

#### N1 — Orçamento mensal por categoria (Budget) 🟢 APROVADO

**O que é:** Definir quanto quer gastar em cada categoria por mês. Diferente de Goals (acumulação), Budget é controle de gasto corrente — "não gastar mais que R$800 em alimentação este mês".

**Por que importa:** É a feature mais fundamental de apps financeiros (YNAB, Mobills, Organizze). O FlowTrack tem Goals para poupança mas não tem controle de gasto por categoria.

**O que fazer:**
- Tabela `budgets (id, user_id, category_id, month, limit_amount, created_at)` no Supabase
- Endpoints: `POST /api/v1/budgets`, `GET /api/v1/budgets?month=YYYY-MM`, `PUT /api/v1/budgets/{id}`, `DELETE /api/v1/budgets/{id}`
- Card no Dashboard: lista de categorias com orçamento, barra de progresso (gasto atual / limite), cor vermelha quando > 100%
- Alerta automático no E11 quando categoria atinge 80% do orçamento

---

#### N2 — Exportação de relatório em PDF 🟢 APROVADO

**O que é:** Botão na página de Relatórios para baixar o relatório atual como PDF formatado.

**O que fazer:**
- Usar `html2canvas` + `jsPDF` no frontend (sem dependência de backend)
- Capturar o DOM da seção de Relatórios (gráficos, top categorias, totais)
- Gerar PDF com cabeçalho "FlowTrack — Relatório [Período]" e data de geração
- Botão "Exportar PDF" ao lado do botão de "Exportar CSV" já existente

---

#### N3 — Tags livres nas transações 🟢 APROVADO

**O que é:** Além da categoria obrigatória, adicionar tags textuais livres às transações ("viagem-sp", "aniversário-ana", "reembolsável") para filtrar e agrupar de forma ad-hoc.

**O que fazer:**
- Campo `tags text[]` na tabela `transactions` do Supabase (migration necessária)
- `TransactionModal`: input de tags com autocomplete das tags já usadas pelo usuário
- `FilterBar`: filtro por tag (dropdown com tags disponíveis)
- `TxnRow`: exibir badges de tags quando presentes
- Endpoint `GET /api/v1/tags` retorna lista de tags distintas do usuário

---

#### N4 — Cashflow projetado (30 dias) 🟢 APROVADO

**O que é:** Linha do tempo dos próximos 30 dias mostrando entradas e saídas esperadas com base em recorrentes e parcelas em andamento. Ajuda a responder: "Posso fazer essa compra agora ou espero o salário?"

**O que fazer:**
- Endpoint `GET /api/v1/cashflow/projection` que lista:
  - Transações recorrentes (`is_recurring = true`) esperadas nos próximos 30 dias
  - Parcelas futuras pendentes (`installment_current < installment_total`)
  - Saldo atual de cada conta
- Retornar saldo projetado dia a dia para os próximos 30 dias
- Gráfico de área no Dashboard ou em Reports mostrando a curva do saldo projetado
- Alertar quando o saldo projetado ficar negativo em algum dia

---

### FASE B — Médio prazo (aprovado, implementar após Fase A)

---

#### E3 — Projeções financeiras 🟡 APROVADO (com ressalvas)

**O que é:** Com base nos padrões históricos, projetar receitas e gastos dos próximos 3 meses.

**Decisão:** Implementar, mas com aviso explícito na UI sobre precisão dos dados.

**Aviso a exibir na UI:**
> "Projeções baseadas nos últimos N meses de histórico. Quanto mais histórico disponível, maior a precisão. Recomendamos pelo menos 6 meses de dados para projeções confiáveis."
> Exibir o número de meses de histórico disponível ao lado do aviso.

**O que fazer:**
- Analisar média de receitas e gastos dos últimos 6 meses (ou todo o histórico disponível se menor)
- Calcular tendência (crescimento/queda mês a mês)
- Gráfico em Reports: linha sólida = histórico, linha pontilhada = projeção 3 meses à frente
- Alertar quando a projeção indica saldo negativo em determinado mês
- Indicador visual do "nível de confiança" baseado no número de meses de histórico

---

#### E6 — Dashboard de patrimônio líquido 🟡 APROVADO (com ressalvas)

**O que é:** Visão consolidada: saldo em contas + investimentos − dívidas = patrimônio líquido.

**Decisão:** Implementar, com aviso sobre precisão.

**Aviso a exibir na UI:**
> "O patrimônio líquido reflete os valores cadastrados manualmente. Mantenha seus investimentos atualizados para maior precisão."

**O que fazer:**
- Card "Patrimônio líquido" no Dashboard = soma de `accounts.balance` + soma de `investments.current_value`
- Gráfico de evolução do patrimônio ao longo do tempo
- Tabela `net_worth_snapshots (user_id, date, total_accounts, total_investments, net_worth)` no Supabase
- Cron no dia 1 de cada mês para salvar snapshot (mesmo cron do F2)

---

#### E18 — Testes de integração do backend 🟡 APROVADO

**O que é:** Testes que chamam os endpoints HTTP reais com banco de dados de teste.

**O que fazer:**
- Configurar `pytest` com `httpx.AsyncClient` e `TestClient` do FastAPI
- Usar projeto Supabase de desenvolvimento separado para os testes
- Testar endpoints críticos: criação de transação (com atualização de saldo), importação OFX, goals auto-tracking, transferências
- Adicionar ao GitHub Actions para rodar em cada PR

---

#### E14 — Histórico e auditoria de alterações 🟡 APROVADO (baixa urgência)

**O que é:** Registro de alterações e capacidade de desfazer as últimas ações.

**Observação:** Desfazer uma transação requer recalcular o saldo da conta. Desfazer uma transferência exige desfazer as duas transações linkadas atomicamente. Implementar com cuidado.

**O que fazer:**
- Tabela `audit_log (user_id, entity_type, entity_id, action, old_values, new_values, created_at)` no Supabase
- Trigger PostgreSQL ou chamada explícita no backend em update/delete
- Tela em Perfil: "Histórico de alterações" com os últimos 50 eventos
- Feature "desfazer" para as últimas 3 ações (com recálculo de saldo)

---

### FASE C — Futuro (quando o projeto crescer ou houver demanda clara)

---

#### E4 — Multi-moeda 🔵 FUTURO

**Decisão:** Aprovado conceitualmente, mas deixado para o futuro pela complexidade da migração de schema.

**Por que importa:** Alta relevância para portfólio Barcelona (EUR/BRL). APIs gratuitas disponíveis (frankfurter.app).

**O que fazer quando chegar a hora:**
- Migration no Supabase: adicionar `original_amount` e `original_currency` na tabela `transactions`
- Integrar com frankfurter.app para conversão automática
- Campo "moeda base" por usuário nas configurações de perfil
- Dashboard mostra saldo total na moeda base com composição de moedas

---

#### E17 — Suporte a mais bancos no PDF parser 🔵 FUTURO

**Decisão:** Deixar para quando houver extratos reais dos bancos para testar.

**Bancos prioritários quando disponíveis:** Itaú, Inter, C6 Bank, Bradesco, Banco do Brasil, Caixa, PagBank.

**Como adicionar:** Seguir o padrão em `backend/app/integrations/pdf_parser.py`. Cada banco tem uma função `_parse_BANCO(text, pages)` e `detect_bank()` é atualizado com o padrão de reconhecimento.

---

#### E10 — Scanner de nota fiscal por OCR 🔵 FUTURO DISTANTE

**Decisão:** Custo de Claude Vision é significativamente maior que o Haiku. Deixar para depois do app mobile (E5) ou PWA com câmera estar consolidado.

---

#### E5 — App mobile nativo (React Native / Expo) 🔵 FUTURO DISTANTE

**Decisão:** Faz sentido se o projeto crescer e houver mais usuários dispostos a pagar. Esforço equivale a criar um novo projeto do zero.

---

#### E8 — Colaboração / Conta familiar 🔵 FUTURO DISTANTE

**Decisão:** Implementar caso o projeto cresça para produto com múltiplos usuários. Requer repensar o RLS do Supabase completamente.

---

#### E1 — Open Finance (sincronização bancária) 🔵 FUTURO DISTANTE

**Decisão:** Custo de API (Belvo/Pluggy) é desproporcional para uso pessoal. Irrelevante para portfólio Barcelona. Considerar apenas se virar produto com usuários pagantes.

---

#### E19 — Testes de componentes React (Vitest) 🔵 FUTURO DISTANTE

**Decisão:** Custo/complexidade acima do retorno para o momento atual. Priorizar E18 (testes de integração do backend) primeiro.

---

### Descartado — Não implementar

---

#### E7 — Relatório fiscal (IR) ❌ DESCARTADO

**Motivo:** Alto risco de incorreções com consequências legais. Regras mudam anualmente. Irrelevante para portfólio Barcelona.

---

#### E9 — Integração Google Sheets / Notion ❌ DESCARTADO

**Motivo:** Esforço de implementação (OAuth Google, webhooks, manutenção) muito acima do retorno. Nicho pequeno de usuários que realmente usariam.

---

#### E13 — Temas e personalização de cor de destaque ❌ DESCARTADO

**Motivo:** As cores são a identidade visual do projeto (marca). Apps maduros não oferecem personalização de accent color. Se quiser oferecer personalização ao usuário no futuro, abordar por outros meios.

---

## PARTE 4 — O que NÃO fazer (decisões tomadas, não reabrir)

- **Sem Next.js** — decidido e não negociável
- **Sem Shadcn/Radix/Chakra** — design system próprio mantido
- **Sem TanStack Query** — fetch manual é intencional
- **Sem Celery/Redis** — cron-job.org para tarefas assíncronas
- **Sem Background Sync API** — não funciona em iOS, Dexie + window.online é a solução
- **Sem Prisma/SQLAlchemy** — Supabase client direto
- **Sem testes de snapshot do React** — muito frágeis, não vale
- **Sem seletor de cor de tema para o usuário** — cores são marca do projeto

---

## PARTE 5 — Estado atual do codebase

**Commit de referência:** `f83a501` (2026-06-02)

**O que está 100% funcional:**
- Auth: login, logout, demo mode, password reset (PKCE)
- Transações: CRUD completo, transferências, parcelas, busca com debounce, filtros colapsáveis (mobile), paginação, CSV export, PDF import (Nubank/Sicredi/MercadoPago/Will Bank), OFX import, CSV import, is_recurring com geração automática (endpoint pronto, cron pendente)
- Investimentos: CRUD, agrupado por tipo, métricas de rentabilidade
- Metas: CRUD, auto-tracking de progresso via transações, alertas no Dashboard
- Relatórios: período preset + range customizado, bar chart, donut por categoria, top 5
- Perfil: tema dark/light, gerenciar contas, gerenciar categorias (CRUD)
- Categorização por IA: Claude Haiku + merchant cache, não-bloqueante
- Dashboard: métricas, sparkline via endpoint `/summary/monthly` (eficiente), alertas ricos, insight
- Design system: tokens CSS, componentes próprios (Button, Card, Input, Modal, Badge, Spinner, ToastContainer, ErrorBoundary)
- Offline: fila Dexie populada para `transactionsService.create`, processada ao reconectar
- Saldo de contas: atualizado automaticamente em todas as operações de transação
- Testes: 38 testes unitários do backend passando
- Build: TypeScript sem erros, ESLint sem erros (0 warnings)

**Pendências operacionais:**
- Configurar no cron-job.org: `POST /internal/generate-recurring` no dia 1 de cada mês (F2)

**Stack exata:**
- Frontend: React 18, TypeScript 5, Vite 8, Zustand, Dexie.js 4, Axios, react-router-dom
- Backend: FastAPI, Python 3.14, Pydantic V2, pdfplumber, anthropic SDK
- Infra: Supabase (São Paulo, projeto `tqrkrnxurtxwcszmwldw`), Railway (backend), Vercel (frontend), cron-job.org
- Testes: pytest 9, coverage via pytest
