import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const unifiedPath = path.join(root, 'public', 'reasons.unified.json');

const TARGET_PROCESS = 'Mapeado - Atos Formais - Não utilizado';

const strip = (v) => String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const norm = (v) => strip(v).toLowerCase().trim().replace(/\s+/g, ' ');
const mk = (stepSilic, motivo, causa) => `${norm(stepSilic)}|${norm(motivo)}|${norm(causa)}`;

const allowed = [
  // DADOS INICIAIS
  ['Dados Iniciais', 'Informações iniciais incorretas ou incompletas', 'Dados incompletos ou incorretos na demanda'],
  ['Dados Iniciais', 'Informações iniciais incorretas ou incompletas', 'Falta justificativas do pedido'],
  ['Dados Iniciais', 'Informações iniciais incorretas ou incompletas', 'Falta anexos obrigatórios'],
  ['Dados Iniciais', 'Informações iniciais incorretas ou incompletas', 'Informações divergentes entre sistemas'],
  ['Dados Iniciais', 'Informações iniciais incorretas ou incompletas', 'Tipo de demanda tratado incorretamente'],
  ['Dados Iniciais', 'Informações iniciais incorretas ou incompletas', 'Dados conflitantes entre CELOG e CILOG'],
  ['Dados Iniciais', 'Informações iniciais incorretas ou incompletas', 'Demanda precisa de ajustes no pré-comprometimento'],

  // DADOS DO CONTRATO
  ['Dados do Contrato', 'Matrícula / Cartório / Dados do imóvel', 'Matrícula desatualizada ou vencida'],
  ['Dados do Contrato', 'Matrícula / Cartório / Dados do imóvel', 'Matrícula incompleta'],
  ['Dados do Contrato', 'Matrícula / Cartório / Dados do imóvel', 'Matrícula sem averbação necessária'],
  ['Dados do Contrato', 'Matrícula / Cartório / Dados do imóvel', 'Falta averbação da construção'],
  ['Dados do Contrato', 'Matrícula / Cartório / Dados do imóvel', 'Matrícula divergente do contrato'],
  ['Dados do Contrato', 'Matrícula / Cartório / Dados do imóvel', 'Proprietário diferente da matrícula'],
  ['Dados do Contrato', 'Matrícula / Cartório / Dados do imóvel', 'Falta habite-se'],
  ['Dados do Contrato', 'Minuta / Cláusulas / Contrato', 'Minuta com cláusulas indevidas'],
  ['Dados do Contrato', 'Minuta / Cláusulas / Contrato', 'Minuta incompatível com o negociado'],
  ['Dados do Contrato', 'Minuta / Cláusulas / Contrato', 'Falta cláusula de alteração de titularidade'],
  ['Dados do Contrato', 'Minuta / Cláusulas / Contrato', 'Multa rescisória com redação incorreta'],
  ['Dados do Contrato', 'Área / Engenharia', 'Informações de área divergentes'],
  ['Dados do Contrato', 'Área / Engenharia', 'Falta laudo de engenharia'],
  ['Dados do Contrato', 'Área / Engenharia', 'Falta dados sobre acréscimo de área'],
  ['Dados do Contrato', 'Documentos complementares', 'Falta Plano de Aquisições válido'],

  // DADOS DO LOCADOR
  ['Dados do Locador', 'Documentação do locador', 'Documentos dos locadores incompletos'],
  ['Dados do Locador', 'Documentação do locador', 'Falta RG/CPF de cônjuge'],
  ['Dados do Locador', 'Documentação do locador', 'Falta certidão de ISS'],
  ['Dados do Locador', 'Conta bancária / Pagamentos', 'Conta em outro banco sem justificativa'],
  ['Dados do Locador', 'Conta bancária / Pagamentos', 'Percentuais dos locadores não informados'],
  ['Dados do Locador', 'Aceite / Concordância', 'Falta anuência do locador'],

  // REPRESENTANTE LEGAL
  ['Representante Legal', 'Representação insuficiente ou irregular', 'Falta contrato social atualizado'],
  ['Representante Legal', 'Representação insuficiente ou irregular', 'Falta procuração válida'],
  ['Representante Legal', 'Representação insuficiente ou irregular', 'Representante legal falecido sem substituição'],

  // DADOS ADICIONAIS
  ['Dados Adicionais', 'Negociação / Laudo / Ação Renovatória', 'Valor acima do laudo sem justificativa'],
  ['Dados Adicionais', 'Negociação / Laudo / Ação Renovatória', 'Falta laudo para AR'],
  ['Dados Adicionais', 'Negociação / Laudo / Ação Renovatória', 'Falta matrícula para AR'],
  ['Dados Adicionais', 'Negociação / Laudo / Ação Renovatória', 'AR sem esclarecimento ou negociação'],
  ['Dados Adicionais', 'Pendências jurídicas / CADIN', 'Locador com pendência no CADIN'],
  ['Dados Adicionais', 'Pendências jurídicas / CADIN', 'Minuta rejeitada pelo jurídico'],
  ['Dados Adicionais', 'Orçamento / Fluxo / Documentos operacionais', 'Falta tela de reserva orçamentária'],
  ['Dados Adicionais', 'Orçamento / Fluxo / Documentos operacionais', 'Falta autorização da GELOG']
].map(([stepSilic, motivo, causa]) => mk(stepSilic, motivo, causa));

const allowedSet = new Set(allowed);

const pairCandidatesFromItem = (item) => {
  const out = [];
  const step = item?.stepSilic ?? item?.['STEP no SILIC'] ?? item?.['STEP SILIC'] ?? '';

  const motivoA = item?.motivo;
  const causaA = item?.causa;
  if (motivoA || causaA) out.push(mk(step, motivoA, causaA));

  const motivoB = item?.descricao ?? item?.descrição;
  const causaB = item?.detalhes;
  if (motivoB || causaB) out.push(mk(step, motivoB, causaB));

  return out;
};

const main = async () => {
  const text = await fs.readFile(unifiedPath, 'utf8');
  const data = JSON.parse(text);

  let touched = 0;
  let atosTotal = 0;

  for (const bucket of data.unifiedByKey ?? []) {
    const proc = bucket?.canonical?.processo;
    if (proc !== 'Atos Formais') continue;
    atosTotal += 1;

    const candidates = new Set();
    for (const v of pairCandidatesFromItem(bucket?.canonical ?? {})) candidates.add(v);
    for (const row of bucket?.items ?? []) {
      for (const v of pairCandidatesFromItem(row?.original ?? {})) candidates.add(v);
    }

    const isAllowed = [...candidates].some((k) => allowedSet.has(k));
    if (!isAllowed) {
      bucket.canonical.processo = TARGET_PROCESS;
      touched += 1;
    }
  }

  await fs.writeFile(unifiedPath, JSON.stringify(data, null, 2) + '\n', 'utf8');
  console.log(`OK: Atos Formais total=${atosTotal}; reclassificados=${touched}; mantidos=${atosTotal - touched}`);
};

main().catch((err) => {
  console.error(err?.stack || err);
  process.exit(1);
});
