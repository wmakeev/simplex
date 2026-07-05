# SimplEx benchmark harness

Performance benchmark harness for the SimplEx compiler. It gives every
compiler-roadmap item a checkable before/after number instead of a guess,
with the V8 JIT tier at measurement time **known and asserted** rather than
accidental.

> **Status: complete (tasks 01–08).** The full harness is implemented: `npm run
> bench` builds the matrix, spawns one process per cell-repeat, aggregates, and
> writes a result file with an environment fingerprint; `npm run bench --
> --compare A.json B.json` classifies deltas with the two-stage significance
> criterion. The target machine (`i5-4690K.linux.node24`) has an A/A-calibrated
> `noiseFloor` in `results/<envId>/env-config.json` (the box itself is
> **uncalibrated** — schedutil governor, turbo on, no interactive sudo — so the
> floor is larger/stricter, never a false win) and a committed baseline exists.
> Fronts 01–06 measure before/after against it — see _Running a
> measurement campaign_ below, which is the single entry point (a front does not
> need the `.plan/` task folder to start).

## Measurement protocol

The harness implements
[`measurement-protocol.md`](../.plan/2026-07-04-compiler-roadmap-plan/plans/00-benchmark-harness/measurement-protocol.md)
(revision 3). That document is normative: what is measured (the five-axis
matrix), how (V8 tier control via natives asserts, one process per cell), how
results are stored and compared, and the reproduction rules across
environments and Node versions. Read it before implementing any harness task.

## Running a measurement campaign

This is the operational how-to for fronts 01–06: everything needed to produce a
comparable before/after number for a roadmap item lives here. The reference
sections further down document each module in detail.

> **Unattended one-shot:** the whole campaign below (A/A ×2 → noiseFloor →
> `env-config.json` → baseline) is packaged into a single script with liveness
> logging, progress/ETA and canary-stop retries —
> `bash bench/scripts/run-campaign.sh` (verify mechanics first with `--smoke`).
> See [`scripts/README.md`](scripts/README.md). Steps 2–4 below describe what
> it automates; step 5 (ABAB before/after) stays manual.

### 1. Quick vs full

```bash
npm run bench:quick -- --tags arith,logic   # iterate: steady + micro, eval, time
npm run bench:full                          # baselines / roadmap numbers: whole matrix
```

- **`quick`** is navigational — `steady` + `micro`, eval only, time only, R=3.
  Its files land in `results/tmp/` (gitignored) and are **never** written to the
  roadmap. Use it while iterating on a change.
- **`full`** is the whole five-axis matrix (eval steady time+bytes, eval
  `no-opt` time, `cold` at k ∈ {1,10} for cold-tagged fixtures, the compile-time
  stage decomposition, and the `compiled-mem` macro), R=10. Required for the
  baseline and every roadmap before/after number. Files land in
  `results/<envId>/` (committed).

### 2. Calibrate the machine (§7.1 checklist)

Do this **before** any `full` run that feeds a baseline or a roadmap number. The
hardware layer is the single largest variance reducer (rustc-perf empirics); it
is additive with the runtime `--noconcurrent_*` flags the worker already sets.

- [ ] **Performance governor + turbo off** (needs root):
      ```bash
      sudo cpupower frequency-set -g performance     # or, without cpupower:
      for g in /sys/devices/system/cpu/cpu*/cpufreq/scaling_governor; do \
        echo performance | sudo tee "$g" >/dev/null; done
      echo 1 | sudo tee /sys/devices/system/cpu/intel_pstate/no_turbo   # Intel P-state
      # AMD / non-pstate: echo 0 | sudo tee /sys/devices/system/cpu/cpufreq/boost
      ```
- [ ] **Pinning** — automatic: the orchestrator runs each worker under `taskset
      --cpu-list <core>` (default = last logical core). It gracefully degrades to
      un-pinned if `taskset` is missing and records that in the fingerprint. On a
      machine with SMT/HyperThreading, additionally offline the sibling core.
- [ ] **Warm the machine** — a short CPU workout before the suite, so early cells
      are not systematically faster than late ones.
- [ ] **Do not disable ASLR** (`setarch -R` is forbidden for metric collection —
      it hides layout bias instead of averaging it; R≈10 processes sample it).
- [ ] **Idle machine** — close browser / IDE indexing; `uptime` 1-min load < 0.5.
- [ ] **Laptop on AC**; do not change Node version or `corpusVersion` between a
      before and its after.

The orchestrator prints these as **warnings** at the start of every `full` run
(governor ≠ performance, turbo on, load > 0.5) but never blocks — see
_Uncalibrated environments_ below.

**Uncalibrated environments.** If the governor / turbo controls need a password
you do not have (`sudo -n true` fails), do **not** block: run anyway, label the
results `uncalibrated-…`, and note it next to the roadmap number. An uncalibrated
`noiseFloor` is larger (more conservative), which only makes the significance
gate stricter — it never manufactures a false win. The current
`i5-4690K.linux.node24` baseline was measured uncalibrated (schedutil governor,
turbo on — no interactive sudo on the box); this is recorded in the roadmap entry
and in the result-file labels.

### 3. Calibrate the noise floor (A/A, §7.3)

Run `full` **twice on the same commit** and compare the two runs. Since the code
is identical, every non-zero delta is pure machine noise; the largest relative
delta over the steady cells is the environment's `noiseFloor`.

```bash
npm run bench:full -- --repeats 5 --label uncalibrated-aa-1 --seed aa-1
npm run bench:full -- --repeats 5 --label uncalibrated-aa-2 --seed aa-2
npm run bench -- --compare \
  results/<envId>/<date>.<sha>.uncalibrated-aa-1.json \
  results/<envId>/<date>.<sha>.uncalibrated-aa-2.json
```

If A/A noise on steady-micro exceeds **5%**, the machine is not ready — revisit
the §7.1 checklist (on an uncalibrated box, record the real floor and proceed
with the `uncalibrated` label instead). Run a **separate** A/A restricted to the
ic-pressure axis for those cells (`--ic-pressure`), whose megamorphic-lookup cost
swings 3.5×–60× with shared-stub-cache fill and needs its own local floor.

Record the measured floor in **`results/<envId>/env-config.json`** so every later
run stamps it into `meta.noiseFloor` automatically (and `compare` uses it as the
stage-1 threshold) without re-passing `--noise-floor`:

```json
{ "noiseFloor": 0.05, "icPressureNoiseFloor": 0.30, "calibrated": false,
  "note": "uncalibrated: schedutil governor, turbo on, no interactive sudo" }
```

Precedence: CLI `--noise-floor` > `env-config.json` > none. Only `noiseFloor` is
consumed by the orchestrator today; the other keys are documentation for the next
person.

### 4. Establish / refresh the baseline

Once calibrated:

```bash
npm run bench:full -- --label baseline
```

Every steady cell must pass the tier assert (`turbofanned`, printed as
`steady-eval-time turbofanned: N/N`) and deopts must be 0 (`--diag` to count
them). Commit the file to `results/<envId>/` and record its headline numbers in
`docs/compiler-roadmap.md`. A new machine or a new **major** Node version is a new
`envId` and needs its own §7.1 → §7.3 → baseline sequence.

On an **uncalibrated** box, pre-warm the package first and raise the canary
guard above the machine's within-run thermal drift (the committed
`i5-4690K.linux.node24` baseline used `--noise-floor 0.15`) — otherwise the
canary hard-stops the run on the same warm-up drift the A/A floor is made of.
See _Known behaviors_ below.

### 5. Before/after for a roadmap item (dual-build ABAB, §9.1)

The final number for a landed item is **not** two separate runs — it is one
`--abab` run that interleaves the two builds `A B A B …` across the whole matrix,
so any monotonic drift (thermal first) is split evenly instead of being blamed on
B. Stage the two builds in **two git worktrees**:

```bash
# from the repo root, on the after-branch commit:
git worktree add ../simplex-before <before-sha>       # e.g. the baseline commit
( cd ../simplex-before && npm ci && npm run build )    # build the BEFORE tree
npm run build                                          # build the AFTER tree (current)

npm run bench -- --abab ../simplex-before/build ./build --label front-01-item-4a
#   → writes …front-01-item-4a-A.json (before) and …-B.json (after)

npm run bench -- --compare \
  results/<envId>/<date>.<sha>.front-01-item-4a-A.json \
  results/<envId>/<date>.<sha>.front-01-item-4a-B.json

git worktree remove ../simplex-before                  # clean up
```

Point both `--abab` dirs at the same `./build` for an A/A self-test of the
mechanism (should classify nothing as significant).

### 6. Read the compare report

`--compare A B` (A = before, B = after) prints a delta table then a ready-to-paste
markdown block in the §9.3 format. How to read it:

- **`**` significant** — passed both stages: |Δ| beat the `noiseFloor` and
  3×pooled-MAD, the sign reproduced across all R processes, and the bootstrap CI
  excluded 0 with Mann-Whitney p < 0.05. Reported as an effect-size CI
  (`+30% [+29%, +31%]`), never a bare p-value.
- **`≈` borderline** — cleared stage 1 but not stage 2; treat as "no confirmed
  effect", investigate if it decides a roadmap item.
- **`~` no effect** — below the floor. These **zero slices are mandatory** in the
  roadmap entry (no effect in cold / no-opt / the interpreter is itself a
  result). bytes/op deltas ride in the same table (allocation regressions).
- **`*` micro-interpret** — indicative only (§10.9): the interpreter's `evalNode`
  ICs are polluted by AST variety, so macro / ic-pressure numbers are the
  load-bearing ones for that backend, not micro.
- Excluded rows (`invalid` tier-assert failures, `contaminated` bytes runs,
  `unmatched` cells) are listed **below** the table, never silently dropped.

### 7. Comparability & commit rules

- **Comparable iff** `envId`, `corpusVersion`, `harnessVersion` and the **exact**
  Node version match. `compare` refuses otherwise (exit 2); `--force` overrides
  for deliberate cross-env diagnosis and prints a loud banner — those numbers must
  **never** enter the roadmap.
- **Committed** (`results/<envId>/`): the baseline of each environment, the
  `env-config.json`, and the final before/after files a roadmap number is drawn
  from (makes the entry re-checkable).
- **Gitignored** (`results/tmp/`): quick runs and `--diag` deopt traces.

### 8. Definition of Done for a roadmap item (§12)

- [ ] `before` and `after` run with `bench:full` on one `envId`, one exact Node
      version, one `corpusVersion`; result files committed.
- [ ] The headline number comes from a dual-build **ABAB** run, not `AAAA BBBB`.
- [ ] Every steady cell passed `kOptimized && kTurboFanned` (no `invalid`); deopts
      are 0.
- [ ] Deltas classified by the two-stage criterion, bytes/op included; borderline
      deltas resolved by stage 2 (bootstrap CI / Mann-Whitney).
- [ ] Recorded in `docs/compiler-roadmap.md` in the §9.3 format, **including** the
      zero slices and the interpret backend.
- [ ] Unexpected results (a regression, or an expected win that failed to appear)
      are written into the roadmap item's prose, not left implicit in the numbers.

## Directory layout

```
bench/
  fixtures/     # expression corpus (task 04) — { name, tags, expression, options?, data, params? }
  probes/       # §13 empirical V8 probes (task 01, already done) — do not modify
    vendor/     # vendored mjsunit.js snapshot for the target V8 branch
  src/
    orchestrator.mjs  # matrix → job queue → child processes → aggregation (task 06)
    worker.mjs        # one process = one matrix cell; mitata inside (task 05)
    tier.mjs          # %-natives wrappers: assertOptimized, neverOptimize (task 03)
    env.mjs           # environment fingerprint (task 06)
    compare.mjs       # before/after comparison, significance criterion (task 07)
  results/      # JSON results (protocol §8)
    tmp/        # transient quick runs — gitignored
    <envId>/    # baselines + final before/after — committed (protocol §8.2)
```

## Module format

`bench/` is **plain ESM JavaScript, run directly by Node — no TypeScript, no
build step, outside `tsconfig` and outside the ESLint pipeline** (`bench/` is
in the ESLint `ignores` list). Rationale:

- The harness must run under raw V8 flags (`--allow-natives-syntax`,
  `--noconcurrent_*`, `--max-opt=0`, `--expose-gc`) from files (natives code
  cannot go through `node -e` / TS transform — protocol §4.1). A compile step
  would only add friction and a moving target between source and what V8 sees.
- Zero-dependencies policy of the published package is preserved: nothing here
  ships in `src/`; `mitata` is a `devDependency` only.

Files use the **`.mjs`** extension (like `bench/probes/*.mjs`). `.mjs` is
unconditionally ESM regardless of the nearest `package.json` `"type"`, so the
harness stays ESM even if the root `"type": "module"` ever changes. Code style
matches `bench/probes/lib.mjs`: no semicolons, single quotes, `node:` import
prefixes.

## Fixture corpus (`fixtures/`)

The corpus is the versioned set of expressions every benchmark runs against
(protocol §5). Each `fixtures/*.mjs` default-exports one fixture:

```js
export default {
  name: 'arith-mixed',              // unique slug, matches the file name
  tags: ['arith', 'micro', 'cold'], // category + granularity + markers
  options: { stdlib: true },        // OPTIONAL, JSON-serialisable, see below
  expression: 'a * b + c / d - e mod f',
  makeData() {                      // deterministic, seeded, JSON-serialisable
    const r = mulberry32(1001)
    return { a: randInt(r, 2, 50), /* … */ }
  }
}
```

**Tags.** Every fixture carries a category tag (`arith`, `logic`, `pipe`,
`lambda`, `property`, `call`, `scope`, `string`, `collection`, or a macro tag
`report` / `transform` / `filter-sort`), a granularity tag (`micro` | `macro`),
and optional markers:

- `cold` — one representative fixture per category, for the expensive cold
  process subcorpus (protocol §4.2).
- `throwing` — guaranteed to throw on the eval path (protocol §10.11).
- `mono` / `poly` — property datasets with monomorphic vs. polymorphic hidden
  classes (protocol §10.6). The corpus as a whole deliberately feeds `get`/`bop`
  objects of many shapes, which is also its ic-pressure contribution (§10.2).

**Datasets are generated, never literal.** `makeData()` builds data with a
seeded PRNG (`_prng.mjs`, `mulberry32` — *not* unseeded `Math.random`) so output
is byte-identical between runs. Data must **not** be a literal in the hot
expression: the compiler would constant-fold or DCE it (protocol §10.4). Every
expression reads all its operands from `data`. Datasets are JSON-serialisable so
the worker (task 05) can pass them across the process boundary as JSON; the
parity test asserts a lossless JSON round-trip.

**Non-serialisable options.** stdlib globals and extensions are functions and
cannot be serialised into a fixture. A fixture instead *declares* what it needs
with a serialisable `options` object (`{ stdlib: true }`, `{ errorMapper: null }`),
and the consuming side reconstructs the real `CompileOptions` via
`makeOptions(fixture)` from `fixtures/index.mjs`. This is the single bridge over
the serialisation boundary — the worker and the parity test both use it, so they
build identical option objects. Fixtures never carry function globals directly;
where a helper function is needed it is defined inline in the expression with
`let` (see `call-*.mjs`).

**Registry & `corpusVersion`.** `fixtures/index.mjs` auto-discovers every
`*.mjs` (except `index.mjs` and `_`-prefixed helpers), exposes them as
`fixtures`, and exports the single `corpusVersion` constant plus `makeOptions`,
`getData` and `byTags` helpers. `corpusVersion` goes into every result file's
fingerprint (§7.2) so results built against different corpora are never silently
compared (§8.3).

**Append-only during a campaign.** Editing an existing fixture's text
invalidates every past number measured against it. During an optimisation
campaign the corpus is **append-only**: to change behaviour, add a new fixture
(and, if deprecating, leave the old one) and bump `corpusVersion`. To add a
fixture: drop a new `fixtures/<name>.mjs` (it is picked up automatically), run
`npm test` — the parity gate (`test/bench-fixtures-parity.test.ts`) compiles it
on both backends and asserts identical results, so a fixture that diverges
between backends fails the suite.

## Tooling: mitata

Sampling engine is [`mitata`](https://github.com/evanwashere/mitata) — adaptive
warmup, distribution statistics (p50/p99, MAD), sub-microsecond batching, a
`do_not_optimize` anti-DCE primitive, `--allow-natives-syntax` support, and a
programmatic JSON API. It is the sampling layer inside each worker; the
significance statistics and tier control are the harness's own layers around
it (protocol §6). Pinned identity (goes into the `env.js` fingerprint, task 06):

```
mitata@1.0.34
sha512-Mc3zrtNBKIMeHSCQ0XqRLo1vbdIx1wvFV9c8NJAiyho6AjNfMY8bVhbS12bwciUdd1t4rj8099CH3N3NFahaUA==
```

The version **and** the resolved tarball hash are pinned because npm versions
outrun git tags (release hygiene, protocol §6). Both are read from
`package-lock.json` (`packages["node_modules/mitata"].version` / `.integrity`).

## Tier control (`src/tier.mjs`)

`tier.mjs` is the **only** module that touches V8 `%`-natives and the
`%GetOptimizationStatus` bits (protocol §4). Everything else (worker,
orchestrator) consumes its wrappers and never spells a `%` intrinsic or a
numeric status bit.

- **Bits are never hardcoded.** They are parsed at import time from the vendored
  mjsunit snapshot of the target V8 branch (`probes/vendor/mjsunit-<tag>.js`);
  a tag mismatch warns and points at probe P1 to re-vendor. `tier.mjs` reads
  only that *data* file — it does not import probe *code* (which runs spawn/tmp
  side effects at import), so `bench/src` stays independent of `probes/`.
- **Import-safe without natives.** Every intrinsic is compiled lazily through a
  guarded `new Function('fn', '… %Intrinsic(fn) …')`, so importing the module in
  a process WITHOUT `--allow-natives-syntax` never throws. `nativesAvailable`
  reports which side of that line you are on.
- **API:** `STATUS`, `nativesAvailable`, `getOptimizationStatus`,
  `decodeStatus`, predicates `isOptimized` / `isTurboFanned` / `isMaglevved` /
  `isInterpreted` / `isBaseline`, `classifyTier`; the steady force-recipe
  `forceSteady(fn, invoke, {warmup})` + post-measurement `assertStillSteady(fn)`
  (deopt detection); `neverOptimize(fn)` / `deoptimize(fn)`; the per-mode
  process-flag table `TIER_FLAGS` (`steady` / `no-opt` / `cold`),
  `DIAGNOSTIC_FLAGS`, and `countDeopts(stderr)`.
- **Steady gate is `kOptimized && kTurboFanned`** — Maglev is also `kOptimized`,
  so a bare `kOptimized` check would silently measure Maglev (probe P1).

Self-check (spawns children with each flag set and prints PASS/FAIL):

```bash
npm run bench:tier-selfcheck        # or: node bench/src/tier.selfcheck.mjs
```

It proves: a hot fn reaches turbofan under the steady recipe; an artificial
deopt is caught by the post-assert; `--max-opt=0` stays interpreted; and the
module imports without natives (no crash).

## Worker (`src/worker.mjs`)

One worker process measures exactly **one matrix cell** (protocol §3):
`fixture × backend × phase × tier-mode × metric`. The orchestrator (task 06)
spawns one `node <v8-flags> src/worker.mjs <cell-json>` per cell — with the
tier-mode's flag set from `tier.mjs` `TIER_FLAGS`, plus `--expose-gc` for the
bytes metric — and reads the JSON cell the worker prints to stdout. mitata is
only the sampling engine inside; tier control (force + assert) is delegated to
`tier.mjs`, and the bytes/op metric + its GC guard are the worker's own layer.
Time and bytes are never measured in the same process (observer CPU overhead,
probe P7).

### Input — cell descriptor

A single JSON object, passed as **the first argv token starting with `{`**, or —
if none is present — read in full from **stdin**. Fields:

| Field | Values | Notes |
|---|---|---|
| `fixture` | corpus name | looked up in the registry |
| `backend` | `compile` \| `interpret` | |
| `phase` | `eval` | call the built function |
| | `compile` | whole build pipeline |
| | `parse` \| `validate` \| `codegen` | compile-time stages (§3); `codegen` is compile-only |
| | `instantiate` \| `instantiate+call` | `new Function` only, and `new Function` + first call (§10.5) |
| | `compiled-mem` | §10.10 macro: heapUsed of `N` compiled fns |
| `tier` | `steady` \| `cold` \| `no-opt` | orchestrator sets the matching V8 flags |
| `metric` | `time` \| `bytes` | ignored for `compiled-mem` |
| `k` | number (cold, default 10) | calls/units per cold process |
| `K` | number (bytes, default 2048) | batch size |
| `N` | number (compiled-mem, default 1000) | expressions compiled |
| `warmup` | number (default 20) | steady force-recipe warmup |
| `minCpuTimeMs` | number (default 200) | mitata sampling budget |
| `buildDir` | path (default `../../build`) | build tree to load the compiler-under-test from (ABAB, §9.1) |
| `icPressure` | bool (default false) | eval only: warm every corpus fixture first to megamorphise the shared ICs (§10.2) |

For the interpreter, `codegen` / `instantiate` / `instantiate+call` are not
applicable (no codegen, no `new Function`) and return an `invalid` cell.

### Output — one JSON cell (schema §8.1)

Printed as a single line to stdout (diagnostics go to stderr):

```jsonc
{
  "fixture": "arith-mixed", "tags": ["arith","micro","cold"],
  "backend": "compile", "phase": "eval", "tier": "steady", "metric": "time",
  "tierAssert": "turbofanned",         // eval+steady only; else null
  "invalid": null,                     // reason string if the cell must be dropped
  "stats": {                           // time metric (ns); null for bytes
    "median_ns": 160.1, "mad_ns": 1.2, "p99_ns": 190.0, "min_ns": 155.4
  },
  "gc": { "collections": 0, "bytesPerOp": null, "contaminated": false },
  "meta": { "actualTier": {…}, "mitata": {…}, "notes": [ … ] }
}
```

- **`stats`** — populated for `time` cells; `p99_ns` is a percentile over mitata
  **batch means** (protocol §6), not over individual iterations (stated in
  `meta.notes`). `null` for `bytes` cells.
- **`gc.bytesPerOp`** — populated for `bytes` / `compiled-mem` cells: net
  resident bytes/op after a full forced GC (level 1, §10.1). `contaminated`
  (level 2 guard) is `true` when an unplanned GC fired inside the measurement
  window; `collections` is that in-window GC count.
- **`tierAssert`** — `turbofanned` (the only valid steady outcome) /
  `not-optimized` / `maglev-not-turbofan` / `deopted`, from the pre- and
  post-measurement asserts (`tier.mjs`). `null` where a single stable target
  cannot be forced (compile-time phases, cold, no-opt); the observed tier is
  logged under `meta.actualTier` instead.
- **`invalid`** — non-null drops the cell from comparison: `natives-unavailable`,
  `not-optimized`, `maglev-not-turbofan`, `deopted`, `phase-not-applicable`, or
  `worker-error`.

The worker always prints a JSON line (even on fatal error: `{ "invalid":
"worker-error", … }`, exit 1), so the orchestrator can always parse a result.

Self-check (spawns children with each flag set and prints PASS/FAIL):

```bash
npm run bench:worker-selfcheck      # or: node bench/src/worker.selfcheck.mjs
```

It proves: every `(backend × phase × tier-mode)` combination yields a valid
cell; steady eval passes `turbofanned` on both backends; bytes/op is `> 0` on an
allocating fixture and `≈ 0` on a pure one; an in-window GC flags the run
`contaminated`; the compiled-fn memory macro is positive; and the module runs
honestly (asserting `natives-unavailable`) without `--allow-natives-syntax`.

## Orchestrator (`src/orchestrator.mjs`)

The orchestrator builds the measurement matrix (protocol §3), spawns **one
`node <v8-flags> worker.mjs <cell>` per cell-repeat**, aggregates the R repeats,
and writes one result file with the environment fingerprint. Cells run
**sequentially** (pinned to one core) and in **randomised / interleaved** order
so thermal drift is spread evenly, not loaded onto late cells (§6, §9.1).

```bash
npm run bench                                    # full preset (whole matrix)
npm run bench:quick -- --tags arith              # quick preset, filtered
npm run bench:full  -- --tags logic              # full preset, one category
npm run bench -- --abab ./build ./build-after    # dual-build ABAB (§9.1)
npm run bench -- --ic-pressure --tags property   # add the ic-pressure axis
npm run bench -- --diag --tags arith             # + per-cell deopt count
npm run bench -- --compare A.json B.json          # before/after delta table + §9.3 block
npm run bench -- --compare A.json B.json --force   # override the comparability gate
```

**Flags:**

- `--preset quick|full` (default `full`). `quick` = `steady` + `micro`, eval
  only, time only — navigational, **not** written to roadmap; the file lands in
  `results/tmp/` (gitignored). `full` = the whole matrix (eval steady time+bytes,
  eval `no-opt` time, eval `cold` time for cold-tagged fixtures at k ∈ {1, 10},
  the compile-time stage decomposition `compile`/`parse`/`validate`/`codegen`/
  `instantiate`/`instantiate+call`, and the `compiled-mem` macro) — required for
  baselines and before/after numbers; the file lands in `results/<envId>/`.
- `--tags <csv>` — restrict to fixture categories (`arith`, `logic`, `pipe`,
  `lambda`, `property`, `call`, `scope`, `string`, `collection`, or a macro tag).
  A fixture matches if it carries **any** of the listed tags.
- `--label <str>` — result-file label (default = preset name). Under ABAB the
  two files get `-A` / `-B` appended.
- `--abab <dirA> <dirB>` — dual-build ABAB (§9.1). Loads the compiler from each
  build tree and interleaves processes `A B A B …` across the whole matrix (never
  in `AAAA BBBB` blocks), reshuffling within each pass. Emits **two** result
  files. Point both at the same `./build` for the A/A self-test of the mechanism.
- `--ic-pressure` — add the ic-pressure axis (§10.2): eval-steady cells that
  first compile and warm **every** corpus fixture (many object shapes) to drive
  the shared `get`/`bop` ICs megamorphic, then measure the target. Reported with
  `icPressure: true`; interpret the ratio to the plain cell, not absolute ns.
- `--diag` — one extra diagnostic spawn per cell under `--trace-deopt`/`-opt`;
  counts `[deoptimizing` lines (§10.3) into each cell's `deopts`, dropping the
  raw traces into `results/tmp/` (gitignored).
- `--force` — only with `--compare`: override the §8.3 comparability gate for a
  deliberate cross-environment / cross-Node comparison (marked loudly; diagnosis
  only, never recorded in the roadmap). See _Compare_ below.
- `--core <n>` / `--no-pin` — pin child processes to core `n` via
  `taskset --cpu-list` (§7.1). taskset is auto-detected (`which` + a probe run);
  if absent the run **gracefully degrades** to un-pinned and records
  `env.pinning = { taskset: false, … }` in the fingerprint. Default core is the
  last logical core.
- `--repeats <R>` — processes per cell (default 10 full / 3 quick; §6 keeps the
  baseline floor at 10). `--min-cpu-ms <ms>` — mitata sampling budget per process
  (default 200 full / 100 quick).
- `--seed <str>` — randomisation seed (default `<label>.<yyyy-mm-dd>`, so a run
  reproduces its cell order). `--noise-floor <frac>` — canary drift threshold and
  compare stage-1 threshold; **overrides** `env-config.json`. When omitted, the
  orchestrator reads `noiseFloor` from `results/<envId>/env-config.json` (the A/A
  calibration, §7.3) and stamps it into `meta.noiseFloor`; the header line prints
  the effective value and its source (`cli` / `env-config` / `none`). `--out
  <dir>` — override the output directory. `--dry-run` — print the matrix and exit
  without spawning.

At the start of every `full` run the orchestrator also prints §7.1 **calibration
warnings** (governor ≠ performance, turbo on, 1-min load > 0.5). They are advisory
— the run proceeds; on an uncalibrated box, label results `uncalibrated-…`.

**Canary (§9.1 p4).** In long suites (≥ 40 metric jobs) the orchestrator
periodically re-runs a fixed steady-eval cell and reports its drift vs. the first
canary. With `--noise-floor` set, drift beyond it **stops** the run with an
explicit error (revisit the §7.1 checklist); without it the drift is logged as
informational only (an uncalibrated machine has no meaningful floor to stop on).

**Aggregation (§8.1).** The R repeats of a cell are reduced to one summary:
`median_ns` = median of per-process medians, `mad_ns` = MAD of those medians,
`min_ns` = min of mins, `p99_ns` = median of p99s. `invalid` repeats (failed tier
assert, deopt, not-applicable) are **excluded** from the summary but listed under
`invalidRepeats`; `processes` counts only the valid ones out of
`requestedProcesses`. A steady-eval cell's `tierAssert` is `turbofanned` only if
every valid repeat was.

### Result file format (§8.1)

One run = one JSON file
`results/<envId>/<yyyy-mm-dd>.<git-short-sha>.<label>.json` (quick runs and
`--out`-redirected runs land under `results/tmp/`):

```jsonc
{
  "meta": {
    "date": "2026-07-04T…Z", "commit": "8210e75", "dirty": false,
    "label": "baseline", "preset": "full", "corpusVersion": 1,
    "noiseFloor": null, "seed": "baseline.2026-07-04", "tags": ["arith"],
    "icPressure": false, "buildDir": null
  },
  "env": { /* §7.2 + pinning */ },
  "cells": [ { "fixture": …, "tierAssert": "turbofanned", "processes": 10,
               "requestedProcesses": 10, "stats": {…}, "gc": {…},
               "invalidRepeats": [], "deopts": 0 }, … ]
}
```

## Compare (`src/compare.mjs`)

`npm run bench -- --compare before.json after.json` classifies every cell's
before/after delta as **significant / borderline / no-effect** and prints (a) a
human-readable delta table and (b) a ready-to-paste markdown block in the §9.3
format for `docs/compiler-roadmap.md`. Both are written to stdout (the markdown
block last).

```bash
npm run bench -- --compare A.json B.json          # A = before, B = after
npm run bench -- --compare A.json B.json --force   # override the comparability gate
npm run bench:compare-selfcheck                    # validate the statistics
```

**Comparability gate (§8.3).** Two results are comparable **iff** their `envId`,
`corpusVersion`, `harnessVersion` and **exact** Node version match. Otherwise
compare **refuses** with a clear error and exit code 2 — cross-environment /
cross-corpus / cross-Node comparisons are invalid by construction. `--force`
overrides for deliberate diagnosis and prints a loud banner; those numbers must
**not** be recorded in the roadmap.

**Exclusions.** `invalid` cells (failed tier assert) and `contaminated` bytes/op
runs (an unplanned GC fired in the measurement window, §10.1) never enter the
comparison — they are listed separately below the table. Cells present in only
one file are listed as `unmatched`.

**Two-stage significance criterion (§9.2).** Each delta is classified:

- **Stage 1 (cheap filter)** — a candidate only if **all three** hold:
  `|Δ median| > noiseFloor` (relative, from the after file's `meta.noiseFloor`,
  else the before file's, else a conservative **5% default** with a warning —
  §7.3 declares > 5% A/A noise "not ready", so below 5% signal is indistinguishable
  from machine noise); `|Δ median| > 3 × pooled MAD` of the two runs
  (`pooledMAD = √((madA² + madB²)/2)`, a modified z-score); and the delta sign
  **reproduces across all R processes**. For two independent result files there
  is no per-pass pairing to preserve (§10.7), so the faithful strong translation
  is **full separation of the per-repeat median sets** (no overlap). Stage 1
  needs the individual repeat medians, so the orchestrator stores them per cell
  under `repeats.medians_ns` / `repeats.bytesPerOp`.
- **Stage 2 (borderline)** — for stage-1 candidates, a **percentile bootstrap CI**
  on the relative difference of medians (deterministic, seeded) plus a
  **Mann-Whitney U** test (normal approximation with continuity + tie correction).
  A candidate is confirmed **significant** (`**`) only if the CI excludes 0 and
  the rank test rejects at p < 0.05; otherwise it is **borderline** (`≈`). The
  reported result is an **effect-size CI** ("+30% [+29%, +31%]"), never a bare
  p-value.

**Zero slices are mandatory (§9.3).** Cells with no effect are reported
explicitly as `~`, never omitted — absence of an effect (in cold, no-opt, or the
interpreter) is itself a result. bytes/op deltas ride in the same table
(allocation growth is a second-order regression). **micro-interpret** cells are
flagged `*` as **indicative only** (§10.9): for the interpreter backend the
`evalNode` ICs are polluted by any AST variety, so macro / ic-pressure numbers
are the load-bearing ones, not micro.

The statistics live in small exported helpers (`normalCdf`, `mannWhitneyU`,
`bootstrapRelCI`, `classifyDelta`, `compareResults`, `checkComparability`).
`compare.selfcheck.mjs` validates them against exhaustive permutation
enumeration and published Mann-Whitney exact-table values (complete separation:
two-sided p = 2 / C(N, n1) → 0.10 / 0.02857 / 0.00794 for n = 3/4/5), and
reproduces the three acceptance criteria (A/A → nothing significant; injected
+30% → exactly one significant delta; incomparable → refuse, `--force` →
compare) on deterministic synthetic inputs.

## Environment fingerprint (`src/env.mjs`)

`collectEnv()` gathers the §7.2 block stamped into every result file; the
orchestrator augments it with `pinning`. Two results are comparable iff their
`envId`, `corpusVersion`, `harnessVersion` and exact `node` match (§8.3).

- `envId` — `<cpu>.<os>.node<major>` slug (e.g. `i5-4690K.linux.node24`), the
  results directory and comparability key.
- `cpu` / `cores` / `os` / `node` / `v8` — machine + runtime identity.
- `governor` — `/sys` cpufreq governor, `"unknown"` if unreadable. `noTurbo` —
  `intel_pstate/no_turbo` (true/false), `null` if unreadable.
- `maglevDefault` — **live probe**: a child under `--allow-natives-syntax` heats
  a tiny function past the TurboFan budget and reads `%GetOptimizationStatus`
  (same repro as probe P2), never inferred from the version number (§7.2/§10.8).
- `mitata` — `<semver>#<integrity>` read programmatically from
  `package-lock.json` (`packages["node_modules/mitata"].{version,integrity}`),
  because npm versions outrun git tags (§6).
- `harnessVersion` — protocol/harness revision constant. `corpusVersion` — from
  the fixture registry.

## Committing results

Per protocol §8.2:

- **Committed:** the baseline of each environment, the A/A calibration runs, the
  per-environment `env-config.json` (the calibrated `noiseFloor`), and the final
  before/after files of each front (the files roadmap numbers are drawn from) —
  this makes entries in `docs/compiler-roadmap.md` re-checkable. They live in
  `bench/results/<envId>/<yyyy-mm-dd>.<git-short-sha>.<label>.json` (results) and
  `bench/results/<envId>/env-config.json` (calibration).
- **Ignored** (`.gitignore`): transient quick runs (`bench/results/tmp/`) and
  diagnostic logs (`--trace-deopt` etc., `*.log` / `*.trace` under `results/`).

`<envId>` is derived from CPU model, OS and the **major** Node version.
Results with different `envId` are not comparable (protocol §8.3).

## Known behaviors

Expected, non-bug outcomes a front will meet — don't chase them as regressions:

- **`throwing-nonnull` / `throwing-nonnull-nomap` eval-steady cells are always
  `invalid: not-optimized`.** These fixtures throw an `ExpressionError` on the
  eval path (protocol §10.11); a hot function that throws every call never
  reaches TurboFan, so the steady tier assert (`kOptimized && kTurboFanned`)
  cannot pass and the `time` + `bytes` steady cells are dropped from comparison
  by design. The throwing path is still measured where a stable tier is not
  required — `no-opt` (interpreted) and `cold` — and those cells **are** valid.
  This is the intended way to benchmark the error path; treat the two
  `not-optimized` steady exclusions per throwing fixture as normal (the compare
  report lists them below the table, never silently drops them). Deopt control
  for the error path therefore rides on this `invalid` mechanism, not on a
  steady deopt count.
- **`i5-4690K.linux.node24` is uncalibrated** (schedutil governor, turbo on — no
  interactive sudo on the box). The A/A noise floor is correspondingly larger
  (`noiseFloor = 0.08`, i.e. 8%; see `results/<envId>/env-config.json`), which
  only makes the stage-1 gate **stricter** and never manufactures a false win.
  The largest A/A swing overall is in the **compile-time stage phases**
  (`compile` / `parse` / `instantiate` / `compiled-mem`), which are GC-bound and
  carry no tier assert — they moved up to ~40% between the two identical A/A
  runs. Trust compile-time deltas only at coarse granularity and only when the
  compare stage-2 test (bootstrap CI + Mann-Whitney) confirms them; a single
  fine compile-time delta below ~40% is noise on this machine.
- **Within-run thermal drift trips the canary on this box.** With
  `noiseFloor = 0.08` active, a ~75-min `full` run (R=10) hit a **canary hard
  stop** at 9.05% drift after ~3000 jobs: the first canary sample ran on a cold
  package at full turbo and later samples ran ~9% slower once sustained load
  heated it — the same warm-up-shaped drift that produced the 8% A/A floor in
  the first place. Mitigation used for the committed baseline: **pre-warm the
  package** (a few minutes of a busy loop on the pinned core before the run,
  §7.1 "warm the machine") and pass an explicit `--noise-floor 0.15` so the
  canary acts as a catastrophic-interference guard instead of re-detecting
  known thermal drift (per-canary drift lines stay in the log for post-hoc
  inspection). The baseline file therefore carries `meta.noiseFloor = 0.15`
  (that run's canary guard); the **environment's** significance floor stays
  `0.08` in `env-config.json`, which is what `compare` picks up from the
  after-file of any later env-config-stamped run. On a properly calibrated box
  (performance governor, turbo off) none of this applies — keep the canary at
  the calibrated floor.
- **`noiseFloor` maintenance.** The floor is a property of the machine, not the
  code. Re-run the A/A (§7.3) and update `env-config.json` after any change to
  the hardware, the OS scheduler/governor, or a **major** Node version bump (a
  new `envId` needs its own A/A from scratch). A run always prints the effective
  floor and its source (`cli` / `env-config` / `none`) in its header, so a
  stale or missing floor is visible at a glance.

## Roadmap of tasks

| Task | File | Delivers |
|---|---|---|
| 01 | `probes/` | §13 empirical V8 probes (done) |
| 02 | this scaffold | layout, mitata dep, npm script, CLI contract |
| 03 | `src/tier.mjs` | mjsunit helpers, tier force-recipes, asserts |
| 04 | `fixtures/` | micro/macro corpus + parity gate (done) |
| 05 | `src/worker.mjs` | one matrix cell: phases, tier modes, bytes/op |
| 06 | `src/orchestrator.mjs`, `src/env.mjs` | matrix, R repeats, ABAB, ic-pressure, fingerprint |
| 07 | `src/compare.mjs` | comparability, two-stage significance criterion |
| 08 | `env-config.json`, docs | §7.1 checklist + calibration warning, A/A → `noiseFloor`, committed baseline, campaign how-to (done) |
