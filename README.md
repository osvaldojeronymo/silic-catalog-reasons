# SILIC 2.0 — Catálogo de Motivos (Vite + TS)

[![Deploy](https://github.com/osvaldojeronymo/silic-catalog-reasons/actions/workflows/deploy.yml/badge.svg)](https://github.com/osvaldojeronymo/silic-catalog-reasons/actions/workflows/deploy.yml)

Site publicado: https://osvaldojeronymo.github.io/silic-catalog-reasons/

Projeto estático com Vite 7, TypeScript 5, Vitest, Playwright, ESLint (flat) e Prettier.

## Como rodar

- Dev server:

```bash
npm run dev
```

- Lint e format:

```bash
npm run lint
npm run lint:fix
npm run format
```

- Typecheck:

```bash
npm run typecheck
```

- Testes unitários:

```bash
npm run test -- --run
npm run test:watch
npm run test:cov
```

- Build e preview:

```bash
npm run build
npm run preview -- --strictPort
```

- E2E (local):

```bash
npm run test:e2e
```

## Estrutura

- `src/types/reason.ts`: tipos canônicos `Reason`/`Catalogo`
- `src/data/fetch.ts`: carregamento do JSON normalizado via `BASE_URL`
- `src/ui/filters.ts`: normalização e filtros (busca e selects)
- `src/ui/render.ts`: renderização e preenchimento de selects
- `src/main.ts`: boot e amarração dos componentes

## GitHub Pages

Publicação via GitHub Actions (`deploy.yml`) usando artifact de build (`dist/`).

`vite.config.ts` define `base: '/silic-catalog-reasons/'` garantindo paths corretos no subdiretório do Pages.

Para disparar novo deploy: qualquer commit na branch `main`.

Ver logs em: Actions > Deploy to GitHub Pages.

## CI

Workflow em `.github/workflows/ci.yml` com: install, typecheck, lint, unit, build, e2e (preview no CI).

## Dados

O app consome `public/reasons.unified.json`.

Para (re)gerar os dados unificados e arquivos corrigidos:

```bash
npm run merge:reasons
```

Arquivos gerados:

- `public/reasons.unified.json`
- `public/reasons.normalized.fixed.json`
- `public/motivos_tabela_completa.fixed.json`
