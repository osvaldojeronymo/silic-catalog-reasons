import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

const inFileUso = path.join(root, 'public', 'reasons.mapeados-uso.json');
const inFileLegacy = path.join(root, 'public', 'reasons.unified.json');
const outDir = path.join(root, 'public', 'mock');
const TARGET_CASES = 10000;

const REGIOES = ['Norte', 'Nordeste', 'Centro-Oeste', 'Sudeste', 'Sul'];
const CANAIS = ['Portal SILIC', 'E-mail', 'Esteira Interna'];
const PESO_CANAL = [0.58, 0.24, 0.18];

const UNIDADES = [
  { unidade: 'SR Belém', regiao: 'Norte' },
  { unidade: 'SR Manaus', regiao: 'Norte' },
  { unidade: 'SR Porto Velho', regiao: 'Norte' },
  { unidade: 'SR Recife', regiao: 'Nordeste' },
  { unidade: 'SR Fortaleza', regiao: 'Nordeste' },
  { unidade: 'SR Salvador', regiao: 'Nordeste' },
  { unidade: 'SR Maceió', regiao: 'Nordeste' },
  { unidade: 'SR Goiânia', regiao: 'Centro-Oeste' },
  { unidade: 'SR Cuiabá', regiao: 'Centro-Oeste' },
  { unidade: 'SR Brasília', regiao: 'Centro-Oeste' },
  { unidade: 'SR Belo Horizonte', regiao: 'Sudeste' },
  { unidade: 'SR Vitória', regiao: 'Sudeste' },
  { unidade: 'SR Rio de Janeiro', regiao: 'Sudeste' },
  { unidade: 'SR São Paulo', regiao: 'Sudeste' },
  { unidade: 'SR Santos', regiao: 'Sudeste' },
  { unidade: 'SR Curitiba', regiao: 'Sul' },
  { unidade: 'SR Florianópolis', regiao: 'Sul' },
  { unidade: 'SR Porto Alegre', regiao: 'Sul' }
];

const CAT_WEIGHT = {
  processual: 1.7,
  documentacao: 1.35,
  financeiro: 1.12,
  'dados do contrato': 0.9,
  'dados adicionais': 0.8,
  'dados iniciais': 0.85,
  'dados do locador': 0.95,
  'representante legal': 0.75
};

const norm = (v) =>
  String(v ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();

const clean = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();

function seededRandom(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const pick = (arr, rnd) => arr[Math.floor(rnd() * arr.length)];

function pickWeighted(arr, weights, rnd) {
  const total = weights.reduce((acc, x) => acc + x, 0);
  const target = rnd() * total;
  let acc = 0;
  for (let i = 0; i < arr.length; i += 1) {
    acc += weights[i];
    if (target <= acc) return arr[i];
  }
  return arr[arr.length - 1];
}

function monthRef(date) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function toIsoDate(date) {
  return date.toISOString().slice(0, 10);
}

function toCsv(rows) {
  if (!rows.length) return '';
  const headers = Object.keys(rows[0]);
  const esc = (v) => {
    const s = String(v ?? '');
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return `"${s.replaceAll('"', '""')}"`;
    }
    return s;
  };

  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(headers.map((h) => esc(row[h])).join(','));
  }
  return `${lines.join('\n')}\n`;
}

function criticidadeFromCategoria(categoriaN) {
  if (categoriaN === 'processual') return 'Alta';
  if (categoriaN === 'documentacao') return 'Média';
  if (categoriaN === 'financeiro') return 'Alta';
  return 'Baixa';
}

function calcSlaDias(categoriaN) {
  if (categoriaN === 'processual') return 5;
  if (categoriaN === 'documentacao') return 6;
  if (categoriaN === 'financeiro') return 5;
  return 7;
}

async function main() {
  let text;
  try {
    text = await fs.readFile(inFileUso, 'utf8');
  } catch {
    text = await fs.readFile(inFileLegacy, 'utf8');
  }
  const parsed = JSON.parse(text);

  const reasons = Array.isArray(parsed.unifiedByKey)
    ? parsed.unifiedByKey
        .map((x) => x?.canonical)
        .filter(Boolean)
        .map((r) => ({
          processo: clean(r.processo),
          tipo: clean(r.tipo),
          situacao: clean(r.situacao),
          categoria: clean(r.categoria),
          descricao: clean(r.descricao),
          detalhes: clean(r.detalhes),
          stepSilic: clean(r.stepSilic || 'Definir')
        }))
    : [];

  if (!reasons.length) {
    throw new Error('Nenhum motivo encontrado em public/reasons.unified.json');
  }

  const rnd = seededRandom(20260220);

  const dimMotivos = reasons.map((r, idx) => ({
    motivoId: idx + 1,
    ativo: 1,
    processo: r.processo,
    tipo: r.tipo,
    situacao: r.situacao,
    categoria: r.categoria,
    descricao: r.descricao,
    detalhes: r.detalhes,
    stepSilic: r.stepSilic
  }));

  const dimUnidades = UNIDADES.map((u, idx) => ({
    unidadeId: idx + 1,
    unidade: u.unidade,
    regiao: u.regiao
  }));

  const fatos = [];
  const startYear = 2025;
  const months = 12;
  let protocolo = 100000;

  for (let m = 0; m < months; m += 1) {
    const mesDate = new Date(Date.UTC(startYear, m, 1));
    const sazonalidade = 1 + 0.22 * Math.sin((m / 12) * Math.PI * 2);

    for (let i = 0; i < dimMotivos.length; i += 1) {
      const motivo = dimMotivos[i];
      const catN = norm(motivo.categoria);
      const peso = CAT_WEIGHT[catN] ?? 1;
      const ruido = 0.6 + rnd() * 1.4;

      const volume = Math.max(0, Math.round(0.9 * peso * sazonalidade * ruido));

      for (let k = 0; k < volume; k += 1) {
        const unidade = pick(dimUnidades, rnd);
        const canal = pickWeighted(CANAIS, PESO_CANAL, rnd);

        const slaDias = calcSlaDias(catN);
        const tempoCorrecaoDias = Math.max(
          1,
          Math.round(2.6 + (catN === 'processual' ? 1.8 : 0) + (catN === 'documentacao' ? 1.0 : 0) + rnd() * 3.7)
        );
        const slaEstourado = tempoCorrecaoDias > slaDias ? 1 : 0;
        const criticidade = criticidadeFromCategoria(catN);

        const diaAbertura = 1 + Math.floor(rnd() * 27);
        const abertura = new Date(Date.UTC(startYear, m, diaAbertura));
        const fechamento = new Date(abertura);
        fechamento.setUTCDate(fechamento.getUTCDate() + tempoCorrecaoDias);

        protocolo += 1;
        fatos.push({
          devolucaoId: fatos.length + 1,
          protocolo: `DV-${protocolo}`,
          mesRef: monthRef(mesDate),
          dataAbertura: toIsoDate(abertura),
          dataFechamento: toIsoDate(fechamento),
          motivoId: motivo.motivoId,
          unidadeId: unidade.unidadeId,
          canalEntrada: canal,
          criticidade,
          slaDias,
          tempoCorrecaoDias,
          slaEstourado,
          status: 'Concluído'
        });
      }
    }
  }

  if (fatos.length < TARGET_CASES && fatos.length > 0) {
    const missing = TARGET_CASES - fatos.length;
    for (let i = 0; i < missing; i += 1) {
      const base = fatos[Math.floor(rnd() * fatos.length)];
      protocolo += 1;
      fatos.push({
        ...base,
        devolucaoId: fatos.length + 1,
        protocolo: `DV-${protocolo}`
      });
    }
  } else if (fatos.length > TARGET_CASES) {
    fatos.length = TARGET_CASES;
    for (let i = 0; i < fatos.length; i += 1) {
      fatos[i].devolucaoId = i + 1;
    }
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    seed: 20260220,
    targetCases: TARGET_CASES,
    periodo: `${startYear}-01 a ${startYear}-12`,
    dimMotivos: dimMotivos.length,
    dimUnidades: dimUnidades.length,
    fatoDevolucoes: fatos.length,
    observacao: 'Dados sintéticos para análise gerencial (não representam produção).' 
  };

  await fs.mkdir(outDir, { recursive: true });
  await Promise.all([
    fs.writeFile(path.join(outDir, 'dim_motivos.synthetic.csv'), toCsv(dimMotivos), 'utf8'),
    fs.writeFile(path.join(outDir, 'dim_unidades.synthetic.csv'), toCsv(dimUnidades), 'utf8'),
    fs.writeFile(path.join(outDir, 'fato_devolucoes.synthetic.csv'), toCsv(fatos), 'utf8'),
    fs.writeFile(path.join(outDir, 'synthetic.summary.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8')
  ]);

  console.log('OK: arquivos sintéticos gerados em public/mock');
  console.log(summary);
}

main().catch((err) => {
  console.error(err?.stack || err);
  process.exit(1);
});
