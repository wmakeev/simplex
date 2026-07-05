// Deterministic PRNG for fixture datasets (protocol §10.4).
//
// Datasets must NOT be literals baked into the hot function — the compiler would
// then constant-fold or DCE them. They are produced by a generator seeded with a
// fixed value, so every call yields byte-identical, JSON-serialisable data that
// the worker (task 05) can hand to the measured function from a structure created
// outside the compiler's sight.
//
// `mulberry32` is a tiny, well-distributed 32-bit PRNG — NOT `Math.random`,
// which is unseeded and would make datasets non-reproducible between runs.

export function mulberry32(seed) {
  let a = seed >>> 0
  return function next() {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Inclusive integer in [min, max].
export const randInt = (rng, min, max) => min + Math.floor(rng() * (max - min + 1))

// Uniform pick from a non-empty array.
export const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)]

// True with probability p — used to punch deterministic null holes into datasets.
export const chance = (rng, p) => rng() < p
