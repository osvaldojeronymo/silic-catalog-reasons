import type { Catalogo } from '@/types/reason'

const norm = (s = '') =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()

const normalizeProcesso = (value = '') => {
  const n = norm(value)
  if (n.includes('contrat')) return 'Contratação'
  if (n.includes('ato formal')) return 'Atos Formais'
  return value
}

export async function loadCatalog(): Promise<Catalogo> {
  const url = import.meta.env.BASE_URL + 'reasons.unified.json'
  const res = await fetch(url, { cache: 'no-store' })
  if (!res.ok) throw new Error('Falha ao carregar reasons.unified.json')

  const raw = (await res.json()) as {
    sourceMeta?: { reasons?: { versao?: string } }
    unifiedByKey?: Array<{
      canonical?: {
        processo?: string
        tipo?: string
        situacao?: string
        stepSilic?: string
        categoria?: string
        descricao?: string
        detalhes?: string
      }
    }>
  }

  const geral = Array.isArray(raw.unifiedByKey)
    ? raw.unifiedByKey
        .map((x) => x.canonical)
        .filter((x): x is NonNullable<typeof x> => Boolean(x))
        .map((x) => ({
          processo: normalizeProcesso(x.processo ?? ''),
          tipo: x.tipo ?? '',
          situacao: x.situacao ?? '',
          stepSilic: x.stepSilic ?? 'Definir',
          categoria: x.categoria ?? '',
          descricao: x.descricao ?? '',
          detalhes: x.detalhes ?? ''
        }))
    : []

  return {
    schemaVersion: '2.0.0',
    sourceMeta: { versao: raw.sourceMeta?.reasons?.versao },
    geral
  }
}
