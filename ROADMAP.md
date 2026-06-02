# FlowTrack — Roadmap Completo

> Documento de referência para a próxima sessão de desenvolvimento.
> Gerado após análise exaustiva de todo o codebase em 2026-06-02.
> Commit base: `d8e398a`

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

## PARTE 1 — Correções Imediatas (Bugs + Inconsistências + Polimento)

### B1 — Saldo das contas não é atualizado automaticamente ⚠️ CRÍTICO

**Problema:** Quando o usuário cria, edita ou exclui uma transação, o `balance` da conta no banco (`accounts.balance`) nunca muda. Saldo e transações vivem em silos separados. O usuário precisa atualizar o saldo manualmente em Perfil → Contas.

**Onde está o problema:**
- `backend/app/api/v1/routers.py` — `create_transaction`, `update_transaction`, `delete_transaction` e `bulk_create_transactions` não tocam em `accounts.balance`
- `backend/app/api/v1/routers.py` — `import_pdf` também não atualiza saldo

**O que fazer:**
1. Em `create_transaction`: após inserir, fazer `UPDATE accounts SET balance = balance + amount WHERE id = account_id AND user_id = user_id`
2. Em `update_transaction`: se `amount` ou `account_id` mudou, calcular a diferença e atualizar. Se `account_id` mudou de conta, reverter o valor da conta antiga e aplicar na nova.
3. Em `delete_transaction`: reverter o valor (`balance - amount`)
4. Em `bulk_create_transactions` e `import_pdf`: acumular os valores por `account_id` e fazer um único UPDATE ao final do loop (não N updates)

**Nota importante:** O Supabase tem suporte a RPC/functions. Pode-se criar uma função SQL `adjust_account_balance(account_id, delta)` e chamá-la via `sb.rpc()` para atomicidade.

---

### B2 — Fila offline (Dexie) existe mas nunca é populada ⚠️

**Problema:** `syncQueueService` em `frontend/src/store.ts` tem infraestrutura completa (add, retry com backoff exponencial), mas `frontend/src/services.ts` chama a API diretamente sem nunca chamar `syncQueueService.add()`. O banner "Sem conexão" aparece corretamente, mas as operações offline falham silenciosamente sem ser enfileiradas.

**Onde está o problema:**
- `frontend/src/services.ts` — `transactionsService.create/update/remove` não tem tratamento de offline
- `frontend/src/utils.ts` — `processQueue()` só processa `entity === 'transaction'`, e só `create/update/delete`

**O que fazer:**
1. Em `services.ts`, no interceptor de resposta do axios (já existe em linha ~25), quando o erro for de rede (`error.code === 'ERR_NETWORK'` ou `!navigator.onLine`), chamar `syncQueueService.add()` em vez de rejeitar
2. Ou: em cada método do `transactionsService`, envolver em try/catch e em caso de erro de rede, adicionar à fila
3. O `processQueue()` em `utils.ts` já processa a fila corretamente quando a conexão volta

**Escopo mínimo:** cobrir apenas `transactionsService.create` para começar, pois é o caso mais comum offline.

---

### B3 — `GoalUpdate` no backend ainda aceita `current_amount` (enganoso)

**Problema:** `backend/app/models.py` — `GoalUpdate` tem `current_amount: Optional[float] = None`. Como goals agora são auto-calculadas das transações, se alguém enviar `current_amount` via PATCH, o valor é salvo no banco mas ignorado no próximo GET (que recalcula). A API aceita um campo sem efeito.

**O que fazer:**
- Remover `current_amount` de `GoalUpdate` em `backend/app/models.py`
- Verificar que nenhum lugar no frontend ainda envia esse campo (após o refactor anterior, não envia mais)

---

### U1 — Sistema de Toast/Feedback Visual ⚠️ ALTO IMPACTO

**Problema:** Nenhuma ação dá confirmação visual. Modal fecha em silêncio após salvar. Não há "Transação salva!", "Meta criada!", "Importação concluída!". É o ponto mais reclamado em reviews de apps financeiros (Organizze, Mobills, Toshl — todos têm).

**O que fazer:**
1. Criar componente `Toast` em `frontend/src/components/ui.tsx`:
   - Suportar variantes: `success`, `error`, `info`
   - Auto-dismiss em 3s
   - Posição: canto inferior direito no desktop, topo centralizado no mobile
   - Animação de entrada/saída (CSS transition, sem biblioteca)
2. Criar hook `useToast` ou store Zustand para disparar toasts de qualquer componente
3. Adicionar toasts nos pontos de sucesso: salvar transação, criar meta, importar CSV/PDF/OFX, criar categoria, editar investimento, etc.
4. Montar o `<ToastContainer>` em `frontend/src/App.tsx`

**Exemplo de uso desejado:**
```tsx
const { toast } = useToast()
// em handleSubmit após sucesso:
toast({ message: 'Transação salva!', variant: 'success' })
```

---

### U2 — Debounce na busca de transações

**Problema:** `frontend/src/pages/Transactions.tsx` — o campo "Buscar..." em `FilterBar` dispara uma requisição HTTP a cada tecla. Em redes lentas, causa múltiplas requests simultâneas.

**O que fazer:**
- Adicionar debounce de 350ms no campo `search` do `FilterBar`
- Implementar com `setTimeout`/`clearTimeout` em um `useEffect` local, sem biblioteca
- Apenas o campo `search` precisa de debounce; os selects e datas podem continuar imediatos

---

### U3 — Filtros colapsáveis no mobile

**Problema:** `frontend/src/pages/Transactions.tsx` — `FilterBar` tem 6 elementos que fazem `flex-wrap` em telas pequenas, ocupando 3+ linhas antes de mostrar qualquer transação.

**O que fazer:**
- Em mobile (`< 768px`), mostrar apenas o campo de busca + botão "Filtros ▾"
- Ao clicar no botão, expandir os demais filtros (conta, tipo, categoria, datas)
- Indicar quantos filtros estão ativos no botão ("Filtros (2) ▾")
- Implementar via estado local + CSS class (padrão já usado no projeto)

---

### U4 — Dashboard busca 500 transações para o sparkline

**Problema:** `frontend/src/pages/Dashboard.tsx` linha ~122: `transactionsService.list({ ..., page_size: 500 })`. Para contas com histórico longo, isso é lento.

**O que fazer:**
- Criar endpoint `GET /api/v1/summary/monthly` no backend que retorna agregados por mês (income/expense) sem retornar transações individuais
- Retornar: `[{ month: "2025-01", income: 3000, expense: 1800 }, ...]` para os últimos 6 meses
- No Dashboard, usar esse endpoint para o sparkline e buscar apenas as transações do mês atual (para "Últimas transações" e métricas)
- Isso reduz o payload de ~500 objetos para 6 objetos

---

### C1 — Reports e Transactions buscam categorias via Supabase direto

**Problema:** Duas páginas ignoram o `GET /api/v1/categories` criado e fazem `supabase.from('categories').select('*')` diretamente:
- `frontend/src/pages/Transactions.tsx` linha ~840: `supabase.from('categories').select('*').order('name')`
- `frontend/src/pages/Reports.tsx` linha ~260: `supabase.from('categories').select('*').order('name')`

**O que fazer:**
- Substituir ambas por `categoriesService.list()` de `../services`
- Remover o import de `supabase` de `Reports.tsx` (que ficará sem uso após a troca)

---

### C2 — `blank` definido dentro dos componentes (8 avisos ESLint)

**Problema:** Em 4 modais, o objeto `blank` é um `const` criado dentro da função do componente, causando o aviso `react-hooks/exhaustive-deps` porque o `useEffect` deveria declará-lo como dependência:
- `frontend/src/pages/Goals.tsx` — `GoalModal`, linha ~130
- `frontend/src/pages/Investments.tsx` — `InvestmentModal`, linha ~141
- `frontend/src/pages/Profile.tsx` — `CategoryModal`
- `frontend/src/pages/Transactions.tsx` — `TransactionModal`, linha ~175

**O que fazer:**
- Mover cada `blank` para fora da função do componente (tornar uma constante de módulo)
- Isso elimina os 8 avisos restantes do ESLint e torna o lint 100% limpo

---

### C3 — `config.py` usa sintaxe deprecada do Pydantic V2

**Problema:** `backend/app/core/config.py` — `class Settings(BaseSettings)` tem `class Config:` interno, que é a sintaxe do Pydantic V1. No Pydantic V2 (usado neste projeto), deve ser `model_config = ConfigDict(...)`. Gera warning em todo startup.

**O que fazer:**
```python
# Antes:
class Config:
    env_file = ".env"
    case_sensitive = False

# Depois:
from pydantic_settings import BaseSettings, SettingsConfigDict
model_config = SettingsConfigDict(env_file=".env", case_sensitive=False)
```

---

### A1 — Botões de ícone sem `aria-label`

**Problema:** Todos os botões de editar (lápis) e excluir (lixeira) têm `title` mas não `aria-label`. O atributo `title` não é lido de forma confiável por todos os screen readers (especialmente em mobile).

**Onde está o problema:** `TxnRow` em Transactions.tsx, `GoalCard` em Goals.tsx, `InvestmentCard` em Investments.tsx, `AccountRow` e `CategoryRow` em Profile.tsx

**O que fazer:**
- Adicionar `aria-label="Editar transação"`, `aria-label="Excluir transação"` etc. em cada botão de ícone
- Manter o `title` como tooltip visual

---

### A2 — Informação transmitida apenas por cor (daltonismo)

**Problema:** Verde = receita, vermelho = gasto. Usuários com deuteranopia/protanopia não conseguem distinguir visualmente.

**O que fazer:**
- Na lista de transações (`TxnRow`), o ícone SVG já distingue (círculo com $ vs. seta), mas o texto do valor usa apenas cor
- Adicionar um prefixo sutil: o `+` já existe para receitas; confirmar que gastos mostrem `-` explicitamente
- No Dashboard sparkline e nas métricas, já há labels textuais ("Receitas"/"Gastos") — está OK
- Na lista de transações: confirmar que `formatCurrency` com valor negativo mostra o `-` no valor

---

### S1 — Senha mínima de 6 caracteres

**Problema:** `frontend/src/pages/ResetPassword.tsx` valida `password.length < 6`. O padrão NIST atual recomenda mínimo 8.

**O que fazer:**
- Alterar para `password.length < 8`
- Atualizar a mensagem: "A senha deve ter pelo menos 8 caracteres."
- Alterar o `placeholder` de "Mínimo 6 caracteres" para "Mínimo 8 caracteres"

---

### P1 — N+1 query no `is_demo` check dentro de loops de import

**Problema:** `backend/app/api/v1/routers.py` — em `import_pdf` (linha ~372) e `bulk_create_transactions` (linha ~328), o check `is_demo = get_supabase().table('demo_users').select...` está dentro do loop de cada transação, fazendo N queries ao banco.

**O que fazer:**
- Mover o check `is_demo` para **antes** do loop (uma única query)
- Em `bulk_create_transactions`: já foi movido para antes do loop ✅ — confirmar
- Em `import_pdf`: está dentro do loop ❌ — mover para antes

---

### P2 — Error Boundary no React

**Problema:** Se qualquer componente lançar uma exceção em runtime (erro de JS inesperado), o app inteiro quebra com tela branca sem mensagem amigável.

**O que fazer:**
- Criar um `ErrorBoundary` class component em `frontend/src/components/ui.tsx`
- Envolver o `AppShell` em `frontend/src/App.tsx` com o ErrorBoundary
- Mostrar mensagem amigável: "Algo deu errado. Recarregue a página." com botão de reload

---

### P3 — `parseCsvDate` não cobre formato europeu `DD.MM.YYYY`

**Problema:** `frontend/src/pages/Transactions.tsx` — `parseCsvDate()` cobre `YYYY-MM-DD`, `DD/MM/YYYY`, `DD/MM/YY`, `DD-MM-YYYY`, mas não `DD.MM.YYYY` (ponto como separador), formato comum em extratos de bancos alemães, espanhóis e portugueses — relevante para o mercado-alvo (Barcelona).

**O que fazer:**
- Adicionar o caso: `if (/^\d{2}\.\d{2}\.\d{4}$/.test(s)) { const [d,m,y] = s.split('.'); return \`${y}-${m}-${d}\` }`

---

## PARTE 2 — Features Grandes (Fase 2)

### F1 — Transferência entre contas

**O que é:** Mover dinheiro entre contas próprias (ex: Nubank → Sicredi). Operação mais comum em apps financeiros.

**O que fazer:**
- Backend: criar endpoint `POST /api/v1/transfers` que cria duas transações atomicamente: uma de débito na conta origem e uma de crédito na conta destino, ambas com `type = 'transfer'`
- Ambas devem ter o mesmo `import_batch_id` para serem linkadas
- Atualizar os `balance` de ambas as contas
- Frontend: no modal de importação/criação, quando tipo for "Transferência", mostrar campo "Para conta"
- Na lista de transações, exibir "→ Sicredi" abaixo da descrição para transferências

### F2 — Recorrentes automáticos

**O que é:** Transações marcadas com `is_recurring = true` devem se auto-gerar no mês seguinte.

**O que fazer:**
- Backend: criar endpoint interno `POST /internal/generate-recurring` que:
  1. Busca todas as transações com `is_recurring = true` do mês anterior que não foram geradas ainda no mês atual
  2. Cria cópias delas com `transaction_date` atualizada para o mês atual
  3. Marca as novas transações com `categorized_by = 'rule'` (não precisa passar pela IA)
- Configurar cron no cron-job.org para chamar esse endpoint no dia 1 de cada mês
- Frontend: no `TxnRow`, ao lado do ícone de recorrente, mostrar "Próxima: 01/Jul"
- Permitir pular ou editar a geração via UI

### F3 — Parcelas (installments)

**O que é:** Compras parceladas no cartão. Os campos `installment_current` e `installment_total` já existem no banco e tipos, mas não têm UI.

**O que fazer:**
- Backend: campo já existe no `TransactionCreate` e `TransactionUpdate`
- Frontend `TransactionModal`: adicionar opção "Parcelado?" com campos "Parcela atual" e "Total de parcelas"
- Frontend `TxnRow`: exibir "3/6" em badge abaixo da descrição quando `installment_total > 0`
- Lógica de criação em lote: quando o usuário informar parcelas, criar todas as N transações de uma vez com datas incrementadas mensalmente

---

## PARTE 3 — Evolução Futura (o que tornaria o FlowTrack acima do mercado)

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
- Frontend: badge numérico no sino (🔔) na sidebar
- Push notifications via Web Push API (funciona em PWA sem app nativo)

---

### E12 — PWA (Progressive Web App)

**O que é:** Tornar o FlowTrack instalável como app na tela inicial do celular, com comportamento offline real.

**O que fazer:**
- Adicionar `manifest.json` com `name`, `icons`, `theme_color`, `display: standalone`
- Registrar Service Worker para cache offline de assets (já tem Dexie para dados)
- Configurar `vite-plugin-pwa` no `vite.config.ts`
- Isso habilita o botão "Adicionar à tela inicial" no iOS/Android sem lojas de apps
- Junto com B2 (populate sync queue), o app funcionará 100% offline

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
- Testar os endpoints críticos: criação de transação (com atualização de saldo), importação OFX, goals auto-tracking
- Adicionar ao CI/CD (GitHub Actions) para rodar em cada PR

---

### E19 — Testes de componentes React (Vitest)

**O que é:** Testes unitários dos componentes React.

**O que fazer:**
- Configurar `vitest` + `@testing-library/react`
- Testar os modais mais críticos: `TransactionModal`, `GoalModal`
- Testar os formatadores e helpers de `utils.ts` (já em parte cobertos pelos testes Python, mas o equivalente JS não tem testes)
- Testar o `FilterBar` e a lógica de filtros

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

**O que está 100% funcional:**
- Auth: login, logout, demo mode, password reset (PKCE)
- Transações: CRUD, busca, filtros, paginação, CSV export, PDF import (Nubank/Sicredi/MercadoPago/Will Bank), OFX import, CSV import, edição completa, is_recurring
- Investimentos: CRUD, agrupado por tipo, métricas de rentabilidade
- Metas: CRUD, auto-tracking de progresso via transações, alertas no Dashboard
- Relatórios: período preset + range customizado, bar chart, donut por categoria, top 5
- Perfil: tema dark/light, gerenciar contas, gerenciar categorias (CRUD)
- Categorização por IA: Claude Haiku + merchant cache, não-bloqueante
- Dashboard: métricas, sparkline, alertas ricos, insight inteligente
- Design system: tokens CSS, componentes próprios (Button, Card, Input, Modal, Badge, Spinner)
- Offline: banner correto (fila ainda não populada — ver B2)
- Testes: 38 testes unitários do backend passando
- Build: TypeScript sem erros, ESLint sem erros

**Stack exata:**
- Frontend: React 18, TypeScript 5, Vite 8, Zustand, Dexie.js 4, Axios, react-router-dom
- Backend: FastAPI, Python 3.14, Pydantic V2, pdfplumber, anthropic SDK
- Infra: Supabase (São Paulo, projeto `tqrkrnxurtxwcszmwldw`), Railway (backend), Vercel (frontend), cron-job.org
- Testes: pytest 9, coverage via pytest

**Commit base deste documento:** `d8e398a`
