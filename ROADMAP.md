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

## PARTE 3 — Evolução Futura

> **Status:** aguardando debate com o usuário antes de implementar.
> A próxima sessão deve começar discutindo quais itens têm prioridade, viabilidade e alinhamento com os objetivos do projeto antes de qualquer implementação.

### E1 — Sincronização bancária via Open Finance (Brasil)

**O que é:** Importar transações automaticamente conectando ao banco do usuário via Open Finance (API regulada pelo Banco Central).

**Provedores disponíveis no Brasil:**
- **Belvo** — API de Open Finance BR, suporta 200+ bancos brasileiros
- **Pluggy** — similar, com SDK Python e Node
- **Quanto** — focado em PFM (Personal Finance Management)

**Impacto:** Eliminaria a necessidade de importar CSV/PDF/OFX manualmente. Seria o diferencial mais forte para uso pessoal.

**Complexidade:** Alta. Requer:
- Integração com provedor (Belvo/Pluggy) — chave de API paga
- Tela de conexão de conta bancária
- Webhook para receber novas transações
- Deduplicação inteligente (Open Finance retorna IDs próprios)

---

### E2 — Inteligência artificial avançada nos Relatórios

**O que é:** Ao invés do "Insight do mês" estático atual, usar Claude para gerar insights personalizados e acionáveis com base nos padrões de gasto do usuário.

**Exemplos de insights que Claude pode gerar:**
- "Seus gastos em restaurantes subiram 40% este mês comparado à sua média. Nos últimos 3 meses você gastou R$1.200 nessa categoria."
- "Com sua taxa de poupança atual (23%), você atingirá a meta 'Viagem Europa' em 8 meses."
- "Você tem 3 assinaturas recorrentes somando R$180/mês. Considere revisar: Netflix, Spotify, Amazon Prime."
- "Este mês você economizou R$150 a mais que no mesmo período do ano passado. +12%."

**Arquitetura:**
- Criar endpoint `POST /api/v1/insights` que recebe período e retorna texto gerado por Claude
- Usar o `claude-haiku-4-5-20251001` (já disponível no projeto via `claude_api.py`)
- Fazer prompt com as métricas do período: top 5 categorias, comparação mês anterior, metas, recorrentes
- Cache o insight por 24h (não gerar a cada carregamento)
- No Dashboard, substituir o card "Insight do mês" por texto gerado + botão "Atualizar insight"

---

### E3 — Projeções financeiras

**O que é:** Com base nos padrões históricos, projetar receitas e gastos dos próximos meses.

**O que fazer:**
- Analisar média de receitas e gastos dos últimos 6 meses
- Calcular tendência (crescimento/queda mês a mês)
- Exibir gráfico de projeção nos Relatórios: linha sólida = histórico, linha pontilhada = projeção 3 meses
- Alertar quando a projeção indica saldo negativo em determinado mês

---

### E4 — Multi-moeda

**O que é:** Suporte a transações em moedas diferentes (USD, EUR, etc.) com conversão automática.

**Relevância:** Alta para o público-alvo europeu. Alguém em Barcelona recebendo em EUR e tendo despesas em BRL.

**O que fazer:**
- Integrar com API de câmbio (exchangerate-api.com ou frankfurter.app — gratuitas)
- Armazenar `original_amount` e `original_currency` além do `amount` em BRL
- No Dashboard, mostrar saldo total em BRL (moeda base) com indicação das moedas que compõem
- Na tela de transações, permitir digitar valor em qualquer moeda com conversão em tempo real

---

### E5 — App mobile nativo (React Native / Expo)

**O que é:** Versão mobile nativa com gestos, câmera para foto de nota fiscal, notificações push.

**Relevância:** Alta. 80% dos usuários de apps financeiros usam mobile.

**O que fazer:**
- Usar Expo com o mesmo backend FastAPI
- Reutilizar os services.ts (com adaptação para fetch nativo)
- Features mobile-first:
  - Lançamento rápido de transação via bottom sheet
  - OCR de nota fiscal via câmera (Google Vision API ou Claude Vision)
  - Push notifications para alertas de meta
  - Widget na tela inicial com saldo e gasto do dia

---

### E6 — Dashboard de patrimônio líquido

**O que é:** Visão consolidada de tudo: saldo em contas + investimentos - dívidas = patrimônio líquido.

**O que fazer:**
- No Dashboard, adicionar card "Patrimônio líquido" = soma de `accounts.balance` + `investments.current_value`
- Gráfico de evolução do patrimônio ao longo do tempo (requer snapshot mensal do patrimônio)
- Criar tabela `net_worth_snapshots` no Supabase: `(user_id, date, total_accounts, total_investments, net_worth)`
- Trigger automático: salvar snapshot no dia 1 de cada mês via cron

---

### E7 — Relatório fiscal (imposto de renda)

**O que é:** Relatório formatado para declaração de IR, com rendimentos, investimentos e deduções.

**Relevância:** Alta para o Brasil. Todo usuário pessoa física tem que declarar IR.

**O que fazer:**
- Relatório "Ano fiscal" filtrando transações por ano
- Exportar categorias relevantes: salário, aluguéis recebidos, deduções médicas (categoria configurável)
- Resumo de investimentos: rendimento bruto por tipo (Tesouro, CDB, Ações)
- Exportar como PDF com formatação profissional

---

### E8 — Colaboração / Conta familiar

**O que é:** Múltiplos usuários compartilhando contas e visualizando gastos conjuntos.

**O que fazer:**
- Criar tabela `households` (grupos familiares)
- Permitir convidar outro usuário por email
- Transações podem ser `shared` (aparecem para ambos) ou `personal`
- Dashboard conjunto mostrando gastos consolidados da família
- Divisão de contas (split) entre membros

---

### E9 — Integração com Google Sheets / Notion

**O que é:** Exportar automaticamente transações para uma planilha Google Sheets ou database Notion.

**Relevância:** Muitos usuários técnicos usam Sheets/Notion como complemento.

**O que fazer:**
- Webhook no backend: quando uma transação é criada, enviar para Google Sheets via Google Sheets API
- Configuração na página de Perfil: URL da planilha + Google OAuth
- Exportar mensalmente (cron) em vez de em tempo real para evitar rate limits

---

### E10 — Scanner de nota fiscal por OCR

**O que é:** Fotografar uma nota fiscal e criar automaticamente a transação com valor, data e estabelecimento preenchidos.

**Como implementar:**
- Upload de imagem para o backend
- Enviar para Claude Vision (claude-opus-4-8 ou claude-sonnet-4-6 com visão) com prompt específico
- Extrair: valor total, data, nome do estabelecimento
- Pré-preencher o formulário de nova transação
- O usuário revisa e confirma

---

### E11 — Notificações proativas (alertas inteligentes)

**O que é:** Notificações preventivas antes que situações problemáticas ocorram.

**Tipos de alerta:**
- "Você gastou 75% do limite de Restaurantes — faltam R$125 para o fim do mês"
- "Conta Nubank ficará negativa se você pagar a fatura de R$450 amanhã"
- "Há 5 transações sem categoria acumuladas esta semana"
- "Recorrente 'Netflix R$55,90' não foi detectado este mês — pode ter cancelado?"

**Implementação:**
- Backend: endpoint `GET /api/v1/alerts` que calcula todos os alertas ativos
- Frontend: badge numérico no sino na sidebar
- Push notifications via Web Push API (funciona em PWA sem app nativo)

---

### E12 — PWA (Progressive Web App)

**O que é:** Tornar o FlowTrack instalável como app na tela inicial do celular, com comportamento offline real.

**O que fazer:**
- Adicionar `manifest.json` com `name`, `icons`, `theme_color`, `display: standalone`
- Registrar Service Worker para cache offline de assets (já tem Dexie para dados)
- Configurar `vite-plugin-pwa` no `vite.config.ts`
- Isso habilita o botão "Adicionar à tela inicial" no iOS/Android sem lojas de apps
- Junto com B2 (fila offline já implementada), o app funcionará 100% offline

---

### E13 — Temas e personalização visual

**O que é:** Além de dark/light, permitir personalização de cor de destaque.

**O que fazer:**
- Na página de Perfil, adicionar seletor de "cor de destaque" (accent color)
- Salvar em `localStorage` e aplicar como `--accent` no CSS
- Oferecer 6–8 opções predefinidas (vinho, azul, verde, laranja, roxo, etc.)
- Manter vinho `#9D2449` como padrão

---

### E14 — Histórico e auditoria de alterações

**O que é:** Registro de quem alterou o quê e quando. Útil para auditar erros e entender mudanças.

**O que fazer:**
- Tabela `audit_log` no Supabase: `(user_id, entity_type, entity_id, action, old_values, new_values, created_at)`
- Trigger PostgreSQL ou chamada explícita no backend ao fazer update/delete
- Tela em Perfil: "Histórico de alterações" com os últimos 50 eventos
- Permitir "desfazer" as últimas 3 ações

---

### E15 — Metas com categorias vinculadas e progresso real

**O que é:** Metas mais ricas: vincular uma meta de limite a uma categoria específica com filtro por período mensal automático.

**Estado atual:** Goals já fazem auto-tracking por `category_id` quando definido. Mas falta:
- UI para vincular meta → categoria no formulário de criação
- Exibir nome da categoria na GoalCard
- Mostrar no dashboard quais categorias têm meta configurada e estão no limite

**O que fazer:**
- No `GoalModal`, quando `period = 'monthly'`, mostrar seletor de categoria
- Na `GoalCard`, exibir a categoria vinculada como badge
- No Dashboard, no card de alertas, mostrar categoria + % atingido

---

### E16 — Comparação período a período nos Relatórios

**O que é:** Ver lado a lado: "Este mês vs. mês anterior" ou "Este ano vs. ano anterior".

**O que fazer:**
- Em Reports, adicionar toggle "Comparar com período anterior"
- Buscar dados de dois períodos e exibir colunas duplas no bar chart
- Mostrar `Δ%` ao lado de cada categoria no donut (ex: "Alimentação +15% vs. mês ant.")
- Adicionar linha de "média dos últimos 6 meses" no bar chart como referência

---

### E17 — Suporte a mais bancos no PDF parser

**Bancos com extratos PDF que ainda não são suportados:**
- **Itaú** — extrato de conta corrente
- **Bradesco** — extrato de conta + fatura cartão
- **Banco do Brasil** — extrato
- **Caixa Econômica** — extrato
- **Inter** — extrato de conta
- **C6 Bank** — fatura do cartão
- **PagBank** — extrato

**Como adicionar:** Seguir o padrão já estabelecido em `backend/app/integrations/pdf_parser.py`. Cada banco tem uma função `_parse_BANCO(text, pages)` e o `detect_bank()` é atualizado com o padrão de reconhecimento.

---

### E18 — Testes de integração do backend (FastAPI)

**O que é:** Testes que chamam os endpoints HTTP reais com um banco de dados de teste.

**O que fazer:**
- Configurar `pytest` com `httpx.AsyncClient` e `TestClient` do FastAPI
- Usar um projeto Supabase de desenvolvimento separado para os testes
- Testar os endpoints críticos: criação de transação (com atualização de saldo), importação OFX, goals auto-tracking, transferências
- Adicionar ao CI/CD (GitHub Actions) para rodar em cada PR

---

### E19 — Testes de componentes React (Vitest)

**O que é:** Testes unitários dos componentes React.

**O que fazer:**
- Configurar `vitest` + `@testing-library/react`
- Testar os modais mais críticos: `TransactionModal` (incluindo fluxos de transferência e parcelas), `GoalModal`
- Testar os formatadores e helpers de `utils.ts`
- Testar o `FilterBar` e a lógica de filtros + debounce

---

## PARTE 4 — O que NÃO fazer (decisões tomadas, não reabrir)

- **Sem Next.js** — decidido e não negociável
- **Sem Shadcn/Radix/Chakra** — design system próprio mantido
- **Sem TanStack Query** — fetch manual é intencional
- **Sem Celery/Redis** — cron-job.org para tarefas assíncronas
- **Sem Background Sync API** — não funciona em iOS, Dexie + window.online é a solução
- **Sem Prisma/SQLAlchemy** — Supabase client direto
- **Sem testes de snapshot do React** — muito frágeis, não vale

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

**Pendência operacional:**
- Configurar no cron-job.org: `POST /internal/generate-recurring` no dia 1 de cada mês (F2)

**Stack exata:**
- Frontend: React 18, TypeScript 5, Vite 8, Zustand, Dexie.js 4, Axios, react-router-dom
- Backend: FastAPI, Python 3.14, Pydantic V2, pdfplumber, anthropic SDK
- Infra: Supabase (São Paulo, projeto `tqrkrnxurtxwcszmwldw`), Railway (backend), Vercel (frontend), cron-job.org
- Testes: pytest 9, coverage via pytest
