#!/bin/sh
# Entrypoint that fixes the #1 self-host footgun: a Docker container
# that runs as root writes root-owned files into bind-mounted host
# volumes, and the host user (or a non-root service user) then can't
# update them — silently breaking skill extraction, prefs saves, mail
# attachments, etc.
#
# Standard PUID/PGID pattern: pick the UID/GID we should drop to,
# chown the writable bind-mounts so existing root-owned content gets
# repaired on every start (idempotent), then exec the real command
# as that user via gosu.
set -e

PUID="${PUID:-1000}"
PGID="${PGID:-1000}"

# Reuse an existing matching group/user if the host's UID/GID already
# corresponds to one in /etc/passwd (e.g. when the image is rebuilt
# and "odysseus" already exists at the same id). Otherwise create.
if ! getent group "$PGID" >/dev/null 2>&1; then
    groupadd -g "$PGID" odysseus
fi
if ! getent passwd "$PUID" >/dev/null 2>&1; then
    useradd -u "$PUID" -g "$PGID" -M -s /bin/sh -d /app odysseus
fi

# Repair ownership on every writable path the app touches at runtime.
#
# Bind-mounted dirs (/app/data, /app/logs) are the obvious ones, but
# the app ALSO writes inside the image's own source tree at runtime:
#   - services/cache/{search,content}/*  (search cache LRU)
#   - services/search_analytics.json
#   - services/search_engine_error.log
#   - services/tts cache, etc.
# These dirs were created as root during `docker build`, so dropping
# to PUID:PGID would otherwise crash on the first import that tries
# to mkdir them. Chown the whole /app tree — fast (<1s on this size)
# and idempotent via the `-not -uid` filter so we only touch files
# that need fixing.
for dir in /app /app/data /app/logs; do
    if [ -d "$dir" ]; then
        # `find ... -not -uid` keeps this O(touched-files), not
        # O(everything), so terabyte-sized maildirs don't slow startup.
        find "$dir" -not -uid "$PUID" -print0 2>/dev/null \
            | xargs -0 -r chown "$PUID:$PGID" 2>/dev/null || true
    fi
done

# Cookbook installs vllm/etc. via `pip install --user`, which pulls
# nvidia-cuda-* wheels into /app/.local but does not set CUDA_HOME or
# symlink /usr/local/cuda. vllm 0.22+ then crashes during engine init
# when FlashInfer tries to JIT a sampler kernel ("Could not find nvcc",
# then "CUDA compiler and toolkit headers are incompatible" on the
# mixed cuda-nvcc 13.3 / cuda-runtime 13.0 wheel combo).
#
# Auto-set CUDA_HOME if a pip-installed nvcc is present, and disable the
# FlashInfer JIT sampler — sampler only, no impact on attention path.
# No-op when vllm isn't installed.
#
# Checked layouts (all are real pip-wheel install paths):
#   nvidia/cu13        — nvidia-nvcc-cu13 (CUDA 13.x wheel style)
#   nvidia/cu12        — nvidia-nvcc-cu12 (CUDA 12.x wheel style)
#   nvidia/cuda_nvcc   — nvidia-cuda-nvcc-cu12 (older cu12 sub-package style)
for cu in \
    /app/.local/lib/python*/site-packages/nvidia/cu13 \
    /app/.local/lib/python*/site-packages/nvidia/cu12 \
    /app/.local/lib/python*/site-packages/nvidia/cuda_nvcc; do
    if [ -x "$cu/bin/nvcc" ]; then
        export CUDA_HOME="$cu"
        break
    fi
done
# Disable the FlashInfer JIT sampler unconditionally — it is sampler-only
# and has no impact on the attention path, but requires nvcc + matching
# CUDA headers at startup. Without this, vLLM crashes with "Could not find
# nvcc" even when the GPU itself is fully visible to the container.
export VLLM_USE_FLASHINFER_SAMPLER="${VLLM_USE_FLASHINFER_SAMPLER:-0}"

# Make Cookbook-installed Python CLIs visible after `pip install --user`.
# vLLM and helper scripts land here because /app is the non-root user's HOME.
export PATH="/app/.local/bin:$PATH"

# Run first-time setup as the app user so data/ files get the right ownership.
# setup.py is idempotent — skips auth.json / .env if they already exist.
# || true so a setup failure never prevents the container from starting.
gosu "$PUID:$PGID" python /app/setup.py || true

# ── Wait for the LLM backend before serving ────────────────────────────
# Footgun this fixes: on a host reboot Docker auto-starts this container
# (restart: unless-stopped) while the host LLM server (LM Studio on
# :12345) may not be up yet — it's launched by hand, often minutes later.
# uvicorn then starts against a dead backend; a pooled keepalive socket to
# the absent host gets stuck "ready" in the asyncio selector and the event
# loop busy-spins at 100% on one core — silent, self-sustaining (it does
# NOT recover when the backend returns), cleared only by a restart. On this
# Strix Halo box that pins the APU near 98 C and runs the fan flat out.
#
# Fix: block here, at ~0% CPU, until the LLM endpoint actually answers, so
# the app only ever starts against a live backend. All knobs optional:
#   ODYSSEUS_WAIT_FOR_LLM=0        disable the gate entirely
#   ODYSSEUS_LLM_WAIT_URL=...      endpoint to probe (default LM Studio)
#   ODYSSEUS_LLM_WAIT_TIMEOUT=0    seconds before starting anyway; 0 = forever
#   ODYSSEUS_LLM_WAIT_INTERVAL=3   seconds between probes
ODYSSEUS_WAIT_FOR_LLM="${ODYSSEUS_WAIT_FOR_LLM:-1}"
case "$ODYSSEUS_WAIT_FOR_LLM" in
    0|false|no|off|"")
        echo "[entrypoint] LLM wait gate disabled (ODYSSEUS_WAIT_FOR_LLM=$ODYSSEUS_WAIT_FOR_LLM)."
        ;;
    *)
        ODYSSEUS_LLM_WAIT_URL="${ODYSSEUS_LLM_WAIT_URL:-http://host.docker.internal:12345/v1/models}"
        ODYSSEUS_LLM_WAIT_TIMEOUT="${ODYSSEUS_LLM_WAIT_TIMEOUT:-0}"
        ODYSSEUS_LLM_WAIT_INTERVAL="${ODYSSEUS_LLM_WAIT_INTERVAL:-3}"
        export ODYSSEUS_LLM_WAIT_URL ODYSSEUS_LLM_WAIT_TIMEOUT ODYSSEUS_LLM_WAIT_INTERVAL
        # Single long-lived python process (one interpreter start, then it
        # sleeps between probes -> genuinely ~0% CPU while waiting). `|| true`
        # keeps the gate fail-open: a bug here must never brick startup.
        python - <<'PY' || true
import os, sys, time, urllib.request, urllib.error
url = os.environ["ODYSSEUS_LLM_WAIT_URL"]
timeout = float(os.environ.get("ODYSSEUS_LLM_WAIT_TIMEOUT", "0") or 0)
interval = float(os.environ.get("ODYSSEUS_LLM_WAIT_INTERVAL", "3") or 3)
print(f"[entrypoint] Waiting for LLM backend at {url} "
      f"(timeout={timeout:.0f}s, 0=forever)...", flush=True)
start = time.monotonic()
last_beat = 0.0
while True:
    try:
        urllib.request.urlopen(url, timeout=3)
        ok = True
    except urllib.error.HTTPError:
        ok = True          # an HTTP error still means the server is listening
    except Exception:
        ok = False
    if ok:
        print("[entrypoint] LLM backend reachable — starting Odysseus.", flush=True)
        break
    waited = time.monotonic() - start
    if timeout > 0 and waited >= timeout:
        print(f"[entrypoint] LLM backend still unreachable after {waited:.0f}s "
              f"— starting anyway.", flush=True)
        break
    if waited - last_beat >= 30:
        last_beat = waited
        print(f"[entrypoint] still waiting for LLM backend ({waited:.0f}s elapsed)...",
              flush=True)
    time.sleep(interval)
PY
        ;;
esac

# Drop root and run the actual app. `gosu` is preferred over `su` /
# `sudo` because it cleans up the process tree (no extra shell layer)
# so signals (SIGTERM from `docker stop`) reach uvicorn directly.
exec gosu "$PUID:$PGID" "$@"
