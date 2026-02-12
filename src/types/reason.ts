export type Reason = {
  processo: string
  tipo: string
  situacao: string
  stepSilic: string
  categoria: string
  descricao: string
  detalhes?: string
}

export type Catalogo = {
  schemaVersion?: string
  generatedAt?: string
  sourceMeta?: { versao?: string }
  geral: Reason[]
}
