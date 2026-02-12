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
      const step = mapLabel(r.stepSilic || 'Definir')
      const cls = statusCls(s)
      return `
      <div class="card ${cls}">
        ${r.detalhes ? `<div class="card-details">${r.detalhes}</div>` : ''}
        <div class="code">${r.descricao}</div>
        <div class="card-meta">
          ${pill(p)}
          ${pill(`Etapa SILIC: ${step}`, 'step')}
          ${pill(t)}
          ${pill(s)}
        </div>
        <div class="card-title">${cat}</div>
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
