# FlowTrack — Roadmap

> Última atualização: 2026-06-03

---

## Contexto

**FlowTrack** é um app de controle financeiro pessoal com categorização via IA, desenvolvido para uso pessoal e como portfólio para o mercado europeu (Barcelona).

**Stack:**
- Frontend: React + TypeScript + Vite, Zustand, Dexie.js, react-router-dom, Axios
- Backend: FastAPI + Python 3.11, Pydantic V2, Supabase (banco + auth)
- IA: Claude Haiku — categorização não-bloqueante com merchant cache
- Infra: Railway (backend), Vercel (frontend), Supabase (São Paulo), cron-job.org

**Regras não negociáveis:**
- Sem Next.js, Shadcn, TanStack Query, Celery/Redis, Background Sync API
- Design system próprio: accent `#9D2449`, fonte Outfit, JetBrains Mono só na marca AFN
- Supabase client direto (sem Prisma/SQLAlchemy), fetch manual (sem TanStack Query)
- Commits sem co-autoria de ferramentas externas

---

## Estado atual do app

Tudo abaixo está 100% funcional e em produção:

**Auth & Perfil**
- Login, logout, modo demo, reset de senha (PKCE)
- Tema dark/light, histórico de alterações com desfazer (últimas 3 ações)

**Transações**
- CRUD completo com edição inline de categoria
- Transferências entre contas (par de transações atômico)
- Parcelas — cria N transações com datas incrementais, badge "3/6"
- Recorrentes — geração automática mensal via cron (`POST /internal/generate-recurring`)
- Tags livres (`#tag`) — filtro, badge na linha, input com sugestão
- Importação: PDF (Nubank, Sicredi, Mercado Pago, Will Bank), OFX, CSV com mapeamento de colunas
- Exportação CSV com filtros
- Busca com debounce 350ms, filtros colapsáveis no mobile, paginação
- Fila offline (Dexie) populada ao detectar `ERR_NETWORK`, processada ao reconectar

**Dashboard**
- Métricas do mês (saldo total, receitas, gastos)
- Sparkline de 6 meses via `GET /summary/monthly`
- Cashflow projetado — próximos 30 dias com base em recorrentes e parcelas
- Patrimônio líquido — contas + investimentos, sparkline histórica de snapshots mensais
- Orçamentos do mês — barras de progresso por categoria
- Alertas automáticos: limites de meta, saldo negativo, transações sem categoria, recorrentes ausentes
- Insight gerado por IA (Claude Haiku, cache 24h) com botão "Atualizar"

**Relatórios**
- Seletor de período: mês / 3m / 6m / ano / customizado
- Comparação com período anterior — toggle com Δ% por categoria no donut, barras duplas
- Bar chart receitas × gastos, donut por categoria, top 5 gastos
- Projeções financeiras — 3 meses à frente com indicador de confiança
- Exportação PDF (html2canvas + jsPDF)

**Metas**
- CRUD, auto-tracking de progresso via transações do período
- Limites mensais com categoria vinculada (badge no card, seletor no modal)

**Investimentos**
- CRUD por tipo, métricas de rentabilidade

**Orçamentos**
- CRUD por categoria/mês, integrado nos alertas (avisa em 80% e 100%)

**Categorização por IA**
- Claude Haiku + merchant cache — roda na fila de forma não-bloqueante

**Infra & Qualidade**
- PWA instalável (vite-plugin-pwa, service worker, theme_color #9D2449)
- 57 testes passando (38 unitários + 19 de integração com mocks)
- GitHub Actions CI: testes + typecheck + ESLint em cada push
- TypeScript sem erros, ESLint 0 warnings
- ErrorBoundary global

**Pendência operacional:**
- Configurar no cron-job.org: `POST /internal/generate-recurring` e `POST /internal/snapshot-net-worth` no dia 1 de cada mês

---

## Futuro

Ideias aprovadas conceitualmente, sem prazo — implementar quando houver demanda clara ou tempo disponível:

| Item | Descrição | Complexidade |
|------|-----------|-------------|
| Multi-moeda | `original_amount` + `original_currency` em transactions, conversão via frankfurter.app | Alta (migration) |
| Mais bancos no PDF parser | Itaú, Inter, C6, Bradesco, BB, Caixa, PagBank — só quando houver extratos reais para testar | Média |
| Push notifications | Web Push API para alertas proativos — funciona em PWA (Android / iOS 16.4+) | Média |
| App mobile nativo | React Native / Expo — só faz sentido se o projeto crescer com usuários | Muito alta |
| Conta familiar | Compartilhamento de dados — requer repensar o RLS do Supabase | Alta |
| Open Finance | Belvo/Pluggy — custo desproporcional para uso pessoal | Alta |
| Scanner de NF por OCR | Claude Vision — custo maior que Haiku, adiar até ter volume | Média |
| Testes de componentes React | Vitest — baixo retorno para o momento, focar nos de integração primeiro | Baixa |

---

## Não implementar

- **Relatório fiscal (IR)** — risco legal, regras mudam anualmente
- **Integração Google Sheets / Notion** — esforço muito acima do retorno
- **Seletor de cor de tema** — as cores são a identidade do projeto
