// Transações: lista, filtros, modais, exportação e importação (PDF, CSV, OFX)
const nova = /^(nova transação|nova|new transaction|new)$/i
const importar = /^(importar|import)$/i
const exportar = /^(exportar|export)$/i

const CSV = [
  'Data;Histórico;Valor',
  '28/09/2026;PADARIA BELA VISTA;-18,50',
  '27/09/2026;PIX RECEBIDO ANA LIMA;250,00',
  '26/09/2026;"MERCADO PAGO *LOJA, CENTRO";-89,90',
  '25/09/2026;POSTO IPIRANGA;-180,00',
  '24/09/2026;FARMACIA PAGUE MENOS;-42,35',
  ';TARIFA SEM DATA;-12,00',
  '22/09/2026;NETFLIX.COM;-44,90',
  '21/09/2026;RESTAURANTE SABOR DA TERRA;-67,80',
].join('\n')

const OFX = `OFXHEADER:100
DATA:OFXSGML
<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260929120000<TRNAMT>-54.90<MEMO>SUPERMERCADO DIA
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20260928120000<TRNAMT>1200.00<MEMO>TED RECEBIDA CLIENTE
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260927120000<TRNAMT>-23.40<MEMO>UBER TRIP
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260926120000<TRNAMT>-310.00<MEMO>CONTA DE LUZ
</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`

const arquivo = (name, mimeType, text) => ({ name, mimeType, buffer: Buffer.from(text, 'utf8') })

async function abrirImportar(page) {
  await page.getByRole('button', { name: importar }).first().click()
  await page.getByRole('dialog').waitFor()
}

async function enviar(page, file) {
  await abrirImportar(page)
  await page.locator('input[type=file]').setInputFiles(file)
}

async function abrirEdicao(page) {
  await page.locator('.tx-desc').first().click()
  await page.getByRole('dialog').waitFor()
}

export default [
  { id: 'transacoes', rota: '/transactions' },
  { id: 'transacoes-vazio', rota: '/transactions', vazio: true },
  // Sem contas, o atalho ?acao=nova abre o aviso para cadastrar uma conta
  { id: 'transacoes-vazio-nova', rota: '/transactions?acao=nova', vazio: true, inteira: false, acao: async page => { await page.getByRole('dialog').waitFor() } },
  {
    // Conta criada, nenhuma transação: estado de primeiro uso com as ações de importar e criar
    id: 'transacoes-vazio-com-conta', rota: '/transactions', vazio: true,
    acao: async page => {
      await page.evaluate(async () => {
        const m = await import('/src/services.ts')
        await m.accountsService.create({ name: 'Nubank', bank_name: 'Nubank', bank_color: '#820ad1', account_type: 'checking', balance: 0 })
      })
      await page.reload()
      await page.getByText(/nenhuma transação ainda|no transactions yet/i).waitFor()
    },
  },
  { id: 'transacoes-filtrada', rota: '/transactions?period=this_month&category_id=cat-1' },
  { id: 'transacoes-sem-categoria', rota: '/transactions?category_id=none' },
  // Modo "A revisar": sem categoria ou IA com pouca confiança, de todos os meses
  { id: 'transacoes-revisar', rota: '/transactions?review=1' },
  // Revisão: trocar a categoria das parcelas agrupadas oferece "Aplicar sempre" logo abaixo da linha
  {
    // Só a tela visível: na foto da página inteira o rodapé fixo cobriria a oferta
    id: 'transacoes-revisar-regra', rota: '/transactions?review=1', inteira: false,
    acao: async page => {
      const sel = page.getByLabel(/^(categoria de notebook dell|category of dell laptop)$/i).first()
      const label = await sel.locator('option').filter({ hasText: /^(Educação|Education)$/ }).first().textContent()
      await sel.selectOption({ label })
      await page.locator('.tx-offer').waitFor()
      await page.locator('.tx-offer').evaluate(el => el.scrollIntoView({ block: 'center' }))
      // O aviso "Categoria atualizada" some em 3 s; sem ele, a oferta fica inteira na foto do celular
      await page.waitForTimeout(3300)
    },
  },
  {
    id: 'transacoes-filtros-celular', rota: '/transactions', somente: 'mobile', inteira: false,
    acao: async page => {
      await page.getByRole('button', { name: /^(filtros|filters)/i }).click()
      await page.getByLabel(/^(período|period)$/i).selectOption('last_month')
      await page.getByLabel(/^(tipo|type)$/i).selectOption('debit')
    },
  },
  {
    id: 'transacoes-periodo-personalizado', rota: '/transactions', somente: 'desktop', inteira: false,
    acao: async page => { await page.getByLabel(/^(período|period)$/i).selectOption('custom') },
  },
  {
    id: 'transacoes-sem-resultado', rota: '/transactions',
    acao: async page => {
      await page.getByRole('searchbox').first().fill('zzzz sem resultado')
      await page.getByText(/nada encontrado|nothing found/i).waitFor()
    },
  },
  { id: 'transacoes-pagina-2', rota: '/transactions?period=&page=2', somente: 'desktop' },
  { id: 'transacoes-nova', rota: '/transactions', inteira: false, acao: async page => { await page.getByRole('button', { name: nova }).first().click() } },
  {
    id: 'transacoes-nova-erros', rota: '/transactions', inteira: false,
    acao: async page => {
      await page.getByRole('button', { name: nova }).first().click()
      await page.getByRole('button', { name: /^(salvar|save)$/i }).click()
    },
  },
  {
    id: 'transacoes-nova-parcelada', rota: '/transactions', inteira: false,
    acao: async page => {
      await page.getByRole('button', { name: nova }).first().click()
      const dialog = page.getByRole('dialog')
      await dialog.getByLabel(/^(descrição|description)$/i).fill('Geladeira Brastemp')
      await dialog.getByLabel(/^(valor|amount)$/i).fill('489,90')
      await dialog.getByRole('checkbox', { name: /^(parcelado|installments)/i }).check()
      await dialog.getByLabel(/^(parcelas|number of installments)$/i).fill('6')
      await dialog.getByLabel(/^(tags)/i).fill('casa, eletro')
    },
  },
  {
    id: 'transacoes-transferencia', rota: '/transactions', inteira: false,
    acao: async page => {
      await page.getByRole('button', { name: nova }).first().click()
      await page.getByRole('tab', { name: /transferência|transfer/i }).click()
    },
  },
  { id: 'transacoes-editar', rota: '/transactions', inteira: false, acao: abrirEdicao },
  {
    id: 'transacoes-editar-transferencia', rota: '/transactions?type=transfer', inteira: false, acao: abrirEdicao,
  },
  {
    id: 'transacoes-excluir', rota: '/transactions', inteira: false,
    acao: async page => {
      await abrirEdicao(page)
      await page.getByRole('dialog').getByRole('button', { name: /^(excluir|delete)$/i }).click()
      await page.getByRole('button', { name: /excluir transação|delete transaction/i }).waitFor()
    },
  },
  {
    id: 'transacoes-excluir-linha', rota: '/transactions', somente: 'desktop', inteira: false,
    acao: async page => {
      await page.locator('.tx-row').nth(1).hover()
      await page.locator('.tx-del').nth(1).click()
    },
  },
  { id: 'transacoes-exportar', rota: '/transactions', inteira: false, acao: async page => { await page.getByRole('button', { name: exportar }).click() } },
  { id: 'transacoes-importar', rota: '/transactions', inteira: false, acao: abrirImportar },
  {
    id: 'transacoes-importar-erro', rota: '/transactions', inteira: false,
    acao: async page => { await enviar(page, arquivo('foto.png', 'image/png', 'nada')) },
  },
  {
    id: 'transacoes-importar-pdf', rota: '/transactions', inteira: false,
    acao: async page => {
      await enviar(page, arquivo('extrato.pdf', 'application/pdf', '%PDF-1.4 extrato de exemplo'))
      await page.getByText(/selecionadas|selected/i).first().waitFor()
    },
  },
  {
    id: 'transacoes-importar-csv', rota: '/transactions', inteira: false,
    acao: async page => {
      await enviar(page, arquivo('extrato-setembro.csv', 'text/csv', CSV))
      await page.getByText(/prontas para importar|ready to import/i).waitFor()
    },
  },
  {
    id: 'transacoes-importar-ofx', rota: '/transactions', inteira: false,
    acao: async page => {
      await enviar(page, arquivo('extrato.ofx', 'application/x-ofx', OFX))
      await page.getByText(/selecionadas|selected/i).first().waitFor()
    },
  },
  {
    id: 'transacoes-importar-concluido', rota: '/transactions', inteira: false,
    acao: async page => {
      await enviar(page, arquivo('extrato.pdf', 'application/pdf', '%PDF-1.4 extrato de exemplo'))
      await page.getByText(/selecionadas|selected/i).first().waitFor()
      await page.getByRole('button', { name: /^(importar|import) \d+/i }).click()
      await page.getByText(/importadas|imported/i).first().waitFor()
    },
  },
]
