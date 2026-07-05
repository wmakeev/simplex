#!/usr/bin/env bash
# SimplEx bench measurement campaign — fully unattended, no supervision needed.
#
#   A/A run 1  ->  A/A run 2  ->  compare + noiseFloor -> env-config.json
#   -> baseline run -> final summary
#
# Designed to be started once (e.g. overnight via nohup) on an idle, ideally
# calibrated machine. Logs every stage with timestamps, prints a liveness /
# progress line (jobs done, %, elapsed, per-stage and whole-campaign ETA)
# every POLL seconds, retries once after an orchestrator canary stop.
#
# Usage / flags: see bench/scripts/README.md. Quick reference:
#   --repeats-aa N        A/A repeats per cell        (default 5)
#   --repeats-baseline N  baseline repeats per cell   (default 10)
#   --min-cpu-ms N        worker min CPU time per sample (default 200)
#   --tags T              comma tag filter (narrows the matrix; full runs omit)
#   --canary-floor F      override canary noise floor for the runs (e.g. 0.15)
#   --retries N           retries after a canary stop  (default 1)
#   --skip-aa             reuse existing env-config.json, run baseline only
#   --aa-only             stop after writing env-config.json (no baseline)
#   --label-prefix P      prefix for run labels        (default "")
#   --smoke               fast mechanics check (~minutes): tiny matrix, R=1,
#                         does NOT write env-config, deletes its result files
set -u

cd "$(dirname "$0")/../.." || exit 2
REPO="$PWD"

REPEATS_AA=5
REPEATS_BASE=10
MIN_CPU=200
TAGS=''
CANARY_FLOOR=''
RETRIES=1
SKIP_AA=0
AA_ONLY=0
SMOKE=0
LABEL_PREFIX=''
POLL=60

while [ $# -gt 0 ]; do
  case "$1" in
    --repeats-aa)       REPEATS_AA=$2; shift 2 ;;
    --repeats-baseline) REPEATS_BASE=$2; shift 2 ;;
    --min-cpu-ms)       MIN_CPU=$2; shift 2 ;;
    --tags)             TAGS=$2; shift 2 ;;
    --canary-floor)     CANARY_FLOOR=$2; shift 2 ;;
    --retries)          RETRIES=$2; shift 2 ;;
    --skip-aa)          SKIP_AA=1; shift ;;
    --aa-only)          AA_ONLY=1; shift ;;
    --label-prefix)     LABEL_PREFIX=$2; shift 2 ;;
    --smoke)            SMOKE=1; shift ;;
    *) echo "unknown flag: $1" >&2; exit 2 ;;
  esac
done

if [ "$SMOKE" = 1 ]; then
  REPEATS_AA=1; REPEATS_BASE=1; MIN_CPU=50; TAGS='arith'
  LABEL_PREFIX='smoke-'; POLL=15
fi

STAMP=$(date +%Y%m%d-%H%M%S)
LOGDIR="$REPO/bench/results/tmp"
mkdir -p "$LOGDIR"
CLOG="$LOGDIR/campaign-$STAMP.log"

say() { echo "[$(date +%H:%M:%S)] $*" | tee -a "$CLOG"; }

# ---------------------------------------------------------------- environment
say "campaign $STAMP started (pid $$) — log: $CLOG"
say "params: aa R=$REPEATS_AA, baseline R=$REPEATS_BASE, min-cpu ${MIN_CPU}ms," \
    "tags='${TAGS:-<all>}', canary-floor='${CANARY_FLOOR:-auto}', smoke=$SMOKE"

GOV=$(cat /sys/devices/system/cpu/cpu0/cpufreq/scaling_governor 2>/dev/null || echo unknown)
NOTURBO=$(cat /sys/devices/system/cpu/intel_pstate/no_turbo 2>/dev/null || echo unknown)
LOAD=$(cut -d' ' -f1 /proc/loadavg)
say "env: governor=$GOV no_turbo=$NOTURBO load=$LOAD"
[ "$GOV" != performance ] && say "WARN: governor is '$GOV', not 'performance' (see README: calibration)"
[ "$NOTURBO" != 1 ] && say "WARN: turbo boost appears enabled (no_turbo=$NOTURBO)"
awk "BEGIN{exit !($LOAD > 0.5)}" && say "WARN: load average $LOAD > 0.5 — machine is not idle"

# ------------------------------------------------------------ progress plumbing
# Campaign-level job accounting for the ETA: filled in as stage logs report
# their matrix size ("metric jobs: N").
TOTAL_JOBS=0        # known jobs of finished+current stages
DONE_JOBS=0         # jobs completed in finished stages
PENDING_FACTOR=0    # repeats still ahead, in units of "aa-run jobs per repeat"
CAMPAIGN_T0=$(date +%s)

fmt_min() { awk "BEGIN{printf \"%.0fm\", $1/60}"; }

# run_stage <stage-tag> <label> <repeats> — runs the orchestrator, polls the
# log for liveness + progress, returns orchestrator exit code. Sets RESULT_FILE.
run_stage() {
  local tag=$1 label=$2 repeats=$3
  local slog="$LOGDIR/$label-$STAMP.log"
  local t0=$(date +%s)
  say "[$tag] starting: label=$label R=$repeats -> $slog"
  # shellcheck disable=SC2086
  node bench/src/orchestrator.mjs --preset full \
    ${TAGS:+--tags "$TAGS"} \
    --repeats "$repeats" --min-cpu-ms "$MIN_CPU" \
    --label "$label" --seed "$label" \
    ${CANARY_FLOOR:+--noise-floor "$CANARY_FLOOR"} \
    >"$slog" 2>&1 &
  local pid=$!

  local jobs='' last=''
  while kill -0 "$pid" 2>/dev/null; do
    sleep "$POLL"
    [ -z "$jobs" ] && jobs=$(grep -oE 'metric jobs: +[0-9]+' "$slog" | grep -oE '[0-9]+' | head -1 || true)
    local prog
    prog=$(tr '\r' '\n' <"$slog" | grep -oE '^ *[0-9]+/[0-9]+ ' | tail -1 | tr -d ' ' || true)
    if [ -n "$prog" ] && [ "$prog" != "$last" ]; then
      last=$prog
      local done=${prog%%/*} total=${prog##*/}
      local now=$(date +%s) el=$(( $(date +%s) - t0 ))
      local rate stage_eta camp_eta camp_done camp_total
      rate=$(awk "BEGIN{printf \"%.3f\", $el/$done}")
      stage_eta=$(awk "BEGIN{printf \"%.0f\", ($total-$done)*$rate}")
      # campaign ETA: finished jobs + this stage + estimated pending stages
      camp_done=$(( DONE_JOBS + done ))
      camp_total=$(awk "BEGIN{printf \"%.0f\", $DONE_JOBS + $total + ($total/$repeats)*$PENDING_FACTOR}")
      camp_eta=$(awk "BEGIN{printf \"%.0f\", ($camp_total-$camp_done)*$rate}")
      say "[$tag] alive: $done/$total jobs ($(awk "BEGIN{printf \"%.0f\", 100*$done/$total}")%)" \
          "| stage elapsed $(fmt_min "$el"), ETA ~$(fmt_min "$stage_eta")" \
          "| campaign ~$camp_done/$camp_total jobs, ETA ~$(fmt_min "$camp_eta")"
    elif [ -z "$prog" ]; then
      say "[$tag] alive: warming up / building matrix ($(fmt_min $(( $(date +%s) - t0 )) ) elapsed)"
    fi
  done
  wait "$pid"; local code=$?

  RESULT_FILE=$(tr '\r' '\n' <"$slog" | grep -oE '^wrote .*\.json' | tail -1 | sed 's/^wrote //' || true)
  local total_done
  total_done=$(tr '\r' '\n' <"$slog" | grep -oE '^ *[0-9]+/[0-9]+ ' | tail -1 | tr -d ' ' | cut -d/ -f2)
  [ -n "${total_done:-}" ] && DONE_JOBS=$(( DONE_JOBS + total_done ))

  if [ $code -ne 0 ]; then
    if grep -q 'canary drift .* > noiseFloor' "$slog"; then
      say "[$tag] CANARY STOP (machine drifted mid-run):"
      tail -2 "$slog" | tr '\r' '\n' | tail -2 | tee -a "$CLOG"
      return 42
    fi
    say "[$tag] FAILED (exit $code) — last log lines:"
    tail -5 "$slog" | tr '\r' '\n' | tail -6 | tee -a "$CLOG"
    return $code
  fi
  say "[$tag] done in $(fmt_min $(( $(date +%s) - t0 )) ): $(tr '\r' '\n' <"$slog" | grep -E 'cells:|turbofanned:' | tr '\n' ' ')"
  say "[$tag] result: ${RESULT_FILE:-<none>}"
  return 0
}

# run_stage_with_retry — same args; retries $RETRIES times after canary stops.
run_stage_with_retry() {
  local attempt=0
  while :; do
    run_stage "$@" && return 0
    local code=$?
    if [ $code -eq 42 ] && [ $attempt -lt "$RETRIES" ]; then
      attempt=$(( attempt + 1 ))
      say "[$1] retrying after canary stop (attempt $attempt/$RETRIES) in 60s — machine should be warm now"
      sleep 60
    else
      return $code
    fi
  done
}

# ------------------------------------------------------------------- campaign
AA1_FILE='' AA2_FILE=''
ENVDIR=''

if [ "$SKIP_AA" = 0 ]; then
  PENDING_FACTOR=$(( REPEATS_AA + ( AA_ONLY == 1 ? 0 : REPEATS_BASE ) ))
  say "=== stage 1/4: A/A run 1 ==="
  run_stage_with_retry aa-1 "${LABEL_PREFIX}aa-1" "$REPEATS_AA" || { say "ABORT: aa-1 failed"; exit 1; }
  AA1_FILE=$RESULT_FILE

  PENDING_FACTOR=$(( AA_ONLY == 1 ? 0 : REPEATS_BASE ))
  say "=== stage 2/4: A/A run 2 ==="
  run_stage_with_retry aa-2 "${LABEL_PREFIX}aa-2" "$REPEATS_AA" || { say "ABORT: aa-2 failed"; exit 1; }
  AA2_FILE=$RESULT_FILE

  say "=== stage 3/4: compare A/A -> noiseFloor ==="
  ENVDIR=$(dirname "$AA1_FILE")
  npm run --silent bench -- --compare "$AA1_FILE" "$AA2_FILE" >>"$CLOG" 2>&1
  CMP_CODE=$?
  say "compare exit=$CMP_CODE (full table appended to campaign log)"
  if grep -qE '^\s*summary: [1-9][0-9]* significant' "$CLOG"; then
    say "WARN: A/A compare reports significant deltas — environment is unstable, noiseFloor will be high"
  fi
  if [ "$SMOKE" = 1 ]; then
    node bench/scripts/noise-floor.mjs "$AA1_FILE" "$AA2_FILE" | tee -a "$CLOG"
    say "smoke: env-config.json NOT written"
  else
    node bench/scripts/noise-floor.mjs "$AA1_FILE" "$AA2_FILE" --write-env-config "$ENVDIR" | tee -a "$CLOG"
    say "noiseFloor written to $ENVDIR/env-config.json"
  fi
else
  say "=== stages 1-3 skipped (--skip-aa): using existing env-config.json ==="
  PENDING_FACTOR=$REPEATS_BASE
fi

if [ "$AA_ONLY" = 1 ]; then
  say "=== campaign finished (--aa-only) in $(fmt_min $(( $(date +%s) - CAMPAIGN_T0 )) ) ==="
  exit 0
fi

PENDING_FACTOR=0
say "=== stage 4/4: baseline (R=$REPEATS_BASE) ==="
run_stage_with_retry baseline "${LABEL_PREFIX}baseline" "$REPEATS_BASE" || { say "ABORT: baseline failed"; exit 1; }
BASE_FILE=$RESULT_FILE

# -------------------------------------------------------------------- summary
say "=== campaign finished in $(fmt_min $(( $(date +%s) - CAMPAIGN_T0 )) ) ==="
say "results:"
[ -n "$AA1_FILE" ] && say "  aa-1:     $AA1_FILE"
[ -n "$AA2_FILE" ] && say "  aa-2:     $AA2_FILE"
say "  baseline: $BASE_FILE"
[ -n "$ENVDIR" ] && [ "$SMOKE" = 0 ] && say "  config:   $ENVDIR/env-config.json"

if [ "$SMOKE" = 1 ]; then
  say "smoke: removing smoke result files"
  rm -f "$AA1_FILE" "$AA2_FILE" "$BASE_FILE"
  say "smoke: OK — campaign mechanics verified"
fi
say "next steps: see bench/scripts/README.md ('After the campaign')"
