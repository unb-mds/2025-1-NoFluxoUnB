# NoFluxo production resource usage and capacity assessment

Observed on 7 October 2026, approximately 23:31–23:41 in Brasília. The production cluster has substantial unused CPU at the present workload. The tighter constraints are Supabase Nano memory and database growth, the Free plan's egress allowance, Darcy's daily AI budget, and placement of every NoFluxo service on one node. A simultaneous-user ceiling remains unverified because existing telemetry does not connect request volume, latency and resource demand, and no load test was run.

The cluster-hosted frontend, backend and Darcy health endpoints all returned HTTP 200 and commit `c57fb02cc1b2ea3dd920a2566d01b66c6ef7f7a7`, matching the inspected checkout. The Deploy API confirms frontend ingress `no-fluxo.crianex.com`. The README also advertises `no-fluxo.com`; that hostname did not resolve from this inspection's network, so its customer path was not verified. The measurements below cover the named NoFluxo cluster workloads and their Supabase project; they are not a forecast of a later deployment.

## Cluster usage and scheduling

The Deploy API's `GET /api/k8s/capacity` returned four Ready nodes, 14 allocatable CPU cores and 54.64 GiB RAM. At the snapshot, the cluster used 1.107 cores, or 7.9%, and 15.98 GiB RAM, or 29.2%. Kubernetes requests reserved 7.19 cores and 11.66 GiB RAM. Requests are scheduling reservations; limits constrain each container; actual usage is a separate measurement.

| Node | CPU cores | CPU used now | CPU reserved | RAM used now | RAM reserved | Root filesystem available |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| cloud-control-pane | 4 | 5% | 6% | 21% | 1% | 191.87 GB of 206.90 GB |
| non-business-node-1 | 2 | 10% | 72% | 47% | 46% | 75.82 GB of 100.81 GB |
| servidor-3 | 4 | 11% | 75% | 41% | 30% | 67.05 GB of 201.63 GB |
| servidor-4 | 4 | 6% | 63% | 17% | 21% | 170.38 GB of 201.63 GB |

The API classified the cluster as `warn` because servidor-3 had 75% CPU requests. Its field named `headroomPct` also returned 75, but the server implementation uses that field for the worst reservation pressure. It does **not** mean 75% spare capacity.

All three NoFluxo pods run on `non-business-node-1`. Their node selector requires `workload-class=non-business`; this is the only node currently bearing that label. Spare resources on the other nodes therefore do not automatically provide NoFluxo scheduling or failover capacity. There is one ready replica per service and no HPA in the namespace. Each container requests 100m CPU and 128 MiB RAM, with limits of 500m CPU and 512 MiB RAM. Updates allow one surge pod and zero unavailable pods.

That node has 565m CPU unreserved. Five additional 100m pods fit by CPU request arithmetic alone, ignoring other scheduling constraints, but would leave just 65m spare. An 80% reservation ceiling leaves room for only **one** additional 100m pod. Doubling all three services would raise reservations from 71.75% to 86.75%, before a rollout surge. A second node eligible for NoFluxo is the stronger availability improvement.

## NoFluxo resource history

The Deploy API returned a seven-day history with 2,017 samples per application, sampled every five minutes. The CPU values below are the sum across the application's pods; transient rollout overlap is included. Sampling can miss short bursts.

| Service | Average CPU | Maximum sampled CPU | Average RAM | Maximum sampled total RAM | Container limit |
| --- | ---: | ---: | ---: | ---: | --- |
| Backend | 0.75m | 50.77m | 65.37 MiB | 136.68 MiB | 500m / 512 MiB |
| Frontend nginx | 0.094m | 0.776m | 3.38 MiB | 3.65 MiB | 500m / 512 MiB |
| Darcy FastAPI | 5.34m | 25.99m | 217.51 MiB | 229.43 MiB | 500m / 512 MiB |

The current backend pod uses about 61.9 MiB and Darcy about 220.4 MiB. Current pods have zero restarts; the Deploy API's seven-day resource report also reported zero restart increases and no crash reasons. Distinct historical pod counts include replaced deployments and do not represent simultaneous replicas.

Node exporter observed non-business-node-1 at 14.4% average CPU and 58.2% maximum five-minute CPU utilization over its available history. Its exporter coverage is about 5.4 days of the requested seven days. Its maximum observed physical-interface outbound rate was 0.207 MB/s, approximately 1.65 Mbit/s. This is shared node traffic, not NoFluxo-only bandwidth. Host network speed, monthly transfer allowance and provider throttling were not available, so network user capacity cannot be calculated from these rates.

Darcy's 128 MiB memory request is below its observed roughly 220 MiB working set. It should be reviewed when planning scheduling reserves. Low average CPU does not establish safe concurrency: the image runs two Uvicorn workers, and the non-stream recommendation handler makes synchronous provider calls within an async handler. The streaming handler uses a synchronous generator. Those paths need separate concurrency tests.

## Supabase compute and database

The management API confirms project `NoFluxo`, region São Paulo, status `ACTIVE_HEALTHY`. The dashboard confirms the **Free plan and Nano t4g.nano** compute. The live `postgres` database is 302,723,887 bytes, approximately 303 MB, against a 500 MB Free plan limit. The dashboard's organization summary reports 318 MB / 500 MB while the detailed current database panel reports 303 MB. Use the conservative 318 MB reading for planning until the dashboard accounting difference is reconciled.

| Database resource | Observation | Capacity implication |
| --- | --- | --- |
| RAM | 443.7 MB reported by the instance; 182–199 MB available | Small memory budget, with existing swap activity |
| Swap | 631.1 MB occupied out of 1.074 GB | Occupancy alone can be historical, but counters also rose during this inspection |
| CPU | About 5.45% non-idle over two scrapes 349 seconds apart; about 3.05 percentage points were I/O wait | Low compute utilization does not remove memory/I/O sensitivity |
| Swap activity | About 75.7 pages/s read from swap and 72.5 pages/s written | Existing paging makes large burst capacity uncertain |
| PostgreSQL connections | 16 to `postgres` at a metrics scrape; 24 across databases during the audit; maximum 60 | Connections include infrastructure and pooled idle sessions, not one connection per user |
| PostgREST pool | Maximum 10; 9 available and 1 waiting in one scrape; timeout counter 0 | HTTP database queries share ten pool slots; 60 PostgreSQL connections is not a 60-user limit |
| Data volume filesystem | 7.72 GB available of 8.35 GB | Filesystem free space does not override the Free plan's 500 MB database quota |

Supabase's [compute documentation](https://supabase.com/docs/guides/platform/compute-and-disk) distinguishes CPU, memory, disk I/O and connection constraints. Its [database size documentation](https://supabase.com/docs/guides/platform/database-size) explains the Free plan database limit and read-only restrictions. Upgrade compute before a major enrollment-week burst; do not choose a tier solely from the current CPU percentage.

There are **3,671 registered Auth users**, 3,620 public profiles, and 450 users whose last sign-in falls within 30 days. That last-sign-in count differs from billable MAU, which also counts token refresh activity and follows the billing cycle. The seven-day API-count response includes UTC buckets from 1–8 October, with the final bucket partial: 107,103 REST requests and 5,350 Auth requests. The recent peak hour contained 1,563 REST requests, approximately 0.434 requests/s averaged over that hour. It does not establish the peak second or sustainable request rate.

The largest table allocations include vectors at 60.28 MB, academic event history at 46.18 MB, course subject membership at 42.51 MB, Auth audit logs at 32.78 MB, class schedule history at 23.92 MB, refresh tokens at 17.84 MB, and student academic histories at 14.17 MB. Both catalog history and authentication history can grow independently of registrations. `pg_stat_user_tables` live-row estimates were stale for several tables, so they must not be used as exact counts. Direct aggregate reads found 26,145 vector rows and 150,836 course subject rows.

User-associated table allocations currently total approximately 83.76 MB, or 22.8 KB per registered user, including shared authentication/history overhead. This is not a measured marginal cost of adding one user. As an explicit storage scenario, allocating **50 KB per additional account** and keeping the catalog fixed gives about **1,640–1,946 additional accounts** before reaching an operational 400 MB database ceiling. Actual capacity can be lower because history, indexes, bloat and new catalog data also consume that space.

Cumulative query statistics include a vector-search category with approximately 563 ms mean execution time and `casar_disciplinas` at approximately 340 ms. These statistics mix past workloads and versions. They identify important load-test routes; they do not provide current end-to-end p95 latency or a safe queries-per-second ceiling.

## Supabase quotas and other resources

The dashboard's current billing cycle is **14 September–14 October 2026**. Usage meters can lag; MAU can take 24 hours to refresh.

| Resource | Used in cycle | Included allowance | Used |
| --- | ---: | ---: | ---: |
| Uncached egress | 1.16 GB | 5 GB | 23.2% |
| Cached egress | 0 GB | 5 GB | 0% |
| Database summary | 318 MB | 500 MB | 63.6% |
| Monthly active users | 352 | 50,000 | 0.70% |
| Storage objects | 4.90 MB in 15 objects; dashboard rounds to 0.005 GB | 1 GB | About 0.49% |
| Realtime peak connections | 3 | 200 | 1.5% |
| Realtime messages | 80 | 2,000,000 | 0.004% |
| Edge Function invocations | 2 | 500,000 | 0.0004% |
| Log ingestion | 1.167 GB | 1 GB | 116.7% |
| Log queries | 2.143 GB scanned | 100 GB | 2.14% |

Log ingestion has already crossed its displayed allowance. This is an upcoming constraint: Supabase's [logs pricing notice](https://supabase.com/changelog/logs-usage-based-pricing) says these warnings are informational during the grace period through early 2027.

Using roughly 24 elapsed days, the current egress pace projects to approximately **1.45 GB per 30-day cycle**. Dividing that by the currently reported 352 MAU gives approximately 4.12 MB per MAU per full cycle. With an operational 4 GB ceiling, the resulting planning envelope is approximately **970 MAU**, rounded to **1,000 MAU**. This estimate includes background, admin and bot traffic and assumes the same behavior mix; it is not a per-user attribution or a performance guarantee. The 50,000-MAU Auth allowance is much larger than this egress envelope.

Keeping 20% spare Realtime connection capacity gives **160 simultaneous connected clients**, assuming one connection per client. This constrains clients that use Realtime subscriptions, not every person browsing the site. For Storage, a 0.8 GB operational ceiling supports about 159 additional 5 MB objects beyond the current stored bytes; the application may impose smaller upload limits. For functions, an 80% quota budget is 400,000 invocations per cycle, whose user equivalent depends on invocations per user.

## Darcy cost and request limits

The live deployments have no overrides for the inspected rate-limit or AI-budget variables. The served commit matches the checkout, whose defaults are:

- 120 backend requests/minute per IP.
- 20 paid-AI requests/minute per IP, in addition to the global limit.
- 30 questions/day per user.
- R$15/day global AI cost ceiling, checked against logged costs with a 60-second cache.

Students sharing campus Wi-Fi can share a public IP. Consequently, 20 AI starts/minute from that IP can reach the limiter even while servers are idle. At six backend requests/minute per active user, the 120/minute allowance corresponds to 20 active users behind the same IP. These are request-rate scenarios, not simultaneous-user limits.

The database contains 80 questions with linked usage records, 79 successful, from the newly populated question identifiers. Their mean recorded cost is **R$0.04882/question** and p95 cost **R$0.09270/question**. Their p95 maximum logged call duration is 15.4 seconds; it is not a measured full user-journey latency. On 7 October the quota table recorded 73 questions from 10 users, while all model-call logs recorded approximately R$3.7294 estimated cost.

The question cost sample is recent and small. Older records include 197 model calls with an unknown model and no price, so historical totals can undercount costs. No current Maritaca balance was recorded in `ai_saldo_registros`; the provider account dashboard required sign-in. Maritaca account RPM/TPM quotas and Gemini project quotas remain unknown. The [Maritaca rate-limit documentation](https://docs.maritaca.ai/pt/rate-limits) distinguishes request and token budgets, both of which can bind before local compute.

With 20% of the R$15 budget reserved, approximately R$12/day is available for planning:

| Questions per AI user per day | At observed mean question cost | If every question costs the observed p95 amount |
| --- | ---: | ---: |
| 5 | 49 AI users/day | 25 AI users/day |
| 10 | 24 AI users/day | 12 AI users/day |
| 30 | 8 AI users/day | 4 AI users/day |

That is about 245 questions/day at the observed mean or 129 at the higher-cost scenario. The second column of scenarios is deliberately conservative; a p95 cost is not the expected cost of every question. These are local budget calculations. The cached ceiling can overshoot under in-flight requests and is not a provider-enforced hard spend cap. Serving 100 AI users asking five questions each would require approximately R$31–58/day including a 20% reserve under these two cost scenarios, plus sufficient provider credits and rate limits.

## Capacity decisions and validation

The measured workload is comfortably below cluster CPU and disk capacity. A purchase of additional shared cluster hardware is not justified by current utilization alone. Improvements that matter first are a second eligible NoFluxo node, appropriately sized Darcy memory requests, stronger Supabase compute, and an explicit AI budget matched to the intended daily audience.

Use these provisional operating boundaries until workload testing supplies a throughput ceiling:

| Resource | Provisional boundary | Meaning |
| --- | --- | --- |
| Cluster scheduling | 80% CPU requests per eligible node | Current NoFluxo node can add one 100m pod while preserving this reserve |
| Database storage | 400 MB operational ceiling | Leaves 20% below the Free plan quota; growth is not solely user-driven |
| Database query pool | At most seven sustained busy slots out of ten | Monitoring target; does not map directly to users |
| Supabase egress | 4 GB per billing cycle | About 1,000 MAU at the current estimated behavior mix |
| Realtime | 160 simultaneous connections | Assumes one connection per client |
| AI budget | R$12 planned use of R$15/day | About 25–49 daily AI users at five questions each |
| Frontend, backend and database simultaneous users | Unverified | No observed demand-to-resource curve or concurrency acceptance test |

The Deploy API's Umami analytics returned zero visitors/pageviews while Supabase showed real traffic. Those zero values cannot calibrate users. Prometheus queries for NoFluxo ingress request rate, p95 latency and server errors returned no series. Request-count and user-journey timing instrumentation is needed before extrapolating application CPU into users.

Validate the intended workload in an isolated environment with synthetic accounts. Start with 25, then 50, 100, 200 and 400 simultaneous users; include curriculum browsing, transcript matching/import, planning, notification polling and support subscriptions. Run separate mixes for AI starts and active streams, including one shared campus IP. Measure actual requests/user/minute and repeat the highest passing level through a sustained soak and a node-failure exercise after redundant placement exists.

Suggested acceptance criteria are ordinary-read p95 below two seconds, user-operation errors below 1%, CPU below 70% and RAM below 80%, no OOM events or growing pool queue, and no quota boundary reached during the test. Select AI latency/first-token criteria separately from ordinary APIs. Stop increasing load when a criterion fails; keep a 20% capacity reserve below the sustained passing workload. Provider calls, writes and fault injection need their own approved test scope and cost budget.

## Evidence and boundaries

Aggregate measurements and configurations are saved in [the evidence JSON](./nofluxo-capacity-2026-10-07.evidence.json). Cluster snapshots and app history came through the Deploy API. Read-only cluster queries supplied actual pod placement/resources and existing Prometheus node metrics. Supabase measurements used the authorized root `.env.local` management token and the API's dedicated read-only SQL endpoint; quota values came from the signed-in Supabase dashboard.

No production configuration, database contents, deployment, provider budget, user account or billing plan was changed. No paid model call or load test was run. Credentials, prompts, academic records, contact details and raw query text are excluded from the deliverables. DNS/certificate services and the image registry are shared infrastructure; their per-user demand and host transfer contracts were not available for a separate user-capacity estimate.


## Backend migration options documented on 8 October 2026

### DEC-CAP-001 — Document backend alternatives for Realtime and Edge Functions

Decision status: proposed
Implementation status: not-implemented
Evidence class: owner-confirmed for documenting these options; inferred for the capacity effects
Accepted by: maintainer request on 8 October 2026 to add both alternatives to this report
Accepted scope: documentation of options, without implementation or production changes

The frontend currently subscribes to `ticket_messages` inserts through `TicketService.subscribeToMessages` in `frontend/src/lib/services/ticket.service.ts`. A backend WebSocket gateway can replace these direct browser subscriptions: the backend holds a shared Supabase Realtime connection and routes events to authenticated, authorized clients. One consumer process can share one upstream connection; multiple processes, replicas and rollout overlap must be counted, or a central consumer must distribute events internally. Remaining direct clients still count against provider limits. Supabase counts WebSocket connections independently of joined channels; channel/event limits remain in force. [Realtime settings](https://supabase.com/docs/guides/realtime/settings), [Realtime limits](https://supabase.com/docs/guides/realtime/limits).

Under this option, the current 160-connection planning allowance does not cap clients connected only to the backend gateway. The limiting resources move to backend socket memory, output bandwidth, event distribution work, queues and reconnection bursts. The Supabase-to-server leg still consumes messages and transfer. Use shared upstream subscriptions rather than recreating one subscription per client. Preserve ticket access and admin scopes, bound slow-client queues, handle session expiry, and recover missed updates by querying authoritative state. Privileged upstream consumption requires explicit downstream authorization. [Realtime authorization](https://supabase.com/docs/guides/realtime/authorization).

Edge Function logic can also move to Express routes/services or bounded background execution. Port Deno-specific imports and runtime behavior; preserve HTTP/auth contracts, environment variables, triggers, webhook verification, idempotency and retries as applicable. A migrated operation avoids hosted Edge invocation usage only when the caller actually uses local backend execution; proxying to the original Edge Function still invokes it. [Edge Functions](https://supabase.com/docs/guides/functions).

The checkout has no `supabase/functions` source directory, so published functions must be inventoried separately before implementation. The two observed invocations do not identify deployed function code. Database queries, storage, Supabase transfer and paid providers continue to consume their resources. Backend CPU/RAM limits remain 500m/512 MiB per container, and the existing CPU-only daily projection must be recalibrated with gateways and ported functions together. No code or production change was made as part of this documentation update.
