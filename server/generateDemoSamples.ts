import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parquetWriteFile } from 'hyparquet-writer';

import { parseCsv } from './demoData.js';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const sampleRoot = resolve(projectRoot, 'samples');
const sampleBaseName = 'customer_revenue_quality_demo';
const csvPath = resolve(sampleRoot, `${sampleBaseName}.csv`);
const jsonPath = resolve(sampleRoot, `${sampleBaseName}.json`);
const parquetPath = resolve(sampleRoot, `${sampleBaseName}.parquet`);

const parsed = parseCsv(await readFile(csvPath, 'utf8'));
const jsonRows = parsed.rows.map((row) =>
  Object.fromEntries(parsed.headers.map((header) => [header, row[header] === '' ? null : row[header]]))
);

await writeFile(jsonPath, `${JSON.stringify(jsonRows, null, 2)}\n`, 'utf8');
parquetWriteFile({
  filename: parquetPath,
  codec: 'UNCOMPRESSED',
  columnData: parsed.headers.map((header) => ({
    name: header,
    data: parsed.rows.map((row) => (row[header] === '' ? null : row[header])),
    type: 'STRING',
    nullable: true,
  })),
  kvMetadata: [
    { key: 'dataone.demo', value: 'customer-revenue-quality' },
    { key: 'dataone.source', value: `${sampleBaseName}.csv` },
  ],
});

console.log(`Generated ${jsonPath}`);
console.log(`Generated ${parquetPath}`);
