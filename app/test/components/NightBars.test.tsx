import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import {
  NightBars,
  describeNight,
  describeNightBars,
  formatDeviationPair,
  nightVerdict,
  type NightBarsNight,
  type NightBarsProps,
} from '../../src/components/NightBars';

const text = (html: string) => html.replace(/<[^>]+>/g, '');
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const nights: NightBarsNight[] = [
  { label: 'V 23', fullLabel: 'venerdì 23 ottobre', bedMin: 328, wakeMin: 446, provenance: 'confermato', bedDevMin: 8, wakeDevMin: -4 },
  { label: 'G 22', bedMin: 357, wakeMin: 461, provenance: 'automatico', bedDevMin: 37, wakeDevMin: 11 },
  { label: 'M 21', bedMin: 323, wakeMin: 452, provenance: 'stimato', bedDevMin: 3, wakeDevMin: 2 },
  { label: 'M 20', bedMin: null, wakeMin: null, provenance: 'mancante', bedDevMin: null, wakeDevMin: null },
  { label: 'Oggi', bedMin: 322, wakeMin: 450, provenance: 'stimato', bedDevMin: 2, wakeDevMin: 0 },
];

const props: NightBarsProps = { nights, medianBedMin: 320, medianWakeMin: 450 };

describe('nightVerdict', () => {
  it('ricava OK/Fuori dagli scarti con tolleranza ± 30', () => {
    expect(nightVerdict(nights[0]!)).toBe('ok');
    expect(nightVerdict(nights[1]!)).toBe('fuori');
    expect(nightVerdict({ provenance: 'stimato', bedDevMin: 30, wakeDevMin: -30 })).toBe('ok');
    expect(nightVerdict({ provenance: 'stimato', bedDevMin: 31, wakeDevMin: 0 })).toBe('fuori');
  });
  it('rispetta regular se fornito e dà mancante senza dati', () => {
    expect(nightVerdict({ provenance: 'confermato', bedDevMin: 50, wakeDevMin: 0, regular: true })).toBe('ok');
    expect(nightVerdict({ provenance: 'confermato', bedDevMin: null, wakeDevMin: 0 })).toBe('mancante');
    expect(nightVerdict(nights[3]!)).toBe('mancante');
  });
});

describe('formatDeviationPair', () => {
  it('letto / sveglia con segno vero', () => {
    expect(formatDeviationPair(8, -4)).toBe('+8 / −4');
    expect(formatDeviationPair(null, 5)).toBe('— / +5');
    expect(formatDeviationPair(null, null)).toBeNull();
  });
});

describe('NightBars', () => {
  const html = renderToStaticMarkup(<NightBars {...props} />);

  it('ha un riassunto accessibile e una tabella con tutti i dati', () => {
    expect(html).toContain('role="img"');
    expect(html).toContain(`aria-label="${esc(describeNightBars(props))}"`);
    expect(describeNightBars(props)).toContain('5 notti');
    expect(describeNightBars(props)).toContain('3 nella tolleranza, 1 fuori, 1 mancante');
    expect(describeNightBars(props)).toContain('Mediana del letto 23:20, della sveglia 07:30, tolleranza ± 30 min');
    expect(html).toContain('<table');
    expect(html.match(/<tr>/g)).toHaveLength(6);
    expect(describeNight(nights[0]!)).toBe(
      'venerdì 23 ottobre: 23:28 → 07:26, confermata, scarto letto +8 min, scarto sveglia −4 min, OK.',
    );
  });

  it('disegna una barra per notte con lo stile della provenienza', () => {
    expect(html.match(/class="hbar/g)).toHaveLength(5);
    expect(html.match(/hbar is-estimated/g)).toHaveLength(2);
    expect(html.match(/hbar is-missing/g)).toHaveLength(1);
    // 23:28 → 07:26: asse 148 → 626
    expect(html).toContain('left:17.62%;width:56.9%');
  });

  it('mostra fasce di tolleranza e linee sulla mediana', () => {
    expect(html.match(/class="band"/g)).toHaveLength(2);
    expect(html.match(/class="avg"/g)).toHaveLength(2);
    // letto 23:20 = asse 140 → 110..170
    expect(html).toContain('left:13.1%;width:7.14%');
    expect(html).toContain('left:16.67%');
  });

  it('scarti e esito sempre come parole, mancante con la parola', () => {
    const t = text(html);
    expect(t).toContain('+8 / −4');
    expect(t).toContain('OK');
    expect(t).toContain('Fuori');
    expect(t).toContain('Mancante');
    expect(html).toContain('badge badge-ok');
    expect(html).toContain('badge badge-out');
    expect(html).toContain('badge badge-missing');
  });

  it('tick delle ore e legenda sempre visibile', () => {
    const t = text(html);
    for (const tick of ['21', '00', '03', '06', '09']) expect(t).toContain(tick);
    expect(t).toContain('Fascia = mediana ± 30 min');
    expect(t).toContain('Punti = mancante');
    expect(t).toContain('Contorno = automatica');
  });

  it('nessun NaN anche con dati assurdi o mediana assente', () => {
    const bad = renderToStaticMarkup(
      <NightBars
        nights={[{ label: 'X', bedMin: Number.NaN, wakeMin: 440, provenance: 'confermato', bedDevMin: Number.NaN, wakeDevMin: 3 }]}
        medianBedMin={null}
        medianWakeMin={Number.NaN}
      />,
    );
    expect(bad).not.toMatch(/NaN|undefined|Infinity/);
    expect(bad).not.toContain('class="band"');
    expect(text(bad)).toContain('Mancante');
    expect(html).not.toMatch(/NaN|undefined|Infinity/);
  });
});
