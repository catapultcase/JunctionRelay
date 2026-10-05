#!/usr/bin/env python3
"""JunctionRelay reference benchmark suite.

Measures one OpenAI-compatible llama-server / llama-swap box and posts each
measurement to JunctionRelay over MCP AS IT IS MEASURED - the only sanctioned
submission channel (see docs/BENCHMARK-CONTRACT.md). Python 3.8+, stdlib only.

    python3 llm-bench.py --api http://box:8080 --machine MyBox \
        --mcp http://jr-host:7180/mcp --mcp-key <local MCP bearer key>

Run it DETACHED (nohup/systemd-run) from a coordinator that can reach the
inference box - never on the box being measured, and not supervised by an
agent whose own model is being benched. --dry-run measures without posting.
Every row also lands in results/<machine>_<stamp>.json, submitted or not -
the file is the outbox for anything the live submission missed.
"""
import argparse
import json
import os
import random
import re
import string
import subprocess
import threading
import time
import urllib.request
from datetime import datetime, timezone

REQUEST_TIMEOUT = 600  # a cold model load rides the first request


# ---------------------------------------------------------------- MCP client

class JRMcp:
    """Minimal MCP streamable-HTTP client - initialize once, then tools/call."""

    def __init__(self, url, bearer):
        self.url, self.bearer, self.sid, self._id = url, bearer, None, 0
        r = self._post({"method": "initialize", "params": {
            "protocolVersion": "2025-03-26", "capabilities": {},
            "clientInfo": {"name": "llm-bench", "version": "1.0"}}})
        if "error" in r:
            raise RuntimeError(f"MCP initialize failed: {r['error']}")
        try:
            self._notify("notifications/initialized")
        except Exception:
            pass  # some servers don't require it

    def _headers(self):
        h = {"Content-Type": "application/json",
             "Accept": "application/json, text/event-stream",
             "Authorization": f"Bearer {self.bearer}"}
        if self.sid:
            h["Mcp-Session-Id"] = self.sid
        return h

    def _post(self, payload):
        self._id += 1
        body = json.dumps({"jsonrpc": "2.0", "id": self._id, **payload}).encode()
        req = urllib.request.Request(self.url, data=body, headers=self._headers())
        with urllib.request.urlopen(req, timeout=60) as r:
            self.sid = r.headers.get("Mcp-Session-Id") or self.sid
            text, ctype = r.read().decode(), r.headers.get("Content-Type", "")
        if "text/event-stream" in ctype:
            for line in text.splitlines():
                if line.startswith("data:"):
                    msg = json.loads(line[5:].strip())
                    if msg.get("id") == self._id:
                        return msg
            raise RuntimeError("MCP: no response event in SSE body")
        return json.loads(text) if text.strip() else {}

    def _notify(self, method):
        body = json.dumps({"jsonrpc": "2.0", "method": method}).encode()
        urllib.request.urlopen(
            urllib.request.Request(self.url, data=body, headers=self._headers()),
            timeout=30).read()

    def call(self, tool, args):
        r = self._post({"method": "tools/call",
                        "params": {"name": tool, "arguments": args}})
        if "error" in r:
            raise RuntimeError(f"MCP {tool}: {r['error']}")
        result = r.get("result", {})
        text = "".join(c.get("text", "") for c in result.get("content", []))
        if result.get("isError"):
            raise RuntimeError(f"MCP {tool}: {text}")
        return text

    def model_ids(self):
        """Catalog name -> id, parsed from models_query's '[id] name' lines."""
        return {m.group(2): int(m.group(1))
                for m in re.finditer(r"\[(\d+)\]\s+(\S+)", self.call("models_query", {}))}


# ------------------------------------------------------------- measurement

def http_json(url, payload=None, timeout=REQUEST_TIMEOUT):
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(
        url, data=data,
        headers={"Content-Type": "application/json"} if data else {})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode())


def salt(n=10):
    return "".join(random.choices(string.ascii_lowercase + string.digits, k=n))


# Salted prompts: llama-server prompt-caches; the salt goes first and every
# depth request also sends cache_prompt=false (contract v3: cold prompts only).
def shallow_prompt():
    return f"(session {salt()}) Hello! In one or two sentences, how are you today?"


def depth_prompt(k_tokens, stream=None):
    """~k thousand tokens of salted log text (about 3.3 chars per token) and an
    ask. Use your own frozen corpus for real text; keep it fixed per suite version."""
    head = f"(session {salt()}{f' stream {stream}' if stream is not None else ''}) "
    paras = []
    while sum(len(p) for p in paras) < k_tokens * 1000 * 3.3:
        paras.append(f"Log entry {len(paras)} ({salt()}): sensor bank {random.randint(1, 9)} reported "
                     f"{random.randint(100, 999)} events at offset {salt(6)}, flagged "
                     f"{random.choice(['amber', 'green', 'red'])} by rule {salt(4)}. Note: {salt(12)} {salt(12)}.")
    return head + "Summarise the state of the system in this log:\n\n" + "\n".join(paras)


def latest_activity(api, model):
    try:
        records = http_json(f"{api}/api/metrics/activity", timeout=15)
    except Exception:
        return None
    for rec in reversed(records):
        if rec.get("model") == model and rec.get("prompt_tokens", 0) > 0:
            return rec
    return None


def run_one(api, model, prompt, max_tokens, cache_prompt=True):
    """One completion. Speeds come from engine telemetry - the response's own
    timings block when the build provides it, else the activity log; wall
    clock is never reported as tok/s."""
    payload = {"model": model,
               "messages": [{"role": "user", "content": prompt}],
               "max_tokens": max_tokens, "stream": False}
    if not cache_prompt:
        payload["cache_prompt"] = False  # llama-server honours it on /v1 too
    start = time.time()
    resp = http_json(f"{api}/v1/chat/completions", payload)
    elapsed = time.time() - start
    usage = resp.get("usage", {})
    out = {"output_tokens": usage.get("completion_tokens", 0),
           "prompt_tokens": usage.get("prompt_tokens", 0),
           "elapsed": elapsed, "gen_tps": None, "prompt_tps": None}
    timings = resp.get("timings") or {}
    if timings.get("predicted_per_second"):
        out["gen_tps"] = timings["predicted_per_second"]
        out["prompt_tps"] = timings.get("prompt_per_second")
    else:
        rec = latest_activity(api, model) or {}
        out["gen_tps"] = rec.get("tokens_per_second")
        out["prompt_tps"] = rec.get("prompt_per_second")
    return out


def running_cmd(api, model):
    """The launch command llama-swap actually spawned (its /running endpoint) -
    the only remote source of truth for spec/KV/MoE flags. llama-server's
    /props does NOT report them (verified: --spec-type draft-mtp still shows
    speculative.types 'none' there). Absent on plain llama-server; fine."""
    try:
        for rec in http_json(f"{api}/running", timeout=15).get("running", []):
            if rec.get("model") == model:
                return rec.get("cmd", "")
    except Exception:
        pass
    return ""


def config_json(model, props, cmd):
    """The launch config the numbers were measured under - engine-reported
    facts from /props, launch flags parsed from the /running cmd. Absent is
    honest, guessed is not."""
    cfg = {"llama_swap_name": model}
    gen = props.get("default_generation_settings", {})
    if gen.get("n_ctx"):
        cfg["ctx"] = int(gen["n_ctx"])
    elif props.get("n_ctx"):
        cfg["ctx"] = int(props["n_ctx"])
    if props.get("total_slots"):
        cfg["parallel"] = int(props["total_slots"])
    if props.get("build_info"):
        cfg["engine"] = props["build_info"]
    mods = props.get("modalities")
    if mods is not None:
        cfg["vision"] = bool(mods.get("vision"))
    # The QUANT is a property of the file that was loaded, and /props.model_path
    # is the server naming it. Do not parse it out of the launch command: that
    # command can come back empty, and when it did, not one row in a 92-row
    # ledger carried a quant (2026-08-27).
    base = str(props.get("model_path") or "").split("/")[-1]
    q = re.search(r"((?:UD-)?I?Q\d[\w_]*|BF16|F16|NVFP4)", base, re.I)
    if q:
        cfg["quant"] = q.group(1)
    m = re.search(r"--spec-type\s+(\S+)", cmd)
    if m:
        cfg["spec_type"] = m.group(1)
    m = re.search(r"-ctk\s+(\S+)", cmd)
    if m:
        cfg["cache_k"] = m.group(1)
    m = re.search(r"-ctv\s+(\S+)", cmd)
    if m:
        cfg["cache_v"] = m.group(1)
    m = re.search(r"--n-cpu-moe\s+(\d+)", cmd)
    if m:
        cfg["n_cpu_moe"] = int(m.group(1))
    return cfg


def assert_gpu(machine, ssh_host):
    """CPU-fallback guard. llama.cpp's dynamic backend loader falls back to
    CPU SILENTLY when its GPU backend cannot load (a missing CUDA runtime DLL
    is enough) - and a CPU number in the ledger is poison. With --ssh given,
    the serving llama-server process must appear in nvidia-smi's compute list
    on the target or the run aborts. Without --ssh the run proceeds but says
    loudly that GPU residency is unverified."""
    if not ssh_host:
        print("  ⚠ GPU residency UNVERIFIED (no --ssh) - if this box fell back "
              "to CPU, these numbers are poison. Verify nvidia-smi yourself.")
        return
    try:
        r = subprocess.run(
            ["ssh", "-o", "ConnectTimeout=10", "-o", "BatchMode=yes", ssh_host,
             "nvidia-smi --query-compute-apps=name --format=csv,noheader"],
            capture_output=True, text=True, timeout=30)
        ok = r.returncode == 0 and "llama-server" in r.stdout.lower()
    except Exception:
        ok = False
    if not ok:
        raise SystemExit(
            f"GPU guard: llama-server is NOT in {machine}'s nvidia-smi compute "
            "list (or the ssh probe failed). Refusing to bench - fix the "
            "backend, verify with nvidia-smi, rerun.")


def bench_model(api, model, machine, parallel_n, submit, ssh_host=None):
    rows = []
    now = lambda: datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S")

    def row(metric, value, scenario, note=None):
        r = {"model": model, "metric": metric, "value": round(value, 2),
             "machine": machine, "scenario": scenario,
             "configJson": json.dumps(cfg), "source": "llm-bench example",
             "notes": note, "capturedAt": now()}
        rows.append(r)
        submit(r)  # live: each row posts the moment it exists

    print("  warm-up (may include model load)...")
    run_one(api, model, shallow_prompt(), 16)
    assert_gpu(machine, ssh_host)  # after load, before any row
    try:
        props = http_json(f"{api}/upstream/{model}/props", timeout=30)
    except Exception:
        try:
            props = http_json(f"{api}/props", timeout=30)
        except Exception:
            props = {}
    cfg = config_json(model, props, running_cmd(api, model))

    # The depth ladder (contract v3): every rung the window allows, tg128 each.
    ctx = cfg.get("ctx") or 0
    for k in (4, 16, 32, 64, 128, 256):
        if ctx and k * 1000 + 640 > ctx:
            break
        scen = f"{k}k"
        res = run_one(api, model, depth_prompt(k), 128, cache_prompt=False)
        if res["output_tokens"] < 2:  # one-token probes report absurd rates
            print(f"  {scen}: dropped (output_tokens={res['output_tokens']})")
            continue
        if res["gen_tps"]:
            row("gen_tok_s", res["gen_tps"], scen)
        if res["prompt_tps"]:
            row("prompt_tok_s", res["prompt_tps"], scen)
        print(f"  {scen}: {res['gen_tps'] or 'n/a'} gen, {res['prompt_tps'] or 'n/a'} prefill")

    results, threads = [None] * parallel_n, []
    start = time.time()
    for i in range(parallel_n):
        def work(idx=i):
            try:
                results[idx] = run_one(api, model, depth_prompt(4, stream=idx), 128, cache_prompt=False)
            except Exception as e:
                results[idx] = {"error": str(e)}
        threads.append(threading.Thread(target=work))
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    wall = time.time() - start
    good = [r for r in results if r and not r.get("error")
            and r["output_tokens"] >= 2 and r["gen_tps"]]
    scen = f"4k_x{parallel_n}"   # N streams at the 4k rung
    if good:
        row("gen_tok_s", sum(r["gen_tps"] for r in good) / len(good), scen,
            f"mean of {len(good)}/{parallel_n} streams")
        row("gen_tok_s_aggregate", sum(r["output_tokens"] for r in good) / wall,
            scen, f"{len(good)}/{parallel_n} streams, {wall:.1f}s wall")
        print(f"  {scen}: {len(good)}/{parallel_n} clean streams")
    return rows


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--api", required=True, help="OpenAI-compatible base URL of the box to measure")
    ap.add_argument("--machine", required=True, help="Lab machine name the numbers are measured ON")
    ap.add_argument("--mcp", help="JunctionRelay MCP endpoint, e.g. http://host:7180/mcp")
    ap.add_argument("--mcp-key", default=os.environ.get("JR_MCP_KEY"), help="Local MCP bearer key (or JR_MCP_KEY env)")
    ap.add_argument("--models", help="comma-separated subset; default: everything the box serves")
    ap.add_argument("--ssh", help="user@host of the measured box - arms the hard CPU-fallback guard (recommended)")
    ap.add_argument("--parallel", type=int, default=4)
    ap.add_argument("--dry-run", action="store_true", help="measure only, post nothing")
    args = ap.parse_args()

    mcp, ids, failed = None, {}, []
    if not args.dry_run:
        if not (args.mcp and args.mcp_key):
            ap.error("--mcp and --mcp-key are required unless --dry-run")
        mcp = JRMcp(args.mcp, args.mcp_key)

    def model_name(serving_id):
        """A serving id names a CONFIGURATION; a benchmark names the MODEL.
        Strip the MTP marker, the context window and the quant tier:
        qwen3.8-27b-256k-q4-mtp -> qwen3.8-27b. The quant suffix must start
        with q/iq, which keeps this off real names like lfm2.5-8b-a1b."""
        n = serving_id.removesuffix("-mtp")
        n = re.sub(r"-\d+k(?=-|$)", "", n)
        return re.sub(r"-(?:iq|q)\d[a-z0-9_]*$", "", n, flags=re.I)

    def submit(r):
        if mcp is None:
            return
        # No catalog lookup: the link is OPTIONAL by contract, so a model you
        # never catalogued still measures and still posts. JR flags the row and
        # models_link_benchmarks attaches it later.
        cfg = json.loads(r["configJson"] or "{}")
        try:
            mcp.call("models_record_benchmark", {
                "modelName": model_name(r["model"]),
                "metric": r["metric"], "value": r["value"],
                "machine": r["machine"], "scenario": r["scenario"],
                # The setup, as the running server reported it.
                "quant": cfg.get("quant"),
                "contextTokens": cfg.get("ctx"),
                "slots": cfg.get("parallel"),
                "kvPrecision": cfg.get("cache_k") or cfg.get("cache_v"),
                "mtp": cfg.get("spec_type") == "draft-mtp",
                "vision": cfg.get("vision"),
                "engine": cfg.get("engine"),
                # Spillover only - the fields above are the contract.
                "configJson": json.dumps({k: v for k, v in cfg.items() if k in
                                          ("llama_swap_name", "n_cpu_moe", "n_layers_total")}),
                "source": r["source"],
                "notes": r["notes"], "capturedAt": r["capturedAt"]})
        except Exception as e:
            failed.append(r)
            print(f"  !! submit failed ({e}) - row kept in outbox")

    served = [m["id"] for m in http_json(f"{args.api}/v1/models", timeout=30)["data"]]
    models = ([m.strip() for m in args.models.split(",")] if args.models else served)
    unknown = [m for m in models if m not in served]
    if unknown:
        raise SystemExit(f"Not served at {args.api}: {unknown}\nServed: {served}")

    print(f"Benching {len(models)} model(s) on {args.machine}, sequential"
          + (", posting live over MCP" if mcp else ", dry run") + ".")
    all_rows = []
    for m in models:
        print(f"\n[{m}]")
        try:
            all_rows.extend(bench_model(args.api, m, args.machine, args.parallel, submit, args.ssh))
        except Exception as e:
            print(f"  FAILED: {e} - no rows recorded for this model")

    os.makedirs("results", exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    out = os.path.join("results", f"{args.machine}_{stamp}.json")
    with open(out, "w") as f:
        json.dump({"machine": args.machine, "api": args.api,
                   "rows": all_rows, "unsubmitted": failed}, f, indent=2)
    print(f"\n{len(all_rows)} row(s), {len(failed)} unsubmitted -> {out}")


if __name__ == "__main__":
    main()
