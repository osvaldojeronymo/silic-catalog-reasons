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

const normalizeCategoria = (value = '') => {
  const n = norm(value)
  if (!n) return ''
  if (n === 'documentacao') return 'Documentação'
  if (n === 'financeiro') return 'Financeiro'
  if (n === 'processual') return 'Processual'
  if (n === 'dados adicionais') return 'Dados Adicionais'
  if (n === 'dados iniciais') return 'Dados Iniciais'
  if (n === 'dados do contrato') return 'Dados do Contrato'
  if (n === 'dados do locador') return 'Dados do Locador'
  if (n === 'representante legal') return 'Representante Legal'
  return value
}

const capitalizeFirst = (value = '') => {
  const s = value.trim()
  if (!s) return ''
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export async function loadCatalog(): Promise<Catalogo> {
  const base = import.meta.env.BASE_URL
  const primaryUrl = base + 'reasons.mapeados-uso.json'
  const legacyUrl = base + 'reasons.unified.json'

  let res = await fetch(primaryUrl, { cache: 'no-store' })
  if (!res.ok) {
    res = await fetch(legacyUrl, { cache: 'no-store' })
  }
  if (!res.ok) throw new Error('Falha ao carregar catálogo de motivos')

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
          categoria: normalizeCategoria(x.categoria ?? ''),
          descricao: capitalizeFirst(x.descricao ?? ''),
          detalhes: x.detalhes ?? ''
        }))
    : []

  return {
    schemaVersion: '2.0.0',
    sourceMeta: { versao: raw.sourceMeta?.reasons?.versao },
    geral
  }
}
