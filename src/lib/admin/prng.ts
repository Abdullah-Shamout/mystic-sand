// A tiny, fast, seedable PRNG. Deterministic for a fixed seed, so the sample orders are the
// same every time they are generated (only their dates move with `now`). Never used during
// render — only in effects/handlers that build the sample data.
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
