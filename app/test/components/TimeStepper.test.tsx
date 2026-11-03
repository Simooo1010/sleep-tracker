import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { TimeStepper, formatTime, parseTime, parseTypedTime, stepTime } from '../../src/components/TimeStepper';

const noop = () => {};

describe('TimeStepper: logica pura', () => {
  it('parseTime legge HH:MM in 24 ore', () => {
    expect(parseTime('23:48')).toBe(23 * 60 + 48);
    expect(parseTime('07:20')).toBe(440);
    expect(parseTime('7:05')).toBe(425);
    expect(parseTime('00:00')).toBe(0);
    for (const v of ['24:00', '12:60', 'abc', '', null, undefined, '12:5']) expect(parseTime(v)).toBeNull();
  });

  it('formatTime riporta nell’arco della giornata', () => {
    expect(formatTime(0)).toBe('00:00');
    expect(formatTime(1439)).toBe('23:59');
    expect(formatTime(1440)).toBe('00:00');
    expect(formatTime(-5)).toBe('23:55');
    expect(formatTime(425)).toBe('07:05');
  });

  it('stepTime: passi di 5 minuti con giro a mezzanotte', () => {
    expect(stepTime('23:48', 5)).toBe('23:53');
    expect(stepTime('23:48', -5)).toBe('23:43');
    expect(stepTime('23:58', 5)).toBe('00:03');
    expect(stepTime('23:55', 5)).toBe('00:00');
    expect(stepTime('00:02', -5)).toBe('23:57');
    expect(stepTime('00:00', -5)).toBe('23:55');
    expect(stepTime('07:20', 5)).toBe('07:25');
  });

  it('stepTime: mancante resta mancante', () => {
    expect(stepTime(null, 5)).toBeNull();
    expect(stepTime('xx', 5)).toBeNull();
    expect(stepTime('07:20', Number.NaN)).toBeNull();
  });
});

describe('TimeStepper: orario scritto a mano', () => {
  it('accetta i formati più comuni', () => {
    const ok: Array<[string, string]> = [
      ['2345', '23:45'],
      ['23:45', '23:45'],
      ['23.45', '23:45'],
      ['23,45', '23:45'],
      ['23 45', '23:45'],
      ['23h45', '23:45'],
      ['730', '07:30'],
      ['7:30', '07:30'],
      ['0730', '07:30'],
      ['7', '07:00'],
      ['07', '07:00'],
      ['7h', '07:00'],
      ['23', '23:00'],
      ['0', '00:00'],
      ['000', '00:00'],
      ['  21:47 ', '21:47'],
      ['2147', '21:47'],
    ];
    for (const [input, out] of ok) expect(parseTypedTime(input), input).toBe(out);
  });

  it('rifiuta ciò che non è un orario, senza inventare nulla', () => {
    for (const v of ['', '   ', 'abc', '24:00', '2400', '12:60', '1260', '7:5', '23:456', '12345', '-5', '7:30pm', null, undefined]) {
      expect(parseTypedTime(v as string | null | undefined), String(v)).toBeNull();
    }
  });
});

describe('TimeStepper: markup', () => {
  const html = renderToStaticMarkup(<TimeStepper bedTime="23:48" wakeTime="07:20" onChange={noop} />);

  it('due righe con etichette italiane e orari', () => {
    expect(html).toContain('Sono andato a letto');
    expect(html).toContain('Mi sono svegliato');
    expect(html).toContain('23:48');
    expect(html).toContain('07:20');
    expect(html).toContain('aria-label="Correggi orari"');
    expect(html.match(/role="group"/g)).toHaveLength(3);
    expect(html).toContain('class="stack ');
    expect(html).toContain('class="row ');
  });

  it('pulsanti tondi da 44px con aria-label e descrizione della riga', () => {
    expect(html.match(/class="btn btn-round"/g)).toHaveLength(4);
    expect(html.match(/aria-label="Anticipa di 5 minuti"/g)).toHaveLength(2);
    expect(html.match(/aria-label="Posticipa di 5 minuti"/g)).toHaveLength(2);
    expect(html.match(/aria-describedby="[^"]+"/g)).toHaveLength(4);
    expect(html).toContain('type="button"');
    expect(html).toContain('−');
    expect(html).not.toContain('disabled');
  });

  it('le cifre sono un pulsante che apre la scrittura, con nome accessibile', () => {
    expect(html.match(/aria-label="Sono andato a letto: 23:48\. Tocca per scrivere l’orario"/g)).toHaveLength(1);
    expect(html.match(/aria-label="Mi sono svegliato: 07:20\. Tocca per scrivere l’orario"/g)).toHaveLength(1);
    expect(html).not.toContain('<input');
    expect(html).not.toContain('role="alert"');
  });

  it('orario annunciato con aria-live', () => {
    expect(html.match(/aria-live="polite"/g)).toHaveLength(2);
    expect(html).not.toMatch(/NaN|undefined|null/);
    expect(html).not.toContain('!');
  });

  it('orario normalizzato a due cifre', () => {
    const h = renderToStaticMarkup(<TimeStepper bedTime="0:05" wakeTime="7:00" onChange={noop} />);
    expect(h).toContain('00:05');
    expect(h).toContain('07:00');
  });

  it('mancante: parola Mancante e pulsanti disabilitati, mai 00:00', () => {
    const h = renderToStaticMarkup(<TimeStepper bedTime={null} wakeTime="07:20" onChange={noop} />);
    expect(h).toContain('Mancante');
    expect(h).not.toContain('00:00');
    expect(h.match(/disabled=""/g)).toHaveLength(2);
    expect(h).not.toMatch(/NaN|undefined|null/);
  });

  it('orario non valido trattato come mancante', () => {
    const h = renderToStaticMarkup(<TimeStepper bedTime="25:99" wakeTime="abc" onChange={noop} />);
    expect(h.match(/Mancante/g)).toHaveLength(2);
    expect(h).not.toMatch(/NaN|undefined|null/);
  });

  it('passo ed etichette personalizzabili; passo non valido torna a 5', () => {
    const h = renderToStaticMarkup(
      <TimeStepper bedTime="23:00" wakeTime="07:00" onChange={noop} step={10} bedLabel="Sono andata a letto" wakeLabel="Mi sono svegliata" />,
    );
    expect(h).toContain('Anticipa di 10 minuti');
    expect(h).toContain('Sono andata a letto');
    const bad = renderToStaticMarkup(<TimeStepper bedTime="23:00" wakeTime="07:00" onChange={noop} step={Number.NaN} />);
    expect(bad).toContain('Anticipa di 5 minuti');
    expect(bad).not.toContain('NaN');
  });
});
