import type { Reason } from '@/types/reason'

const stripAccents = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
const norm = (s = '') => stripAccents(s).toLowerCase().trim().replace(/\s+/g, ' ')

export type Filtros = {
  q: string
  processo: string
  tipo: string
  situacao: string
  categoria: string
}

export function aplicarFiltros(lista: Reason[], f: Filtros): Reason[] {
  const qn = norm(f.q)
  return lista.filter((r) => {
    const okProc = !f.processo || r.processo === f.processo
    const okTipo = !f.tipo || r.tipo === f.tipo
    const okSit = !f.situacao || r.situacao === f.situacao
    const okCat = !f.categoria || r.categoria === f.categoria
    const texto = `${r.descricao ?? ''} ${r.detalhes ?? ''}`
    const okQ = !qn || norm(texto).includes(qn)
    return okProc && okTipo && okSit && okCat && okQ
  })
}
