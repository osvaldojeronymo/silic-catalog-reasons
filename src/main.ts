// src/main.ts — App unificado usando dataset normalizado
import './styles/style.css'
import type { Reason } from '@/types/reason'
import { loadCatalog } from '@/data/fetch'
import { aplicarFiltros, type Filtros } from '@/ui/filters'
import { fillSelect, renderLista, mapLabel } from '@/ui/render'

// Refs DOM
const els = {
  q: document.getElementById('q') as HTMLInputElement | null,
  processo: document.getElementById('processo') as HTMLSelectElement | null,
  tipo: document.getElementById('tipo') as HTMLSelectElement | null,
  situacao: document.getElementById('situacao') as HTMLSelectElement | null,
  categoria: document.getElementById('categoria') as HTMLSelectElement | null,
  grid: document.getElementById('grid'),
  metaVersao: document.getElementById('metaVersao'),
  viewSummary: document.getElementById('viewSummary') as HTMLButtonElement | null,
  viewList: document.getElementById('viewList') as HTMLButtonElement | null,
  btnReset: document.getElementById('btnReset') as HTMLButtonElement | null,
  resultsInfo: document.getElementById('resultsInfo') as HTMLSpanElement | null,
  btnDensity: document.getElementById('btnDensity') as HTMLButtonElement | null,
  pagination: document.getElementById('pagination') as HTMLDivElement | null,
  pageSize: document.getElementById('pageSize') as HTMLSelectElement | null,
  btnPrev: document.getElementById('btnPrev') as HTMLButtonElement | null,
  btnNext: document.getElementById('btnNext') as HTMLButtonElement | null,
  pageNumbers: document.getElementById('pageNumbers') as HTMLDivElement | null
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
  if (els.tipo) fillSelect(els.tipo, uniq(lista.map((x) => x.tipo).filter(Boolean)))
  if (els.situacao) fillSelect(els.situacao, uniq(lista.map((x) => x.situacao).filter(Boolean)))
  if (els.categoria) fillSelect(els.categoria, uniq(lista.map((x) => x.categoria).filter(Boolean)))

  // Estado dos filtros
  type URLState = {
    q: string
    processo: string
    tipo: string
    situacao: string
    categoria: string
    view: 'summary' | 'list'
    page: number
    size: number | 'all'
  }
  const getURLState = (): URLState => {
    const sp = new URLSearchParams(location.search)
    return {
      q: sp.get('q') ?? '',
      processo: sp.get('processo') ?? '',
      tipo: sp.get('tipo') ?? '',
      situacao: sp.get('situacao') ?? '',
      categoria: sp.get('categoria') ?? '',
      view: (sp.get('view') as 'summary' | 'list' | null) ?? 'summary',
      page: Math.max(1, parseInt(sp.get('page') || '1', 10)),
      size: sp.get('size') === 'all' ? 'all' : Math.max(1, parseInt(sp.get('size') || '10', 10))
    }
  }
  const setURLState = (f: Filtros, view: 'summary' | 'list', page: number, size: number | 'all') => {
    const sp = new URLSearchParams()
    if (f.q) sp.set('q', f.q)
    if (f.processo) sp.set('processo', f.processo)
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
  if (els.tipo) els.tipo.value = initial.tipo
  if (els.situacao) els.situacao.value = initial.situacao
  if (els.categoria) els.categoria.value = initial.categoria

  const filtros: Filtros = {
    q: initial.q,
    processo: initial.processo,
    tipo: initial.tipo,
    situacao: initial.situacao,
    categoria: initial.categoria
  }

  let currentView: 'summary' | 'list' = initial.view
  let compact = false
  let pageSize: number | 'all' = initial.size || 10
  let page = initial.page || 1
  els.viewSummary?.setAttribute('aria-pressed', currentView === 'summary' ? 'true' : 'false')
  els.viewList?.setAttribute('aria-pressed', currentView === 'list' ? 'true' : 'false')
  if (els.pageSize) {
    const opt = Array.from(els.pageSize.options).find(o => (o.value === 'all' && pageSize === 'all') || parseInt(o.value, 10) === pageSize)
    if (opt) els.pageSize.value = opt.value
  }

  const CAT_ICONS: Record<string, string> = {
    documentacao: '📄',
    financeiro: '💰',
    processual: '⚖️'
  }

  function renderSummary(items: Reason[]) {
    if (!els.grid) return
    // Agrupa por categoria e mostra contagens
    const map = new Map<string, number>()
    for (const r of items) map.set(r.categoria, (map.get(r.categoria) ?? 0) + 1)
    const cats = Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0], 'pt-BR'))
    ;(els.grid as HTMLElement).innerHTML = cats
      .map(([cat, n]) => {
        const icon = CAT_ICONS[cat] ?? '📁'
        const name = mapLabel(cat)
        const pressed = filtros.categoria === cat ? 'true' : 'false'
        return `
          <button class="cat-card" data-cat="${cat}" aria-label="${name} (${n})" aria-pressed="${pressed}">
            <span class="cat-name" data-icon="${icon}">${name}</span>
            <span class="cat-count">${n}</span>
          </button>
        `
      })
      .join('')

    // Click numa categoria aplica filtro e muda para lista
    ;(els.grid as HTMLElement).querySelectorAll<HTMLButtonElement>('.cat-card')
      .forEach((btn) => {
        btn.addEventListener('click', () => {
          const val = btn.getAttribute('data-cat') ?? ''
          if (els.categoria) els.categoria.value = val
          filtros.categoria = val
          currentView = 'list'
          applyAndRender()
        })
      })
  }

  const updateResultsInfo = (total: number, totalPages?: number) => {
    if (!els.resultsInfo) return
    const parts = [] as string[]
    if (filtros.processo) parts.push(`Processo: ${filtros.processo}`)
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
  const applyAndRender = () => {
    const out = aplicarFiltros(lista, filtros)
    // calcular paginação
    const total = out.length
  const isAll = currentView === 'list' && pageSize === 'all'
  const totalPages = currentView === 'list' ? (isAll ? 1 : Math.max(1, Math.ceil(total / (pageSize as number)))) : 1
  page = currentView === 'list' ? clamp(page, 1, totalPages) : 1
  updateResultsInfo(total, isAll ? undefined : totalPages)
    // Empty state (lista)
    if (currentView === 'list' && total === 0 && els.grid) {
      ;(els.grid as HTMLElement).innerHTML = `
        <div class="empty">
          🗂️ Nenhum resultado encontrado.<br/>
          <button id="clearFilters" class="btn btn-secondary" style="margin-top:10px">Limpar filtros</button>
        </div>`
      document.getElementById('clearFilters')?.addEventListener('click', () => {
        filtros.q = filtros.processo = filtros.tipo = filtros.situacao = filtros.categoria = ''
        if (els.q) els.q.value = ''
        if (els.processo) els.processo.value = ''
        if (els.tipo) els.tipo.value = ''
        if (els.situacao) els.situacao.value = ''
        if (els.categoria) els.categoria.value = ''
        page = 1
        applyAndRender()
      })
      els.pagination?.setAttribute('hidden', 'true')
      renderChips()
      setURLState(filtros, currentView, page, pageSize)
      return
    }
    setURLState(filtros, currentView, page, pageSize)
    if (!els.grid) return
    if (currentView === 'summary') {
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

  // View toggle
  els.viewSummary?.addEventListener('click', () => {
    currentView = 'summary'
    els.viewSummary?.setAttribute('aria-pressed', 'true')
    els.viewList?.setAttribute('aria-pressed', 'false')
    page = 1
    applyAndRender()
  })
  els.viewList?.addEventListener('click', () => {
    currentView = 'list'
    els.viewSummary?.setAttribute('aria-pressed', 'false')
    els.viewList?.setAttribute('aria-pressed', 'true')
    page = 1
    applyAndRender()
  })

  // Reset filtros
  els.btnReset?.addEventListener('click', () => {
    if (els.q) els.q.value = ''
    if (els.processo) els.processo.value = ''
    if (els.tipo) els.tipo.value = ''
    if (els.situacao) els.situacao.value = ''
    if (els.categoria) els.categoria.value = ''
    filtros.q = filtros.processo = filtros.tipo = filtros.situacao = filtros.categoria = ''
    currentView = 'summary'
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

  // Alterna densidade compacta da lista
  els.btnDensity?.addEventListener('click', () => {
    compact = !compact
    document.documentElement.toggleAttribute('data-compact', compact)
    els.btnDensity && (els.btnDensity.textContent = compact ? 'Modo confortável' : 'Modo compacto')
  })

  // Voltar/avançar do navegador: re-aplica estado
  window.addEventListener('popstate', () => {
    const st = getURLState()
    if (els.q) els.q.value = st.q
    if (els.processo) els.processo.value = st.processo
    if (els.tipo) els.tipo.value = st.tipo
    if (els.situacao) els.situacao.value = st.situacao
    if (els.categoria) els.categoria.value = st.categoria
    filtros.q = st.q
    filtros.processo = st.processo
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
    els.viewSummary?.setAttribute('aria-pressed', currentView === 'summary' ? 'true' : 'false')
    els.viewList?.setAttribute('aria-pressed', currentView === 'list' ? 'true' : 'false')
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
