# SILIC 2.0 — Catálogo de Motivos (Vite + TS)

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

O `vite.config.ts` define `base: '/silic-catalog-reasons/'` para funcionar em Pages.
Certifique-se de publicar `dist/` como site estático.

## CI

Workflow em `.github/workflows/ci.yml` com: install, typecheck, lint, unit, build, e2e (preview no CI).

## Dados

O app consome `public/reasons.normalized.json`, que já está normalizado (minúsculas/sem acentos),
reduzindo lógica de normalização no runtime.
