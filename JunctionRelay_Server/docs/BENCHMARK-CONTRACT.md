# The JunctionRelay Benchmark Contract (v2)

JunctionRelay's MODELS pages — the Benchmarks browser and the Models
dashboard — are **suite-agnostic**. They render whatever conforming
measurements land in the ledger, no matter which harness produced them.
This document is the contract a benchmark suite posts against. The server
owns it; every suite (including the reference one this contract grew out
of) is a client.

The contract is **designed for AI agents coordinating benchmark runs over
MCP**: an agent discovers the catalog, drives its own suite against the
serving boxes, posts results, and can retire an invalidated measurement
era — all through the same authenticated machine channel.

## The channel

Machine clients talk to the **local MCP endpoint** (`/mcp`, streamable
HTTP, `Authorization: Bearer <local MCP key>` — configured in Settings →
Local MCP). The relevant tools:

| Tool | Role |
|---|---|
| `models_query` | Discover catalog ids, serving map, recent measurements |
| `models_benchmarks` | The MATRIX in one call — every measured cell grouped by window and placement regime, plus refusals and untested gaps |
| `models_set_serving` | Record what a machine serves, **with the setup that slot actually runs** |
| `models_add_model` / `models_update_model` | Create/curate catalog entries (name, quant, **measured** sizeGb, category…) |
| `models_record_benchmark` | Post one measurement (see below) |
| `models_delete_benchmarks` | Retire an **invalidated** era (filtered — combine filters; a bare modelId hits that model EVERYWHERE). `quant` and `modelName` narrow to ONE setup, so a capture bug is undone at the granularity it happened |
| `models_link_benchmarks` | Attach rows that name a model to a catalog entry, after the fact |
| `models_sync_catalog` | Refresh the catalog from what is actually on disk — you walk the store, it reports the difference |
| `models_record_reference_score` / `models_delete_reference_score` | Published, cited eval figures (their own table — see below) |
| `models_record_wont_fit` / `models_withdraw_wont_fit` | Fit verdicts (their own table — see below) |

Browser-session tools may use the equivalent REST routes instead; the
shapes are identical.

## The three stores, and which one changes

Every fact about a model lives in exactly one of these, and mixing them is the
mistake this contract exists to prevent:

| Store | States | How it changes |
|---|---|---|
| **Benchmark ledger** | what was true **when it was measured** — the number plus the setup that produced it (quant, window, KV, slots, MTP, spill, vision, engine build), captured at run time and stored ON THE ROW | **Never edited.** A different setup is a NEW ROW. An engine upgrade starts a comparable-but-distinct series |
| **Catalog** | **what we own today** — one entry per MODEL we have downloaded, with its traits and the quants held | Updated in place, on demand |
| **Serving map** | what each machine runs **now**, which is its default, and **the setup that slot serves** (quant, window, KV, slots, MTP, vision, weights GB) | Updated when serving changes |

⛔ **THE CATALOG IS MODELS, NEVER CONFIGURATIONS.** One downloaded model is one
entry — `qwen3.8-27b`, not `qwen3.8-27b-128k-q4-mtp`. Holding that model at three
quants is still ONE entry. Quant, context window, KV precision, slot count and MTP
are ways of RUNNING a model: they belong to the serving map and to a benchmark's
`configJson`. `models_add_model` rejects a name carrying a quant, window, precision
or MTP suffix, and says so.

⛔ **AND NOTHING MAY BORROW FROM THE CATALOG.** A catalog entry is a CHECKPOINT and
lists every quant owned of it, so anything reading a fact off it states a fact about
six quants at once. It surfaces in several places at once: the Serving
tab showed the daily driver as all six quants and 131 GB when the slot runs one at
17.9 GB; the matrix flagged Flash-Next with a red ✕ for MTP because the CHECKPOINT
has a head its UD-IQ4_XS quant does not; and the cloud rolled seven setups into two.

A slot, a measurement and a quant each state their own facts. Per-quant capability
lives in `quantsJson` (`{"quant":"UD-Q4_K_XL","sizeGb":17.92,"mtp":true}`), read from
the GGUF tensor table — not inferred from the checkpoint's traits.

This split is what lets a UI tell the difference between *can this model do X* (the
catalog's traits) and *did this run do X* (the row's configJson) — the Benchmarks
matrix renders vision and MTP as three states on exactly that pair: on in this run,
supported but off in this run, or not in the weights at all.

## One measurement

A row carries **its own identity and its own setup**. It never depends on the
catalog for either.

`models_record_benchmark` arguments:

- `modelName` — the MODEL measured, e.g. `qwen3.8-27b`. Not a serving id: no
  quant, window or `-mtp`. **It need not be in the catalog** — see below.
- `metric` — see the canonical set below.
- `value` — the measured number. **Measured, never estimated** — engine
  telemetry or a timed run, never a spec sheet.
- `machine` — Lab machine name the number was measured ON.
- `hardware` — the TIN, when the machine's name is a role that moves between boxes
  (a role name such as "Node A" can move between different hardware). A speed
  belongs to the hardware; the Lab inventory only says what is in the machine today. Optional;
  the matrix prints it beside the machine.
- `scenario` — the load regime (see below).
- **The setup, captured at RUN TIME:** `quant`, `contextTokens`, `slots`,
  `kvPrecision`, `mtp`, `vision`, `engine`, `weightsGb`.
- `configJson` — spillover only, for keys your suite cares about (see below).
- `source` — your suite's name.
- `notes` — free text; caveats worth keeping with the number.
- `capturedAt` — ISO UTC, only when backdating.

### The catalog link is optional

A benchmark is a historical fact; the catalog is a shelf that changes. So a row
stores `modelName` and links to an entry only if one matches. This means you can
benchmark a model you never catalogued, and reorganising the catalog cannot break
history. Unlinked rows are flagged in the UI with ⚠️, never hidden;
`models_link_benchmarks` attaches them once the entry exists.

### Capture the setup from the RUNNING SERVER

⛔ **Never fill these in from the catalog.** The catalog holds MODELS, so asked
which quant a run used it can only answer *the ones we own* — and a UI that
accepts that answer prints every quant held against every row. A field you did
not capture must be sent as null; it renders `—`, and unknown is a legitimate
answer.

Read them from the engine, not from a filename or a config file. For
llama-server, `/props?model=<id>` reports what was actually loaded:

| Field | From |
|---|---|
| `quant` | `model_path` — the file it opened |
| `contextTokens` | `default_generation_settings.n_ctx` |
| `slots` | `total_slots` |
| `vision` | `modalities.vision` |
| `engine` | `build_info` |

A name is not evidence. The reference suite once parsed the quant out of the
launch command, that command came back empty, and **not one row in a 92-row
ledger carried a quant** (2026-08-27).

## Canonical metrics

Unknown metrics are accepted (the ledger is append-only and open), but
only the canonical set drives the UI:

| Metric | Unit | Meaning |
|---|---|---|
| `gen_tok_s` | tokens/s | Generation speed for one stream at the scenario's depth (per-stream under `<depth>_xN`) |
| `prompt_tok_s` | tokens/s | Prefill speed — the whole prompt read cold |
| `ttft_s` | seconds | Time to first token: the server's own prompt time for the whole prompt (v3) |
| `draft_accept` | ratio | Accepted / drafted tokens of a speculative head, 0–1 (v3) |
| `llb_pp512` / `llb_tg128` | tokens/s | `llama-bench` pp512 / tg128 at the scenario's depth, same file and placement, no draft head (v3.1) — the number a llama.cpp thread posts, beside ours |
| `rung_failed` | 1 | A rung that was ATTEMPTED and produced no numbers (the process died mid-prompt). `value` 1, `notes` = the engine's own cause line from the box's logs, `scenario` = the rung. Post it with the same setup and configJson as the run's measured rows so it lands in their cell. The matrix shows a FAILED chip there; a rung deeper than the window shows N/A and needs no row (2026-09-25) |
| `gen_tok_s_aggregate` | tokens/s | Total delivered across all streams of a `<depth>_xN` run |
| `gpu_watts_avg` | watts | Mean GPU power draw during the run's generation |
| `vram_gb` | GB | Measured VRAM footprint while the model is loaded (weights + KV + buffers) |
| `cold_load_s` | seconds | Wall time to load the model cold |
| `disk_read_mbs` | MB/s | Sustained disk read while generating. Post it: it is the only thing that separates "weights live in RAM" from "weights live on the SSD and are paged in every token", and those differ by an order of magnitude. The UI bands on it |
| `vram_shared_gb` | GB | **Windows only.** The serving process's GPU memory the driver has spilled into shared (system) memory, from the WDDM `GPU Process Memory` counters. A full card on Windows never errors and reads nothing on disk; it pages to RAM and falls off a cliff (measured 2026-09-24: 0.65 GB ran at full speed, 1.1 GB cost 35% of generation and 50% of prefill, 4.9 GB cost 93% / 98%). At 0.8 GB and above, on a setup that places nothing in RAM on purpose, the UI files the cell under its own regime, *paged to system RAM*. ⚠️ The same counter also counts the pinned host buffers of a chosen offload (`n_cpu_moe`): 12 expert layers in RAM read 9.6 GB shared and ran at 97 tok/s, so offload rows are never classed as paging |

## Reference scores (their own table)

Published third-party eval figures for known models — SWE-bench Verified/Pro, Aider
polyglot — live in **their own table**, never in the measurement ledger. They are
catalog-domain facts about the checkpoint itself: `models_record_reference_score`
(modelId, benchmark, score, **source URL — mandatory**, notes naming the evaluated
variant) and `models_delete_reference_score` for corrections; REST at
`/api/models/reference-scores`. The UI shows **one benchmark at a time** (a picker; a
model that does not publish it stays blank — figures from different benchmarks are
different scales and never substitute for one another), and always says the figure
describes the full-precision checkpoint, not the quant a box serves.

⚠️ **Prefer independently-run figures, and say which you have.** A vendor's own
number and an independent one look identical in a column and are not comparable:
the harness, scaffold and prompt are the vendor's choice. Record the distinction in
`notes` until it is a field. Checked 2026-08-27: the Aider Polyglot leaderboard was
**0 verified / 22 self-reported**, and LiveCodeBench carried 7 models — coverage of
open-weight and community models is thin everywhere, so expect a sparse column.

⚠️ **Coverage is not a solved problem.** Community fine-tunes and week-old releases
appear on no independent leaderboard at all. A score present on EVERY model can only
come from a suite you run yourself against your own fleet.

## Fit verdicts (their own table)

"This exact setup cannot serve on this machine" lives in its own table, and it is a
**measurement of refusal — a real load was attempted and the box said no**:
`models_record_wont_fit` (modelId, machine, the exact configJson attempted, the load
error **verbatim from the box's own logs**) and `models_withdraw_wont_fit` when a
verdict is disproven; REST at `/api/models/fit-verdicts`. The matrix renders a verdict
as *won't fit* instead of *untested*.

⛔ **TESTED DATA ONLY — NO MANUAL VERDICTS**. A policy, an arithmetic
argument, or a transcribed note is not a verdict: if nobody attempted the load, the cell
stays *untested*. And a transient failure is not a verdict either — a refused request
with no load error in the box's own logs is inconclusive, and nothing is recorded.

## Scenarios (prompt depths) — v3, 2026-09-25

A scenario is a **prompt depth**: one cold request of that many tokens.
`prompt_tok_s` is the prefill of the whole prompt, `gen_tok_s` the next 128
tokens at that depth (tg128), `ttft_s` the server's prompt time. This is the
shape published numbers take (`llama-bench -d`, the vLLM/MLX recipes), so a
cell here reads against a cell out there. **Depths are never averaged together.**

| Scenario | Meaning |
|---|---|
| `4k` `16k` `32k` `64k` `128k` `256k` | The ladder; post every rung the window allows. The UI's headline is `4k`; the matrix shows every rung as a band (prefill · tok/s), with a column picker |
| `<depth>_xN` | N simultaneous streams at that depth (`4k_x4`); post per-stream `gen_tok_s` **and** `gen_tok_s_aggregate` |

Rules: cold prompts only (`cache_prompt=false`, salt first); real text cut to
the depth, the served token count in `notes`; keep the corpus frozen within a
suite version. `shallow` / `deep` / `review` / `parallel_xN` (v1–v2) are
retired and no longer render.

## configJson — spillover only

The setup fields above are the contract. `configJson` is a free-form bag for
what is specific to your suite; extra keys are preserved and shown raw.

| Key | Type | Meaning |
|---|---|---|
| `llama_swap_name` | string | The serving id the box launched, kept as provenance |
| `n_cpu_moe` | int/true | MoE expert layers held in system RAM — a **grouping axis**: spilled setups never share a section or chart with all-in-VRAM setups. ⛔ It is the COUNT of expert layers in RAM from EVERY source: `--n-cpu-moe N` **and** every `-ot ...ffn_*_exps=CPU` pin. A placement that pins by name only was posted without it and filed as all-in-VRAM (IQ1_S with 10 layers in RAM, 2026-09-24), and the production Flash-Next entry read 27 for a shape that pins 37. A suite that posts this field must derive it from the pins, not from the one flag |
| `n_layers_total` | int | Total layer count (verify against the model's own config.json), so the spill reads as the fraction it is |
| `load_mode` | string | `none` = resident, mmap disabled; anything else = mmapped. ⛔ Post it EVEN WHEN ABSENT (as `mmap`): its absence beside `n_cpu_moe` is itself the explanation for a slow number, since the two are incompatible on llama.cpp |
| `tensor_split` | string | GPU split ratio. Its ABSENCE on a multi-GPU box is a real cause of OOM |
| `tensor_overrides` | string[] | Explicit placement, e.g. `ple_ngram_embd=CPU` |

`contextTokens`, `kvPrecision` and `n_cpu_moe` are **grouping axes**: different
windows, KV precisions or spill states never share a section or chart.

## Measurement ethics

These are what make numbers comparable at all:

0. ⛔ **BENCHMARK WITH EVERY CAPABILITY THE WEIGHTS HAVE.** If the checkpoint carries
   an MTP head, pass `--spec-type draft-mtp`. If it ships an mmproj, load it. A
   measurement taken with a capability switched off is not a measurement of that model —
   it silently understates it, and nothing in the number says so.
   Measured 2026-08-28: the same NVFP4 checkpoint read **65 tok/s without MTP and 134.5
   with it**. The slower figure had already been used to rank two variants against each
   other, and the ranking was backwards.
   The matrix marks this: a red ✕ in the MTP or Vision column means the weights support
   it and this run did not use it. Treat it as a bug in the setup, not a property of the
   model.
1. **Engine truth, not wall clock** — read speeds from the engine's own
   telemetry (e.g. `/api/metrics/activity`); drop rows with
   `output_tokens < 2` (one-token probes report absurd rates).
2. **One run per box** — never two runs against the SAME machine (they compete
   for its GPU), and never bench from a box that is also a target. Two
   DIFFERENT machines concurrently is fine: measured 2026-08-28, a config read
   143.04 tok/s alone and 143.64 with a second box mid-run (+0.4%, inside
   run-to-run noise). This rule previously forbade any concurrency, on a
   contaminated era that measured 3× spreads — but that era shared a machine.
   Nothing is shared between independent boxes, and speeds come from each
   engine's own telemetry rather than the coordinator's clock.
3. **Measured, never estimated** — sizes from `ls -l`, VRAM from the GPU
   gauges, layer counts from the model's own config. A wrong number is
   worse than no number.
4. **Sequential A/B for comparisons** — same thermal state, back to back.
5. **Invalidated eras die explicitly** — `models_delete_benchmarks` with a
   filter and a reason, so the series that remain are all trustworthy.

## Tabs are discovered, not hardcoded (2026-08-28)

The Benchmarks page is bench-agnostic: anything that posts these shapes lights it
up. So its tabs are found in the data rather than written into the page - a fixed
list would mean the next suite someone brings has nowhere to land and needs a
code change to be seen at all.

| | |
|---|---|
| **Speed** | The built-in throughput matrix: `gen_tok_s`, `prompt_tok_s`, `gen_tok_s_aggregate`, `gpu_watts_avg`, `vram_gb`, `cold_load_s`, `disk_read_mbs`. Machines are its columns, because throughput is a property of the hardware |
| **Every other suite** | One tab per suite that posts scored rows. Rows key on the MODEL and its setup; the metric's suffix becomes the column |

**Name your suite in `configJson.suite`** and the tab appears under that name.
`LLMReasoningTest` is displayed as *Intelligence*; a suite the page has never
heard of shows under its own name rather than vanishing. Without a `suite` the
metric family (the text before the first `_`) is used, so a bench that never
names itself still gets a tab.

⛔ **A scored metric is `<family>_<column>`** — `eval_looping` is the `looping`
column of whatever suite posted it. Keep the family stable; it is the grouping.

⛔ **INTELLIGENCE IS KEYED ON THE WEIGHTS, NOT THE BOX.** Speed's columns are
machines because throughput is hardware. A reasoning score is not - the same
quant answers the same on either machine - so machine is provenance there and
rides the row's subtext. That is also what lets a hosted model, with no machine
and no quant, be an ordinary row: **`machine` is optional on a benchmark row**,
and a cloud model omits it rather than claiming a box it does not run on.

⚠️ **An overall across FEWER columns is not the same number.** The page
case-weights the overall using `cases` from `configJson`, never a mean of rates -
a five-case tier and a twenty-case tier do not deserve equal say - and it marks a
row that ran fewer columns than its suite offers (`⚠4/5`, muted rather than
colour-banded). A partial run that reads as a full one can rank above a model
that was tested harder.

## Display semantics (what your data earns)

The UI groups by workload category (catalog `category`), then context
window × **placement regime** × KV precision. There are FOUR regimes —
all-in-VRAM, experts-in-system-RAM, **paged-from-SSD** (decided by a measured
`disk_read_mbs`) and, since 2026-09-24, **paged-to-system-RAM** (decided by a measured
`vram_shared_gb` of 0.8 GB or more, the Windows driver's silent spill) — never by
comparing weights to memory; rows merge across machines when
they are the same setup under different local ids; the headline number is
the latest (or median, user-toggled) **4K** `gen_tok_s`, color-banded
(defaults since 2026-09-24: green ≥50, amber 30–50, red <30; they were 70/60).
Prefill is banded on its own scale (green ≥2,000 tok/s, amber 1,000–2,000, red
<1,000 — a whole-repo review read in about half a minute, in about a minute, or
in minutes; tightened from 1,000 / 300 on 2026-09-24).
Every other rung renders beside it as `prefill / tok/s` bands (a column picker hides any);
concurrency and watts are columns too, VRAM and the engine version ride the detail views.

## Versioning

⚠️ **Two contracts, two version numbers.** This one - the BENCHMARK contract, how a row is
shaped - is at **v2**. The CLOUD SYNC contract, what leaves the box, is separately at **v4**
(`Model_Lab_SyncContract.cs`); v4 added the serving setup fields. They move independently and
a bump in one says nothing about the other.

**v3.1 (2026-09-25) — additive.** `llb_pp512` / `llb_tg128`: `llama-bench`'s own figures at a
rung's depth, same file and placement, posted under the depth's scenario and shown in the
cell tooltips. The matrix shows every rung as a band with a column picker, and filters by machine.

**v3 (2026-09-25) — breaking for scenarios.** Scenarios are prompt depths (`4k` … `256k`,
`<depth>_xN`); `shallow`/`deep`/`review`/`parallel_xN` no longer render. New metrics `ttft_s`
and `draft_accept`. Row shape unchanged. Suites post `suite_version` and the UI shows one
era at a time, so v2 rows stay in the ledger and out of the way.

**v2.1 (2026-08-28) — additive.** A serving assignment carries the setup it serves;
`quantsJson` carries per-quant capability read from the GGUF; `models_benchmarks` returns the
matrix in one call; `models_delete_benchmarks` narrows by `quant`/`modelName`. Nothing about
an existing benchmark row changed.

**v2 (2026-08-27) — breaking.** A measurement names its model with `modelName`
(was: a required catalog `modelId`) and carries its setup as first-class fields
(was: inside `configJson`). Both changes exist so a row stands on its own: the
catalog can be reorganised, or not contain the model at all, without touching
history — and the UI never has to ask the catalog a question only the run can
answer.

Otherwise additive: new metrics, scenarios and configJson keys may appear;
existing meanings do not change. Servers reject nothing for carrying extra
fields; older servers reject unknown *tool arguments*, so clients strip
newest-first and retry.
