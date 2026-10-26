import { describe, expect, it, vi } from "vitest";
import type { Night } from "../../src/domain/types";
import { MemoryRepo } from "../../src/server/memory-repo";
import {
  MAX_ACTIVE_TOKENS,
  confirmNight,
  createApiToken,
  napFromUi,
  rateNight,
  recordQuestion,
  revokeApiToken,
  saveEveningCheckFromUi,
  setExceptions,
  undoConfirmNight,
} from "../../src/server/mutations";
import { authenticate, hashToken } from "../../src/server/token";

const MISSING = { value: null, provenance: "mancante" } as const;
const GENERIC = "Errore nel salvataggio. Riprova.";

function night(over: Partial<Night> = {}): Night {
  return {
    nightDate: "2026-10-24",
    bedAt: { value: "2026-10-23T21:30:00.000Z", provenance: "automatico" },
    wakeAt: { value: "2026-10-24T05:30:00.000Z", provenance: "stimato" },
    status: "stimata",
    quality: { value: 3, provenance: "confermato" },
    energy: { ...MISSING },
    isException: false,
    factors: ["schermo-a-letto"],
    ...over,
  };
}

describe("confirmNight", () => {
  it("conferma gli orari esistenti e restituisce la notte precedente", async () => {
    const before = night();
    const repo = new MemoryRepo({ nights: [before] });
    const r = await confirmNight(repo, { nightDate: "2026-10-24" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.previous).toEqual(before);
    expect(r.value.night.status).toBe("confermata");
    expect(r.value.night.bedAt).toEqual({
      value: "2026-10-23T21:30:00.000Z",
      provenance: "confermato",
    });
    expect(r.value.night.wakeAt).toEqual({
      value: "2026-10-24T05:30:00.000Z",
      provenance: "confermato",
    });
    expect(r.value.night.quality).toEqual(before.quality);
    expect(r.value.night.factors).toEqual(["schermo-a-letto"]);
    expect(await repo.getNight("2026-10-24")).toEqual(r.value.night);
  });

  it("usa gli orari passati normalizzati in ISO UTC", async () => {
    const repo = new MemoryRepo({ nights: [night()] });
    const r = await confirmNight(repo, {
      nightDate: "2026-10-24",
      bedAt: "2026-10-24T00:15:00+02:00",
      wakeAt: "2026-10-24T08:00:00+02:00",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.night.bedAt.value).toBe("2026-10-23T22:15:00.000Z");
    expect(r.value.night.wakeAt.value).toBe("2026-10-24T06:00:00.000Z");
  });

  it("crea la notte se non esiste e gli orari sono passati (previous null)", async () => {
    const repo = new MemoryRepo();
    const r = await confirmNight(repo, {
      nightDate: "2026-10-24",
      bedAt: "2026-10-23T22:00:00Z",
      wakeAt: "2026-10-24T06:00:00Z",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.previous).toBeNull();
    expect(r.value.night.status).toBe("confermata");
    expect(r.value.night.quality).toEqual(MISSING);
    expect(r.value.night.isException).toBe(false);
    expect(r.value.night.factors).toEqual([]);
    expect(await repo.getNight("2026-10-24")).toEqual(r.value.night);
  });

  it("notte senza orari e nessun orario passato: errore", async () => {
    const repo = new MemoryRepo({
      nights: [
        night({
          bedAt: { ...MISSING },
          wakeAt: { ...MISSING },
          status: "mancante",
        }),
      ],
    });
    expect(await confirmNight(repo, { nightDate: "2026-10-24" })).toEqual({
      ok: false,
      error: "Mancano gli orari della notte.",
    });
    expect(
      await confirmNight(new MemoryRepo(), {
        nightDate: "2026-10-24",
        bedAt: "2026-10-23T22:00:00Z",
      }),
    ).toEqual({
      ok: false,
      error: "Mancano gli orari della notte.",
    });
  });

  it("orari incoerenti: sveglia non dopo il letto, o data non valida", async () => {
    const repo = new MemoryRepo({ nights: [night()] });
    const err = { ok: false, error: "Gli orari non sono coerenti." };
    expect(
      await confirmNight(repo, {
        nightDate: "2026-10-24",
        bedAt: "2026-10-24T06:00:00Z",
        wakeAt: "2026-10-24T05:00:00Z",
      }),
    ).toEqual(err);
    expect(
      await confirmNight(repo, {
        nightDate: "2026-10-24",
        bedAt: "2026-10-24T06:00:00Z",
        wakeAt: "2026-10-24T06:00:00Z",
      }),
    ).toEqual(err);
    expect(
      await confirmNight(repo, {
        nightDate: "2026-10-24",
        bedAt: "non-una-data",
      }),
    ).toEqual(err);
    expect((await repo.getNight("2026-10-24"))?.status).toBe("stimata");
  });

  it("durata oltre 16 ore: errore; esattamente 16 ore: ok", async () => {
    const repo = new MemoryRepo();
    const err = { ok: false, error: "Gli orari non sono coerenti." };
    expect(
      await confirmNight(repo, {
        nightDate: "2026-10-24",
        bedAt: "2026-10-23T12:00:00Z",
        wakeAt: "2026-10-24T04:01:00Z",
      }),
    ).toEqual(err);
    const ok = await confirmNight(repo, {
      nightDate: "2026-10-24",
      bedAt: "2026-10-23T12:00:00Z",
      wakeAt: "2026-10-24T04:00:00Z",
    });
    expect(ok.ok).toBe(true);
  });

  it("conferma + annulla ripristina esattamente la notte precedente", async () => {
    const before = night();
    const repo = new MemoryRepo({ nights: [before] });
    const c = await confirmNight(repo, {
      nightDate: "2026-10-24",
      bedAt: "2026-10-23T23:00:00Z",
      wakeAt: "2026-10-24T07:00:00Z",
    });
    expect(c.ok).toBe(true);
    if (!c.ok) return;
    expect((await repo.getNight("2026-10-24"))?.status).toBe("confermata");
    const u = await undoConfirmNight(repo, c.value.previous, "2026-10-24");
    expect(u).toEqual({ ok: true, value: undefined });
    expect(await repo.getNight("2026-10-24")).toEqual(before);
  });

  it("annulla senza notte precedente: la riscrive come mancante senza orari", async () => {
    const repo = new MemoryRepo();
    const c = await confirmNight(repo, {
      nightDate: "2026-10-24",
      bedAt: "2026-10-23T22:00:00Z",
      wakeAt: "2026-10-24T06:00:00Z",
    });
    expect(c.ok).toBe(true);
    if (!c.ok) return;
    const u = await undoConfirmNight(repo, c.value.previous, "2026-10-24");
    expect(u.ok).toBe(true);
    expect(await repo.getNight("2026-10-24")).toEqual({
      nightDate: "2026-10-24",
      bedAt: { ...MISSING },
      wakeAt: { ...MISSING },
      status: "mancante",
      quality: { ...MISSING },
      energy: { ...MISSING },
      isException: false,
      factors: [],
    });
  });

  it("errore del repo: messaggio generico senza dettagli", async () => {
    const repo = new MemoryRepo({ nights: [night()] });
    vi.spyOn(repo, "overwriteNight").mockRejectedValue(
      new Error("connection refused at db:5432"),
    );
    expect(await confirmNight(repo, { nightDate: "2026-10-24" })).toEqual({
      ok: false,
      error: GENERIC,
    });
    expect(await undoConfirmNight(repo, null, "2026-10-24")).toEqual({
      ok: false,
      error: GENERIC,
    });
  });
});

describe("rateNight", () => {
  it("imposta solo i campi passati con provenienza confermato e non tocca lo status", async () => {
    const repo = new MemoryRepo({ nights: [night()] });
    const r = await rateNight(repo, { nightDate: "2026-10-24", energy: 4 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.energy).toEqual({ value: 4, provenance: "confermato" });
    expect(r.value.quality).toEqual({ value: 3, provenance: "confermato" });
    expect(r.value.status).toBe("stimata");
    expect(await repo.getNight("2026-10-24")).toEqual(r.value);

    const r2 = await rateNight(repo, {
      nightDate: "2026-10-24",
      quality: 5,
      energy: 2,
    });
    expect(r2.ok && r2.value.quality.value).toBe(5);
    expect(r2.ok && r2.value.energy.value).toBe(2);
  });

  it("notte inesistente: errore", async () => {
    expect(
      await rateNight(new MemoryRepo(), { nightDate: "2026-10-24", energy: 3 }),
    ).toEqual({
      ok: false,
      error: "Notte non trovata.",
    });
  });

  it("voti non validi: errore e nessuna scrittura", async () => {
    const before = night();
    const repo = new MemoryRepo({ nights: [before] });
    for (const bad of [0, 6, 2.5, Number.NaN, -1]) {
      const r = await rateNight(repo, {
        nightDate: "2026-10-24",
        energy: bad as 1,
      });
      expect(r).toEqual({ ok: false, error: "Voto non valido." });
    }
    expect(
      await rateNight(repo, { nightDate: "2026-10-24", quality: 7 as 5 }),
    ).toEqual({
      ok: false,
      error: "Voto non valido.",
    });
    expect(await repo.getNight("2026-10-24")).toEqual(before);
  });

  it("errore del repo: messaggio generico", async () => {
    const repo = new MemoryRepo();
    vi.spyOn(repo, "getNight").mockRejectedValue(new Error("boom"));
    expect(
      await rateNight(repo, { nightDate: "2026-10-24", energy: 3 }),
    ).toEqual({ ok: false, error: GENERIC });
  });
});

describe("setExceptions", () => {
  it("imposta le eccezioni, aggiorna uses e isException", async () => {
    const repo = new MemoryRepo({ nights: [night()] });
    const r = await setExceptions(repo, {
      nightDate: "2026-10-24",
      slugs: ["viaggio", "festa"],
    });
    expect(r).toEqual({ ok: true, value: undefined });
    expect(repo.exceptions["2026-10-24"]).toEqual(["festa", "viaggio"]);
    expect(repo.exceptionTypes.find((t) => t.slug === "viaggio")?.uses).toBe(1);
    const n = await repo.getNight("2026-10-24");
    expect(n?.isException).toBe(true);
    expect(n?.status).toBe("stimata");
    expect(n?.quality).toEqual({ value: 3, provenance: "confermato" });
  });

  it("rimuovere tutte le eccezioni: isException false e uses decrementati", async () => {
    const repo = new MemoryRepo({ nights: [night()] });
    await setExceptions(repo, { nightDate: "2026-10-24", slugs: ["viaggio"] });
    const r = await setExceptions(repo, { nightDate: "2026-10-24", slugs: [] });
    expect(r.ok).toBe(true);
    expect(repo.exceptions["2026-10-24"]).toBeUndefined();
    expect(repo.exceptionTypes.find((t) => t.slug === "viaggio")?.uses).toBe(0);
    expect((await repo.getNight("2026-10-24"))?.isException).toBe(false);
  });

  it("notte inesistente: la crea come mancante", async () => {
    const repo = new MemoryRepo();
    const r = await setExceptions(repo, {
      nightDate: "2026-10-24",
      slugs: ["malattia"],
    });
    expect(r.ok).toBe(true);
    const n = await repo.getNight("2026-10-24");
    expect(n?.status).toBe("mancante");
    expect(n?.bedAt).toEqual(MISSING);
    expect(n?.isException).toBe(true);
  });

  it("slug non valido: errore specifico", async () => {
    const repo = new MemoryRepo({ nights: [night()] });
    expect(
      await setExceptions(repo, {
        nightDate: "2026-10-24",
        slugs: ["Non Valido!"],
      }),
    ).toEqual({
      ok: false,
      error: "Eccezione non valida.",
    });
    expect((await repo.getNight("2026-10-24"))?.isException).toBe(false);
  });

  it("passa al repo solo le label degli slug richiesti, normalizzate; ignora vuote e non stringa", async () => {
    const repo = new MemoryRepo({ nights: [night()] });
    const spy = vi.spyOn(repo, "setNightExceptions");
    const r = await setExceptions(repo, {
      nightDate: "2026-10-24",
      slugs: ["trasloco", "esame", "vuota"],
      labels: {
        trasloco: "  Trasloco   casa  ",
        vuota: "   ",
        altro: "Non richiesto",
        esame: 5 as unknown as string,
      },
    });
    expect(r.ok).toBe(true);
    expect(spy).toHaveBeenCalledWith(
      "2026-10-24",
      ["trasloco", "esame", "vuota"],
      { trasloco: "Trasloco casa" },
    );
  });

  it("senza label (o tutte vuote) chiama il repo con soli slug", async () => {
    const repo = new MemoryRepo({ nights: [night()] });
    const spy = vi.spyOn(repo, "setNightExceptions");
    await setExceptions(repo, { nightDate: "2026-10-24", slugs: ["viaggio"] });
    await setExceptions(repo, {
      nightDate: "2026-10-24",
      slugs: ["viaggio"],
      labels: { viaggio: "  " },
    });
    expect(spy.mock.calls[0]).toEqual(["2026-10-24", ["viaggio"]]);
    expect(spy.mock.calls[1]).toEqual(["2026-10-24", ["viaggio"]]);
  });

  it("label troppo lunga: troncata a EXCEPTION_LABEL_MAX", async () => {
    const repo = new MemoryRepo({ nights: [night()] });
    const spy = vi.spyOn(repo, "setNightExceptions");
    await setExceptions(repo, {
      nightDate: "2026-10-24",
      slugs: ["lunga"],
      labels: { lunga: "x".repeat(50) },
    });
    expect(spy.mock.calls[0]?.[2]).toEqual({ lunga: "x".repeat(30) });
  });

  it("errore del repo sulla notte: messaggio generico", async () => {
    const repo = new MemoryRepo();
    vi.spyOn(repo, "getNight").mockRejectedValue(new Error("boom"));
    expect(
      await setExceptions(repo, {
        nightDate: "2026-10-24",
        slugs: ["viaggio"],
      }),
    ).toEqual({
      ok: false,
      error: GENERIC,
    });
  });
});

describe("saveEveningCheckFromUi", () => {
  it("salva i campi passati come confermato e gli altri come mancante", async () => {
    const repo = new MemoryRepo();
    const r = await saveEveningCheckFromUi(repo, {
      date: "2026-10-24",
      tiredness: 4,
      factors: ["caffe-tardi"],
    });
    expect(r).toEqual({ ok: true, value: undefined });
    expect(await repo.getEveningCheck("2026-10-24")).toEqual({
      date: "2026-10-24",
      tiredness: { value: 4, provenance: "confermato" },
      mood: { ...MISSING },
      factors: ["caffe-tardi"],
      napMinutesToday: { ...MISSING },
    });
    expect(repo.naps).toEqual([]);
  });

  it("merge: i campi non passati restano quelli esistenti", async () => {
    const repo = new MemoryRepo();
    await saveEveningCheckFromUi(repo, {
      date: "2026-10-24",
      tiredness: 4,
      mood: 2,
      factors: ["a", "b"],
    });
    await saveEveningCheckFromUi(repo, { date: "2026-10-24", mood: 5 });
    expect(await repo.getEveningCheck("2026-10-24")).toEqual({
      date: "2026-10-24",
      tiredness: { value: 4, provenance: "confermato" },
      mood: { value: 5, provenance: "confermato" },
      factors: ["a", "b"],
      napMinutesToday: { ...MISSING },
    });
    await saveEveningCheckFromUi(repo, { date: "2026-10-24", factors: [] });
    expect((await repo.getEveningCheck("2026-10-24"))?.factors).toEqual([]);
    expect((await repo.getEveningCheck("2026-10-24"))?.tiredness.value).toBe(4);
  });

  it("napMinutesToday > 0 salva anche il sonnellino", async () => {
    const repo = new MemoryRepo();
    const r = await saveEveningCheckFromUi(repo, {
      date: "2026-10-24",
      napMinutesToday: 30,
    });
    expect(r.ok).toBe(true);
    expect((await repo.getEveningCheck("2026-10-24"))?.napMinutesToday).toEqual(
      {
        value: 30,
        provenance: "confermato",
      },
    );
    expect(repo.naps).toHaveLength(1);
    expect(repo.naps[0]).toMatchObject({
      date: "2026-10-24",
      minutes: 30,
      provenance: "confermato",
    });
  });

  it("napMinutesToday 0 salva il check ma nessun sonnellino", async () => {
    const repo = new MemoryRepo();
    const r = await saveEveningCheckFromUi(repo, {
      date: "2026-10-24",
      napMinutesToday: 0,
    });
    expect(r.ok).toBe(true);
    expect(
      (await repo.getEveningCheck("2026-10-24"))?.napMinutesToday.value,
    ).toBe(0);
    expect(repo.naps).toEqual([]);
  });

  it("valori fuori range: Dati non validi e nessuna scrittura", async () => {
    const repo = new MemoryRepo();
    const bad = [
      { tiredness: 0 as 1 },
      { mood: 6 as 5 },
      { tiredness: 2.5 as 2 },
      { napMinutesToday: -1 },
      { napMinutesToday: 601 },
      { napMinutesToday: 10.5 },
      { factors: Array.from({ length: 13 }, (_, i) => `f${i}`) },
    ];
    for (const extra of bad) {
      expect(
        await saveEveningCheckFromUi(repo, { date: "2026-10-24", ...extra }),
      ).toEqual({
        ok: false,
        error: "Dati non validi.",
      });
    }
    expect(repo.checks).toEqual([]);
    expect(
      (
        await saveEveningCheckFromUi(repo, {
          date: "2026-10-24",
          napMinutesToday: 600,
          factors: Array(12).fill("x"),
        })
      ).ok,
    ).toBe(true);
  });

  it("dayNote: trim e salvataggio", async () => {
    const repo = new MemoryRepo();
    const r = await saveEveningCheckFromUi(repo, {
      date: "2026-10-24",
      dayNote: "  Giornata di esami  ",
    });
    expect(r.ok).toBe(true);
    expect((await repo.getEveningCheck("2026-10-24"))?.dayNote).toBe(
      "Giornata di esami",
    );
  });

  it("dayNote: vuota o null diventa null e cancella la nota esistente", async () => {
    const repo = new MemoryRepo();
    await saveEveningCheckFromUi(repo, { date: "2026-10-24", dayNote: "ciao" });
    await saveEveningCheckFromUi(repo, { date: "2026-10-24", dayNote: "   " });
    expect((await repo.getEveningCheck("2026-10-24"))?.dayNote).toBeNull();
    await saveEveningCheckFromUi(repo, { date: "2026-10-24", dayNote: "di nuovo" });
    await saveEveningCheckFromUi(repo, { date: "2026-10-24", dayNote: null });
    expect((await repo.getEveningCheck("2026-10-24"))?.dayNote).toBeNull();
  });

  it("dayNote assente: la nota esistente resta", async () => {
    const repo = new MemoryRepo();
    await saveEveningCheckFromUi(repo, { date: "2026-10-24", dayNote: "nota" });
    await saveEveningCheckFromUi(repo, { date: "2026-10-24", mood: 3 });
    const c = await repo.getEveningCheck("2026-10-24");
    expect(c?.dayNote).toBe("nota");
    expect(c?.mood.value).toBe(3);
  });

  it("dayNote: limite DAY_NOTE_MAX (dopo il trim) e tipo non valido", async () => {
    const repo = new MemoryRepo();
    expect(
      (
        await saveEveningCheckFromUi(repo, {
          date: "2026-10-24",
          dayNote: ` ${"a".repeat(280)} `,
        })
      ).ok,
    ).toBe(true);
    expect(
      await saveEveningCheckFromUi(repo, {
        date: "2026-10-25",
        dayNote: "a".repeat(281),
      }),
    ).toEqual({ ok: false, error: "Dati non validi." });
    expect(
      await saveEveningCheckFromUi(repo, {
        date: "2026-10-25",
        dayNote: 5 as unknown as string,
      }),
    ).toEqual({ ok: false, error: "Dati non validi." });
    expect(await repo.getEveningCheck("2026-10-25")).toBeNull();
  });

  it("errore del repo: messaggio generico", async () => {
    const repo = new MemoryRepo();
    vi.spyOn(repo, "saveEveningCheck").mockRejectedValue(new Error("boom"));
    expect(
      await saveEveningCheckFromUi(repo, { date: "2026-10-24", mood: 3 }),
    ).toEqual({
      ok: false,
      error: GENERIC,
    });
  });
});

describe("recordQuestion", () => {
  it("registra la domanda", async () => {
    const repo = new MemoryRepo();
    const row = {
      date: "2026-10-24",
      kind: "energy" as const,
      nightDate: "2026-10-24",
      answeredOrSkipped: true,
    };
    expect(await recordQuestion(repo, row)).toEqual({
      ok: true,
      value: undefined,
    });
    expect(repo.questions).toEqual([row]);
  });

  it("errore del repo: messaggio generico", async () => {
    const repo = new MemoryRepo();
    vi.spyOn(repo, "logQuestion").mockRejectedValue(new Error("boom"));
    expect(
      await recordQuestion(repo, {
        date: "2026-10-24",
        kind: "quality",
        answeredOrSkipped: false,
      }),
    ).toEqual({ ok: false, error: GENERIC });
  });
});

describe("napFromUi", () => {
  it("start e stop salvano eventi con sorgente app e il sonnellino", async () => {
    const repo = new MemoryRepo();
    const t0 = new Date("2026-10-24T12:00:30Z");
    const t1 = new Date("2026-10-24T12:40:10Z");
    expect(await napFromUi(repo, "start", t0)).toEqual({
      ok: true,
      value: { nightDate: null },
    });
    expect(await napFromUi(repo, "stop", t1)).toEqual({
      ok: true,
      value: { nightDate: null },
    });
    expect(
      repo.events.map((e) => [e.type, e.source, e.idempotencyKey]),
    ).toEqual([
      ["nap_start", "app", "nap_start:2026-10-24T12:00"],
      ["nap_end", "app", "nap_end:2026-10-24T12:40"],
    ]);
    expect(repo.naps).toHaveLength(1);
    expect(repo.naps[0]).toMatchObject({
      date: "2026-10-24",
      minutes: 40,
      provenance: "automatico",
    });
  });

  it("doppio tocco nello stesso minuto: idempotente", async () => {
    const repo = new MemoryRepo();
    await napFromUi(repo, "start", new Date("2026-10-24T12:00:05Z"));
    const again = await napFromUi(
      repo,
      "start",
      new Date("2026-10-24T12:00:50Z"),
    );
    expect(again.ok).toBe(true);
    expect(repo.events).toHaveLength(1);
  });

  it("errore del repo: messaggio generico", async () => {
    const repo = new MemoryRepo();
    vi.spyOn(repo, "insertEvent").mockRejectedValue(new Error("boom"));
    expect(
      await napFromUi(repo, "start", new Date("2026-10-24T12:00:00Z")),
    ).toEqual({ ok: false, error: GENERIC });
  });
});

const PEPPER = "pepper-di-prova-abbastanza-lungo";

describe("createApiToken", () => {
  it("restituisce il token in chiaro una volta; nel repo c'è solo l'hash, coerente con authenticate", async () => {
    const repo = new MemoryRepo();
    const res = await createApiToken(repo, { label: "  iPhone " }, PEPPER);
    if (!res.ok) throw new Error(res.error);
    const { token, info } = res.value;
    expect(token).toMatch(/^st_[A-Za-z0-9_-]{43}$/);
    expect(info).toMatchObject({ label: "iPhone", active: true, lastUsedAt: null });

    // Il chiaro non compare mai: né nell'elenco né nello stato del repo.
    const listed = JSON.stringify(await repo.listTokens());
    const state = JSON.stringify({
      tokenHashes: repo.tokenHashes,
      events: repo.events,
      nights: repo.nights,
      checks: repo.checks,
      naps: repo.naps,
      questions: repo.questions,
      settings: repo.settings,
    });
    expect(listed).not.toContain(token);
    expect(state).not.toContain(token);
    expect(repo.tokenHashes).toEqual([hashToken(token, PEPPER)]);
    expect(listed).not.toContain(hashToken(token, PEPPER));

    // Il token funziona come bearer; con un altro pepper o un token diverso no.
    const ok = (t: string, pepper = PEPPER) => authenticate(`Bearer ${t}`, pepper, (h) => repo.tokenExists(h));
    expect(await ok(token)).toBe(true);
    expect(await ok(token, "un-altro-pepper-molto-lungo")).toBe(false);
    expect(await ok(`${token.slice(0, -1)}${token.endsWith("A") ? "B" : "A"}`)).toBe(false);
  });

  it("due token creati sono diversi", async () => {
    const repo = new MemoryRepo();
    const a = await createApiToken(repo, { label: "A" }, PEPPER);
    const b = await createApiToken(repo, { label: "B" }, PEPPER);
    expect(a.ok && b.ok && a.value.token !== b.value.token).toBe(true);
    expect(await repo.listTokens()).toHaveLength(2);
  });

  it("etichetta vuota, di soli spazi o oltre 40 caratteri → errore calmo, nessun token", async () => {
    const repo = new MemoryRepo();
    for (const label of ["", "   ", "x".repeat(41)]) {
      expect(await createApiToken(repo, { label }, PEPPER)).toEqual({ ok: false, error: "Etichetta non valida." });
    }
    expect(await repo.listTokens()).toEqual([]);
  });

  it("massimo 10 token attivi; un token revocato libera un posto", async () => {
    const repo = new MemoryRepo();
    for (let i = 0; i < MAX_ACTIVE_TOKENS; i += 1) {
      expect((await createApiToken(repo, { label: `t${i}` }, PEPPER)).ok).toBe(true);
    }
    expect(await createApiToken(repo, { label: "uno di troppo" }, PEPPER)).toEqual({
      ok: false,
      error: "Hai già troppi token attivi. Revocane uno.",
    });
    expect(await repo.listTokens()).toHaveLength(MAX_ACTIVE_TOKENS);

    const first = (await repo.listTokens())[0]!;
    expect(await revokeApiToken(repo, first.id)).toEqual({ ok: true, value: undefined });
    expect((await createApiToken(repo, { label: "nuovo" }, PEPPER)).ok).toBe(true);
  });

  it("pepper troppo corto o repo che lancia → errore generico senza dettagli", async () => {
    const repo = new MemoryRepo();
    expect(await createApiToken(repo, { label: "iPhone" }, "corto")).toEqual({ ok: false, error: GENERIC });
    expect(await repo.listTokens()).toEqual([]);

    vi.spyOn(repo, "createToken").mockRejectedValueOnce(new Error("hash duplicato st_segreto"));
    const res = await createApiToken(repo, { label: "iPhone" }, PEPPER);
    expect(res).toEqual({ ok: false, error: GENERIC });
    vi.spyOn(repo, "listTokens").mockRejectedValueOnce(new Error("db giù"));
    expect(await createApiToken(repo, { label: "iPhone" }, PEPPER)).toEqual({ ok: false, error: GENERIC });
  });
});

describe("revokeApiToken", () => {
  it("revoca: il token non autentica più e resta nell'elenco come revocato", async () => {
    const repo = new MemoryRepo();
    const created = await createApiToken(repo, { label: "iPhone" }, PEPPER);
    if (!created.ok) throw new Error(created.error);
    const header = `Bearer ${created.value.token}`;
    expect(await authenticate(header, PEPPER, (h) => repo.tokenExists(h))).toBe(true);

    expect(await revokeApiToken(repo, created.value.info.id)).toEqual({ ok: true, value: undefined });
    expect(await authenticate(header, PEPPER, (h) => repo.tokenExists(h))).toBe(false);
    expect(await repo.listTokens()).toMatchObject([{ id: created.value.info.id, active: false }]);
  });

  it("id inesistente o non valido → 'Token non trovato.'", async () => {
    const repo = new MemoryRepo();
    for (const id of [42, 0, -1, 1.5, Number.NaN]) {
      expect(await revokeApiToken(repo, id)).toEqual({ ok: false, error: "Token non trovato." });
    }
  });

  it("repo che lancia → errore generico", async () => {
    const repo = new MemoryRepo();
    vi.spyOn(repo, "revokeToken").mockRejectedValueOnce(new Error("db giù"));
    expect(await revokeApiToken(repo, 1)).toEqual({ ok: false, error: GENERIC });
  });
});
