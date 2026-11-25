import { describe, expect, it, vi } from "vitest";
import type { EveningCheck, Night } from "../../src/domain/types";
import { MemoryRepo } from "../../src/server/memory-repo";
import { saveNightDetails } from "../../src/server/night-edit";

const GENERIC = "Errore nel salvataggio. Riprova.";
const TODAY = "2026-10-30";
const DATE = "2026-10-24";
const MISSING = { value: null, provenance: "mancante" } as const;

function night(over: Partial<Night> = {}): Night {
  return {
    nightDate: DATE,
    bedAt: { value: "2026-10-23T21:30:00.000Z", provenance: "automatico" },
    wakeAt: { value: "2026-10-24T05:30:00.000Z", provenance: "stimato" },
    status: "stimata",
    quality: { ...MISSING },
    energy: { ...MISSING },
    isException: false,
    factors: [],
    ...over,
  };
}

function spyWrites(repo: MemoryRepo) {
  return {
    overwrite: vi.spyOn(repo, "overwriteNight"),
    exceptions: vi.spyOn(repo, "setNightExceptions"),
    check: vi.spyOn(repo, "saveEveningCheck"),
  };
}

describe("saveNightDetails", () => {
  it("crea una notte mancante dagli orari: confermata e confermato", async () => {
    const repo = new MemoryRepo();
    const r = await saveNightDetails(
      repo,
      {
        nightDate: DATE,
        times: {
          bedAt: "2026-10-23T21:30:00.000Z",
          wakeAt: "2026-10-24T05:30:00.000Z",
        },
      },
      TODAY,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.night.status).toBe("confermata");
    expect(r.value.night.bedAt).toEqual({
      value: "2026-10-23T21:30:00.000Z",
      provenance: "confermato",
    });
    expect(r.value.night.wakeAt.provenance).toBe("confermato");
    expect(await repo.getNight(DATE)).toEqual(r.value.night);
  });

  it("notte stimata con solo qualità: resta stimata, orari invariati", async () => {
    const before = night();
    const repo = new MemoryRepo({ nights: [before] });
    const r = await saveNightDetails(repo, { nightDate: DATE, quality: 4 }, TODAY);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.night.status).toBe("stimata");
    expect(r.value.night.bedAt).toEqual(before.bedAt);
    expect(r.value.night.wakeAt).toEqual(before.wakeAt);
    expect(r.value.night.quality).toEqual({ value: 4, provenance: "confermato" });
  });

  it("corregge una notte confermata (scrittura esplicita)", async () => {
    const repo = new MemoryRepo({
      nights: [
        night({
          status: "confermata",
          bedAt: { value: "2026-10-23T21:30:00.000Z", provenance: "confermato" },
          wakeAt: { value: "2026-10-24T05:30:00.000Z", provenance: "confermato" },
        }),
      ],
    });
    const r = await saveNightDetails(
      repo,
      {
        nightDate: DATE,
        times: {
          bedAt: "2026-10-23T22:00:00.000Z",
          wakeAt: "2026-10-24T06:15:00.000Z",
        },
      },
      TODAY,
    );
    expect(r.ok).toBe(true);
    const saved = await repo.getNight(DATE);
    expect(saved?.bedAt.value).toBe("2026-10-23T22:00:00.000Z");
    expect(saved?.wakeAt.value).toBe("2026-10-24T06:15:00.000Z");
    expect(saved?.status).toBe("confermata");
  });

  it("null rimuove il voto (mancante), undefined lo lascia", async () => {
    const repo = new MemoryRepo({
      nights: [
        night({
          quality: { value: 3, provenance: "confermato" },
          energy: { value: 2, provenance: "confermato" },
        }),
      ],
    });
    const r = await saveNightDetails(repo, { nightDate: DATE, quality: null }, TODAY);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.night.quality).toEqual({ value: null, provenance: "mancante" });
    expect(r.value.night.energy).toEqual({ value: 2, provenance: "confermato" });
  });

  it("orari incoerenti o durata > 16 h: errore e nessuna scrittura", async () => {
    const repo = new MemoryRepo({ nights: [night()] });
    const w = spyWrites(repo);
    const bad = [
      { bedAt: "2026-10-24T06:00:00.000Z", wakeAt: "2026-10-24T05:00:00.000Z" },
      { bedAt: "2026-10-23T10:00:00.000Z", wakeAt: "2026-10-24T05:30:00.000Z" },
      { bedAt: "boh", wakeAt: "2026-10-24T05:30:00.000Z" },
    ];
    for (const times of bad) {
      const r = await saveNightDetails(
        repo,
        { nightDate: DATE, times, quality: 5, evening: { mood: 2 } },
        TODAY,
      );
      expect(r).toEqual({ ok: false, error: "Gli orari non sono coerenti." });
    }
    expect(w.overwrite).not.toHaveBeenCalled();
    expect(w.exceptions).not.toHaveBeenCalled();
    expect(w.check).not.toHaveBeenCalled();
  });

  it("data futura o non valida: 'Dati non validi.' senza scritture", async () => {
    const repo = new MemoryRepo();
    const w = spyWrites(repo);
    for (const nightDate of ["2026-10-31", "2026-02-30", "1999-12-31", "oggi"]) {
      expect(await saveNightDetails(repo, { nightDate, quality: 3 }, TODAY)).toEqual({
        ok: false,
        error: "Dati non validi.",
      });
    }
    // oggi è ammesso
    expect((await saveNightDetails(repo, { nightDate: TODAY, quality: 3 }, TODAY)).ok).toBe(true);
    expect(w.overwrite).toHaveBeenCalledTimes(1);
  });

  it("punteggi e slug non validi: nessuna scrittura", async () => {
    const repo = new MemoryRepo();
    const w = spyWrites(repo);
    const bad = [
      { quality: 6 },
      { energy: 2.5 },
      { exceptions: { slugs: ["Non Slug"] } },
      { exceptions: { slugs: ["a".repeat(41)] } },
      { evening: { factors: Array.from({ length: 13 }, (_, i) => `f${i}`) } },
      { evening: { dayNote: "x".repeat(281) } },
      { evening: { tiredness: 0 } },
    ] as never[];
    for (const extra of bad) {
      const r = await saveNightDetails(repo, { nightDate: DATE, ...(extra as object) }, TODAY);
      expect(r).toEqual({ ok: false, error: "Dati non validi." });
    }
    expect(w.overwrite).not.toHaveBeenCalled();
    expect(w.check).not.toHaveBeenCalled();
  });

  it("eccezioni con etichetta libera: crea il tipo e imposta isException", async () => {
    const repo = new MemoryRepo({ nights: [night()] });
    const r = await saveNightDetails(
      repo,
      {
        nightDate: DATE,
        exceptions: {
          slugs: ["cena-dai-suoceri"],
          labels: { "cena-dai-suoceri": "  Cena dai   suoceri " },
        },
      },
      TODAY,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.night.isException).toBe(true);
    const types = await repo.listExceptionTypes();
    expect(types.find((t) => t.slug === "cena-dai-suoceri")?.label).toBe("Cena dai suoceri");
    expect((await repo.listNightExceptions(DATE, DATE))[DATE]).toEqual(["cena-dai-suoceri"]);

    const off = await saveNightDetails(
      repo,
      { nightDate: DATE, exceptions: { slugs: [] } },
      TODAY,
    );
    expect(off.ok && off.value.night.isException).toBe(false);
  });

  it("setNightExceptions che lancia: 'Eccezione non valida.'", async () => {
    const repo = new MemoryRepo();
    vi.spyOn(repo, "setNightExceptions").mockRejectedValue(new Error("db"));
    const w = vi.spyOn(repo, "overwriteNight");
    const r = await saveNightDetails(
      repo,
      { nightDate: DATE, exceptions: { slugs: ["malattia"] } },
      TODAY,
    );
    expect(r).toEqual({ ok: false, error: "Eccezione non valida." });
    expect(w).not.toHaveBeenCalled();
  });

  it("sera prima: fattori nel check e in Night.factors, tiredness null mancante, nota vuota null", async () => {
    const prev: EveningCheck = {
      date: "2026-10-23",
      tiredness: { value: 4, provenance: "confermato" },
      mood: { value: 3, provenance: "confermato" },
      factors: ["caffe-tardi"],
      napMinutesToday: { value: 20, provenance: "confermato" },
      dayNote: "vecchia",
    };
    const repo = new MemoryRepo({ nights: [night()], checks: [prev] });
    const r = await saveNightDetails(
      repo,
      {
        nightDate: DATE,
        evening: {
          tiredness: null,
          mood: 5,
          factors: ["schermo-a-letto", "cena-pesante"],
          dayNote: "   ",
        },
      },
      TODAY,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.night.factors).toEqual(["schermo-a-letto", "cena-pesante"]);
    const check = await repo.getEveningCheck("2026-10-23");
    expect(check?.factors).toEqual(["schermo-a-letto", "cena-pesante"]);
    expect(check?.tiredness).toEqual({ value: null, provenance: "mancante" });
    expect(check?.mood).toEqual({ value: 5, provenance: "confermato" });
    expect(check?.dayNote).toBeNull();
    expect(check?.napMinutesToday).toEqual(prev.napMinutesToday);
    expect(await repo.listNaps("2026-10-01", "2026-10-31")).toEqual([]);
  });

  it("sera prima senza check esistente: ne crea uno vuoto con i campi passati", async () => {
    const repo = new MemoryRepo();
    const r = await saveNightDetails(
      repo,
      { nightDate: DATE, evening: { dayNote: " Giornata lunga " } },
      TODAY,
    );
    expect(r.ok).toBe(true);
    const check = await repo.getEveningCheck("2026-10-23");
    expect(check?.dayNote).toBe("Giornata lunga");
    expect(check?.tiredness).toEqual({ value: null, provenance: "mancante" });
    expect(check?.factors).toEqual([]);
  });

  it("input vuoto: ok, nessuna scrittura, ritorna la notte esistente o vuota", async () => {
    const before = night();
    const repo = new MemoryRepo({ nights: [before] });
    const w = spyWrites(repo);
    const r = await saveNightDetails(repo, { nightDate: DATE }, TODAY);
    expect(r).toEqual({ ok: true, value: { night: before } });
    const empty = await saveNightDetails(repo, { nightDate: "2026-10-20" }, TODAY);
    expect(empty.ok && empty.value.night.status).toBe("mancante");
    expect(w.overwrite).not.toHaveBeenCalled();
    expect(await repo.getNight("2026-10-20")).toBeNull();
  });

  it("errore del repo: messaggio generico", async () => {
    const repo = new MemoryRepo();
    vi.spyOn(repo, "overwriteNight").mockRejectedValue(new Error("segreto-interno"));
    const r = await saveNightDetails(repo, { nightDate: DATE, quality: 3 }, TODAY);
    expect(r).toEqual({ ok: false, error: GENERIC });

    const repo2 = new MemoryRepo();
    vi.spyOn(repo2, "getNight").mockRejectedValue(new Error("segreto-interno"));
    expect(await saveNightDetails(repo2, { nightDate: DATE, quality: 3 }, TODAY)).toEqual({
      ok: false,
      error: GENERIC,
    });
  });
});
