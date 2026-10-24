#!/usr/bin/env node
// npm run add-provider -- --id <id> --baseUrl <url> --model <modello> --env <NOME_ENV>
// Aggiunge la voce a providers.config.json e, se la env var e' presente, la verifica con una chiamata reale.
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { addProvider, parseArgs } from '../src/tools/add-provider.ts';

const defaultConfig = fileURLToPath(new URL('../providers.config.json', import.meta.url));

async function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error((err as Error).message);
    process.exit(2);
  }
  const configPath = args.config ? resolve(process.cwd(), args.config) : defaultConfig;
  try {
    const { entry, probe } = await addProvider(args, { configPath, env: process.env });
    console.log(`Voce "${entry.id}" scritta in ${configPath} (priority ${entry.priority}, structuredOutput ${entry.structuredOutput}).`);
    switch (probe.status) {
      case 'ok':
        console.log(`Prova OK: modello ${probe.model}, modo ${probe.structured}, ${probe.latencyMs} ms.`);
        break;
      case 'skipped_no_env':
        console.log(`Prova saltata: ${args.env} non e' impostata. Il provider verra' ignorato finche' non imposti la env var.`);
        console.log(`Rilancia con --replace dopo aver impostato ${args.env} per rilevare il modo strutturato migliore.`);
        break;
      case 'skipped_by_flag':
        console.log('Prova saltata (--no-test).');
        break;
      case 'failed':
        console.error(`Prova FALLITA: ${probe.error}. La voce e' stata scritta comunque: controlla baseUrl/model/chiave.`);
        process.exit(1);
    }
  } catch (err) {
    console.error(`Errore: ${(err as Error).message}`);
    process.exit(1);
  }
}

void main();
