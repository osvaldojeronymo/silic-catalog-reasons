import type { Reason } from '@/types/reason'

const LABELS_GENERIC: Record<string, string> = {
  locacao: 'Locação',
  cessao: 'Cessão',
  comodato: 'Comodato',
  'ato formal': 'Ato formal',
  prorrogacao: 'Prorrogação',
  'mudanca de endereco': 'Mudança de endereço',
  'nova unidade': 'Nova unidade',
  regularizacao: 'Regularização',
  'acao renovatoria': 'Ação renovatória',
  'alteracao de titularidade': 'Alteração de titularidade',
  documentacao: 'Documentação',
  financeiro: 'Financeiro',
  processual: 'Processual'
}

export const mapLabel = (v: string) => LABELS_GENERIC[v] ?? v

export function renderLista(container: HTMLElement, lista: Reason[]) {
  if (!lista.length) {
    container.innerHTML = `<div class="empty">Nenhum registro encontrado.</div>`
    return
  }
  const codeOf = (r: Reason) => {
    const raw = r.descricao
      .normalize('NFD')
      .replace(/[^\p{L}\p{N} ]+/gu, '')
      .trim()
      .split(/\s+/)
      .slice(0, 3)
      .join('-')
      .toUpperCase()
    let base = raw.replace(/[^A-Z0-9-]/g, '')
    if (!base) base = 'SEM-DESC'
    if (base.length > 11) base = base.slice(0, 11)
    return base
  }
  const pill = (txt: string, cls = '') => `<span class="pill ${cls}">${txt}</span>`
  const statusCls = (s: string) => {
    const n = s.toLowerCase()
    if (n.includes('indefer') || n.includes('não') || n.includes('nao')) return 'card--err'
    if (n.includes('pend') || n.includes('ajuste') || n.includes('correção') || n.includes('correcao')) return 'card--warn'
    return 'card--ok'
  }

  container.innerHTML = lista
    .map((r) => {
      const codigo = codeOf(r)
      const p = mapLabel(r.processo)
      const t = mapLabel(r.tipo)
      const s = mapLabel(r.situacao)
      const cat = mapLabel(r.categoria)
      const cls = statusCls(s)
      // Categoria: abreviações em PT-BR para manter significado curto.
      const ABBR: Record<string, string> = {
        'DOCUMENTAÇÃO': 'DOC',
        'FINANCEIRO': 'FIN',
        'PROCESSUAL': 'PROC'
      }
      const fullCat = cat.toUpperCase()
      // Usa mapeamento conhecido; caso contrário heurística: primeira palavra >=4 letras -> 3 primeiras letras
      let shortCat = ABBR[fullCat]
      if (!shortCat) {
        const parts = fullCat.split(/\s+/)
        if (parts.length === 1) {
          const w = parts[0]
          if (w) {
            if (w.length <= 4) shortCat = w // palavra já curta
            else if (w.length <= 6) shortCat = w.slice(0, 4)
            else if (w.length <= 10) shortCat = w.slice(0, 5)
            else shortCat = w.slice(0, 3) // muito longa sem regra conhecida
          } else shortCat = ''
        } else {
          // Frases: pega iniciais até 5 chars
          shortCat = parts.map(p => p[0]).join('').slice(0, 5)
        }
      }
      const catTitleAttr = shortCat !== fullCat ? ` title="${fullCat}"` : ''
      return `
      <div class="card ${cls}">
        ${r.detalhes ? `<div class="card-details">${r.detalhes}</div>` : ''}
        <div class="code">${r.descricao}</div>
        <div class="card-meta">
          ${pill(p)}
          ${pill(t)}
          ${pill(s)}
        </div>
  <div class="card-title"${catTitleAttr}>${shortCat}</div>
      </div>
      `
    })
    .join('')
}

export function fillSelect(select: HTMLSelectElement, values: string[], mapLabelFn = mapLabel) {
  const first = select.querySelector('option')
  select.innerHTML = ''
  if (first) select.appendChild(first)
  values
    .slice()
    .sort((a, b) => a.localeCompare(b, 'pt-BR'))
    .forEach((v) => {
      const opt = document.createElement('option')
      opt.value = v
      opt.textContent = mapLabelFn(v)
      select.appendChild(opt)
    })
}
