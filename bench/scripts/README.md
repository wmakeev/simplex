# Bench campaign runner

`run-campaign.sh` packages the whole measurement campaign from the protocol
(`.plan/2026-07-04-compiler-roadmap-plan/plans/00-benchmark-harness/measurement-protocol.md`)
into a single unattended script — no human or agent supervision required:

```
A/A run 1  →  A/A run 2  →  compare + noiseFloor → env-config.json  →  baseline
```

It logs every step with timestamps, prints a liveness line with per-stage and
whole-campaign progress/ETA, retries once after a canary stop, and finishes
with a summary of all produced files.

> Plain-language companion (what to run, when and why, nightly cron setup):
> [`harness-explain/EXPLAIN.md`](../../.plan/2026-07-04-compiler-roadmap-plan/plans/00-benchmark-harness/harness-explain/EXPLAIN.md)
> (in Russian).

## TL;DR

```bash
# 1. verify the mechanics first (~2-5 min, cleans up after itself):
bash bench/scripts/run-campaign.sh --smoke

# 2. calibrate the machine (once per boot, needs sudo — see below), then
#    start the real campaign and walk away (~2.5-3 h at defaults):
nohup bash bench/scripts/run-campaign.sh > /dev/null 2>&1 &

# 3. watch it live (optional):
tail -f bench/results/tmp/campaign-*.log
```

## Prerequisites

- Repo built: `npm run build` (workers import from `build/`).
- **Idle machine.** Close IDEs, browsers, background indexers. Interactive
  work while the campaign runs inflates the noise floor and can trigger
  canary stops (this is by design — better a stop than silently bad numbers).
- Calibration (protocol §7.1, needs sudo; skip = numbers marked uncalibrated):

  ```bash
  # performance governor on all cores
  for g in /sys/devices/system/cpu/cpu*/cpufreq/scaling_governor; do
    echo performance | sudo tee "$g" > /dev/null
  done
  # disable turbo boost (intel_pstate)
  echo 1 | sudo tee /sys/devices/system/cpu/intel_pstate/no_turbo > /dev/null
  ```

  Revert after the campaign (`schedutil` / `echo 0`). The script only WARNs
  if the machine is uncalibrated or loaded — it never blocks, so an overnight
  run is never lost to a strict check; read the WARN lines in the log.

## What each stage does

| Stage | What | Why |
|---|---|---|
| 1. `aa-1` | full matrix, R=5 (default) | first half of the A/A pair (§7.3) |
| 2. `aa-2` | identical run, different seed | second half |
| 3. compare | `--compare aa-1 aa-2` + `noise-floor.mjs` | max steady eval-time delta → `noiseFloor`, written to `bench/results/<envId>/env-config.json` (future runs and `--compare` pick it up automatically) |
| 4. `baseline` | full matrix, R=10 (default) | the committed reference numbers for fronts 01–06 |

A/A must report **zero significant deltas** (it compares a commit to itself);
if the log shows a WARN about significant A/A deltas, the environment is
unstable — recalibrate and rerun.

## Flags

| Flag | Default | Meaning |
|---|---|---|
| `--repeats-aa N` | 5 | repeats per cell in the A/A runs |
| `--repeats-baseline N` | 10 | repeats per cell in the baseline run |
| `--min-cpu-ms N` | 200 | worker minimum CPU time per sample |
| `--tags T` | all | narrow the matrix (comma-separated fixture tags) |
| `--canary-floor F` | auto | override the canary stop threshold (e.g. `0.15` on a machine with thermal drift; auto = `env-config.json` / none) |
| `--retries N` | 1 | retries after a canary stop (first minutes warm the package; a retry on a warm machine usually survives) |
| `--skip-aa` | — | baseline only, reuse the existing `env-config.json` |
| `--aa-only` | — | stop after writing `env-config.json` (no baseline) |
| `--label-prefix P` | — | prefix for run labels / result file names |
| `--smoke` | — | fast end-to-end mechanics check: `--tags arith`, R=1, min-cpu 50 ms, does **not** write `env-config.json`, deletes its result files |

## Reading the log

One campaign log (`bench/results/tmp/campaign-<stamp>.log`, also mirrored to
stdout) plus one raw orchestrator log per stage (`<label>-<stamp>.log`).
The liveness line appears every 60 s (15 s in smoke):

```
[23:14:02] [baseline] alive: 1240/4620 jobs (27%) | stage elapsed 20m, ETA ~55m | campaign ~5860/9240 jobs, ETA ~57m
```

- **stage** numbers are exact; **campaign** totals are estimates until every
  stage has reported its matrix size.
- `CANARY STOP` — the orchestrator detected machine drift mid-run and stopped
  (protocol §9.1); the script retries automatically (`--retries`). Two stops
  in a row → abort: recalibrate / cool down / raise `--canary-floor`.
- `WARN` lines at the top record the environment state (governor, turbo,
  load) for the record.

## Outputs

- `bench/results/<envId>/<date>.<sha>.aa-1.json`, `…aa-2.json`,
  `…baseline.json` — result files (commit them, §8.2).
- `bench/results/<envId>/env-config.json` — `noiseFloor` + provenance note
  (commit it; the orchestrator and `--compare` read it automatically).
  The **latest** measurement wins here; every measurement is also appended to
  `noise-floor-history.jsonl` (committed) with its date, so the noise-floor
  trend over time stays recorded — result files carry the date in their
  names, so repeated runs never overwrite each other. View the history as a
  table: `node bench/scripts/noise-history.mjs`.
- `bench/results/tmp/*.log` — logs (gitignored, disposable).

Repeated `--aa-only` runs (e.g. scheduled on idle hours) are the intended way
to assess how quiet a machine is before committing to a real baseline: each
run appends one history line, and the table shows whether the floor converges.

## After the campaign

1. Check the campaign log tail: A/A significant deltas = 0; baseline
   steady cells `turbofanned` (the two `throwing-nonnull` steady cells are
   expected `invalid` — a thrown exception in the hot path blocks TurboFan).
2. Commit `bench/results/<envId>/` (result files + `env-config.json`).
3. Record the headline baseline numbers in `docs/compiler-roadmap.md`
   (Step 0 section) with the environment and a calibrated/uncalibrated mark.
4. Fronts 01–06 then measure before/after with
   `npm run bench -- --compare <before>.json <after>.json`
   (see `bench/README.md` for the dual-build ABAB workflow).
