import { expect, test, type APIRequestContext, type Page, type TestInfo } from '@playwright/test';

// Pagina Impostazioni: token per i Comandi e sessione.
// Il repo in memoria è unico per il server e i token creati restano finché non si revocano (massimo 10 attivi):
// ogni test usa un'etichetta unica e si chiude revocando ciò che ha creato.
// Progetti: "iphone" (390 px, una voce per volta) e "desktop"/"uhd" (sezioni affiancate).

const isPhone = (name: string) => name === 'iphone';
const TOKEN_RE = /^st_[A-Za-z0-9_-]{43}$/;

const uniqueLabel = (testInfo: TestInfo) => `e2e-${testInfo.project.name}-${Date.now()}`;

/** Su telefono la sezione si apre dalla voce dell'elenco; su PC è già visibile. */
async function openSection(page: Page, testInfo: TestInfo, title: 'Token per i Comandi' | 'Sessione') {
  if (isPhone(testInfo.project.name)) {
    await page.locator('main button.list-row').filter({ hasText: title }).click();
  }
  await expect(page.getByRole('heading', { level: 2, name: title })).toBeVisible();
}

const row = (page: Page, label: string) => page.locator('main li').filter({ hasText: label });

/** Crea un token con l'etichetta data e restituisce il token in chiaro mostrato una volta. */
async function createToken(page: Page, label: string): Promise<string> {
  await page.getByLabel('Etichetta').fill(label);
  await page.getByRole('button', { name: 'Crea token' }).click();
  const code = page.locator('code[data-token]');
  await expect(code).toBeVisible();
  const token = ((await code.textContent()) ?? '').trim();
  expect(token).toMatch(TOKEN_RE);
  return token;
}

/** Revoca a due passi (usata anche per ripulire). Non fa nulla se il token è già revocato. */
async function revokeIfActive(page: Page, label: string) {
  const item = row(page, label);
  if ((await item.count()) === 0) return;
  const confirm = item.getByRole('button', { name: 'Conferma revoca' });
  if ((await confirm.count()) === 0) {
    const revoke = item.getByRole('button', { name: 'Revoca', exact: true });
    if ((await revoke.count()) === 0) return;
    await revoke.click();
  }
  await confirm.click();
  await expect(item.getByText('Revocato', { exact: true })).toBeVisible();
}

/** 400 = il token è accettato (corpo volutamente vuoto, nessun dato scritto); 401 = rifiutato. */
async function probe(request: APIRequestContext, token: string): Promise<number> {
  const res = await request.post('/api/events', { headers: { Authorization: `Bearer ${token}` }, data: {} });
  return res.status();
}

test('titolo, spiegazione e un solo pulsante pieno', async ({ page }, testInfo) => {
  await page.goto('/impostazioni');
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
  await expect(page.getByRole('heading', { level: 1, name: 'Impostazioni' })).toBeVisible();

  await openSection(page, testInfo, 'Token per i Comandi');
  await expect(
    page.getByText("Il token permette ai Comandi dell'iPhone di inviare i segnali. Si vede una sola volta."),
  ).toBeVisible();
  await expect(page.getByLabel('Etichetta')).toHaveValue('iPhone');
  await expect(page.getByRole('button', { name: 'Crea token' })).toBeVisible();
  await expect(page.locator('main .btn-primary:visible')).toHaveCount(1);
  await expect(page.locator('code[data-token]')).toHaveCount(0);
});

test('crea un token, lo vede una volta, dopo il ricaricamento non c\'è più in chiaro', async ({ page, request }, testInfo) => {
  const label = uniqueLabel(testInfo);
  await page.goto('/impostazioni');
  await openSection(page, testInfo, 'Token per i Comandi');

  const token = await createToken(page, label);
  try {
    await expect(page.getByText('Copialo adesso: non lo rivedrai.')).toBeVisible();
    // L'indirizzo per i Comandi è l'origine corrente + /api/events.
    const origin = new URL(page.url()).origin;
    await expect(page.locator('code[data-endpoint]')).toHaveText(`${origin}/api/events`);
    // "Copia" risponde sempre con una frase: copiato, oppure il rimedio a mano (permessi della pagina).
    await page.getByRole('button', { name: 'Copia', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: /Copiato\.|Non riesco a copiare/ })).toBeVisible();

    // Il nuovo token compare nell'elenco, attivo e mai usato; funziona come bearer.
    const item = row(page, label);
    await expect(item.getByText('Attivo', { exact: true })).toBeVisible();
    await expect(item.getByText('Mai usato')).toBeVisible();
    expect(await probe(request, token)).toBe(400);

    // Mai nell'indirizzo né negli archivi del browser.
    expect(page.url()).not.toContain(token);
    const stored = await page.evaluate(() =>
      JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage }, cookie: document.cookie }),
    );
    expect(stored).not.toContain(token);

    // Ricarico: il token in chiaro sparisce da pagina e HTML, l'elenco resta.
    await page.reload();
    await openSection(page, testInfo, 'Token per i Comandi');
    await expect(page.locator('code[data-token]')).toHaveCount(0);
    expect(await page.content()).not.toContain(token);
    await expect(page.getByText('Copialo adesso: non lo rivedrai.')).toHaveCount(0);
    const after = row(page, label);
    await expect(after.getByText('Attivo', { exact: true })).toBeVisible();
    await expect(after.getByText('Ultimo uso')).toBeVisible(); // la verifica qui sopra l'ha usato
  } finally {
    await revokeIfActive(page, label);
  }
});

test('revoca a due passi: nessuna azione immediata, Annulla ripristina, poi il token non entra più', async ({ page, request }, testInfo) => {
  const label = uniqueLabel(testInfo);
  await page.goto('/impostazioni');
  await openSection(page, testInfo, 'Token per i Comandi');
  const token = await createToken(page, label);
  const item = row(page, label);
  try {
    // Primo tocco: solo la richiesta di conferma, il token resta attivo e funzionante.
    await item.getByRole('button', { name: 'Revoca', exact: true }).click();
    await expect(item.getByRole('button', { name: 'Conferma revoca' })).toBeVisible();
    await expect(item.getByText('Attivo', { exact: true })).toBeVisible();
    expect(await probe(request, token)).toBe(400);

    // Annulla: si torna a "Revoca".
    await item.getByRole('button', { name: 'Annulla' }).click();
    await expect(item.getByRole('button', { name: 'Conferma revoca' })).toHaveCount(0);
    await expect(item.getByRole('button', { name: 'Revoca', exact: true })).toBeVisible();

    // Secondo passo: revocato, a parole, senza più pulsanti, e il token è rifiutato.
    await item.getByRole('button', { name: 'Revoca', exact: true }).click();
    await item.getByRole('button', { name: 'Conferma revoca' }).click();
    await expect(item.getByText('Revocato', { exact: true })).toBeVisible();
    await expect(item.getByRole('button')).toHaveCount(0);
    expect(await probe(request, token)).toBe(401);

    // Dopo il ricaricamento resta revocato.
    await page.reload();
    await openSection(page, testInfo, 'Token per i Comandi');
    await expect(row(page, label).getByText('Revocato', { exact: true })).toBeVisible();
  } finally {
    await revokeIfActive(page, label);
  }
});

test('etichetta vuota: errore calmo in role="alert", nessun token creato', async ({ page }, testInfo) => {
  await page.goto('/impostazioni');
  await openSection(page, testInfo, 'Token per i Comandi');
  await page.getByLabel('Etichetta').fill('   ');
  await page.getByRole('button', { name: 'Crea token' }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByRole('alert')).not.toContainText(/undefined|null|NaN|Error/);
  await expect(page.locator('code[data-token]')).toHaveCount(0);
});

test('sessione: pulsante secondario "Esci"', async ({ page }, testInfo) => {
  await page.goto('/impostazioni');
  await openSection(page, testInfo, 'Sessione');
  const exit = page.getByRole('button', { name: 'Esci', exact: true });
  await expect(exit).toBeVisible();
  await expect(exit).toHaveClass(/btn-secondary/);
  await expect(page.locator('main .btn-primary:visible')).toHaveCount(0);
});

test('telefono: una sezione per volta con "Indietro"; PC: sezioni affiancate', async ({ page }, testInfo) => {
  await page.goto('/impostazioni');
  const tokens = page.getByRole('heading', { level: 2, name: 'Token per i Comandi' });
  const session = page.getByRole('heading', { level: 2, name: 'Sessione' });

  if (isPhone(testInfo.project.name)) {
    const rows = page.locator('main button.list-row:visible');
    await expect(rows).toHaveCount(2);
    await expect(tokens).toBeHidden();
    await expect(session).toBeHidden();

    await rows.filter({ hasText: 'Token per i Comandi' }).click();
    await expect(tokens).toBeVisible();
    await expect(session).toBeHidden();
    await expect(page.locator('main button.list-row:visible')).toHaveCount(0);

    await page.getByRole('button', { name: 'Indietro' }).click();
    await expect(page.locator('main button.list-row:visible')).toHaveCount(2);
    await expect(tokens).toBeHidden();

    await rows.filter({ hasText: 'Sessione' }).click();
    await expect(session).toBeVisible();
    await expect(tokens).toBeHidden();
  } else {
    await expect(page.locator('main button.list-row:visible')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Indietro' })).toHaveCount(0);
    const a = await tokens.boundingBox();
    const b = await session.boundingBox();
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    expect(b!.x).toBeGreaterThan(a!.x + 100);
    expect(Math.abs(b!.y - a!.y)).toBeLessThan(4);
  }
});

test('la barra di navigazione porta a Impostazioni', async ({ page }, testInfo) => {
  await page.goto('/');
  if (isPhone(testInfo.project.name)) {
    await page.getByRole('link', { name: 'Impostazioni' }).click();
  } else {
    await page.locator('nav.side').getByRole('link', { name: 'Impostazioni' }).click();
  }
  await expect(page).toHaveURL(/\/impostazioni$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Impostazioni' })).toBeVisible();
  await expect(page.locator('[aria-current="page"]:visible')).toContainText('Impostazioni');
});

// Nessuno scorrimento orizzontale su telefono, a 390 px e a 320 px (iPhone SE), anche con il token appena creato
// (stringa lunga senza spazi) e con ogni sezione aperta. Il viewport si fissa alla creazione del contesto (test.use).
for (const width of [390, 320] as const) {
  test.describe(`${width}px`, () => {
    test.use({ viewport: { width, height: width === 390 ? 844 : 640 } });

    test('nessuno scorrimento orizzontale', async ({ page }, testInfo) => {
      test.skip(!isPhone(testInfo.project.name), 'solo telefono');
      const label = uniqueLabel(testInfo);

      const check = async (what: string) => {
        const o = await page.evaluate(() => ({
          scroll: document.documentElement.scrollWidth,
          inner: window.innerWidth,
          body: document.body.scrollWidth,
        }));
        const why = `${what}: scrollWidth ${o.scroll}, body ${o.body}, innerWidth ${o.inner}`;
        expect(o.inner, why).toBe(width);
        expect(o.scroll, why).toBeLessThanOrEqual(o.inner);
        expect(o.body, why).toBeLessThanOrEqual(o.inner);
      };

      await page.goto('/impostazioni');
      await check('elenco');

      await openSection(page, testInfo, 'Sessione');
      await check('sezione Sessione');
      await page.getByRole('button', { name: 'Indietro' }).click();

      await openSection(page, testInfo, 'Token per i Comandi');
      await check('sezione Token');
      await createToken(page, label);
      try {
        await check('token appena creato');
        await page.getByRole('button', { name: 'Nascondi' }).click();
        const item = row(page, label);
        await item.getByRole('button', { name: 'Revoca', exact: true }).click();
        await check('conferma revoca');
      } finally {
        await revokeIfActive(page, label);
      }
      await check('token revocato');
    });
  });
}
