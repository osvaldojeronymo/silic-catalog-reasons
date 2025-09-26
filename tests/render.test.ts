import { describe, expect, it } from 'vitest'
import { renderLista } from '@/ui/render'
import type { Reason } from '@/types/reason'

describe('renderLista', () => {
  it('renderiza vazio com mensagem', () => {
    const div = document.createElement('div')
    renderLista(div, [])
    expect(div.textContent).toMatch(/Nenhum registro/i)
  })

  it('renderiza cards com dados', () => {
    const div = document.createElement('div')
    const items: Reason[] = [
      { processo: 'ato formal', tipo: 'locacao', situacao: 'prorrogacao', categoria: 'financeiro', descricao: 'pre-comprometimento' }
    ]
    renderLista(div, items)
    expect(div.querySelectorAll('.card').length).toBe(1)
    expect(div.textContent).toMatch(/pre-comprometimento/i)
  })
})
