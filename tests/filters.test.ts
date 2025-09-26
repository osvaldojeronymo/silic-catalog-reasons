import { describe, expect, it } from 'vitest'
import { aplicarFiltros, type Filtros } from '@/ui/filters'
import type { Reason } from '@/types/reason'

const data: Reason[] = [
  { processo: 'ato formal', tipo: 'locacao', situacao: 'prorrogacao', categoria: 'financeiro', descricao: 'pre-comprometimento' },
  { processo: 'ato formal', tipo: 'cessao', situacao: 'nova unidade', categoria: 'processual', descricao: 'laudo de avaliacao' },
]

describe('aplicarFiltros', () => {
  it('filtra por categoria e tipo', () => {
    const filtros: Filtros = { q: '', processo: '', tipo: 'locacao', situacao: '', categoria: 'financeiro' }
    const out = aplicarFiltros(data, filtros)
    expect(out.length).toBe(1)
    expect(out[0]!.descricao).toContain('pre-comprometimento')
  })

  it('filtra por busca textual (normalizada)', () => {
    const filtros: Filtros = { q: 'avaliacao', processo: '', tipo: '', situacao: '', categoria: '' }
    const out = aplicarFiltros(data, filtros)
    expect(out.length).toBe(1)
    expect(out[0]!.descricao).toContain('laudo')
  })
})
