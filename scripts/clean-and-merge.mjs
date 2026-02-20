import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import XLSX from 'xlsx';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

const files = {
	motivosXlsx: path.join(root, 'public', 'assets', 'motivos_tabela_completa 1.xlsx'),
	atosFormaisImport: path.join(root, 'public', 'assets', 'atos_formais_import.json'),
	unified: path.join(root, 'public', 'reasons.unified.json'),
	mappedUso: path.join(root, 'public', 'reasons.mapeados-uso.json'),
	mappedReserva: path.join(root, 'public', 'reasons.mapeados-reserva.json')
};

const stripDiacritics = (value) =>
	String(value ?? '')
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '');

const normalizeText = (value) =>
	stripDiacritics(value)
		.toLowerCase()
		.trim()
		.replace(/\s+/g, ' ');

function keyOf(entry) {
	return [
		normalizeText(entry.processo),
		normalizeText(entry.tipo),
		normalizeText(entry.situacao),
		normalizeText(entry.categoria),
		normalizeText(entry.descricao),
		normalizeText(entry.detalhes)
	].join('|');
}

const clean = (v) => String(v ?? '').trim();

function mapRow(row) {
	// Mapeamento solicitado: A..G da planilha -> campos do JSON
	return {
		processo: clean(row.processo),
		tipo: clean(row.tipo),
		situacao: clean(row['situação']),
		categoria: clean(row.categoria),
		descricao: clean(row['descrição']),
		detalhes: clean(row.detalhes),
		stepSilic: clean(row['STEP no SILIC']) || 'Definir'
	};
}

function mapAtosFormaisRow(row) {
	// Import complementar solicitado: processo/tipo/situação/bloco/motivo/causa
	const bloco = clean(row.bloco);
	return {
		processo: clean(row.processo),
		tipo: clean(row.tipo),
		situacao: clean(row['situação']),
		categoria: bloco,
		descricao: clean(row.motivo),
		detalhes: clean(row.causa),
		stepSilic: bloco || 'Definir'
	};
}

async function loadOptionalAtosFormaisImport() {
	try {
		const text = await fs.readFile(files.atosFormaisImport, 'utf8');
		const parsed = JSON.parse(text);
		if (!Array.isArray(parsed)) return [];
		return parsed;
	} catch {
		return [];
	}
}

async function main() {
	const wb = XLSX.readFile(files.motivosXlsx);
	const firstSheet = wb.SheetNames[0];
	if (!firstSheet) throw new Error('Planilha sem abas.');

	const ws = wb.Sheets[firstSheet];
	const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
	const mapped = rows.map(mapRow);
	const atosImportRows = await loadOptionalAtosFormaisImport();
	const mappedAtosImport = atosImportRows.map(mapAtosFormaisRow);

	const grouped = new Map();
	const allCanonicalRows = [
		...mapped.map((canonical, i) => ({
			canonical,
			source: 'motivos_tabela_completa 1.xlsx',
			index: i,
			original: rows[i]
		})),
		...mappedAtosImport.map((canonical, i) => ({
			canonical,
			source: 'atos_formais_import.json',
			index: i,
			original: atosImportRows[i]
		}))
	];

	for (let i = 0; i < allCanonicalRows.length; i += 1) {
		const { canonical, source, index, original } = allCanonicalRows[i];
		const key = keyOf(canonical);

		if (!grouped.has(key)) {
			grouped.set(key, {
				key,
				canonical,
				sourceCount: 0,
				extras: {
					stepsSilic: [],
					motivos: [],
					causas: []
				},
				items: []
			});
		}

		const bucket = grouped.get(key);
		bucket.sourceCount += 1;
		bucket.items.push({
			source,
			index,
			original
		});

		if (canonical.stepSilic && !bucket.extras.stepsSilic.includes(canonical.stepSilic)) {
			bucket.extras.stepsSilic.push(canonical.stepSilic);
		}
	}

	const unified = {
		schemaVersion: '3.0.0',
		generatedAt: new Date().toISOString(),
		sourceMeta: {
			motivos: {
				format: 'xlsx',
				sheet: firstSheet,
				path: 'public/assets/motivos_tabela_completa 1.xlsx',
				mapping: {
					A: 'processo',
					B: 'tipo',
					C: 'situacao',
					D: 'categoria',
					E: 'descricao',
					F: 'detalhes',
					G: 'stepSilic'
				}
			},
			atosFormaisImport: {
				format: 'json',
				path: 'public/assets/atos_formais_import.json',
				mapping: {
					processo: 'processo',
					tipo: 'tipo',
					situação: 'situacao',
					bloco: 'categoria+stepSilic',
					motivo: 'descricao',
					causa: 'detalhes'
				}
			}
		},
		counts: {
			xlsxRows: mapped.length,
			atosFormaisImportRows: mappedAtosImport.length,
			unifiedDistinct: grouped.size
		},
		unifiedByKey: Array.from(grouped.values())
	};

	await fs.writeFile(files.unified, JSON.stringify(unified, null, 2) + '\n', 'utf8');
	await fs.writeFile(files.mappedUso, JSON.stringify(unified, null, 2) + '\n', 'utf8');

	const emptyReserva = {
		...unified,
		schemaVersion: '3.0.0',
		sourceMeta: {
			...unified.sourceMeta,
			segmento: 'reserva'
		},
		counts: {
			...unified.counts,
			unifiedDistinct: 0
		},
		unifiedByKey: []
	};
	await fs.writeFile(files.mappedReserva, JSON.stringify(emptyReserva, null, 2) + '\n', 'utf8');

	console.log('OK: generated', path.relative(root, files.unified));
	console.log('OK: generated', path.relative(root, files.mappedUso));
	console.log('OK: generated', path.relative(root, files.mappedReserva));
	console.log('OK: source rows', mapped.length, '+ import', mappedAtosImport.length, 'distinct', grouped.size);
}

main().catch((err) => {
	console.error(err?.stack || err);
	process.exit(1);
});
