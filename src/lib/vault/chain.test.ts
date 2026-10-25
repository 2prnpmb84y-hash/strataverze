import { describe, expect, it } from "vitest";
import { canonicalJson, checkChain, eventHash, GENESIS_HASH, type ChainEvent } from "./chain";

/** Event 3 from the rolled-back proof on production, 24 Oct 2026: the database's own hash. */
const FROM_DATABASE = {
  prevHash: "0efda173ae1d60967339b6e13f525966bad85e054f4984c683fca44da48381d7",
  schemeId: "555dde40-5575-4115-b0a3-2eb2b70ff8ca",
  seq: 3,
  occurredAt: "2026-10-24T15:51:42.175Z",
  eventType: "version.added",
  recordId: "75420262-48b7-4acc-b8e2-8d4f2f6a0727",
  versionId: "1cc40c97-c3db-4cc3-884e-0f8b898f3c29",
  contentHash: "b".repeat(64),
  actorProfileId: "afaea461-9b17-4542-bce8-8f8576724012",
  details: '{"note":"é"}',
};

function chainOf(n: number): ChainEvent[] {
  const out: ChainEvent[] = [];
  let prev = GENESIS_HASH;
  for (let seq = 1; seq <= n; seq++) {
    const e = { schemeId: "s1", seq, occurredAt: `2026-10-25T0${seq}:00:00.000Z`, eventType: "record.captured", recordId: `r${seq}`, versionId: null, contentHash: "a".repeat(64), actorProfileId: null, details: canonicalJson({ n: seq }), prevHash: prev };
    const rowHash = eventHash(e);
    out.push({ ...e, rowHash });
    prev = rowHash;
  }
  return out;
}

describe("vault event hash", () => {
  it("matches the hash the database computed", () => {
    expect(eventHash(FROM_DATABASE)).toBe("972a3e7a4171f9049022df2c1300a8ea34deeb183d83bd4f6bfcebd5344f49b5");
  });

  it("writes JSON the same way every time", () => {
    expect(canonicalJson({ b: 1, a: { d: [1, { z: 1, y: 2 }], c: null }, u: undefined })).toBe('{"a":{"c":null,"d":[1,{"y":2,"z":1}]},"b":1}');
  });
});

describe("checking a chain", () => {
  it("passes an untouched chain, in any order", () => {
    const c = checkChain([...chainOf(4)].reverse());
    expect(c).toMatchObject({ ok: true, eventsChecked: 4, headSeq: 4 });
  });

  it("finds an event whose details were changed", () => {
    const events = chainOf(4);
    events[1] = { ...events[1], details: canonicalJson({ n: 99 }) };
    const c = checkChain(events);
    expect(c.ok).toBe(false);
    expect(c.firstBadSeq).toBe(2);
    expect(c.problems).toContain("Event 2 has been changed since it was recorded.");
  });

  it("finds an event removed from the middle", () => {
    const events = chainOf(4).filter((e) => e.seq !== 3);
    expect(checkChain(events).problems.join(" ")).toContain("Event 3 is missing");
  });

  it("finds events removed from the end, against the last check's head", () => {
    const events = chainOf(4);
    const head = { seq: 4, hash: events[3].rowHash };
    expect(checkChain(events.slice(0, 3), head).problems).toContain("Event 4, the last one seen by the previous check, is missing.");
    expect(checkChain(events, head).ok).toBe(true);
  });

  it("finds a whole chain rebuilt after a check", () => {
    const events = chainOf(3);
    const rebuilt = chainOf(3).map((e) => e);
    // A different history with the same numbers: the head no longer matches.
    const other = rebuilt.map((e, i) => (i === 0 ? { ...e } : e));
    const head = { seq: 3, hash: "f".repeat(64) };
    expect(checkChain(other, head).problems).toContain("Event 3 is not the one the previous check saw.");
    expect(checkChain(events).ok).toBe(true);
  });

  it("finds a time changed by a millisecond", () => {
    const events = chainOf(2);
    events[0] = { ...events[0], occurredAt: "2026-10-25T01:00:00.001Z" };
    expect(checkChain(events).firstBadSeq).toBe(1);
  });
});
