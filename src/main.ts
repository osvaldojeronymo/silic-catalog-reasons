// src/main.ts — App unificado usando dataset normalizado
import './styles/style.css'
import type { Reason } from '@/types/reason'
import { loadCatalog } from '@/data/fetch'
import { aplicarFiltros, type Filtros } from '@/ui/filters'
import { fillSelect, renderLista, mapLabel } from '@/ui/render'

type ViewMode = 'summary' | 'list' | 'reports' | 'mapped'

// Refs DOM
const els = {
  q: document.getElementById('q') as HTMLInputElement | null,
  processo: document.getElementById('processo') as HTMLSelectElement | null,
  stepSilic: document.getElementById('stepSilic') as HTMLSelectElement | null,
  tipo: document.getElementById('tipo') as HTMLSelectElement | null,
  situacao: document.getElementById('situacao') as HTMLSelectElement | null,
  categoria: document.getElementById('categoria') as HTMLSelectElement | null,
  grid: document.getElementById('grid'),
  metaVersao: document.getElementById('metaVersao'),
  viewReports: document.getElementById('viewReports') as HTMLButtonElement | null,
  viewSummary: document.getElementById('viewSummary') as HTMLButtonElement | null,
  viewList: document.getElementById('viewList') as HTMLButtonElement | null,
  btnMappedUnused: document.getElementById('btnMappedUnused') as HTMLButtonElement | null,
  resultsInfo: document.getElementById('resultsInfo') as HTMLSpanElement | null,
  pagination: document.getElementById('pagination') as HTMLDivElement | null,
  pageSize: document.getElementById('pageSize') as HTMLSelectElement | null,
  btnPrev: document.getElementById('btnPrev') as HTMLButtonElement | null,
  btnNext: document.getElementById('btnNext') as HTMLButtonElement | null,
  pageNumbers: document.getElementById('pageNumbers') as HTMLDivElement | null
}

type SyntheticFact = {
  mesRef: string
  motivoId: number
  unidadeId: number
  criticidade: string
  tempoCorrecaoDias: number
  slaEstourado: number
}

type SyntheticReason = {
  motivoId: number
  processo: string
  tipo: string
  categoria: string
  descricao: string
  situacao: string
}

type SyntheticUnit = {
  unidadeId: number
  unidade: string
  regiao: string
}

type SyntheticBundle = {
  facts: SyntheticFact[]
  reasons: SyntheticReason[]
  units: SyntheticUnit[]
}

let syntheticCache: SyntheticBundle | null = null
let reportRequestId = 0

const htmlEscape = (v: string) =>
  String(v)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')

function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]
    const next = text[i + 1]

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        field += '"'
        i += 1
      } else if (ch === '"') {
        inQuotes = false
      } else {
        field += ch
      }
      continue
    }

    if (ch === '"') {
      inQuotes = true
      continue
    }

    if (ch === ',') {
      row.push(field)
      field = ''
      continue
    }

    if (ch === '\n') {
      row.push(field)
      field = ''
      if (row.length > 1 || row[0] !== '') rows.push(row)
      row = []
      continue
    }

    if (ch === '\r') continue
    field += ch
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field)
    if (row.length > 1 || row[0] !== '') rows.push(row)
  }

  return rows
}

function csvToObjects(text: string): Array<Record<string, string>> {
  const rows = parseCsv(text)
  if (!rows.length) return []
  const headers = rows[0]
  return rows.slice(1).map((cols) => {
    const obj: Record<string, string> = {}
    headers.forEach((h, i) => {
      obj[h] = cols[i] ?? ''
    })
    return obj
  })
}

async function loadSyntheticBundle(): Promise<SyntheticBundle> {
  if (syntheticCache) return syntheticCache
  const base = import.meta.env.BASE_URL
  const [factsRes, reasonsRes, unitsRes] = await Promise.all([
    fetch(base + 'mock/fato_devolucoes.synthetic.csv', { cache: 'no-store' }),
    fetch(base + 'mock/dim_motivos.synthetic.csv', { cache: 'no-store' }),
    fetch(base + 'mock/dim_unidades.synthetic.csv', { cache: 'no-store' })
  ])

  if (!factsRes.ok || !reasonsRes.ok || !unitsRes.ok) {
    throw new Error('Arquivos sintéticos não encontrados. Execute: npm run mock:generate')
  }

  const [factsCsv, reasonsCsv, unitsCsv] = await Promise.all([factsRes.text(), reasonsRes.text(), unitsRes.text()])

  const facts = csvToObjects(factsCsv).map((r) => ({
    mesRef: r.mesRef,
    motivoId: Number(r.motivoId || 0),
    unidadeId: Number(r.unidadeId || 0),
    criticidade: r.criticidade || 'Baixa',
    tempoCorrecaoDias: Number(r.tempoCorrecaoDias || 0),
    slaEstourado: Number(r.slaEstourado || 0)
  }))

  const reasons = csvToObjects(reasonsCsv).map((r) => ({
    motivoId: Number(r.motivoId || 0),
    processo: r.processo || '',
    tipo: r.tipo || '',
    categoria: r.categoria || '',
    descricao: r.descricao || '',
    situacao: r.situacao || ''
  }))

  const units = csvToObjects(unitsCsv).map((r) => ({
    unidadeId: Number(r.unidadeId || 0),
    unidade: r.unidade || '',
    regiao: r.regiao || ''
  }))

  syntheticCache = { facts, reasons, units }
  return syntheticCache
}

async function boot() {
  // Loading state (skeleton)
  if (els.grid) {
    (els.grid as HTMLElement).innerHTML = `
      <div class="loading" role="status" aria-live="polite">
        <div class="skel"></div>
        <div class="skel"></div>
        <div class="skel"></div>
      </div>`
  }

  // Path robusto para Pages e dev
  const data = await loadCatalog()
  const lista: Reason[] = Array.isArray(data?.geral) ? data.geral : []

  // versão
  const versao = data?.sourceMeta?.versao
  if (els.metaVersao && versao) {
    els.metaVersao.textContent = `Versão do catálogo: ${versao}`
  }

  // Popular selects dinamicamente
  const uniq = <T,>(arr: T[]) => Array.from(new Set(arr))
  if (els.processo) fillSelect(els.processo, uniq(lista.map((x) => x.processo).filter(Boolean)))
  if (els.stepSilic) fillSelect(els.stepSilic, uniq(lista.map((x) => x.stepSilic).filter(Boolean)))
  if (els.tipo) fillSelect(els.tipo, uniq(lista.map((x) => x.tipo).filter(Boolean)))
  if (els.situacao) fillSelect(els.situacao, uniq(lista.map((x) => x.situacao).filter(Boolean)))
  if (els.categoria) fillSelect(els.categoria, uniq(lista.map((x) => x.categoria).filter(Boolean)))

  // Estado dos filtros
  type URLState = {
    q: string
    processo: string
    stepSilic: string
    tipo: string
    situacao: string
    categoria: string
    view: ViewMode
    page: number
    size: number | 'all'
  }
  const getURLState = (): URLState => {
    const sp = new URLSearchParams(location.search)
    return {
      q: sp.get('q') ?? '',
      processo: sp.get('processo') ?? '',
      stepSilic: sp.get('stepSilic') ?? '',
      tipo: sp.get('tipo') ?? '',
      situacao: sp.get('situacao') ?? '',
      categoria: sp.get('categoria') ?? '',
      view: ((sp.get('view') as ViewMode | null) ?? 'reports') === 'reports'
        ? 'reports'
        : ((sp.get('view') as ViewMode | null) ?? 'reports') === 'list'
          ? 'list'
          : ((sp.get('view') as ViewMode | null) ?? 'reports') === 'mapped'
            ? 'mapped'
            : 'reports',
      page: Math.max(1, parseInt(sp.get('page') || '1', 10)),
      size: sp.get('size') === 'all' ? 'all' : Math.max(1, parseInt(sp.get('size') || '10', 10))
    }
  }
  const setURLState = (f: Filtros, view: ViewMode, page: number, size: number | 'all') => {
    const sp = new URLSearchParams()
    if (f.q) sp.set('q', f.q)
    if (f.processo) sp.set('processo', f.processo)
    if (f.stepSilic) sp.set('stepSilic', f.stepSilic)
    if (f.tipo) sp.set('tipo', f.tipo)
    if (f.situacao) sp.set('situacao', f.situacao)
    if (f.categoria) sp.set('categoria', f.categoria)
    if (view !== 'summary') sp.set('view', view)
    if (view === 'list') {
      if (page > 1) sp.set('page', String(page))
      if (size === 'all') sp.set('size', 'all')
      else if (size !== 10) sp.set('size', String(size))
    }
    const qs = sp.toString()
    const newUrl = qs ? `?${qs}` : location.pathname
    history.replaceState(null, '', newUrl)
  }

  const initial = getURLState()
  // Aplicar estados iniciais nos inputs
  if (els.q) els.q.value = initial.q
  if (els.processo) els.processo.value = initial.processo
  if (els.stepSilic) els.stepSilic.value = initial.stepSilic
  if (els.tipo) els.tipo.value = initial.tipo
  if (els.situacao) els.situacao.value = initial.situacao
  if (els.categoria) els.categoria.value = initial.categoria

  const filtros: Filtros = {
    q: initial.q,
    processo: initial.processo,
    stepSilic: initial.stepSilic,
    tipo: initial.tipo,
    situacao: initial.situacao,
    categoria: initial.categoria
  }

  let currentView: ViewMode = initial.view
  let pageSize: number | 'all' = initial.size || 10
  let page = initial.page || 1
  els.viewReports?.setAttribute('aria-pressed', currentView === 'reports' ? 'true' : 'false')
  els.viewSummary?.setAttribute('aria-pressed', currentView === 'summary' ? 'true' : 'false')
  els.viewList?.setAttribute('aria-pressed', currentView === 'list' ? 'true' : 'false')
  if (els.pageSize) {
    const opt = Array.from(els.pageSize.options).find(o => (o.value === 'all' && pageSize === 'all') || parseInt(o.value, 10) === pageSize)
    if (opt) els.pageSize.value = opt.value
  }

  const CAT_ICONS: Record<string, string> = {
    'Dados iniciais': '🗂️',
    'Dados contrato': '📑',
    'Dados locador': '🏢',
    'Dados adicionais': '➕',
    'Documentação': '📄',
    'Financeiro': '💰',
    'Processual': '⚖️',
    'Representante legal': '🧑‍⚖️'
  }

  function renderSummary(items: Reason[]) {
    if (!els.grid) return
    // 1º nível: processo. 2º: etapa SILIC. 3º: categoria
    const byProcess = new Map<string, Map<string, Map<string, number>>>()
    for (const r of items) {
      const processo = r.processo || 'Definir'
      const step = r.stepSilic || 'Definir'
      const cat = r.categoria || 'Dados adicionais'

      if (!byProcess.has(processo)) byProcess.set(processo, new Map())
      const byStep = byProcess.get(processo)!
      if (!byStep.has(step)) byStep.set(step, new Map())
      const catMap = byStep.get(step)!
      catMap.set(cat, (catMap.get(cat) ?? 0) + 1)
    }

    const PROCESS_ORDER = ['Contratação', 'Atos Formais']
    const processos = Array.from(byProcess.entries()).sort((a, b) => {
      const ia = PROCESS_ORDER.indexOf(a[0])
      const ib = PROCESS_ORDER.indexOf(b[0])
      if (ia !== -1 && ib !== -1) return ia - ib
      if (ia !== -1) return -1
      if (ib !== -1) return 1
      return a[0].localeCompare(b[0], 'pt-BR')
    })

    const renderStepSection = (processo: string, step: string, catMap: Map<string, number>) => {
      const stageTotal = Array.from(catMap.values()).reduce((acc, n) => acc + n, 0)
      const categories = Array.from(catMap.entries()).sort((a, b) => a[0].localeCompare(b[0], 'pt-BR'))

      const allPressed = filtros.processo === processo && filtros.stepSilic === step && !filtros.categoria ? 'true' : 'false'
      const allBtn = `
        <button class="cat-card" data-proc="${processo}" data-step="${step}" data-cat="" aria-label="Etapa ${step} (${stageTotal})" aria-pressed="${allPressed}">
          <span class="cat-name" data-icon="🧭">${mapLabel(step)} — todos os motivos</span>
          <span class="cat-count">${stageTotal}</span>
        </button>
      `

      const catButtons = categories
        .map(([cat, n]) => {
          const icon = CAT_ICONS[cat] ?? '📁'
          const name = mapLabel(cat)
          const pressed = filtros.processo === processo && filtros.stepSilic === step && filtros.categoria === cat ? 'true' : 'false'
          return `
            <button class="cat-card" data-proc="${processo}" data-step="${step}" data-cat="${cat}" aria-label="${name} (${n})" aria-pressed="${pressed}">
              <span class="cat-name" data-icon="${icon}">${name}</span>
              <span class="cat-count">${n}</span>
            </button>
          `
        })
        .join('')

      return `
        <section class="step-card">
          <div class="step-header">
            <h3 class="step-title">Etapa SILIC: ${mapLabel(step)}</h3>
            <span class="step-total">${stageTotal} motivo${stageTotal === 1 ? '' : 's'}</span>
          </div>
          <div class="step-cards">
            ${allBtn}
            ${catButtons}
          </div>
        </section>
      `
    }

    ;(els.grid as HTMLElement).innerHTML =
      processos
      .map(([processo, byStep]) => {
        const steps = Array.from(byStep.entries())
          .filter(([step]) => step !== 'Definir')
          .sort((a, b) => a[0].localeCompare(b[0], 'pt-BR'))

        if (!steps.length) return ''

        const processoTotal = steps
          .flatMap(([, catMap]) => Array.from(catMap.values()))
          .reduce((acc, n) => acc + n, 0)

        const stepsHtml = steps
          .map(([step, catMap]) => renderStepSection(processo, step, catMap))
          .join('')

        return `
          <section class="process-card">
            <div class="process-header">
              <h2 class="process-title">Processo: ${mapLabel(processo)}</h2>
              <span class="process-total">${processoTotal} motivo${processoTotal === 1 ? '' : 's'}</span>
            </div>
            ${stepsHtml}
          </section>
        `
      })
      .join('')

    // Click em processo/etapa/categoria aplica filtro e muda para lista
    ;(els.grid as HTMLElement).querySelectorAll<HTMLButtonElement>('.cat-card')
      .forEach((btn) => {
        btn.addEventListener('click', () => {
          const processo = btn.getAttribute('data-proc') ?? ''
          const step = btn.getAttribute('data-step') ?? ''
          const cat = btn.getAttribute('data-cat') ?? ''
          if (els.processo) els.processo.value = processo
          if (els.stepSilic) els.stepSilic.value = step
          if (els.categoria) els.categoria.value = cat
          filtros.processo = processo
          filtros.stepSilic = step
          filtros.categoria = cat
          currentView = 'list'
          applyAndRender()
        })
      })
  }

  const updateResultsInfo = (total: number, totalPages?: number) => {
    if (!els.resultsInfo) return
    const parts = [] as string[]
    if (filtros.processo) parts.push(`Processo: ${filtros.processo}`)
    if (filtros.stepSilic) parts.push(`Etapa SILIC: ${filtros.stepSilic}`)
    if (filtros.tipo) parts.push(`Tipo: ${filtros.tipo}`)
    if (filtros.situacao) parts.push(`Situação: ${filtros.situacao}`)
    if (filtros.categoria) parts.push(`Categoria: ${filtros.categoria}`)
    const pageInfo = totalPages && currentView === 'list' ? ` — página ${page} de ${totalPages}` : ''
    const ctx = parts.length ? `(${parts.join(' · ')})` : ''
    els.resultsInfo.textContent = `${total} resultado${total === 1 ? '' : 's'}${pageInfo} ${ctx}`.trim()
  }
  // Chips de filtros ativos
  const chipsContainer = document.getElementById('activeChips')
  const renderChips = () => {
    if (!chipsContainer) return
    const parts: Array<{ key: keyof Filtros; label: string }> = []
    if (filtros.processo) parts.push({ key: 'processo', label: `Processo: ${filtros.processo}` })
    if (filtros.stepSilic) parts.push({ key: 'stepSilic', label: `Etapa SILIC: ${filtros.stepSilic}` })
    if (filtros.tipo) parts.push({ key: 'tipo', label: `Tipo: ${filtros.tipo}` })
    if (filtros.situacao) parts.push({ key: 'situacao', label: `Situação: ${filtros.situacao}` })
    if (filtros.categoria) parts.push({ key: 'categoria', label: `Categoria: ${filtros.categoria}` })
    if (filtros.q) parts.push({ key: 'q', label: `Busca: “${filtros.q}”` })
    chipsContainer.innerHTML = parts
      .map(
        (p) => `<span class="chip">${p.label}
          <button aria-label="Remover filtro ${p.key}" data-key="${p.key}">×</button>
        </span>`
      )
      .join('')
    chipsContainer.querySelectorAll('button[data-key]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const k = (e.currentTarget as HTMLButtonElement).dataset.key as keyof Filtros
        ;(filtros as any)[k] = ''
        if (k === 'q' && els.q) els.q.value = ''
        const el = (els as any)[k]
        if (el && 'value' in el) el.value = ''
        page = 1
        applyAndRender()
      })
    })
  }

  const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n))
  const renderMappedCatalog = (items: Reason[]) => {
    if (!els.grid) return

    const grouped = new Map<string, Map<string, Map<string, number>>>()
    for (const r of items) {
      const categoria = r.categoria || 'Não informado'
      const nivel2 = r.descricao || 'Não informado'
      const nivel3 = r.detalhes || 'Não informado'
      if (!grouped.has(categoria)) grouped.set(categoria, new Map())
      const m2 = grouped.get(categoria)!
      if (!m2.has(nivel2)) m2.set(nivel2, new Map())
      const m3 = m2.get(nivel2)!
      m3.set(nivel3, (m3.get(nivel3) ?? 0) + 1)
    }

    const categorias = Array.from(grouped.entries()).sort((a, b) => a[0].localeCompare(b[0], 'pt-BR'))

    ;(els.grid as HTMLElement).innerHTML = `
      <section class="report-board" aria-label="Mapa de motivos mapeados">
        <header class="report-head">
          <h2>Motivos mapeados</h2>
          <p>Visualização completa por Categoria → Nível 2 (descrição) → Nível 3 (detalhes).</p>
        </header>
        <div class="mapped-grid">
          ${categorias
            .map(([categoria, m2]) => {
              const total = Array.from(m2.values())
                .flatMap((m3) => Array.from(m3.values()))
                .reduce((a, n) => a + n, 0)

              const nivel2Html = Array.from(m2.entries())
                .sort((a, b) => a[0].localeCompare(b[0], 'pt-BR'))
                .map(([nivel2, m3]) => {
                  const rows = Array.from(m3.entries())
                    .sort((a, b) => a[0].localeCompare(b[0], 'pt-BR'))
                    .map(([nivel3, qtd]) => `<tr><td>${htmlEscape(nivel3)}</td><td>${qtd.toLocaleString('pt-BR')}</td></tr>`)
                    .join('')

                  return `
                    <details class="mapped-details">
                      <summary>${htmlEscape(nivel2)}</summary>
                      <table>
                        <thead><tr><th>Nível 3</th><th>Qtde</th></tr></thead>
                        <tbody>${rows}</tbody>
                      </table>
                    </details>
                  `
                })
                .join('')

              return `
                <article class="mapped-card">
                  <h3>${htmlEscape(categoria)} <span class="mapped-count">${total.toLocaleString('pt-BR')}</span></h3>
                  ${nivel2Html}
                </article>
              `
            })
            .join('')}
        </div>
      </section>
    `
  }

  const renderSyntheticReports = async () => {
    if (!els.grid) return

    const req = ++reportRequestId
    ;(els.grid as HTMLElement).innerHTML = `
      <div class="loading" role="status" aria-live="polite">
        <div class="skel"></div>
        <div class="skel"></div>
        <div class="skel"></div>
      </div>`

    try {
      const { facts, reasons } = await loadSyntheticBundle()
      if (req !== reportRequestId || currentView !== 'reports') return

      const reasonById = new Map(reasons.map((r) => [r.motivoId, r]))

      const total = facts.length
      const tempoMedio = total > 0 ? facts.reduce((acc, x) => acc + x.tempoCorrecaoDias, 0) / total : 0
      const tempoMaximo = total > 0 ? Math.max(...facts.map((x) => x.tempoCorrecaoDias)) : 0

      const normText = (v = '') =>
        v
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toLowerCase()
          .trim()

      const processoLabel = (v = '') => {
        const n = normText(v)
        if (n.includes('contrat')) return 'Contratação'
        if (n.includes('ato formal')) return 'Atos Formais'
        return v || 'Não informado'
      }

      const modalidadeLabel = (v = '') => {
        const n = normText(v)
        if (n.includes('locacao')) return 'Locação'
        if (n.includes('cessao')) return 'Cessão'
        if (n.includes('comodato')) return 'Comodato'
        return v || 'Não informado'
      }

      const servicoContratacao = (v = '') => {
        const n = normText(v)
        if (n.includes('nova unidade')) return 'Nova Unidade'
        if (n.includes('mudanca de endereco')) return 'Mudança de Endereço'
        if (n.includes('regularizacao')) return 'Regularização'
        return ''
      }

      const servicoAtosFormais = (v = '') => {
        const n = normText(v)
        if (n.includes('prorrogacao')) return 'Prorrogação'
        if (n.includes('rescisao')) return 'Rescisão'
        if (n.includes('titularidade')) return 'Alteração de titularidade'
        if (n.includes('antecipacao')) return 'Antecipação de parcela'
        if (n.includes('recebimento') && n.includes('imovel')) return 'Recebimento de imóvel'
        if (n.includes('acrescimo') && n.includes('area')) return 'Acréscimo de área'
        if (n.includes('supressao') && n.includes('area')) return 'Supressão de área'
        if (n.includes('revisao') && n.includes('aluguel')) return 'Revisão de aluguel'
        if (n.includes('reajuste') && n.includes('aluguel')) return 'Reajuste de aluguel'
        if (n.includes('apostilamento')) return 'Apostilamento'
        if (n.includes('acao renovatoria')) return 'Ação renovatória'
        return ''
      }

      const inc = (m: Map<string, number>, key: string, v = 1) => m.set(key, (m.get(key) ?? 0) + v)
      const byMotivo = new Map<string, number>()
      const byCategoria = new Map<string, number>()
      const byCategoriaNivel2 = new Map<string, number>()
      const byModalidade = new Map<string, number>()
      const byServicoContratacao = new Map<string, number>()
      const byServicoAtosFormais = new Map<string, number>()
      const byMes = new Map<string, number>()
      const byMesProcesso = new Map<string, { contratacao: number; atosFormais: number }>()

      const servicosContratacaoOrdem = ['Nova Unidade', 'Mudança de Endereço', 'Regularização']
      const servicosAtosOrdem = [
        'Prorrogação',
        'Rescisão',
        'Alteração de titularidade',
        'Antecipação de parcela',
        'Recebimento de imóvel',
        'Acréscimo de área',
        'Supressão de área',
        'Revisão de aluguel',
        'Reajuste de aluguel',
        'Apostilamento',
        'Ação renovatória'
      ]

      for (const f of facts) {
        const r = reasonById.get(f.motivoId)
        const proc = processoLabel(r?.processo || '')
        const modalidade = modalidadeLabel(r?.tipo || '')
        const sit = r?.situacao || ''
        const categoria = r?.categoria || 'Não informado'
        const nivel2 = r?.descricao || 'Não informado'
        inc(byMotivo, r?.descricao || 'Não informado')
        inc(byCategoria, categoria)
        inc(byCategoriaNivel2, `${categoria}|||${nivel2}`)
        inc(byModalidade, modalidade)
        if (proc === 'Contratação') {
          const serv = servicoContratacao(sit)
          if (serv) inc(byServicoContratacao, serv)
        } else if (proc === 'Atos Formais') {
          const serv = servicoAtosFormais(sit)
          if (serv) inc(byServicoAtosFormais, serv)
        }
        inc(byMes, f.mesRef || 'Não informado')
        const m = f.mesRef || 'Não informado'
        if (!byMesProcesso.has(m)) byMesProcesso.set(m, { contratacao: 0, atosFormais: 0 })
        const bucket = byMesProcesso.get(m)!
        if (proc === 'Contratação') bucket.contratacao += 1
        else if (proc === 'Atos Formais') bucket.atosFormais += 1
      }

      const top = (m: Map<string, number>, n: number) =>
        Array.from(m.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, n)

      const topMotivos = top(byMotivo, 8)
      const topCategorias = top(byCategoria, 6)
      const topCategoriaNivel2 = top(byCategoriaNivel2, 10)
      const topModalidades = top(byModalidade, 3)
      const meses = Array.from(byMes.entries()).sort((a, b) => a[0].localeCompare(b[0]))
      const mesesAcumulado = (() => {
        let running = 0
        let runningContratacao = 0
        let runningAtos = 0
        return meses.map(([mes, qtd]) => {
          running += qtd
          const p = byMesProcesso.get(mes) || { contratacao: 0, atosFormais: 0 }
          runningContratacao += p.contratacao
          runningAtos += p.atosFormais
          return {
            mes,
            total: running,
            contratacao: runningContratacao,
            atosFormais: runningAtos
          }
        })
      })()
      const servicosContratacao = servicosContratacaoOrdem
        .map((s) => [s, byServicoContratacao.get(s) ?? 0] as [string, number])
      const servicosAtos = servicosAtosOrdem
        .map((s) => [s, byServicoAtosFormais.get(s) ?? 0] as [string, number])

      const tableRows = (entries: Array<[string, number]>) =>
        entries
          .map(([k, v]) => `<tr><td>${htmlEscape(k)}</td><td>${v.toLocaleString('pt-BR')}</td></tr>`)
          .join('')

      const tableRowsCategoriaNivel2 = (entries: Array<[string, number]>) =>
        entries
          .map(([k, v]) => {
            const [cat, nivel2] = k.split('|||')
            return `<tr><td>${htmlEscape(cat || 'Não informado')}</td><td>${htmlEscape(nivel2 || 'Não informado')}</td><td>${v.toLocaleString('pt-BR')}</td></tr>`
          })
          .join('')

      const chartRows = (entries: Array<{ mes: string; total: number; contratacao: number; atosFormais: number }>) => {
        const max = Math.max(...entries.map((x) => x.total), 1)
        const labelMes = (m: string) => {
          const [y, mm] = m.split('-')
          return `${mm}/${y}`
        }

        return entries
          .map((entry) => {
            const width = Math.max(2, Math.round((entry.total / max) * 100))
            const percContratacao = entry.total > 0 ? (entry.contratacao / entry.total) * 100 : 0
            const percAtos = entry.total > 0 ? (entry.atosFormais / entry.total) * 100 : 0
            return `<div class="chart-row">
              <span class="chart-label">${htmlEscape(labelMes(entry.mes))}</span>
              <div class="chart-track" aria-hidden="true">
                <div class="chart-fill" style="width:${width}%"></div>
              </div>
              <span class="chart-value">${entry.total.toLocaleString('pt-BR')}</span>
              <span class="chart-detail">Contratação: ${percContratacao.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}% · Atos Formais: ${percAtos.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%</span>
            </div>`
          })
          .join('')
      }

      ;(els.grid as HTMLElement).innerHTML = `
        <section class="report-board" aria-label="Relatórios gerenciais sintéticos">
          <header class="report-head">
            <h2>Relatórios gerenciais (dados sintéticos)</h2>
            <p>Base emulada a partir do catálogo de motivos ativos. As modalidades (Locação, Cessão e Comodato) reúnem serviços de Contratação e de Atos Formais.</p>
          </header>

          <div class="report-kpis">
            <article class="report-kpi"><h3>Total devoluções</h3><strong>${total.toLocaleString('pt-BR')}</strong></article>
            <article class="report-kpi">
              <h3>
                Tempo médio de devolução
                <span class="hint" title="Média simples dos dias de devolução/correção. Fórmula sugerida ao desenvolvedor: SUM(tempoCorrecaoDias) / COUNT(casos).">
                  ⓘ
                </span>
              </h3>
              <strong>${tempoMedio.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} dias</strong>
            </article>
            <article class="report-kpi">
              <h3>
                Tempo máximo de devolução
                <span class="hint" title="Maior tempo observado entre os casos. Fórmula sugerida ao desenvolvedor: MAX(tempoCorrecaoDias).">
                  ⓘ
                </span>
              </h3>
              <strong>${tempoMaximo.toLocaleString('pt-BR')} dias</strong>
            </article>
            <article class="report-kpi"><h3>Motivos ativos</h3><strong>${reasons.length.toLocaleString('pt-BR')}</strong></article>
          </div>

          <div class="report-grid">
            <article class="report-card">
              <h3>Pareto de motivos (Top 8)</h3>
              <table><thead><tr><th>Motivo</th><th>Qtde</th></tr></thead><tbody>${tableRows(topMotivos)}</tbody></table>
            </article>
            <article class="report-card">
              <h3>Devoluções por categoria</h3>
              <table><thead><tr><th>Categoria</th><th>Qtde</th></tr></thead><tbody>${tableRows(topCategorias)}</tbody></table>
            </article>
            <article class="report-card">
              <h3>Devoluções por modalidade</h3>
              <table><thead><tr><th>Modalidade</th><th>Qtde</th></tr></thead><tbody>${tableRows(topModalidades)}</tbody></table>
            </article>
            <article class="report-card">
              <h3>Devoluções por categoria (nível 2)</h3>
              <table><thead><tr><th>Categoria</th><th>Nível 2</th><th>Qtde</th></tr></thead><tbody>${tableRowsCategoriaNivel2(topCategoriaNivel2)}</tbody></table>
            </article>
            <article class="report-card">
              <h3>Devoluções - Contratação</h3>
              <table><thead><tr><th>Serviço</th><th>Qtde</th></tr></thead><tbody>${tableRows(servicosContratacao)}</tbody></table>
            </article>
            <article class="report-card">
              <h3>Devoluções - Atos Formais</h3>
              <table><thead><tr><th>Serviço</th><th>Qtde</th></tr></thead><tbody>${tableRows(servicosAtos)}</tbody></table>
            </article>
            <article class="report-card report-card-wide">
              <h3>Tendência mensal (acumulado)</h3>
              <div class="report-chart" role="img" aria-label="Gráfico de barras do acumulado mensal de devoluções">
                ${chartRows(mesesAcumulado)}
              </div>
            </article>
          </div>
        </section>
      `
    } catch (err) {
      if (req !== reportRequestId || currentView !== 'reports') return
      ;(els.grid as HTMLElement).innerHTML = `
        <div class="error">
          Não foi possível carregar os relatórios sintéticos.<br/>
          Execute <strong>npm run mock:generate</strong> e atualize a página.
        </div>`
      console.error(err)
    }
  }

  const applyAndRender = () => {
    const out = aplicarFiltros(lista, filtros)
    // calcular paginação
    const total = out.length
    const isAll = currentView === 'list' && pageSize === 'all'
    const totalPages = currentView === 'list' ? (isAll ? 1 : Math.max(1, Math.ceil(total / (pageSize as number)))) : 1
    page = currentView === 'list' ? clamp(page, 1, totalPages) : 1
    if (currentView === 'reports') {
      if (els.resultsInfo) els.resultsInfo.textContent = 'Visualizando relatórios com dados sintéticos'
    } else if (currentView === 'mapped') {
      if (els.resultsInfo) els.resultsInfo.textContent = 'Visualizando mapa completo de motivos mapeados em uso'
    } else {
      updateResultsInfo(total, isAll ? undefined : totalPages)
    }
    // Empty state (lista)
    if (currentView === 'list' && total === 0 && els.grid) {
      ;(els.grid as HTMLElement).innerHTML = `
        <div class="empty">
          🗂️ Nenhum resultado encontrado.
        </div>`
      els.pagination?.setAttribute('hidden', 'true')
      renderChips()
      setURLState(filtros, currentView, page, pageSize)
      return
    }
    setURLState(filtros, currentView, page, pageSize)
    if (!els.grid) return
    if (currentView === 'reports') {
      els.pagination?.setAttribute('hidden', 'true')
      void renderSyntheticReports()
    } else if (currentView === 'mapped') {
      els.pagination?.setAttribute('hidden', 'true')
      renderMappedCatalog(lista)
    } else if (currentView === 'summary') {
      els.pagination?.setAttribute('hidden', 'true')
      renderSummary(out)
    } else {
      const isAll = pageSize === 'all'
      const start = isAll ? 0 : (page - 1) * (pageSize as number)
      const end = isAll ? out.length : start + (pageSize as number)
      const slice = out.slice(start, end)
      renderLista(els.grid as HTMLElement, slice)
      // render nav
      if (els.pagination && els.pageNumbers && els.btnPrev && els.btnNext) {
        if (!isAll && totalPages > 1) {
          els.pagination.removeAttribute('hidden')
          els.pageNumbers.innerHTML = ''
          // estratégia simples: mostrar até 7 botões com elipses se necessário
          const createBtn = (label: string | number, pageNum: number | null, current = false) => {
            const btn = document.createElement('button')
            btn.className = 'page-btn'
            btn.type = 'button'
            btn.textContent = String(label)
            if (current) btn.setAttribute('aria-current', 'page')
            if (pageNum !== null) {
              btn.addEventListener('click', () => {
                page = pageNum
                applyAndRender()
                window.scrollTo({ top: 0, behavior: 'smooth' })
              })
            } else {
              btn.disabled = true
            }
            return btn
          }
          const add = (el: HTMLElement) => els.pageNumbers!.appendChild(el)
          const windowSize = 5
          let startPage = Math.max(1, page - Math.floor(windowSize / 2))
          let endPage = startPage + windowSize - 1
          if (endPage > totalPages) {
            endPage = totalPages
            startPage = Math.max(1, endPage - windowSize + 1)
          }
          // Primeiro
          if (startPage > 1) {
            add(createBtn(1, 1, page === 1))
            if (startPage > 2) add(createBtn('…', null))
          }
          for (let p = startPage; p <= endPage; p++) {
            add(createBtn(p, p, p === page))
          }
          if (endPage < totalPages) {
            if (endPage < totalPages - 1) add(createBtn('…', null))
            add(createBtn(totalPages, totalPages, page === totalPages))
          }
          els.btnPrev.disabled = page <= 1
          els.btnNext.disabled = page >= totalPages
        } else {
          els.pagination.setAttribute('hidden', 'true')
        }
      }
    }
    renderChips()
  }

  // Listeners
  els.q?.addEventListener('input', (e) => {
    filtros.q = (e.target as HTMLInputElement).value || ''
    page = 1
    applyAndRender()
  })
  els.processo?.addEventListener('change', (e) => {
    filtros.processo = (e.target as HTMLSelectElement).value || ''
    page = 1
    applyAndRender()
  })
  els.stepSilic?.addEventListener('change', (e) => {
    filtros.stepSilic = (e.target as HTMLSelectElement).value || ''
    page = 1
    applyAndRender()
  })
  els.tipo?.addEventListener('change', (e) => {
    filtros.tipo = (e.target as HTMLSelectElement).value || ''
    page = 1
    applyAndRender()
  })
  els.situacao?.addEventListener('change', (e) => {
    filtros.situacao = (e.target as HTMLSelectElement).value || ''
    page = 1
    applyAndRender()
  })
  els.categoria?.addEventListener('change', (e) => {
    filtros.categoria = (e.target as HTMLSelectElement).value || ''
    page = 1
    applyAndRender()
  })

  els.viewReports?.addEventListener('click', () => {
    currentView = 'reports'
    els.viewReports?.setAttribute('aria-pressed', 'true')
    els.viewSummary?.setAttribute('aria-pressed', 'false')
    els.viewList?.setAttribute('aria-pressed', 'false')
    els.btnMappedUnused?.setAttribute('aria-pressed', 'false')
    page = 1
    applyAndRender()
  })

  // View toggle
  els.viewSummary?.addEventListener('click', () => {
    currentView = 'summary'
    els.viewReports?.setAttribute('aria-pressed', 'false')
    els.viewSummary?.setAttribute('aria-pressed', 'true')
    els.viewList?.setAttribute('aria-pressed', 'false')
    els.btnMappedUnused?.setAttribute('aria-pressed', 'false')
    page = 1
    applyAndRender()
  })
  els.viewList?.addEventListener('click', () => {
    currentView = 'list'
    els.viewReports?.setAttribute('aria-pressed', 'false')
    els.viewSummary?.setAttribute('aria-pressed', 'false')
    els.viewList?.setAttribute('aria-pressed', 'true')
    els.btnMappedUnused?.setAttribute('aria-pressed', 'false')
    page = 1
    applyAndRender()
  })

  if (els.btnMappedUnused) {
    els.btnMappedUnused.hidden = false
    els.btnMappedUnused.textContent = 'Motivos mapeados em uso'
    els.btnMappedUnused.setAttribute('aria-pressed', 'false')
  }

  els.btnMappedUnused?.addEventListener('click', () => {
    currentView = 'mapped'
    els.viewReports?.setAttribute('aria-pressed', 'false')
    els.viewSummary?.setAttribute('aria-pressed', 'false')
    els.viewList?.setAttribute('aria-pressed', 'false')
    els.btnMappedUnused?.setAttribute('aria-pressed', 'true')
    page = 1
    applyAndRender()
  })

  // Paginação: tamanho de página e navegação
  els.pageSize?.addEventListener('change', (e) => {
    const val = (e.target as HTMLSelectElement).value
    pageSize = val === 'all' ? 'all' : Math.max(1, parseInt(val, 10) || 10)
    page = 1
    applyAndRender()
  })
  els.btnPrev?.addEventListener('click', () => {
    if (page > 1) {
      page -= 1
      applyAndRender()
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  })
  els.btnNext?.addEventListener('click', () => {
    page += 1
    applyAndRender()
    window.scrollTo({ top: 0, behavior: 'smooth' })
  })

  // Voltar/avançar do navegador: re-aplica estado
  window.addEventListener('popstate', () => {
    const st = getURLState()
    if (els.q) els.q.value = st.q
    if (els.processo) els.processo.value = st.processo
    if (els.stepSilic) els.stepSilic.value = st.stepSilic
    if (els.tipo) els.tipo.value = st.tipo
    if (els.situacao) els.situacao.value = st.situacao
    if (els.categoria) els.categoria.value = st.categoria
    filtros.q = st.q
    filtros.processo = st.processo
    filtros.stepSilic = st.stepSilic
    filtros.tipo = st.tipo
    filtros.situacao = st.situacao
    filtros.categoria = st.categoria
    currentView = st.view
    page = st.page
    pageSize = st.size
    if (els.pageSize) {
      const opt = Array.from(els.pageSize.options).find(o => (o.value === 'all' && pageSize === 'all') || parseInt(o.value, 10) === pageSize)
      if (opt) els.pageSize.value = opt.value
    }
    els.viewReports?.setAttribute('aria-pressed', currentView === 'reports' ? 'true' : 'false')
    els.viewSummary?.setAttribute('aria-pressed', currentView === 'summary' ? 'true' : 'false')
    els.viewList?.setAttribute('aria-pressed', currentView === 'list' ? 'true' : 'false')
    els.btnMappedUnused?.setAttribute('aria-pressed', currentView === 'mapped' ? 'true' : 'false')
    applyAndRender()
  })

  // Primeira renderização
  applyAndRender()
}

boot().catch((err) => {
  console.error('Falha ao iniciar:', err)
  if (els.grid) {
    ;(els.grid as HTMLElement).innerHTML = `<div class="error">Erro ao carregar dados.</div>`
  }
})
