import type { Catalogo } from '@/types/reason'

export async function loadCatalog(): Promise<Catalogo> {
  const url = import.meta.env.BASE_URL + 'reasons.normalized.json'
  const res = await fetch(url, { cache: 'no-store' })
  if (!res.ok) throw new Error('Falha ao carregar reasons.normalized.json')
  return (await res.json()) as Catalogo
}
