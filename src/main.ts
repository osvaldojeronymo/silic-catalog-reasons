// src/main.ts — App unificado usando dataset normalizado
import './styles/style.css';
import type { Reason } from '@/types/reason';
import { loadCatalog } from '@/data/fetch';
import { aplicarFiltros, type Filtros } from '@/ui/filters';
import { fillSelect, renderLista, mapLabel } from '@/ui/render';

type ViewMode = 'summary' | 'list' | 'reports' | 'mapped';

// Refs DOM
const els = {
  dashboardKpis: document.getElementById('dashboardKpis'),
  openFiltersBtn: document.getElementById('openFiltersBtn') as HTMLButtonElement | null,
  closeFiltersBtn: document.getElementById('closeFiltersBtn') as HTMLButtonElement | null,
  filtersDrawer: document.getElementById('filtersDrawer'),
  drawerBackdrop: document.getElementById('drawerBackdrop'),
  q: document.getElementById('q') as HTMLInputElement | null,
  processo: document.getElementById('processo') as HTMLSelectElement | null,
  stepSilic: document.getElementById('stepSilic') as HTMLSelectElement | null,
  tipo: document.getElementById('tipo') as HTMLSelectElement | null,
  situacao: document.getElementById('situacao') as HTMLSelectElement | null,
  categoria: document.getElementById('categoria') as HTMLSelectElement | null,
  grid: document.getElementById('grid'),
  metaVersao: document.getElementById('metaVersao'),
  viewReports: document.getElementById('viewReports') as HTMLButtonElement | null,
  viewSummary: document.getElementById('viewSummary') as HTMLButtonElement | null,
  viewList: document.getElementById('viewList') as HTMLButtonElement | null,
  btnMappedUnused: document.getElementById('btnMappedUnused') as HTMLButtonElement | null,
  resultsInfo: document.getElementById('resultsInfo') as HTMLSpanElement | null,
  pagination: document.getElementById('pagination') as HTMLDivElement | null,
  pageSize: document.getElementById('pageSize') as HTMLSelectElement | null,
  btnPrev: document.getElementById('btnPrev') as HTMLButtonElement | null,
  btnNext: document.getElementById('btnNext') as HTMLButtonElement | null,
  pageNumbers: document.getElementById('pageNumbers') as HTMLDivElement | null,
};

type SyntheticFact = {
  mesRef: string;
  motivoId: number;
  unidadeId: number;
  criticidade: string;
  tempoCorrecaoDias: number;
  slaEstourado: number;
};

type SyntheticReason = {
  motivoId: number;
  processo: string;
  tipo: string;
  categoria: string;
  descricao: string;
  situacao: string;
};

type SyntheticUnit = {
  unidadeId: number;
  unidade: string;
  regiao: string;
};

type SyntheticBundle = {
  facts: SyntheticFact[];
  reasons: SyntheticReason[];
  units: SyntheticUnit[];
};

let syntheticCache: SyntheticBundle | null = null;
let reportRequestId = 0;

const DRAWER_STORAGE_KEY = 'silic-catalog-reasons:filters-drawer';

const PRIORITY_CATEGORIES = [
  'Processual',
  'Documentação',
  'Financeiro',
  'Dados do Contrato',
  'Dados Iniciais',
  'Dados do Locador',
  'Representante Legal',
];

const htmlEscape = (v: string) =>
  String(v)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

const capitalizeFirst = (value = '') => {
  const s = value.trim();
  if (!s) return '';
  return s.charAt(0).toUpperCase() + s.slice(1);
};

const normalizeCategoriaLabel = (value = '') => {
  const s = value.trim();
  if (!s) return '';
  const n = s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
  if (n === 'documentacao') return 'Documentação';
  if (n === 'financeiro') return 'Financeiro';
  if (n === 'processual') return 'Processual';
  if (n === 'dados adicionais') return 'Dados Adicionais';
  if (n === 'dados iniciais') return 'Dados Iniciais';
  if (n === 'dados do contrato') return 'Dados do Contrato';
  if (n === 'dados do locador') return 'Dados do Locador';
  if (n === 'representante legal') return 'Representante Legal';
  return capitalizeFirst(s);
};

const priorityIndex = (categoria: string) => {
  const normalized = normalizeCategoriaLabel(categoria);
  const idx = PRIORITY_CATEGORIES.indexOf(normalized);
  return idx === -1 ? Number.MAX_SAFE_INTEGER : idx;
};

const isPriorityCategory = (categoria: string) =>
  priorityIndex(categoria) !== Number.MAX_SAFE_INTEGER;

const sortCategories = (a: string, b: string) => {
  const pa = priorityIndex(a);
  const pb = priorityIndex(b);
  if (pa !== pb) return pa - pb;
  return a.localeCompare(b, 'pt-BR');
};

const readDrawerPreference = () => {
  try {
    return window.localStorage.getItem(DRAWER_STORAGE_KEY) === 'open';
  } catch {
    return false;
  }
};

const persistDrawerPreference = (open: boolean) => {
  try {
    window.localStorage.setItem(DRAWER_STORAGE_KEY, open ? 'open' : 'closed');
  } catch {
    // Ignora indisponibilidade de storage sem afetar a navegação.
  }
};

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        field += '"';
        i += 1;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      continue;
    }

    if (ch === ',') {
      row.push(field);
      field = '';
      continue;
    }

    if (ch === '\n') {
      row.push(field);
      field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
      continue;
    }

    if (ch === '\r') continue;
    field += ch;
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    if (row.length > 1 || row[0] !== '') rows.push(row);
  }

  return rows;
}

function csvToObjects(text: string): Array<Record<string, string>> {
  const rows = parseCsv(text);
  if (!rows.length) return [];
  const headers = rows[0];
  return rows.slice(1).map((cols) => {
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => {
      obj[h] = cols[i] ?? '';
    });
    return obj;
  });
}

async function loadSyntheticBundle(): Promise<SyntheticBundle> {
  if (syntheticCache) return syntheticCache;
  const base = import.meta.env.BASE_URL;
  const [factsRes, reasonsRes, unitsRes] = await Promise.all([
    fetch(base + 'mock/fato_devolucoes.synthetic.csv', { cache: 'no-store' }),
    fetch(base + 'mock/dim_motivos.synthetic.csv', { cache: 'no-store' }),
    fetch(base + 'mock/dim_unidades.synthetic.csv', { cache: 'no-store' }),
  ]);

  if (!factsRes.ok || !reasonsRes.ok || !unitsRes.ok) {
    throw new Error('Arquivos sintéticos não encontrados. Execute: npm run mock:generate');
  }

  const [factsCsv, reasonsCsv, unitsCsv] = await Promise.all([
    factsRes.text(),
    reasonsRes.text(),
    unitsRes.text(),
  ]);

  const facts = csvToObjects(factsCsv).map((r) => ({
    mesRef: r.mesRef,
    motivoId: Number(r.motivoId || 0),
    unidadeId: Number(r.unidadeId || 0),
    criticidade: r.criticidade || 'Baixa',
    tempoCorrecaoDias: Number(r.tempoCorrecaoDias || 0),
    slaEstourado: Number(r.slaEstourado || 0),
  }));

  const reasons = csvToObjects(reasonsCsv).map((r) => ({
    motivoId: Number(r.motivoId || 0),
    processo: r.processo || '',
    tipo: r.tipo || '',
    categoria: normalizeCategoriaLabel(r.categoria || ''),
    descricao: capitalizeFirst(r.descricao || ''),
    situacao: r.situacao || '',
  }));

  const units = csvToObjects(unitsCsv).map((r) => ({
    unidadeId: Number(r.unidadeId || 0),
    unidade: r.unidade || '',
    regiao: r.regiao || '',
  }));

  syntheticCache = { facts, reasons, units };
  return syntheticCache;
}

async function boot() {
  const setDrawerOpen = (open: boolean) => {
    els.filtersDrawer?.classList.toggle('is-open', open);
    els.drawerBackdrop?.toggleAttribute('hidden', !open);
    document.body.classList.toggle('drawer-open', open);
    els.openFiltersBtn?.setAttribute('aria-expanded', open ? 'true' : 'false');
    persistDrawerPreference(open);
  };

  // Loading state (skeleton)
  if (els.grid) {
    (els.grid as HTMLElement).innerHTML = `
      <div class="loading" role="status" aria-live="polite">
        <div class="skel"></div>
        <div class="skel"></div>
        <div class="skel"></div>
      </div>`;
  }

  // Path robusto para Pages e dev
  const data = await loadCatalog();
  const lista: Reason[] = Array.isArray(data?.geral) ? data.geral : [];

  // versão
  const versao = data?.sourceMeta?.versao;
  if (els.metaVersao && versao) {
    els.metaVersao.textContent = `Versão do catálogo: ${versao}`;
  }

  // Popular selects dinamicamente
  const uniq = <T>(arr: T[]) => Array.from(new Set(arr));
  if (els.processo) fillSelect(els.processo, uniq(lista.map((x) => x.processo).filter(Boolean)));
  if (els.stepSilic) fillSelect(els.stepSilic, uniq(lista.map((x) => x.stepSilic).filter(Boolean)));
  if (els.tipo) fillSelect(els.tipo, uniq(lista.map((x) => x.tipo).filter(Boolean)));
  if (els.situacao) fillSelect(els.situacao, uniq(lista.map((x) => x.situacao).filter(Boolean)));
  if (els.categoria) fillSelect(els.categoria, uniq(lista.map((x) => x.categoria).filter(Boolean)));

  // Estado dos filtros
  type URLState = {
    q: string;
    processo: string;
    stepSilic: string;
    tipo: string;
    situacao: string;
    categoria: string;
    view: ViewMode;
    page: number;
    size: number | 'all';
  };
  const getURLState = (): URLState => {
    const sp = new URLSearchParams(location.search);
    return {
      q: sp.get('q') ?? '',
      processo: sp.get('processo') ?? '',
      stepSilic: sp.get('stepSilic') ?? '',
      tipo: sp.get('tipo') ?? '',
      situacao: sp.get('situacao') ?? '',
      categoria: sp.get('categoria') ?? '',
      view:
        ((sp.get('view') as ViewMode | null) ?? 'reports') === 'reports'
          ? 'reports'
          : ((sp.get('view') as ViewMode | null) ?? 'reports') === 'list'
            ? 'list'
            : ((sp.get('view') as ViewMode | null) ?? 'reports') === 'mapped'
              ? 'mapped'
              : 'reports',
      page: Math.max(1, parseInt(sp.get('page') || '1', 10)),
      size: sp.get('size') === 'all' ? 'all' : Math.max(1, parseInt(sp.get('size') || '10', 10)),
    };
  };
  const setURLState = (f: Filtros, view: ViewMode, page: number, size: number | 'all') => {
    const sp = new URLSearchParams();
    if (f.q) sp.set('q', f.q);
    if (f.processo) sp.set('processo', f.processo);
    if (f.stepSilic) sp.set('stepSilic', f.stepSilic);
    if (f.tipo) sp.set('tipo', f.tipo);
    if (f.situacao) sp.set('situacao', f.situacao);
    if (f.categoria) sp.set('categoria', f.categoria);
    if (view !== 'summary') sp.set('view', view);
    if (view === 'list') {
      if (page > 1) sp.set('page', String(page));
      if (size === 'all') sp.set('size', 'all');
      else if (size !== 10) sp.set('size', String(size));
    }
    const qs = sp.toString();
    const newUrl = qs ? `?${qs}` : location.pathname;
    history.replaceState(null, '', newUrl);
  };

  const initial = getURLState();
  // Aplicar estados iniciais nos inputs
  if (els.q) els.q.value = initial.q;
  if (els.processo) els.processo.value = initial.processo;
  if (els.stepSilic) els.stepSilic.value = initial.stepSilic;
  if (els.tipo) els.tipo.value = initial.tipo;
  if (els.situacao) els.situacao.value = initial.situacao;
  if (els.categoria) els.categoria.value = initial.categoria;

  const filtros: Filtros = {
    q: initial.q,
    processo: initial.processo,
    stepSilic: initial.stepSilic,
    tipo: initial.tipo,
    situacao: initial.situacao,
    categoria: initial.categoria,
  };

  let currentView: ViewMode = initial.view;
  let pageSize: number | 'all' = initial.size || 10;
  let page = initial.page || 1;
  els.viewReports?.setAttribute('aria-pressed', currentView === 'reports' ? 'true' : 'false');
  els.viewSummary?.setAttribute('aria-pressed', currentView === 'summary' ? 'true' : 'false');
  els.viewList?.setAttribute('aria-pressed', currentView === 'list' ? 'true' : 'false');
  setDrawerOpen(readDrawerPreference());
  if (els.pageSize) {
    const opt = Array.from(els.pageSize.options).find(
      (o) => (o.value === 'all' && pageSize === 'all') || parseInt(o.value, 10) === pageSize,
    );
    if (opt) els.pageSize.value = opt.value;
  }

  const CAT_ICONS: Record<string, string> = {
    'Dados iniciais': '🗂️',
    'Dados contrato': '📑',
    'Dados locador': '🏢',
    'Dados adicionais': '➕',
    Documentação: '📄',
    Financeiro: '💰',
    Processual: '⚖️',
    'Representante legal': '🧑‍⚖️',
  };

  function renderSummary(items: Reason[]) {
    if (!els.grid) return;
    const byProcess = new Map<string, Map<string, Map<string, number>>>();
    for (const r of items) {
      const processo = r.processo || 'Definir';
      const step = r.stepSilic || 'Definir';
      const cat = r.categoria || 'Dados Adicionais';

      if (!byProcess.has(processo)) byProcess.set(processo, new Map());
      const byStep = byProcess.get(processo)!;
      if (!byStep.has(step)) byStep.set(step, new Map());
      const catMap = byStep.get(step)!;
      catMap.set(cat, (catMap.get(cat) ?? 0) + 1);
    }

    const PROCESS_ORDER = ['Contratação', 'Atos Formais'];
    const processos = Array.from(byProcess.entries()).sort((a, b) => {
      const ia = PROCESS_ORDER.indexOf(a[0]);
      const ib = PROCESS_ORDER.indexOf(b[0]);
      if (ia !== -1 && ib !== -1) return ia - ib;
      if (ia !== -1) return -1;
      if (ib !== -1) return 1;
      return a[0].localeCompare(b[0], 'pt-BR');
    });

    const renderCategoryButtons = (
      processo: string,
      step: string,
      categories: Array<[string, number]>,
      variant: 'priority' | 'secondary',
    ) =>
      categories
        .map(([cat, n]) => {
          const icon = CAT_ICONS[cat] ?? '📁';
          const name = mapLabel(cat);
          const pressed =
            filtros.processo === processo && filtros.stepSilic === step && filtros.categoria === cat
              ? 'true'
              : 'false';
          return `
            <button class="cat-card ${variant === 'priority' ? 'cat-card--priority' : ''}" data-proc="${htmlEscape(processo)}" data-step="${htmlEscape(step)}" data-cat="${htmlEscape(cat)}" aria-label="${htmlEscape(name)} (${n})" aria-pressed="${pressed}">
              <span class="cat-name" data-icon="${icon}">${htmlEscape(name)}</span>
              <span class="cat-count">${n}</span>
            </button>
          `;
        })
        .join('');

    const renderStepSection = (
      processo: string,
      step: string,
      catMap: Map<string, number>,
      defaultOpen: boolean,
    ) => {
      const stageTotal = Array.from(catMap.values()).reduce((acc, n) => acc + n, 0);
      const orderedCategories = Array.from(catMap.entries()).sort((a, b) =>
        sortCategories(a[0], b[0]),
      );
      const priorityCategories = orderedCategories.filter(([cat]) => isPriorityCategory(cat));
      const visibleCategories =
        priorityCategories.length > 0 ? priorityCategories : orderedCategories.slice(0, 2);
      const collapsedCategories = orderedCategories.filter(
        ([cat]) => !visibleCategories.some(([visibleCat]) => visibleCat === cat),
      );
      const stepOpen =
        (filtros.processo === processo && filtros.stepSilic === step) ||
        (!filtros.processo && !filtros.stepSilic && defaultOpen);
      const collapsedOpen = collapsedCategories.some(
        ([cat]) =>
          filtros.processo === processo && filtros.stepSilic === step && filtros.categoria === cat,
      );

      const allPressed =
        filtros.processo === processo && filtros.stepSilic === step && !filtros.categoria
          ? 'true'
          : 'false';
      const allBtn = `
        <button class="cat-card cat-card--all" data-proc="${htmlEscape(processo)}" data-step="${htmlEscape(step)}" data-cat="" aria-label="Etapa ${htmlEscape(step)} (${stageTotal})" aria-pressed="${allPressed}">
          <span class="cat-name" data-icon="🧭">${htmlEscape(mapLabel(step))} — todos os motivos</span>
          <span class="cat-count">${stageTotal}</span>
        </button>
      `;

      return `
        <details class="step-card step-card--disclosure" ${stepOpen ? 'open' : ''}>
          <summary class="step-header">
            <div>
              <h3 class="step-title">Etapa SILIC: ${htmlEscape(mapLabel(step))}</h3>
              <span class="step-disclosure">${visibleCategories.length} categoria${visibleCategories.length === 1 ? '' : 's'} em destaque${collapsedCategories.length ? ` · ${collapsedCategories.length} recolhida${collapsedCategories.length === 1 ? '' : 's'}` : ''}</span>
            </div>
            <span class="step-total">${stageTotal} motivo${stageTotal === 1 ? '' : 's'}</span>
          </summary>
          <div class="step-body">
            <div class="step-cards">
              ${allBtn}
              ${renderCategoryButtons(processo, step, visibleCategories, 'priority')}
            </div>
            ${
              collapsedCategories.length
                ? `
                <details class="summary-extra-cats" ${collapsedOpen ? 'open' : ''}>
                  <summary>Outras categorias deste agrupamento</summary>
                  <div class="step-cards step-cards--nested">
                    ${renderCategoryButtons(processo, step, collapsedCategories, 'secondary')}
                  </div>
                </details>
              `
                : ''
            }
          </div>
        </details>
      `;
    };

    (els.grid as HTMLElement).innerHTML = processos
      .map(([processo, byStep], processIndex) => {
        const steps = Array.from(byStep.entries())
          .filter(([step]) => step !== 'Definir')
          .sort((a, b) => a[0].localeCompare(b[0], 'pt-BR'));

        if (!steps.length) return '';

        const processoTotal = steps
          .flatMap(([, catMap]) => Array.from(catMap.values()))
          .reduce((acc, n) => acc + n, 0);
        const processOpen =
          filtros.processo === processo || (!filtros.processo && processIndex === 0);

        const stepsHtml = steps
          .map(([step, catMap], stepIndex) =>
            renderStepSection(processo, step, catMap, stepIndex === 0),
          )
          .join('');

        return `
          <details class="process-card process-card--disclosure" ${processOpen ? 'open' : ''}>
            <summary class="process-header">
              <div>
                <h2 class="process-title">Processo: ${htmlEscape(mapLabel(processo))}</h2>
                <span class="process-disclosure">${steps.length} etapa${steps.length === 1 ? '' : 's'} disponíveis no resumo</span>
              </div>
              <span class="process-total">${processoTotal} motivo${processoTotal === 1 ? '' : 's'}</span>
            </summary>
            <div class="process-body">
              ${stepsHtml}
            </div>
          </details>
        `;
      })
      .join('');

    // Click em processo/etapa/categoria aplica filtro e muda para lista
    (els.grid as HTMLElement).querySelectorAll<HTMLButtonElement>('.cat-card').forEach((btn) => {
      btn.addEventListener('click', () => {
        const processo = btn.getAttribute('data-proc') ?? '';
        const step = btn.getAttribute('data-step') ?? '';
        const cat = btn.getAttribute('data-cat') ?? '';
        if (els.processo) els.processo.value = processo;
        if (els.stepSilic) els.stepSilic.value = step;
        if (els.categoria) els.categoria.value = cat;
        filtros.processo = processo;
        filtros.stepSilic = step;
        filtros.categoria = cat;
        currentView = 'list';
        applyAndRender();
      });
    });
  }

  const updateResultsInfo = (total: number, totalPages?: number) => {
    if (!els.resultsInfo) return;
    const parts = [] as string[];
    if (filtros.processo) parts.push(`Processo: ${filtros.processo}`);
    if (filtros.stepSilic) parts.push(`Etapa SILIC: ${filtros.stepSilic}`);
    if (filtros.tipo) parts.push(`Tipo: ${filtros.tipo}`);
    if (filtros.situacao) parts.push(`Situação: ${filtros.situacao}`);
    if (filtros.categoria) parts.push(`Categoria: ${filtros.categoria}`);
    const pageInfo =
      totalPages && currentView === 'list' ? ` — página ${page} de ${totalPages}` : '';
    const ctx = parts.length ? `(${parts.join(' · ')})` : '';
    els.resultsInfo.textContent =
      `${total} resultado${total === 1 ? '' : 's'}${pageInfo} ${ctx}`.trim();
  };
  // Chips de filtros ativos
  const chipsContainer = document.getElementById('activeChips');
  const renderChips = () => {
    if (!chipsContainer) return;
    const parts: Array<{ key: keyof Filtros; label: string }> = [];
    if (filtros.processo) parts.push({ key: 'processo', label: `Processo: ${filtros.processo}` });
    if (filtros.stepSilic)
      parts.push({ key: 'stepSilic', label: `Etapa SILIC: ${filtros.stepSilic}` });
    if (filtros.tipo) parts.push({ key: 'tipo', label: `Tipo: ${filtros.tipo}` });
    if (filtros.situacao) parts.push({ key: 'situacao', label: `Situação: ${filtros.situacao}` });
    if (filtros.categoria)
      parts.push({ key: 'categoria', label: `Categoria: ${filtros.categoria}` });
    if (filtros.q) parts.push({ key: 'q', label: `Busca: “${filtros.q}”` });
    chipsContainer.innerHTML = parts
      .map(
        (p) => `<span class="chip">${p.label}
          <button aria-label="Remover filtro ${p.key}" data-key="${p.key}">×</button>
        </span>`,
      )
      .join('');
    chipsContainer.querySelectorAll('button[data-key]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const k = (e.currentTarget as HTMLButtonElement).dataset.key as keyof Filtros;
        (filtros as any)[k] = '';
        if (k === 'q' && els.q) els.q.value = '';
        const el = (els as any)[k];
        if (el && 'value' in el) el.value = '';
        page = 1;
        applyAndRender();
      });
    });
  };

  const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
  const renderDashboardKpis = (items: Reason[]) => {
    if (!els.dashboardKpis) return;

    const processos = new Set(items.map((item) => item.processo).filter(Boolean)).size;
    const categorias = new Set(items.map((item) => item.categoria).filter(Boolean)).size;
    const etapas = new Set(items.map((item) => item.stepSilic).filter(Boolean)).size;
    const detalhados = items.filter((item) => item.detalhes && item.detalhes.trim()).length;
    const viewLabel: Record<ViewMode, string> = {
      reports: 'Relatórios',
      summary: 'Resumo navegável',
      list: 'Lista filtrada',
      mapped: 'Mapa hierárquico',
    };

    els.dashboardKpis.innerHTML = `
      <article class="dashboard-kpi-card accent-blue">
        <span class="kpi-label">Modo atual</span>
        <strong>${viewLabel[currentView]}</strong>
        <p>Visualização principal ativa no momento.</p>
      </article>
      <article class="dashboard-kpi-card accent-amber">
        <span class="kpi-label">Itens no recorte</span>
        <strong>${items.length.toLocaleString('pt-BR')}</strong>
        <p>Quantidade de motivos após os filtros aplicados.</p>
      </article>
      <article class="dashboard-kpi-card accent-green">
        <span class="kpi-label">Categorias únicas</span>
        <strong>${categorias.toLocaleString('pt-BR')}</strong>
        <p>Distribuição temática disponível no recorte.</p>
      </article>
      <article class="dashboard-kpi-card accent-slate">
        <span class="kpi-label">Processos e detalhes</span>
        <strong>${processos.toLocaleString('pt-BR')} · ${etapas.toLocaleString('pt-BR')}</strong>
        <p>${detalhados.toLocaleString('pt-BR')} itens possuem detalhamento complementar.</p>
      </article>
    `;
  };

  const renderMappedCatalog = (items: Reason[]) => {
    if (!els.grid) return;

    const grouped = new Map<string, Map<string, Map<string, number>>>();
    for (const r of items) {
      const categoria = r.categoria || 'Não informado';
      const nivel2 = r.descricao || 'Não informado';
      const nivel3 = r.detalhes || 'Não informado';
      if (!grouped.has(categoria)) grouped.set(categoria, new Map());
      const m2 = grouped.get(categoria)!;
      if (!m2.has(nivel2)) m2.set(nivel2, new Map());
      const m3 = m2.get(nivel2)!;
      m3.set(nivel3, (m3.get(nivel3) ?? 0) + 1);
    }

    const categorias = Array.from(grouped.entries()).sort((a, b) => {
      const pa = priorityIndex(a[0]);
      const pb = priorityIndex(b[0]);
      if (pa !== pb) return pa - pb;
      return a[0].localeCompare(b[0], 'pt-BR');
    });

    (els.grid as HTMLElement).innerHTML = `
      <section class="report-board" aria-label="Mapa de motivos mapeados">
        <header class="report-head">
          <div>
            <h2>Motivos mapeados</h2>
            <p>As categorias prioritárias abrem primeiro. As demais ficam recolhidas para reduzir o volume visível na tela.</p>
          </div>
        </header>
        <div class="mapped-grid">
          ${categorias
            .map(([categoria, m2]) => {
              const total = Array.from(m2.values())
                .flatMap((m3) => Array.from(m3.values()))
                .reduce((a, n) => a + n, 0);
              const priority = priorityIndex(categoria) !== Number.MAX_SAFE_INTEGER;

              const nivel2Html = Array.from(m2.entries())
                .sort((a, b) => a[0].localeCompare(b[0], 'pt-BR'))
                .map(([nivel2, m3]) => {
                  const rows = Array.from(m3.entries())
                    .sort((a, b) => a[0].localeCompare(b[0], 'pt-BR'))
                    .map(
                      ([nivel3, qtd]) =>
                        `<tr><td>${htmlEscape(nivel3)}</td><td>${qtd.toLocaleString('pt-BR')}</td></tr>`,
                    )
                    .join('');

                  return `
                    <details class="mapped-details">
                      <summary>${htmlEscape(nivel2)}</summary>
                      <table>
                        <thead><tr><th>Nível 3</th><th>Qtde</th></tr></thead>
                        <tbody>${rows}</tbody>
                      </table>
                    </details>
                  `;
                })
                .join('');

              return `
                <details class="mapped-card ${priority ? 'mapped-card--priority' : ''}" ${priority ? 'open' : ''}>
                  <summary>
                    <span>${htmlEscape(categoria)}</span>
                    <span class="mapped-count">${total.toLocaleString('pt-BR')} ${priority ? '· prioritário' : ''}</span>
                  </summary>
                  <div class="mapped-card-body">
                    ${nivel2Html}
                  </div>
                </details>
              `;
            })
            .join('')}
        </div>
      </section>
    `;
  };

  const renderSyntheticReports = async () => {
    if (!els.grid) return;

    const req = ++reportRequestId;
    (els.grid as HTMLElement).innerHTML = `
      <div class="loading" role="status" aria-live="polite">
        <div class="skel"></div>
        <div class="skel"></div>
        <div class="skel"></div>
      </div>`;

    try {
      const { facts, reasons } = await loadSyntheticBundle();
      if (req !== reportRequestId || currentView !== 'reports') return;

      const reasonById = new Map(reasons.map((r) => [r.motivoId, r]));

      const total = facts.length;
      const tempoMedio =
        total > 0 ? facts.reduce((acc, x) => acc + x.tempoCorrecaoDias, 0) / total : 0;
      const tempoMaximo = total > 0 ? Math.max(...facts.map((x) => x.tempoCorrecaoDias)) : 0;

      const normText = (v = '') =>
        v
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toLowerCase()
          .trim();

      const processoLabel = (v = '') => {
        const n = normText(v);
        if (n.includes('contrat')) return 'Contratação';
        if (n.includes('ato formal')) return 'Atos Formais';
        return v || 'Não informado';
      };

      const modalidadeLabel = (v = '') => {
        const n = normText(v);
        if (n.includes('locacao')) return 'Locação';
        if (n.includes('cessao')) return 'Cessão';
        if (n.includes('comodato')) return 'Comodato';
        return v || 'Não informado';
      };

      const servicoContratacao = (v = '') => {
        const n = normText(v);
        if (n.includes('nova unidade')) return 'Nova Unidade';
        if (n.includes('mudanca de endereco')) return 'Mudança de Endereço';
        if (n.includes('regularizacao')) return 'Regularização';
        return '';
      };

      const servicoAtosFormais = (v = '') => {
        const n = normText(v);
        if (n.includes('prorrogacao')) return 'Prorrogação';
        if (n.includes('rescisao')) return 'Rescisão';
        if (n.includes('titularidade')) return 'Alteração de titularidade';
        if (n.includes('antecipacao')) return 'Antecipação de parcela';
        if (n.includes('recebimento') && n.includes('imovel')) return 'Recebimento de imóvel';
        if (n.includes('acrescimo') && n.includes('area')) return 'Acréscimo de área';
        if (n.includes('supressao') && n.includes('area')) return 'Supressão de área';
        if (n.includes('revisao') && n.includes('aluguel')) return 'Revisão de aluguel';
        if (n.includes('reajuste') && n.includes('aluguel')) return 'Reajuste de aluguel';
        if (n.includes('apostilamento')) return 'Apostilamento';
        if (n.includes('acao renovatoria')) return 'Ação renovatória';
        return '';
      };

      const inc = (m: Map<string, number>, key: string, v = 1) => m.set(key, (m.get(key) ?? 0) + v);
      const byMotivo = new Map<string, number>();
      const byCategoria = new Map<string, number>();
      const byModalidade = new Map<string, number>();
      const byModalidadeNivel2 = new Map<string, number>();
      const byServicoContratacao = new Map<string, number>();
      const byServicoAtosFormais = new Map<string, number>();
      const byServicoContratacaoNivel2 = new Map<string, number>();
      const byServicoAtosNivel2 = new Map<string, number>();
      const byMes = new Map<string, number>();
      const byMesProcesso = new Map<string, { contratacao: number; atosFormais: number }>();

      const servicosContratacaoOrdem = ['Nova Unidade', 'Mudança de Endereço', 'Regularização'];
      const servicosAtosOrdem = [
        'Prorrogação',
        'Rescisão',
        'Alteração de titularidade',
        'Antecipação de parcela',
        'Recebimento de imóvel',
        'Acréscimo de área',
        'Supressão de área',
        'Revisão de aluguel',
        'Reajuste de aluguel',
        'Apostilamento',
        'Ação renovatória',
      ];

      for (const f of facts) {
        const r = reasonById.get(f.motivoId);
        const proc = processoLabel(r?.processo || '');
        const modalidade = modalidadeLabel(r?.tipo || '');
        const sit = r?.situacao || '';
        const categoria = r?.categoria || 'Não informado';
        const nivel2 = r?.descricao || 'Não informado';
        inc(byMotivo, r?.descricao || 'Não informado');
        inc(byCategoria, categoria);
        inc(byModalidade, modalidade);
        inc(byModalidadeNivel2, `${modalidade}|||${nivel2}`);
        if (proc === 'Contratação') {
          const serv = servicoContratacao(sit);
          if (serv) {
            inc(byServicoContratacao, serv);
            inc(byServicoContratacaoNivel2, `${serv}|||${nivel2}`);
          }
        } else if (proc === 'Atos Formais') {
          const serv = servicoAtosFormais(sit);
          if (serv) {
            inc(byServicoAtosFormais, serv);
            inc(byServicoAtosNivel2, `${serv}|||${nivel2}`);
          }
        }
        inc(byMes, f.mesRef || 'Não informado');
        const m = f.mesRef || 'Não informado';
        if (!byMesProcesso.has(m)) byMesProcesso.set(m, { contratacao: 0, atosFormais: 0 });
        const bucket = byMesProcesso.get(m)!;
        if (proc === 'Contratação') bucket.contratacao += 1;
        else if (proc === 'Atos Formais') bucket.atosFormais += 1;
      }

      const top = (m: Map<string, number>, n: number) =>
        Array.from(m.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, n);

      const topMotivos = top(byMotivo, 8);
      const topCategorias = top(byCategoria, 6);
      const topModalidades = top(byModalidade, 3);
      const modalidadeNivel2Completo = Array.from(byModalidadeNivel2.entries());
      const meses = Array.from(byMes.entries()).sort((a, b) => a[0].localeCompare(b[0]));
      const mesesAcumulado = (() => {
        let running = 0;
        let runningContratacao = 0;
        let runningAtos = 0;
        return meses.map(([mes, qtd]) => {
          running += qtd;
          const p = byMesProcesso.get(mes) || { contratacao: 0, atosFormais: 0 };
          runningContratacao += p.contratacao;
          runningAtos += p.atosFormais;
          return {
            mes,
            total: running,
            contratacao: runningContratacao,
            atosFormais: runningAtos,
          };
        });
      })();

      const servicosContratacaoNivel2 = Array.from(byServicoContratacaoNivel2.entries()).sort(
        (a, b) => {
          const [servA, nivel2A] = a[0].split('|||');
          const [servB, nivel2B] = b[0].split('|||');
          const idxA = servicosContratacaoOrdem.indexOf(servA);
          const idxB = servicosContratacaoOrdem.indexOf(servB);
          if (idxA !== idxB) return idxA - idxB;
          if (b[1] !== a[1]) return b[1] - a[1];
          return (nivel2A || '').localeCompare(nivel2B || '', 'pt-BR');
        },
      );

      const servicosAtosNivel2 = Array.from(byServicoAtosNivel2.entries()).sort((a, b) => {
        const [servA, nivel2A] = a[0].split('|||');
        const [servB, nivel2B] = b[0].split('|||');
        const idxA = servicosAtosOrdem.indexOf(servA);
        const idxB = servicosAtosOrdem.indexOf(servB);
        if (idxA !== idxB) return idxA - idxB;
        if (b[1] !== a[1]) return b[1] - a[1];
        return (nivel2A || '').localeCompare(nivel2B || '', 'pt-BR');
      });

      const tableRows = (entries: Array<[string, number]>) =>
        entries
          .map(
            ([key, value]) =>
              `<tr><td>${htmlEscape(key)}</td><td>${value.toLocaleString('pt-BR')}</td></tr>`,
          )
          .join('');

      const tableRowsModalidadeNivel2 = (entries: Array<[string, number]>) =>
        (() => {
          const grouped = new Map<string, Array<[string, number]>>();
          for (const [key, value] of entries) {
            const [modalidade, nivel2] = key.split('|||');
            const groupKey = modalidade || 'Não informado';
            if (!grouped.has(groupKey)) grouped.set(groupKey, []);
            grouped.get(groupKey)!.push([nivel2 || 'Não informado', value]);
          }

          const order = ['Locação', 'Cessão', 'Comodato'];
          const groupedRows = Array.from(grouped.entries()).sort((a, b) => {
            const idxA = order.indexOf(a[0]);
            const idxB = order.indexOf(b[0]);
            if (idxA !== -1 && idxB !== -1) return idxA - idxB;
            if (idxA !== -1) return -1;
            if (idxB !== -1) return 1;
            return a[0].localeCompare(b[0], 'pt-BR');
          });

          return groupedRows
            .map(([modalidade, items]) => {
              const totalItems = items.reduce((acc, [, qty]) => acc + qty, 0);
              const detailRows = items
                .sort((a, b) => b[1] - a[1])
                .map(
                  ([nivel2, qty]) =>
                    `<li><span class="service-label">${htmlEscape(nivel2)}</span><strong class="service-qty">${qty.toLocaleString('pt-BR')}</strong></li>`,
                )
                .join('');

              return `<tr>
                <td>${htmlEscape(modalidade)}</td>
                <td>
                  <ul class="service-breakdown">${detailRows}</ul>
                  <div class="service-total">Total: ${totalItems.toLocaleString('pt-BR')}</div>
                </td>
              </tr>`;
            })
            .join('');
        })();

      const tableRowsServicoNivel2 = (entries: Array<[string, number]>) =>
        (() => {
          const grouped = new Map<string, Array<[string, number]>>();
          for (const [key, value] of entries) {
            const [servico, nivel2] = key.split('|||');
            const groupKey = servico || 'Não informado';
            if (!grouped.has(groupKey)) grouped.set(groupKey, []);
            grouped.get(groupKey)!.push([nivel2 || 'Não informado', value]);
          }

          return Array.from(grouped.entries())
            .map(([servico, items]) => {
              const totalItems = items.reduce((acc, [, qty]) => acc + qty, 0);
              const detailRows = items
                .map(
                  ([nivel2, qty]) =>
                    `<li><span class="service-label">${htmlEscape(nivel2)}</span><strong class="service-qty">${qty.toLocaleString('pt-BR')}</strong></li>`,
                )
                .join('');

              return `<tr>
                <td>${htmlEscape(servico)}</td>
                <td>
                  <ul class="service-breakdown">${detailRows}</ul>
                  <div class="service-total">Total: ${totalItems.toLocaleString('pt-BR')}</div>
                </td>
              </tr>`;
            })
            .join('');
        })();

      const chartRows = (
        entries: Array<{ mes: string; total: number; contratacao: number; atosFormais: number }>,
      ) => {
        const max = Math.max(...entries.map((x) => x.total), 1);
        const labelMes = (m: string) => {
          const [y, mm] = m.split('-');
          return `${mm}/${y}`;
        };

        return entries
          .map((entry) => {
            const width = Math.max(2, Math.round((entry.total / max) * 100));
            const percContratacao = entry.total > 0 ? (entry.contratacao / entry.total) * 100 : 0;
            const percAtos = entry.total > 0 ? (entry.atosFormais / entry.total) * 100 : 0;
            return `<div class="chart-row">
              <span class="chart-label">${htmlEscape(labelMes(entry.mes))}</span>
              <div class="chart-track" aria-hidden="true">
                <div class="chart-fill" style="width:${width}%"></div>
              </div>
              <span class="chart-value">${entry.total.toLocaleString('pt-BR')}</span>
              <span class="chart-detail">Contratação: ${percContratacao.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}% · Atos Formais: ${percAtos.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%</span>
            </div>`;
          })
          .join('');
      };

      const reportPanel = ({
        title,
        subtitle,
        body,
        wide = false,
      }: {
        title: string;
        subtitle: string;
        body: string;
        wide?: boolean;
      }) => `
        <article class="report-card ${wide ? 'report-card-wide' : ''}">
          <details class="report-panel">
            <summary>
              <div class="report-panel-head">
                <div>
                  <span class="report-panel-title">${title}</span>
                  <span class="report-panel-subtitle">${subtitle}</span>
                </div>
                <span class="report-panel-cta">Expandir</span>
              </div>
            </summary>
            <div class="report-panel-body">${body}</div>
          </details>
        </article>
      `;

      (els.grid as HTMLElement).innerHTML = `
        <section class="report-board" aria-label="Relatórios gerenciais sintéticos">
          <header class="report-head">
            <div>
              <h2>Relatórios gerenciais (dados sintéticos)</h2>
              <p>Base emulada a partir do catálogo de motivos ativos. As modalidades (Locação, Cessão e Comodato) reúnem serviços de Contratação e de Atos Formais.</p>
            </div>
            <div class="report-actions">
              <button id="exportPdfBtn" type="button" class="btn btn-secondary" aria-label="Exportar relatórios em PDF">
                Exportar PDF
              </button>
            </div>
          </header>

          <div class="report-kpis">
            <article class="report-kpi"><h3>Total devoluções</h3><strong>${total.toLocaleString('pt-BR')}</strong></article>
            <article class="report-kpi">
              <h3>
                Tempo médio de devolução
                <span class="hint" title="Média simples dos dias de devolução/correção. Fórmula sugerida ao desenvolvedor: SUM(tempoCorrecaoDias) / COUNT(casos).">
                  ⓘ
                </span>
              </h3>
              <strong>${tempoMedio.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} dias</strong>
            </article>
            <article class="report-kpi">
              <h3>
                Tempo máximo de devolução
                <span class="hint" title="Maior tempo observado entre os casos. Fórmula sugerida ao desenvolvedor: MAX(tempoCorrecaoDias).">
                  ⓘ
                </span>
              </h3>
              <strong>${tempoMaximo.toLocaleString('pt-BR')} dias</strong>
            </article>
            <article class="report-kpi"><h3>Motivos ativos</h3><strong>${reasons.length.toLocaleString('pt-BR')}</strong></article>
          </div>

          <div class="report-grid">
            ${reportPanel({
              title: 'Pareto de motivos (Top 8)',
              subtitle: `${topMotivos.length} linhas resumidas`,
              body: `<table><thead><tr><th>Motivo</th><th>Qtde</th></tr></thead><tbody>${tableRows(topMotivos)}</tbody></table>`,
            })}
            ${reportPanel({
              title: 'Devoluções por categoria',
              subtitle: `${topCategorias.length} categorias consolidadas`,
              body: `<table><thead><tr><th>Categoria</th><th>Qtde</th></tr></thead><tbody>${tableRows(topCategorias)}</tbody></table>`,
            })}
            ${reportPanel({
              title: 'Devoluções - Contratação',
              subtitle: `${servicosContratacaoNivel2.length} detalhamentos de serviço`,
              body: `<table class="service-table"><thead><tr><th>Serviço</th><th>Nível 2 (detalhamento)</th></tr></thead><tbody>${tableRowsServicoNivel2(servicosContratacaoNivel2)}</tbody></table>`,
            })}
            ${reportPanel({
              title: 'Devoluções - Atos Formais',
              subtitle: `${servicosAtosNivel2.length} detalhamentos de serviço`,
              body: `<table class="service-table"><thead><tr><th>Serviço</th><th>Nível 2 (detalhamento)</th></tr></thead><tbody>${tableRowsServicoNivel2(servicosAtosNivel2)}</tbody></table>`,
            })}
            ${reportPanel({
              title: 'Devoluções por modalidade',
              subtitle: `${topModalidades.length} modalidades`,
              body: `<table><thead><tr><th>Modalidade</th><th>Qtde</th></tr></thead><tbody>${tableRows(topModalidades)}</tbody></table>`,
            })}
            ${reportPanel({
              title: 'Devoluções por modalidade (nível 2)',
              subtitle: `${modalidadeNivel2Completo.length} combinações analisadas`,
              body: `<table class="service-table"><thead><tr><th>Modalidade</th><th>Nível 2 (detalhamento)</th></tr></thead><tbody>${tableRowsModalidadeNivel2(modalidadeNivel2Completo)}</tbody></table>`,
            })}
            ${reportPanel({
              title: 'Tendência mensal (acumulado)',
              subtitle: `${mesesAcumulado.length} meses no histórico`,
              body: `<div class="report-chart" role="img" aria-label="Gráfico de barras do acumulado mensal de devoluções">${chartRows(mesesAcumulado)}</div>`,
              wide: true,
            })}
          </div>
        </section>
      `;

      const exportPdfBtn = document.getElementById('exportPdfBtn') as HTMLButtonElement | null;
      exportPdfBtn?.addEventListener('click', () => {
        window.print();
      });
    } catch (err) {
      if (req !== reportRequestId || currentView !== 'reports') return;
      (els.grid as HTMLElement).innerHTML = `
        <div class="error">
          Não foi possível carregar os relatórios sintéticos.<br/>
          Execute <strong>npm run mock:generate</strong> e atualize a página.
        </div>`;
      console.error(err);
    }
  };

  const applyAndRender = () => {
    const out = aplicarFiltros(lista, filtros);
    renderDashboardKpis(out);
    // calcular paginação
    const total = out.length;
    const isAll = currentView === 'list' && pageSize === 'all';
    const totalPages =
      currentView === 'list'
        ? isAll
          ? 1
          : Math.max(1, Math.ceil(total / (pageSize as number)))
        : 1;
    page = currentView === 'list' ? clamp(page, 1, totalPages) : 1;
    if (currentView === 'reports') {
      if (els.resultsInfo)
        els.resultsInfo.textContent = 'Visualizando relatórios com dados sintéticos';
    } else if (currentView === 'mapped') {
      if (els.resultsInfo)
        els.resultsInfo.textContent = 'Visualizando mapa completo de motivos mapeados em uso';
    } else {
      updateResultsInfo(total, isAll ? undefined : totalPages);
    }
    // Empty state (lista)
    if (currentView === 'list' && total === 0 && els.grid) {
      (els.grid as HTMLElement).innerHTML = `
        <div class="empty">
          🗂️ Nenhum resultado encontrado.
        </div>`;
      els.pagination?.setAttribute('hidden', 'true');
      renderChips();
      setURLState(filtros, currentView, page, pageSize);
      return;
    }
    setURLState(filtros, currentView, page, pageSize);
    if (!els.grid) return;
    if (currentView === 'reports') {
      els.pagination?.setAttribute('hidden', 'true');
      void renderSyntheticReports();
    } else if (currentView === 'mapped') {
      els.pagination?.setAttribute('hidden', 'true');
      renderMappedCatalog(lista);
    } else if (currentView === 'summary') {
      els.pagination?.setAttribute('hidden', 'true');
      renderSummary(out);
    } else {
      const isAll = pageSize === 'all';
      const start = isAll ? 0 : (page - 1) * (pageSize as number);
      const end = isAll ? out.length : start + (pageSize as number);
      const slice = out.slice(start, end);
      renderLista(els.grid as HTMLElement, slice);
      // render nav
      if (els.pagination && els.pageNumbers && els.btnPrev && els.btnNext) {
        if (!isAll && totalPages > 1) {
          els.pagination.removeAttribute('hidden');
          els.pageNumbers.innerHTML = '';
          // estratégia simples: mostrar até 7 botões com elipses se necessário
          const createBtn = (label: string | number, pageNum: number | null, current = false) => {
            const btn = document.createElement('button');
            btn.className = 'page-btn';
            btn.type = 'button';
            btn.textContent = String(label);
            if (current) btn.setAttribute('aria-current', 'page');
            if (pageNum !== null) {
              btn.addEventListener('click', () => {
                page = pageNum;
                applyAndRender();
                window.scrollTo({ top: 0, behavior: 'smooth' });
              });
            } else {
              btn.disabled = true;
            }
            return btn;
          };
          const add = (el: HTMLElement) => els.pageNumbers!.appendChild(el);
          const windowSize = 5;
          let startPage = Math.max(1, page - Math.floor(windowSize / 2));
          let endPage = startPage + windowSize - 1;
          if (endPage > totalPages) {
            endPage = totalPages;
            startPage = Math.max(1, endPage - windowSize + 1);
          }
          // Primeiro
          if (startPage > 1) {
            add(createBtn(1, 1, page === 1));
            if (startPage > 2) add(createBtn('…', null));
          }
          for (let p = startPage; p <= endPage; p++) {
            add(createBtn(p, p, p === page));
          }
          if (endPage < totalPages) {
            if (endPage < totalPages - 1) add(createBtn('…', null));
            add(createBtn(totalPages, totalPages, page === totalPages));
          }
          els.btnPrev.disabled = page <= 1;
          els.btnNext.disabled = page >= totalPages;
        } else {
          els.pagination.setAttribute('hidden', 'true');
        }
      }
    }
    renderChips();
  };

  // Listeners
  els.q?.addEventListener('input', (e) => {
    filtros.q = (e.target as HTMLInputElement).value || '';
    page = 1;
    if (window.innerWidth < 900) setDrawerOpen(false);
    applyAndRender();
  });
  els.processo?.addEventListener('change', (e) => {
    filtros.processo = (e.target as HTMLSelectElement).value || '';
    page = 1;
    if (window.innerWidth < 900) setDrawerOpen(false);
    applyAndRender();
  });
  els.stepSilic?.addEventListener('change', (e) => {
    filtros.stepSilic = (e.target as HTMLSelectElement).value || '';
    page = 1;
    if (window.innerWidth < 900) setDrawerOpen(false);
    applyAndRender();
  });
  els.tipo?.addEventListener('change', (e) => {
    filtros.tipo = (e.target as HTMLSelectElement).value || '';
    page = 1;
    if (window.innerWidth < 900) setDrawerOpen(false);
    applyAndRender();
  });
  els.situacao?.addEventListener('change', (e) => {
    filtros.situacao = (e.target as HTMLSelectElement).value || '';
    page = 1;
    if (window.innerWidth < 900) setDrawerOpen(false);
    applyAndRender();
  });
  els.categoria?.addEventListener('change', (e) => {
    filtros.categoria = (e.target as HTMLSelectElement).value || '';
    page = 1;
    if (window.innerWidth < 900) setDrawerOpen(false);
    applyAndRender();
  });

  els.openFiltersBtn?.addEventListener('click', () => setDrawerOpen(true));
  els.closeFiltersBtn?.addEventListener('click', () => setDrawerOpen(false));
  els.drawerBackdrop?.addEventListener('click', () => setDrawerOpen(false));

  els.viewReports?.addEventListener('click', () => {
    currentView = 'reports';
    els.viewReports?.setAttribute('aria-pressed', 'true');
    els.viewSummary?.setAttribute('aria-pressed', 'false');
    els.viewList?.setAttribute('aria-pressed', 'false');
    els.btnMappedUnused?.setAttribute('aria-pressed', 'false');
    page = 1;
    applyAndRender();
  });

  // View toggle
  els.viewSummary?.addEventListener('click', () => {
    currentView = 'summary';
    els.viewReports?.setAttribute('aria-pressed', 'false');
    els.viewSummary?.setAttribute('aria-pressed', 'true');
    els.viewList?.setAttribute('aria-pressed', 'false');
    els.btnMappedUnused?.setAttribute('aria-pressed', 'false');
    page = 1;
    applyAndRender();
  });
  els.viewList?.addEventListener('click', () => {
    currentView = 'list';
    els.viewReports?.setAttribute('aria-pressed', 'false');
    els.viewSummary?.setAttribute('aria-pressed', 'false');
    els.viewList?.setAttribute('aria-pressed', 'true');
    els.btnMappedUnused?.setAttribute('aria-pressed', 'false');
    page = 1;
    applyAndRender();
  });

  if (els.btnMappedUnused) {
    els.btnMappedUnused.hidden = false;
    els.btnMappedUnused.textContent = 'Motivos mapeados em uso';
    els.btnMappedUnused.setAttribute('aria-pressed', 'false');
  }

  els.btnMappedUnused?.addEventListener('click', () => {
    currentView = 'mapped';
    els.viewReports?.setAttribute('aria-pressed', 'false');
    els.viewSummary?.setAttribute('aria-pressed', 'false');
    els.viewList?.setAttribute('aria-pressed', 'false');
    els.btnMappedUnused?.setAttribute('aria-pressed', 'true');
    page = 1;
    applyAndRender();
  });

  // Paginação: tamanho de página e navegação
  els.pageSize?.addEventListener('change', (e) => {
    const val = (e.target as HTMLSelectElement).value;
    pageSize = val === 'all' ? 'all' : Math.max(1, parseInt(val, 10) || 10);
    page = 1;
    applyAndRender();
  });
  els.btnPrev?.addEventListener('click', () => {
    if (page > 1) {
      page -= 1;
      applyAndRender();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  });
  els.btnNext?.addEventListener('click', () => {
    page += 1;
    applyAndRender();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  // Voltar/avançar do navegador: re-aplica estado
  window.addEventListener('popstate', () => {
    const st = getURLState();
    if (els.q) els.q.value = st.q;
    if (els.processo) els.processo.value = st.processo;
    if (els.stepSilic) els.stepSilic.value = st.stepSilic;
    if (els.tipo) els.tipo.value = st.tipo;
    if (els.situacao) els.situacao.value = st.situacao;
    if (els.categoria) els.categoria.value = st.categoria;
    filtros.q = st.q;
    filtros.processo = st.processo;
    filtros.stepSilic = st.stepSilic;
    filtros.tipo = st.tipo;
    filtros.situacao = st.situacao;
    filtros.categoria = st.categoria;
    currentView = st.view;
    page = st.page;
    pageSize = st.size;
    if (els.pageSize) {
      const opt = Array.from(els.pageSize.options).find(
        (o) => (o.value === 'all' && pageSize === 'all') || parseInt(o.value, 10) === pageSize,
      );
      if (opt) els.pageSize.value = opt.value;
    }
    els.viewReports?.setAttribute('aria-pressed', currentView === 'reports' ? 'true' : 'false');
    els.viewSummary?.setAttribute('aria-pressed', currentView === 'summary' ? 'true' : 'false');
    els.viewList?.setAttribute('aria-pressed', currentView === 'list' ? 'true' : 'false');
    els.btnMappedUnused?.setAttribute('aria-pressed', currentView === 'mapped' ? 'true' : 'false');
    applyAndRender();
  });

  // Primeira renderização
  applyAndRender();
}

boot().catch((err) => {
  console.error('Falha ao iniciar:', err);
  if (els.grid) {
    (els.grid as HTMLElement).innerHTML = `<div class="error">Erro ao carregar dados.</div>`;
  }
});
