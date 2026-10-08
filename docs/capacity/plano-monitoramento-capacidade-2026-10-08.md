# Contrato do plano e decisões de arquitetura

**Plano v1.1 — 8 de outubro de 2026; alinhamento documental. Estado: planejamento revisado; implementação não iniciada.** A autorização desta conversa é elaborar e revisar o plano, fundamentar o armazenamento e estimar custo. Não inclui publicar código, aplicar SQL, criar serviço pago, enviar alertas ou executar carga de produção.

**DEC-CAP-002 — Medir demanda, atendimento e capacidade com histórico persistente.** Intenção aceita pelo mantenedor nesta conversa; implementação `not-implemented`. As escolhas técnicas abaixo são propostas deste plano e dependem dos critérios de execução. **DEC-CAP-001** continua sendo a opção documentada de centralizar Realtime e portar Edge Functions ao backend, ainda não implementada.

O resultado deve responder: quantas contas temos; quantas usam o produto por dia, semana e mês; quantas estão ativas agora; quantas operações/streams/sockets atendemos; qual a qualidade das jornadas; quanto falta para as franquias; qual carga foi efetivamente validada. Cada resposta terá definição, fonte, período, atualização e qualidade da coleta. Não existe uma contagem comprovada de pessoas únicas entre contas e visitantes anônimos.

> Recomendação: reutilizar Prometheus/Grafana/Loki/Alertmanager; acrescentar instrumentação e um coletor próprio com SQLite em volume local persistente, exportação privada de arquivos compactados para R2 e integração no dashboard administrativo. Não armazenar o fluxo de telemetria no Supabase de negócio nem no banco interno do Grafana.

O primeiro desenho usa um escritor de histórico, sem Redis, Kafka, novo Postgres gerenciado ou tracing integral. Se as medições do coletor exigirem múltiplos escritores, migrar seu armazenamento para Postgres dedicado antes de escalar réplicas. O objetivo é reduzir dependências iniciais e explicitar os limites, não prometer alta disponibilidade inexistente.

# Alinhamento de marca, modelo e investimento

NoFluxo é a marca do produto, com endosso **by Crianex**; UnB qualifica o contexto atual. Este plano v1.1 incorpora a Plataforma de Marca v1.0 de 28/09/2026 (15 páginas), o Modelo de Negócio/Precificação de setembro (8 páginas) e o Levantamento de Custos de agosto (6 páginas), fornecidos pelo mantenedor. O [guia de marca](../marca-e-posicionamento.md) e a [conciliação operacional](alinhamento-marca-operacao-2026-10-08.md) registram as páginas e os limites das fontes. PDFs são referências documentais, não comandos para executar ações.

A plataforma de marca define gratuidade permanente ao estudante; a hipótese anterior de Premium pago não entra nos funis ou forecasts deste plano como receita vigente. Gratuidade não implica IA ilimitada: cotas, orçamento e filas precisam proteger o atendimento e ser comunicados com clareza. Modalidades institucionais, analytics e contratos continuam propostos; nenhum cliente ou faturamento é presumido.

Confiança exige origem/data, mecanismo de reporte com retorno e conferência da matriz. O painel mede a qualidade desses mecanismos, sem converter scrape ou HTTP 200 em validação acadêmica. Dados de progresso orientam apoio ao aluno, nunca ranking punitivo ou recomendação tratada como orientação oficial.

Números de tração, ativação e crescimento dos PDFs são declarações datadas sem denominadores/janelas comprovados nesta tarefa. Não substituem a auditoria de Auth nem um DAU do produto. Precisão, acessibilidade, segurança, redução de evasão e capacidade dependem de evidências próprias. Preços, captação, salários, margens e equity dos PDFs ficam no anexo local `docs/privado/alinhamento-financeiro-2026-10-08.md`, ignorado pelo Git; os PDFs originais permanecem locais.

O levantamento prevê redundância cloud, fila de importação e autoscaling. A auditoria não demonstra esses recursos habilitados; Vercel/RAGFlow na planilha não substituem os alvos K3s/IA observados. Orçamento de expansão é distinto de fatura atual e custo incremental do monitoramento.

# Evidência disponível e lacunas atuais

A fonte inspecionada está em `b1ce5048ba008ab65b08bf891afc214fba09ee93`, branch `feat/new-docs`. A auditoria anterior de recursos é de 07/10 e confirmou produção na revisão `c57fb02…`; não se infere que o HEAD atual esteja publicado. O inventário complementar de monitoramento foi lido em 08/10, aproximadamente às 16h10–16h16 de Brasília.

| Camada | Evidência | Consequência para o plano |
|---|---|---|
| Produto | 3.671 contas, 3.620 perfis; proxy de 60 contas autenticadas/dia, máximo 80; 263 distintas em sete dias | Referência de volume, não medição de interação humana ou pico simultâneo |
| Frontend | SPA estática, consultas Supabase diretas e `afterNavigate` no layout; busca não encontrou integração Umami nas entradas inspecionadas | Instrumentar navegador e operações diretas; confirmar bundle servido antes de diagnosticar Umami |
| Backend | Express, controles por IP, autorização por handler, logger de produção em stdout | Instrumentar antes dos limitadores; não transformar logs em banco de acesso |
| Darcy | Dockerfile inicia dois workers Uvicorn; logger de IA é best-effort e inclui trechos/identificadores | Agregar workers corretamente; não copiar conteúdo sensível para o histórico novo |
| Supabase | Free/Nano, banco 303–318 MB, paginação; consultas e franquias não equivalem a usuários | Preservar recursos de negócio e observar filas, memória, I/O, egress e orçamento |
| Prometheus | Uma réplica, PVC local de 30 GiB, retenção 15 dias ou 25 GiB; 134.174 séries, 1.092 MiB e 47m na leitura | Reutilizar com orçamento de cardinalidade e histórico independente |
| Dados Prometheus | `du` em `/prometheus`: 8.949.361 KiB, aproximadamente 8,53 GiB | Tamanho de diretório é distinto da reserva do PVC e do disco do nó |
| Grafana e alertas | Grafana, Loki e Alertmanager prontos; Grafana configurado com banco Postgres externo | Não alegar perda do banco Grafana só porque `/var/lib/grafana` é `emptyDir` |

A coleta do kubelet devolveu aproximadamente o mesmo uso de disco para vários PVCs locais: é evidência do sistema de arquivos compartilhado, não uso isolado de cada volume. Não somar esses números. Retenção declarada pode ser reduzida pelo limite de tamanho; não garantir 15 dias completos sem conferir a cobertura de séries.

Continuam sem confirmação: custo contratual do disco/CPU do cluster; conta e franquias disponíveis de R2; permissões da Deploy API para um novo alvo/coleta; algoritmo de assinatura dos tokens atuais; política de coleta anônima; fontes das funções hospedadas; cotas e créditos dos provedores de IA. São gates concretos, não razões para esconder resultados como zero.

# Definições que o dashboard deverá respeitar

| Indicador | Definição e unidade |
|---|---|
| Contas cadastradas | Contagem de Auth, com total bruto e exclusões de teste/equipe explicitadas; fotografia diária |
| DAU autenticado | Contas distintas com navegação ou ação de produto elegível no dia de Brasília; exclui refresh, heartbeat e testes |
| WAU / MAU do produto | União de contas elegíveis em sete/trinta dias; não soma DAU e não substitui MAU faturável |
| Ativos agora | Contas com ação elegível recente ou pulso de atividade enquanto houve interação nos últimos cinco minutos; deduplicação entre abas e aparelhos |
| Presença visível | Sessões com aba visível e pulso recente, mesmo sem interação; indicador separado |
| Sessões anônimas | Sessões efêmeras observadas, não pessoas; não deduplicar dispositivos por fingerprint nem somar com contas como “total de pessoas” |
| Sessões / aparelhos | Identificadores aleatórios de sessão; uma conta pode ter vários |
| Requisições em andamento | Operações HTTP ainda abertas; não equivale a usuários |
| Streams de IA / sockets | Fluxos e conexões efetivamente abertos; conexão não implica interação |
| Capacidade validada | Carga sustentada aprovada sob perfil, recursos e SLOs registrados; status e validade próprios |
| Franquia / orçamento | Egress, armazenamento, conexões/mensagens e custo de IA; dimensões independentes de throughput |

Uma navegação elegível ou ação bem-sucedida de produto estabelece atividade diária. Heartbeat neutro atualiza presença; **não cria DAU/MAU por si só**. Pulso que confirma uma interação nova é elegível, inclusive depois da meia-noite; deduplicar a última interação por sessão evita transformar timer em atividade. Ao voltar de aba oculta, registrar nova navegação/ação observada para retomar a contagem. `isTrusted` e visibilidade ajudam a classificação no navegador, mas não comprovam humanidade nem impedem automação.

Contas são identificadas no servidor após validação de identidade. Eventos de administração, testes e robôs conhecidos ficam em coortes separadas, definidas pelo servidor. Um campo `is_test` enviado pelo cliente não altera essa classificação. Visitantes sem coleta, bloqueadores e falhas de rede tornam as contagens observadas uma cobertura parcial, indicada no painel.

# Ativação, retorno e evidência de valor

Coorte de cadastro usa contas elegíveis criadas no dia de Brasília, com origem/fonte verificadas e exclusões de equipe/teste. **Ativação** proposta: primeiro progresso utilizável após importação, casamento e persistência em até sete dias do cadastro. O numerador é conta distinta ativada; denominador é conta elegível cadastrada na coorte, não sessão, todo o estoque Auth ou visita anônima. Janela e resultado têm versão. Uma confirmação só no navegador é `browser-observed`; confirmação de persistência vem de recibo/consulta mínima autorizada no backend, não de um campo arbitrário do cliente.

**D7/D30 do produto:** conta da coorte com ação elegível no sétimo/trigésimo dia de Brasília após o cadastro, em janela de um dia e com até 24h para eventos tardios. São taxas de retorno ao app, não permanência acadêmica ou efeito na evasão. Finalizar D7 após o fim do dia 7 e a tolerância; D30 após o dia 30 e a tolerância. Uma coleta de sete dias não gera D30: primeiras coortes finalizadas exigem até 32 dias de calendário. Até lá, apresentar `IMMATURE`/`PARTIAL`, com cobertura, nunca benchmark do PDF.

Guardar estado mínimo de coorte por 35 dias desde a âncora, depois apenas agregado fechado e versão. Aliases da chave resolvem a conta antes de qualificar ativação/retorno. Replay pode corrigir agregado aberto mas não mudar cadastro, criar nova coorte, estender TTL ou voltar a contar online. Exclusão e restore também percorrem esse estado. Alunos já cadastrados entram em coorte separada de primeiro uso observado, sem fingir que seu cadastro aconteceu na data de implantação.

Uso útil é jornada de importação, fluxograma, plano ou grade com resultado semântico. Tentativa, conclusão, cancelamento e refação têm denominadores distintos e um `attempt_id` idempotente. O parser atual é PDF.js local; chamadas RPC/LLM, cache e persistência são fases separadas. Não inferir tokens de IA por importação a partir da projeção de agosto.

Crescimento precisa de janela comparável e mesma definição. A ausência de gasto em anúncios não prova CAC zero; custo de aquisição inclui o escopo acordado de trabalho/campanha. NPS/pesquisa usa agregados de convites e respostas, somente após aprovação da coleta; não guarda texto livre na telemetria. Visitantes que exploram matriz sem conta ficam em funil de sessões, sem login imposto para medir interesse.

# Fluxo proposto e isolamento dos dados

Navegador envia lotes → backend valida e pseudonimiza → coletor dedicado grava e agrega → SQLite/PVC mantém janela operacional → arquivos privados no R2 preservam histórico e recuperação. Dashboard administrativo consulta agregados pelo backend; Grafana usa séries e alertas. O navegador não recebe credenciais do coletor, R2, Prometheus ou API de gerenciamento do Supabase.

Backend/Darcy expõem métricas → Prometheus coleta a cada 15 segundos → coletor exporta uma seleção estável a cada minuto → rollups de cinco minutos/uma hora preservam histórico. Contadores de HTTP abrangem todo o tráfego observado; não se grava uma linha por requisição bem-sucedida no banco de telemetria. O orçamento de eventos brutos cobre presença e marcos de jornadas, não todos os acessos REST.

O coletor proposto é Python/FastAPI separado, com um worker HTTP, SQLite da biblioteca padrão e uma thread escritora exclusiva com fila limitada em volume POSIX local. Exportação Parquet usa job limitado e não bloqueia o loop HTTP; avaliar dependência e consumo do encoder no ensaio. API de leitura usa conexões somente leitura, limites de tempo e intervalo. Queries históricas grandes vão para job de exportação, sem varrer arquivos Parquet a cada atualização da página.

Proposta inicial: request de 100m/256 MiB, limite de 500m/512 MiB e PVC local de 20 GiB. São parâmetros de partida a medir. Posicionamento exige validação de reservas, afinidade do PV e disco físico, preferindo o conjunto de infraestrutura/monitoramento autorizado. Não presumir que a Deploy API cria esse quarto alvo ou que a folga de CPU de outros nós serve automaticamente ao NoFluxo.

Usar estratégia `Recreate` e uma réplica para o escritor, encerrando e drenando a fila antes de liberar o volume. PVC `ReadWriteOnce` não impede dois processos no mesmo nó; não é proteção suficiente contra escritores concorrentes. Não colocar SQLite/WAL em NFS nem reaproveitar o PVC NFS de Grafana.

# Instrumentação do navegador e acesso ao coletor

Criar módulo de telemetria isolado e testável, iniciado uma vez em `frontend/src/routes/+layout.svelte`. Usar `afterNavigate`, eventos de visibilidade e marcos explícitos das jornadas. Instrumentar `frontend/src/lib/utils/api.ts` e serviços Supabase relevantes, especialmente histórico, planejamento e tickets; o wrapper de API sozinho não cobre chamadas diretas ao banco.

Eventos de navegador permitidos: `navigation`, `journey_start`, `journey_end`, `interaction_pulse`, `visibility_pulse`, `connection_state`. Cadastro, ativação confirmada, coorte, estado de reporte e saúde curricular usam emissores internos autorizados; o navegador não pode escolher esses fatos, instituição ou status de conferência. Rotas e jornadas são enums/templatizações. Nunca enviar query string, hash de OAuth, corpo, prompt, PDF, disciplina, email, nome, IP ou texto bruto de erro. Duração cliente usa relógio monotônico; timestamp UTC é validado no recebimento.

Agrupar até 20 eventos ou 16 KiB por lote, com envio a cada 60 segundos e jitter; heartbeat no máximo um por minuto por sessão visível. Pulso de atividade só ocorre enquanto houver interação recente. Timer é suspenso em aba oculta. Listener passivo de interação atualiza memória e não gera um evento por clique/scroll. Pausa, remoção de listeners e logout precisam ser explícitos.

O payload nunca escolhe a identidade autenticada. No ingresso de sessão, o backend verifica Supabase Auth e emite uma credencial curta exclusivamente para telemetria, com audiência, escopo, ator pseudônimo, sessão e expiração de até cinco minutos, limitada pela expiração do token original. Ela não autoriza acesso a dados de produto. Não validar identidade apenas decodificando JWT. Validar emissor, audiência, algoritmo permitido e expiração; chaves anon/service-role não representam uma conta. Contas Supabase anônimas, se existirem, ficam na coorte anônima pelo atributo verificado, não entram no DAU de contas reais.

Se houver assinatura assimétrica e SDK compatível, verificar localmente com JWKS cacheado. Com token simétrico ou SDK sem suporte, usar `auth.getUser` no ingresso/renovação da credencial de telemetria. A biblioteca/range presente não prova suporte; verificar algoritmo e versão efetivos. Isso evita uma consulta Supabase a cada pulso. Para 20 minutos de uso diário, estimar aproximadamente quatro verificações remotas por conta/dia no fallback, mais renovações/abas; medir bytes e cache real antes de fixar o orçamento.

Fila cliente em memória; IndexedDB somente se habilitado pela política de coleta, máximo 200 eventos ou 64 KiB e 24 horas. Particionar por ator/sessão. Logout/troca de conta limpa o segmento; reenvio autenticado exige mesma identidade validada. Evento anônimo com credencial expirada e sem revalidação segura é descartado e a lacuna é contabilizada. `sendBeacon` de última hora não pode inventar um header Bearer: usar `fetch(..., keepalive: true)` autorizado; coleta de encerramento permanece best-effort.

# Limitadores, autenticação administrativa e privacidade

Criar ingresso dedicado `POST /observability/session` e `POST /observability/events`. Ele passa por validação de corpo/origem e limitadores próprios, mas **não deve disputar o limite global atual de 120/IP/minuto** com ações do produto. Na rede do campus, 100 pulsos/minuto já consumiriam quase essa cota. A exceção vale só para a telemetria; nenhum endpoint de IA ou produto é liberado.

Aplicar teto por credencial/sessão e conta, limite agregado de bytes, fila e trabalho por segundo, e proteção por IP ajustada à concentração do campus. Valores finais vêm do ensaio; ponto inicial: dois lotes/minuto por sessão, 20 eventos/lote, tamanho 16 KiB. A emissão de credenciais também é limitada. Uma pessoa pode ter vários dispositivos; evitar um limitador único de uma requisição/minuto por conta que derrube clientes legítimos.

Coleta anônima é sempre classe de menor confiança e tem orçamento independente contra criação ilimitada de sessões. Só a chave assinada pelo servidor define ator/coorte; campos extras e rotas desconhecidas são descartados, sem criar labels ou linhas arbitrárias. CORS não substitui autenticação.

Leituras `GET /observability/overview`, `/timeseries`, `/capacity` e exportação são acessíveis apenas a administrador com escopo `dashboard`, verificado com identidade real e contrato de `has_admin_scope`. Não executar o RPC de permissão através de um cliente service-role esperando que ele represente o usuário. Cache de permissão é curto e não é usado para gravar dados de produto; expiração/revogação devem ter testes.

Ator autenticado é `HMAC(chave privada, domínio || auth UUID)`, sem UUID bruto no histórico novo. HMAC continua sendo pseudonimização, não anonimização. Chave fica apenas no servidor e fora do Git. Para manter WAU/MAU sem duplicar contas na rotação, definir janela de 35 dias e transição de chave com aliases antigo/novo deduplicados; teste de rotação é obrigatório antes de ativá-la. Chave não vira label nem é entregue a ferramentas públicas.

Definir e revisar finalidade/base de tratamento, política de coleta anônima e processo de exclusão antes de ativação. Exclusão percorre banco local, partições e três snapshots de identidade, inclusive restaurações; um tombstone só aplicado na UI não remove os dados. Agregados sem identificadores permanecem apenas conforme a política aprovada. A revisão técnica não substitui essa decisão organizacional.

# Métricas do backend e do Darcy

Em `backend/src/index.ts`, instalar o observador antes de rate limiting e parser. Classificar rota por mapa finito dos controllers, inclusive requisições recusadas antes do router. URL não reconhecida vira `__unmatched__`; método é enum. Health/readiness, preflight, métricas e a própria telemetria ficam fora da taxa de operações de produto usada para capacidade; permanecem contabilizados como tráfego técnico. `finish` e `close` compartilham um único guard para decrementar in-flight exatamente uma vez. Encerramento prematuro tem resultado `client_abort`, não “200 bem-sucedido”.

| Família proposta | Labels permitidas / significado |
|---|---|
| `nofluxo_http_requests_total` | serviço, rota normalizada, método, classe de status |
| `nofluxo_http_duration_seconds` | histograma por serviço/rota; API comum separada de SSE |
| `nofluxo_http_inflight` | gauge por serviço; nenhuma identidade pessoal |
| `nofluxo_rejections_total` | motivo finito: IP, cota individual, orçamento, auth, corpo, saturação |
| `nofluxo_journey_duration_seconds` | jornada e resultado; origem cliente/servidor explícita |
| `nofluxo_ai_calls_total` / tokens / custo | provedor e modelo de lista permitida, resultado; modelo desconhecido é um bucket |
| `nofluxo_ai_ttft_seconds` | primeira entrega da jornada; não inferir do maior tempo de uma chamada |
| `nofluxo_telemetry_*` | aceitos, repetidos, descartados, atraso, fila, cobertura e exportação |

Usar histograma com buckets adequados a milissegundos/segundos e streams longos em família separada. Orçamento: alvo de 3.000 séries adicionais, teto de 5.000 por projeto; seleção de arquivo com 500 séries agregadas estáveis. Modelos/coortes limitados por enum. SHA da versão aparece em `build_info` e nos recibos, não como label de cada histograma. Sem user/session/request ID, URL bruta ou mensagem de exceção nas labels.

O Dockerfile do Darcy mantém dois workers. Counters/histogramas Python requerem registry multiprocess, diretório compartilhado por pod, definido antes do fork e limpo uma vez no startup do pai. Testar worker morto/reiniciado, pod substituído e gauge vivo. Não copiar hooks de Gunicorn supondo que existem no Uvicorn; até validar o ciclo de vida, in-flight confiável vem do proxy backend e gauges Python incompatíveis ficam ausentes. Não reduzir workers como atalho de observabilidade.

Métricas em porta/Service privados separados do ingresso público. Declarar `ServiceMonitor` com label `release: prometheus`, compatível com o seletor observado; validar também selector do Service, targetPort e escopo de namespace. Ausência de Ingress, NetworkPolicy realmente aplicada e teste externo são necessários: nome “internal” não torna a rota privada. A Deploy API do projeto não declara essa coleta atualmente.

# Supabase, IA, Realtime e funções no monitoramento

Adapter do coletor consulta métricas Supabase a cada cinco minutos, com timeout, resposta limitada, backoff/jitter e uma consulta por projeto. Usar o caminho autenticado já validado na auditoria; Basic Auth com service-role falhou naquela inspeção. Encapsular a API de gerenciamento, restringir URLs/refs no servidor e guardar somente gauges permitidos. Secret do provider nunca chega ao navegador.

Medir CPU por deltas de contadores e janela correta; memória disponível, swap ocupado e taxa de paginação; conexões ativas/ociosas; fila e expirados do PostgREST; tamanho do banco e espaço físico. Contagem de contas/perfis e alocações de tabelas ocorre uma vez ao dia, não por usuário/heartbeat. Consultas têm timeout baixo e explicação de origem para não contar inspeção como jornada de produto.

Franquias têm ciclo, quota e timestamp separados da telemetria. Mostrar envelope de ciclo completo e saldo/dias restantes como projeções diferentes; dividir a franquia total pelos dias restantes produziria folga falsa. Consultar API documentada quando disponível; se um medidor de faturamento só estiver no painel, aceitar atualização administrativa auditada com validade e marcar `STALE` após 24 horas. Não automatizar scraping de sessão administrativa nem assumir que endpoint privado de billing é contrato público.

Preservar o ledger financeiro existente de IA. O pipeline de monitoramento não passa a autorizar ou bloquear gastos; observadores de uso são best-effort, com contador de falhas de persistência. “Custo registrado” e “custo real faturado” são diferentes. Há chamadas antigas sem preço/contexto; monitorar custo desconhecido e cobertura, sem convertê-los em zero. Cobrir também embeddings de sugestões de módulo livre, ausentes de algumas proteções atuais. Correlacionar chamadas por identificador interno na camada de eventos, sem labels pessoais; distinguir tentativa física, chamada, pergunta e jornada para evitar dupla cobrança estatística.

Se DEC-CAP-001 for implementada, acrescentar sockets dos clientes, contas distintas conectadas, upstreams Supabase, eventos recebidos/entregues, destinatários por evento, bytes, fila por cliente, descartes, reconexão e recuperação. Upstream por processo/réplica é contado; 160 conexões diretas não vira limite de clientes do gateway. Medir funções portadas por execução, duração, fila e resultado. Enquanto essas funções não existirem, mostrar “não habilitado”, não gauge zero como capacidade comprovada.

# Confiança curricular, acolhimento e acessibilidade

Medir origem/idade da base por instituição e matriz, última tentativa/sucesso de scraping, cobertura das matrizes esperadas e estado de conferência. Fonte, revisão do dado, responsável/escopo da validação e prazo formam a evidência; sucesso de scrape não confere matriz. Nova revisão dos dados exige invalidar ou renovar conferência. Limiar inicial de atraso curricular é configurado por fonte/calendário pelo dono dos dados, não um número global que confunda cursos sem atualização esperada com falha.

Reportes: criado → triado → correção proposta → verificação concluída → retorno entregue. Um ticket encerrado não prova correção curricular; instrumentar mudança de dado e verificação sem guardar mensagem do aluno, nome de disciplina ou histórico pessoal no coletor. Tempo de primeira resposta, resolução verificada e retorno são métricas separadas. Os mecanismos por disciplina e selo descritos na marca são backlog, não funcionalidades demonstradas pelo canal de tickets existente.

Em recomendações da Darcy, medir conclusão/recusa e presença de explicação no contrato do resultado, com auditoria sintética/de qualidade à parte. Uma flag de cliente não atesta resposta correta; nenhum prompt/resposta acadêmica bruta entra nas séries. O painel informa lacunas e convida à conferência humana; não anuncia formatura garantida ou fonte oficial.

O painel administrativo também usa cor com texto/ícone, tabela alternativa aos gráficos, teclado/foco, movimento reduzido e leitura em telas pequenas. WCAG 2.2 AA é alvo; scanners, revisão manual e participação de pessoas com deficiência são evidências distintas. Menu de acessibilidade não comprova conformidade. Alertas sobre confiança no dado são tão acionáveis quanto falhas técnicas, com responsável e retorno definidos.

# Instituições, finalidade e custo por jornada

Escopo inicial: NoFluxo UnB. Agrupamento por instituição/unidade/contrato depende de cadastro curado e vínculo verificado pelo servidor; não inferir instituição por domínio de email ou curso enviado no evento. O schema recebe apenas `scope_key` de allowlist, opcional quando ainda não há cadastro. A ausência aparece como `NOT_ENABLED`/`UNKNOWN`, não como cliente ou receita igual a zero comprovados. Clientes institucionais futuros não ganham acesso ao admin global.

Os tetos de 3.000 séries novas e 500 séries arquivadas são globais. Instituição/curso/ator de cardinalidade livre não vira label Prometheus. Selecionar séries técnicas/qualidade dentro desse orçamento; recortes institucionais usam agregados consultados com autorização por escopo, janelas e limites de exportação. Adicionar tenants não cria 500 séries nem arquivo por minuto para cada um.

Antes de expor analytics à IES, testar supressão de recortes com menos de 20 participantes distintos, supressão complementar e resistência à reconstrução por filtros/intervalos/exports. É ponto de partida do desenho, não certificação de anonimização ou LGPD. HMAC permanece pseudonimização. Telemetria operacional não autoriza trajetória acadêmica, score de evasão individual, rankings punitivos ou venda de dados; analytics institucional é outro produto/finalidade, com orçamento e aceite próprios.

Custos distinguem importação no browser/RPC, geração de plano, conversa, embeddings e ferramentas. Registrar moeda, data/versão da tarifa, input/output/cache, modo de processamento, tentativas e cobertura do ledger. O código usa Sabiá 4/Sabiazinho 4; a tabela de Sabiá 3 do PDF não é tarifa atual. Consultar fonte oficial e validar `ai_pricing`; preço ausente ou uso não registrado marca incompletude. Cache/Flex/Batch/noturno não são descontos multiplicáveis; não habilitá-los nesta revisão.

Custo estimado, custo faturado, reserva e pagamento são valores separados. Contas matriculadas, contas Auth e MAU do app não são o mesmo denominador para rateio. Custo por jornada inclui falhas/retries; custo por jornada bem-sucedida informa numerador e denominador. Receita contratada/recebida, setup pontual, licenças e burn pertencem ao anexo financeiro. Cobrança por uso exige ledger transacional próprio: telemetria best-effort não pode ser seu único comprovante.

# Modelo de dados do histórico

Schema versionado em banco separado; exemplos abaixo são contratos de desenho, não migration aplicada. Agregados expostos não permitem buscar trajetória individual. Payload bruto flexível e JSON arbitrário são proibidos.

```sql
raw_event (
  event_id TEXT PRIMARY KEY,
  source TEXT, cohort TEXT, kind TEXT, journey TEXT,
  actor_hash BLOB, session_hash BLOB,
  scope_key TEXT, attempt_id TEXT,
  occurred_at_ms INTEGER, received_at_ms INTEGER,
  duration_ms INTEGER, result_code TEXT,
  schema_version INTEGER, quality TEXT
);
actor_day (
  day_brasilia TEXT, actor_kind TEXT, cohort TEXT,
  actor_hash BLOB, first_seen_ms INTEGER, last_action_ms INTEGER,
  PRIMARY KEY(day_brasilia, actor_kind, cohort, actor_hash)
);
actor_cohort (
  anchor_day_brasilia TEXT, definition_version TEXT, cohort TEXT,
  actor_hash BLOB, activated_at_ms INTEGER, return_d7 INTEGER,
  return_d30 INTEGER, expires_at_ms INTEGER, quality TEXT,
  PRIMARY KEY(anchor_day_brasilia, definition_version, cohort, actor_hash)
);
metric_minute (
  minute_utc INTEGER, series_key TEXT, fingerprint TEXT,
  value REAL, source_epoch TEXT, quality TEXT,
  PRIMARY KEY(minute_utc, series_key, source_epoch)
);
window_rollup (
  window_utc INTEGER, step_seconds INTEGER, series_key TEXT,
  count REAL, sum REAL, min REAL, max REAL, last REAL,
  covered_seconds INTEGER, quality TEXT,
  PRIMARY KEY(window_utc, step_seconds, series_key)
);
capacity_run (
  run_id TEXT PRIMARY KEY, fingerprint TEXT, profile TEXT,
  achieved_rate REAL, peak_concurrency INTEGER,
  slo_passed INTEGER, reserve_fraction REAL,
  valid_until_utc INTEGER, evidence_manifest TEXT
);
```

Âncora de `actor_cohort` é validada na origem; eventos não podem alterá-la. Fechamento diário preserva denominadores, coortes imaturas e correções versionadas. Expiração é 35 dias desde a âncora, sem extensão por nova interação. `scope_key` e `attempt_id` não viram labels. Armazenar novo estado não muda o prazo do histórico acadêmico de negócio.

Manter ainda tabela de aliases de ator com versão/expiração, checkpoints de exportação, versões de schema/chave, manifesto de objetos/checksum e intervalos de lacuna. Aliases só são emitidos após identidade validada: o servidor deriva os HMACs de chave atual/anterior do mesmo UUID, preservando a união da janela de 35 dias. Raw event usa unicidade transacional; `actor_day` é upsert no mesmo commit para evento elegível. Presence state tem prazo curto e separa ação de pulso. O contador de duplicata não atualiza atividade. Eventos internos sem ator nunca criam DAU.

DAU é `COUNT(DISTINCT ator canônico)` dos eventos elegíveis no dia e coorte; resolver aliases antes da união, sem somar coortes que se sobrepõem. WAU/MAU unem conjuntos de dias no mesmo domínio de identidade. Retenção exata de identidade: 35 dias; depois guardar apenas contagens diárias e meses fechados. Consultas arbitrárias de unicidade além dessa janela retornam “não disponível”, nunca soma de DAU. Valores históricos consolidados podem mudar por eventos tardios dentro da janela e são versionados.

Metric descriptors trazem unidade, tipo, buckets, origem, step e regra de redução. Contadores são tratados por deltas/resets/época; gauges usam média ponderada pelo tempo e cobertura. Para p95, preservar contagem por bucket e soma/contagem, agregando populações compatíveis. Não calcular média de p95 nem somar amostras de contador cumulativo como se fossem eventos.

# Retenção, backups e exportação

| Dados | Janela proposta | Persistência e limite |
|---|---|---|
| Séries detalhadas Prometheus | Até 15 dias ou tamanho configurado | PVC existente; não ampliar a retenção global automaticamente |
| Seleção de métricas por minuto | 30 dias | SQLite e arquivos privados; 500 séries de orçamento |
| Agregados de cinco minutos | 90 dias | Arquivos e índices de consulta; buckets preservados |
| Agregados horários | Dias 91–400 | Histórico de aproximadamente 13 meses |
| Agregados diários / recibos | 400 dias | Sem ator pessoal; versões de perfil e validade |
| Eventos de presença/jornada | Sete dias | Partições privadas; 30 sinais/ator/dia como hipótese de custo |
| Identidade autenticada / anônima | 35 dias / dois dias | Sets exatos; três snapshots compactos recentes de estado |
| Estado de ativação/retorno | 35 dias desde a âncora | Mínimo por conta; depois somente agregados fechados e qualidade |
| Logs diagnósticos novos | Sete dias; orçamento 100 MB/dia compactados | Sem payload sensível; erros agregados preservados mesmo se amostra exceder orçamento |

O registro por minuto é a seleção acordada, não uma cópia de todas as séries de todos os projetos. Amostragem de logs/diagnóstico não altera contadores de tráfego nem sets de atividade. Tracing distribuído fica fora da primeira versão e do custo base; se ativado, medir tamanho por span e usar teto próprio, incluindo tempestades de erro.

Exportar a cada cinco minutos por família e dia UTC, com chave única, checksum e manifesto. Não criar um objeto por evento. Preparar lotes limitados e tornar o manifesto visível depois de confirmar os objetos. Checkpoint de exportação é durável; retentativa usa a mesma chave sem sobrescrever dados diferentes. Limpar o temporário após validação.

**Não enviar três snapshots completos do SQLite**: o modelo usa partições imutáveis e três snapshots compactos de identidade/checkpoints. Backup de arquivo SQLite ativo exige API de backup consistente ou reconstrução pelos arquivos, não `cp` sem WAL. A reconstrução parte do último estado e reexecuta eventos/minutos com unicidade.

Expurgo periódico respeita a data dos dados, não apenas a data de upload. Replays não estendem TTL; restauração expurga vencidos antes de servir consultas. Lifecycle no bucket é proteção adicional, não substituto do job de retenção. Erros de expurgo, objetos órfãos e atraso de backup geram alertas. Ausência de arquivo esperado aparece como lacuna.

# Entrega, falhas e qualidade dos números

Configurar SQLite WAL em filesystem local, `synchronous=FULL`, transações curtas e uma fila escritora limitada. `202` do ingresso só significa lote persistido após o commit confirmado pelo coletor; não afirmar entrega exatamente uma vez pela rede. Timeout/reenvio pode duplicar tráfego, mas o event ID e o upsert de ator impedem duplicar contagem.

A captura interna dos handlers de produto não aguarda o coletor: usa fila limitada e contabiliza descartes. A falha do monitoramento não impede login, planejamento ou resposta da IA. Falha de escrita no ledger financeiro existente mantém suas regras próprias; não confundir fail-open de telemetria com autorização de gasto.

O coletor devolve 503 quando não consegue aceitar duravelmente, sem fila infinita. Limites iniciais: timeout interno de 200 ms a ajustar por ensaio, 10 mil eventos/16 MiB de fila em memória, WAL/scratch com reserva de 1 GiB cada. Pausar exportações caras, limitar queries e aplicar descarte explícito de diagnóstico antes de comprometer recursos do produto.

RPO proposto para perda do nó: até cinco minutos para dados já aceitos pelo coletor, após validar o ciclo de exportação; sinais ainda no navegador e gaps de scrape não têm essa garantia; com R2 indisponível, a garantia é suspensa e o atraso fica visível. Crash de processo com disco íntegro não perde lote já confirmado, dentro das garantias de fsync/filesystem. RTO alvo de restauração: quatro horas, a provar por ensaio. Uma réplica com PV local não oferece failover automático; dashboards/alertas fora desse nó precisam sinalizar a ausência.

Relógio servidor é referência; client timestamp fora de tolerância ou sem coerência é marcado/recusado. Eventos autenticados tardios de até 24h corrigem agregados, mas não ressuscitam presença atual. Pulsos antigos não tornam alguém “online”. UTC é persistido, dia de negócio usa timezone IANA de Brasília, faturamento usa seu próprio ciclo.

Cada resposta traz `observed_at`, `window`, `coverage`, `last_success`, `schema_version`, `source` e `quality`. Estados: `OK`, `PARTIAL`, `STALE`, `UNKNOWN`, `NOT_ENABLED`. Série ausente não é zero. Atraso superior a duas janelas de coleta rebaixa qualidade; providers de cinco minutos ficam stale após dez minutos, com regras distintas para faturamento diário.

# Dashboard de demanda, qualidade e capacidade

Adicionar seção administrativa em `/admin/dashboard`, usando `frontend/src/lib/services/dashboard.service.ts` para chamadas ao backend de observabilidade. Os RPCs existentes de negócio permanecem com suas fontes e definições; nenhum token administrativo de monitoramento entra no cliente.

Quatro grupos de visualização (todos com origem, janela, qualidade e legenda sem depender só de cor): **demanda** (contas, DAU/WAU/MAU, anônimos/sessões, ativos cinco minutos, presença, ativação, retorno D7/D30 e in-flight); **qualidade** (volume, erros por causa, p50/p95/p99, jornada inteira, primeiro trecho/resposta IA, idade/conferência da base e reporte/correção/retorno); **recursos/franquias** (CPU, RAM, throttling, fila, swap, crescimento do banco, egress, sockets e orçamento); **capacidade** (perfil validado, revisão, carga sustentada, reserva, confiança e data de expiração).

Atualização: 30 segundos para resumo, cinco minutos para histórico/quota técnica e uma vez ao dia para cadastro/franquias manuais. Um único request devolve o resumo cacheado; limitar pontos por gráfico a 1.000 e permitir step explícito. Cada cartão identifica a janela e distingue observado de estimado. Mostrar “sem dados recentes” em cinza, sem traçar zero durante indisponibilidade.

Grafana recebe dashboards e regras provisionados em Git, não só edição manual. Correção da cobertura Umami é uma tarefa própria: verificar script, website ID, domínio publicado, bloqueadores, envio/recepção e timezone. Pode complementar visitas, mas não substituir identidade autenticada ou prova de capacidade.

Exemplos de consultas a validar com séries reais:

```promql
sum(rate(nofluxo_http_requests_total[5m]))

histogram_quantile(0.95,
  sum by (le, route) (
    rate(nofluxo_http_duration_seconds_bucket[5m])
  )
)

sum(nofluxo_http_inflight)
```

Resultados de jornada refletem o contrato semântico, não apenas HTTP 200; resposta HTTP bem-sucedida com falha conhecida da operação continua sendo falha de jornada, em enum sem corpo sensível.

Picos subminuto são vistos no Prometheus de 15 segundos e em in-flight; a série arquivada de um minuto não substitui esse diagnóstico. A consulta de p95 fica sem avaliação com amostra insuficiente, e SSE não entra no mesmo histograma das leituras comuns.

# Alertas e critérios de saúde

Começar com poucas regras acionáveis, `for` e deduplicação. Alertas têm proprietário e procedimento de diagnóstico; canal/destinatário só é habilitado após autorização. Não configurar envio nesta fase de planejamento.

| Condição | Proposta inicial | Ação / interpretação |
|---|---|---|
| Produto indisponível | Sonda externa em duas origens falha repetidamente por dois minutos | Conferir ingresso, dependências e revisão; health isolado não prova jornada |
| Latência/erro | Leituras p95 >2 s ou falhas inesperadas >1% por dez minutos, com pelo menos 100 operações | Separar causas, evitar percentis em amostras minúsculas |
| Pouco tráfego | Três falhas consecutivas de jornada sintética | Detectar falha mesmo sem amostra suficiente para percentil |
| Rejeições | Crescimento de 429 por IP/saturação; quota legítima aparece separada | Não esconder falha de atendimento atrás de “servidor saudável” |
| Recursos | CPU >70% ou RAM >80% sustentadas; qualquer OOM | Investigar throttling/working set e filas; teto depende do limite correto |
| Supabase | Fila crescente/expirações, swap ativo com degradação, banco >400 MB | Priorizar memória/I/O e crescimento, não CPU ociosa |
| Franquias/custo | Projeção ultrapassa margem; IA planejada R$12 de R$15/dia | Cobertura de custo e preço ausente entram no aviso |
| Monitoramento | Coleta/exportação ausente; fila >80%; descarte >0,5% | Marcar dados parciais e recuperar a coleta |
| Armazenamento | 70% aviso, 85% crítico, previsão <14 dias | Conferir disco do nó e diretórios; respeitar reserva de 80% do coletor |

Sondas não pagas a cada 60 segundos e jornada sintética não financeira a cada cinco minutos, com coorte separada. Não executar IA real automaticamente. Liveness é local; falha de Supabase não deve causar restart em massa por uma probe de liveness. Readiness/dependência e observação funcional têm papéis distintos.

# Matrícula, picos e cenários de expansão

Usar 5× e 10× de concentração na janela de matrícula como sensibilidades iniciais dos PDFs, não observações do cluster. Combinar importação no browser/RPC, cold cache, plano/grade, conversa e egress com taxas independentes de chegada. Um burst pode manter tokens totais parecidos e ainda aumentar retries, tempo de espera, abandono e custo por sucesso. Volume mensal médio não certifica atendimento no pico.

Ensaio mantém perfil realista de dispositivos, rede e NAT do campus. A fila de processamento e o autoscaling descritos no levantamento são opções arquiteturais: só entram no recibo quando implementados, configurados e testados. Mais nós não garantem capacidade linear quando banco, scheduler, distribuição, I/O ou provedor limitam. Cobertura multi-universidade e SLA contratado exigem planos de redundância/restore e conjuntos de dados próprios; o retrato atual não oferece N−1 validado.

Tratar as metas de expansão como perfis de negócio, depois traduzir matrículas → adoção → DAU/MAU → ações e concentração → tráfego por serviço. Cada seta guarda hipótese ou medição. Não transformar “15–20 mil ativos” sem janela, da peça de agosto, em capacidade simultânea ou capacidade já comprada.

# Como obter uma capacidade defensável

A instrumentação responde quantos atendemos. Para dizer quantos podemos atender, coletar pelo menos sete dias de perfil, incluindo dias úteis/fim de semana; período de matrícula é um perfil adicional. Medir ações por conta/dia, distribuição de sessão, proporção IA, uso anônimo, chamadas diretas ao Supabase, picos e resposta. Valores do relatório anterior de CPU isolada não viram capacidade validada.

Perfis separados: navegação/catalogo; importação/matching; planejamento; IA com provedores simulados; IA real sob orçamento próprio; Realtime direto; gateway WebSocket e funções portadas quando existirem. Registrar proporções e conjunto de dados/indexes representativos, caches frios/quentes, recursos/tier, workers, réplicas e topologia externa. Simulador de IA valida processamento local, não crédito/quota/latência do provedor real.

Combinar ensaio de usuários simultâneos com modelo de chegadas independente da latência. Um loop fechado desacelera quando o servidor fica lento e pode mascarar saturação. Registrar taxa oferecida, obtida e `dropped_iterations` do gerador; queda por falta de VUs é falha do ensaio, não prova de capacidade. Gerador usa clientes remotos, TLS/WSS real e não concorre no nó medido.

Sequência: smoke 1–5 usuários; patamares 10, 25, 50, 100, 200, 400 apenas enquanto critérios passam; ajustar taxas à demanda medida. Aquecer e medir pelo menos 15 minutos por patamar, separar cenário frio e manter o maior aprovado em soak de duas horas. Encerrar aumento imediatamente na primeira violação. Só testar perda de nó após redundância existir e em escopo autorizado; hoje a perda do único nó elegível interrompe o produto.

Critérios propostos: leitura p95 <2 s e p99 <5 s; falhas inesperadas <1%; nenhuma rejeição por saturação/IP no perfil representativo; CPU <70%, RAM <80%, sem OOM e sem fila crescente. IA: TTFT p95 <10 s e resposta completa p95 <45 s como metas a calibrar, não métricas existentes. SLO de replicação WebSocket deve ser aprovado após baseline; backlog precisa estabilizar e eventos autorizados devem convergir após reconexão.

# Registro de capacidade e validade das projeções

Guardar recibo por ensaio: identificador, data, ambiente, SHA/digests, perfil de ações, massa de teste, recursos, workers/réplicas, tier/indexes do banco, modos Realtime/funções, taxas oferecida/atingida, concorrência, histogramas, erros, filas, custos, instrumento/versão e manifesto das evidências.

Estados: `UNVALIDATED`, `VALIDATED_LOCAL`, `VALIDATED_TOPOLOGY`, `STALE`. Uma validação local não é aceitação do caminho real. Validade padrão de 14 dias; alterar imagem/configuração relevante, tier, schema/index, perfil ou migração de sockets/funções invalida o recibo. Não extrapolar além da maior carga sustentada aprovada sem rotular hipótese.

Reservar 20% da carga sustentada que passou. Conversão diária usa demanda e concentração observadas, por classe de operação:

```text
lambda_safe = 0.8 * lambda_passed
DAU_cpu = lambda_safe * seconds_in_active_period
          / (requests_per_DAU * observed_peak_factor)
```

A fórmula só vale com unidades/escopo comparáveis. Não usar 248 REST/presença como demanda do Express: há consultas diretas ao Supabase e tráfego de fundo. Para o produto completo, verificar as demandas de cada serviço e o mínimo dos envelopes compatíveis. Concurrency por Little relaciona operações em andamento, taxa e duração; não transforma sockets ou conexões de banco em pessoas.

Manter envelopes separados para CPU/filas, memória, DAU de tráfego, novos cadastros, usuários de IA e sockets simultâneos. Dashboard mostra carga atual e distância para o perfil validado, além de franquias. “N-1” permanece não validado enquanto faltar redundância. Nenhum medidor gera número verde infinito por divisão por zero, CPU ociosa ou ausência de amostra.

# Etapas de implementação e critérios de conclusão

Estimativa de esforço de engenharia: **16–24 dias úteis**, mais a janela de observação (sete dias para perfil inicial; até 32 dias de calendário para primeiro D30 fechado) e tempo de infraestrutura/revisão. Não é preço contratado nem prazo de aprovação. Etapas podem ser sequenciadas sem publicar partes que exponham dados ou recebam eventos sem retenção.

| Etapa / esforço | Entrega | Condição de conclusão |
|---|---|---|
| P0 — contratos e recursos, 2–3 dias | Definições, schema, allowlists, política, algoritmo JWT, storage/token R2 e posição do coletor | Gates de infraestrutura/privacidade documentados; nenhum segredo em cliente |
| P1 — métricas técnicas, 2–3 dias | Express, Darcy multiprocess, Services/ServiceMonitors e dashboards Grafana | Scrape real, rota privada, testes de close/restart/cardinalidade, métricas por jornada |
| P2 — histórico durável, 3–4 dias | Coletor, SQLite/PVC, índices, exportação, expurgo e restauração | Commit/ack/dedupe demonstrados, replay idempotente, restauração e lacunas verificadas |
| P3 — atividade e coortes, 3–4 dias | Cliente de eventos, credencial curta, chamados Supabase diretos, API/admin | Multidispositivo e NAT corretos; ativo/visível/refresh separados; coleta não bloqueia produto |
| P4 — confiança e escopos, 2–4 dias | Fonte/data/conferência, ciclo de reporte, agregação institucional e contratos de custo | Escopos verificados, sem dado individual; correção/retorno distinguem fechamento de ticket |
| P5 — baseline e capacidade, 2–3 dias + janela | Perfil, sondas, ensaios isolados e recibos com validade | Dados suficientes e carga representativa; provedores reais só com orçamento autorizado |
| P6 — operação e revisão, 2–3 dias | Alertas autorizados, runbooks, prova de exclusão, rollback e custos medidos | Recebimento de teste autorizado, expurgo/restore validado, orçamento/latência sem regressão |

Os dias são estimativas por etapa e podem totalizar 16–24 conforme sobreposição de revisão; o tempo de observação não se transforma em trabalho ativo diário. Cada PR atualiza owner e consumidores da KB: frontend, backend, IA, dados, segurança e operações conforme os arquivos tocados. Registrar intenção com DEC e resultados com classe de evidência.

Rollout futuro: flags desligadas → staging → contas internas identificadas → pequena fração de coleta → coleta integral → baseline → ensaio de capacidade. Percentual inicial não permite escalar DAU observado por multiplicação e chamar de exato. Métricas de tráfego permanecem integrais; cobertura de atividade mostra a fase.

Rollback separa flags de cliente, ingresso, exporter e painel. Desligar telemetria mantém os caminhos do produto; bloquear novas escritas permite exportar e preservar histórico. Não apagar PVC/objetos como rollback de aplicação. Publicação, mudanças no cluster e carga real dependem de sua autorização própria.

# Matriz de testes de implementação

| Caso adversarial | Resultado exigido |
|---|---|
| Dez abas / dois aparelhos da mesma conta | Um DAU; sessões/sockets distintos; atividade sem soma por réplica |
| Refresh ou aba visível sem interação | Não cria DAU elegível nem usuário ativo indevido |
| Aba oculta / timer suspenso | Presença vence; não há heartbeat infinito |
| Logout/troca de conta com fila offline | Nenhum evento antigo atribuído à nova conta |
| Mesmo lote enviado dez vezes, inclusive em duas réplicas | Um raw event, um upsert de ator e contador explícito de repetição |
| Timeout após commit antes do ack | Reenvio idempotente; nenhum evento “aceito” apenas em memória |
| CPU/métricas em dois workers; morte de um | Counters agregados corretos; gauge morto não persiste como atividade |
| `finish` e `close`; SSE desconectado | In-flight decrementado uma vez; encerramento não contado como sucesso de jornada |
| 200 usuários no mesmo IP do campus | Telemetria não consome limiter do produto; limites próprios ainda impedem abuso |
| ID/role/teste/route maliciosos | Identidade/coorte vêm do servidor; rota inválida vira bucket finito |
| 10 mil URLs/IDs e erros distintos | Séries dentro do limite; nenhuma label contendo dado pessoal |
| JWT inválido/expirado, admin revogado | Sem dado administrativo; telemetria credenciada só dentro de escopo/validade |
| Dia de Brasília, mudança de mês/chave e relógio fora de ordem | DAU/WAU/MAU corretos; aliases não duplicam atores |
| Provider/coletor/Prometheus indisponível | Produto funciona; painel indica parcial/stale/unknown e não zero |
| Disco cheio ou R2 indisponível por longo período | Fila limitada, alarme, descarte/expiração explícitos; recursos do produto preservados |
| Restauração sem WAL ou schema/chave errado | Restore recusado/isolado; expurgo e migração precedem consultas |
| Histograma de várias réplicas/intervalos | Percentil da população, não média dos percentis |
| Exclusão de ator e restore de backup antigo | Dados não reaparecem; snapshots/objetos antigos expurgados conforme política |
| Quota/pricing atrasados ou modelo sem preço | Custo/capacidade financeira marcados incompletos; nada convertido em zero |
| Ensaio saturado e gerador sem VUs | Interromper, invalidar resultado e guardar causa/taxa oferecida |
| Cadastro/ativação/D7/D30 com replay ou coorte imatura | Âncora fixa, conta única e janela correta; sem taxa madura inventada |
| Instituição/coorte escolhida no browser | Vínculo vem do servidor ou escopo permanece desconhecido |
| Recorte pequeno, filtro e diferença entre exports | Supressão complementar; nenhum ator ou trajetória reconstruível |
| Ticket fechado sem correção/conferência | Métricas não atribuem correção ou selo por fechamento |
| Upload local e IA com tarifa/cache/falha | Sem tokens fictícios no upload; custo por unidade correto e lacunas explícitas |
| Gratuidade e ledger financeiro ausente | Cotas claras; zero receita não inferido de ausência; não cobrar por telemetria |
| Pico 5×/10× com cold cache e retries | SLO/custo por sucesso medidos; autoscaling não presumido |
| Gráfico sem cor, teclado e leitor de tela | Tabela e estados legíveis; conformidade só no escopo testado |

Testes unitários apenas onde verificam contratos; integração exercita SQLite real, servidor HTTP, autenticação simulada e dois workers; E2E cobre navegador/admin e chamadas Supabase diretas. Injectar falhas em ambiente isolado, não em produção por este plano. Inclua todos os caminhos com conteúdo sensível no teste de redaction, incluindo stdout do Darcy.

# Dimensionamento de armazenamento e hipóteses

Modelo reproduzível em `monitoring-cost-model-2026-10-08.py`; parâmetros e resultados em `monitoring-cost-estimate-2026-10-08.json`. Ele não usa rede ou credenciais. Unidade monetária: USD; espaço decimal em GB e binário em GiB. Valores são orçamento de estado estável com retenção preenchida, não compressão medida ou fatura já contratada.

Parâmetros principais: 40 sinais por ator/dia; sessões anônimas no mesmo volume do DAU autenticado por falta de medição; raw por sete dias; 200 bytes/sinal compactado e 800 bytes/linha local com índices; dois dias de estado anônimo, 35 de autenticado com 320 bytes/linha; estado separado de coorte por 35 dias a 192 bytes/conta, assumindo novos cadastros/dia iguais ao DAU autenticado (hipótese, não taxa observada); três snapshots compactos desses estados; 500 séries por minuto durante 30 dias, de cinco minutos durante 90 dias e horárias nos dias 91–400. Aplicar reserva de duas vezes aos tamanhos estimados.

Orçamento adicional: 200 linhas de agregado/dia por 400 dias; até 100 MB/dia de diagnóstico compactado, com sete dias; 100 MB de recibos. O banco local reserva 1 GiB para WAL e 1 GiB para trabalho temporário. Índices/dados locais não são cobrados como bytes Parquet; o modelo usa custos por linha diferentes. Diagnósticos com excesso de volume geram contadores/lacunas, sem amostrar os sets de atividade.

No Prometheus compartilhado, 3.000 séries novas com passo 15s e 15 dias resultam em aproximadamente 0,52 GB de samples a 2 bytes, ou **1,56 GB** com fator de três para índice/WAL. Isso é incremento estimado, distinto do coletor e da TSDB total atual; RAM/churn precisam de ensaio. Teto de 5.000 séries aumentaria esse orçamento para cerca de 2,59 GB.

Guardar eventos raw no Supabase consumiria no modelo cerca de 54 MB no porte de 60 DAU e 896 MB em 1.000 DAU, só por sete dias. As métricas por minuto acrescentariam vários GB. Isso ultrapassa a folga do banco Free em crescimento e compete com memória/I/O; a proposta separa esse histórico do banco de negócio.


# Estimativa de custo mensal

R2 Standard, preços oficiais consultados em 08/10/2026: armazenamento US$0,015/GB-mês, escritas Classe A US$4,50/milhão e leituras Classe B US$0,36/milhão; franquias mensais de 10 GB, um milhão A e dez milhões B. O provedor arredonda unidades cobradas para cima. O modelo reserva 100 mil operações de cada classe por mês, com lotes; não cria um objeto por evento. A disponibilidade da franquia desta conta ainda não foi verificada.

| DAU autenticado de cenário | Sessões anônimas/dia assumidas | R2 reservado, GB | Local, GiB | R2/mês com franquia disponível | R2/mês sem franquia* | Cabe em 20 GiB a 80%? |
|---|---|---|---|---|---|---|
| 60 | 60 | 4,05 | 8,57 | US$0,000 | US$4,935 | Sim |
| 1.000 | 1.000 | 4,37 | 9,38 | US$0,000 | US$4,935 | Sim |
| 10.000 | 10.000 | 7,39 | 17,20 | US$0,000 | US$4,980 | Não |
| 50.000 | 50.000 | 20,80 | 51,96 | US$0,165 | US$5,175 | Não |

*Caso conservador sem franquia trata as unidades incrementais do projeto como cobradas separadamente, com arredondamento; numa conta compartilhada a cobrança marginal depende das unidades já ocupadas. O preço é de objetos/armazenamento/operações R2, não de todo o monitoramento. Transferência direta do R2 não tem tarifa de egress; tráfego/CPU/disco do servidor, impostos, engenharia, provedores e serviços intermediários não estão incluídos. [Preços oficiais R2](https://developers.cloudflare.com/r2/pricing/).

**Porte atual:** orçamento de até aproximadamente 4,06 GB no R2 e 8,57 GiB locais em estado estável; R2 pode ficar em US$0 se houver franquia, ou cerca de US$4,94/mês no caso conservador sem ela. A provisão local de 20 GiB cabe no modelo; o valor mensal marginal do disco/CPU contratados do cluster é **não confirmado**, não “gratuito”. O cenário atual usa proxy de 60 DAU e assume outros 60 visitantes/sessões anônimos por dia.

**Crescimento:** 10 mil DAU com igual volume anônimo usa cerca de 7,39 GB R2 e 17,21 GiB locais, excedendo os 16 GiB operacionais de um PVC de 20 GiB; planejar pelo menos 32 GiB. 50 mil usa aproximadamente 20,80 GB R2, US$0,165/mês com franquia, mas precisa de cerca de 51,97 GiB locais: planejar volume de pelo menos 80 GiB com margem e cotação própria. A disponibilidade atual do disco compartilhado não justifica essa expansão. Esses cenários dimensionam armazenamento; não afirmam que o produto ou coletor atendam 10/50 mil DAU.

A alternativa Supabase Pro começa em US$25/mês por organização, inclui crédito que cobre uma instância Micro e 8 GB de disco por projeto; disco excedente custa US$0,125/GB-mês. Outra instância/maior compute altera o total. Não existe tarifa avulsa que autorize ultrapassar 500 MB de banco no Free. Guardar telemetria no mesmo projeto também compete com seu compute; não é a opção inicial deste plano. [Preços oficiais Supabase](https://supabase.com/pricing).

# Fórmulas e sensibilidade do orçamento

Definir D = DAU autenticado e A = sessões anônimas/dia; cenário base usa A = D e C (novos cadastros/dia) = D, por falta de cobertura atual; C é parâmetro próprio. Fator de reserva = 2.

```text
raw_cloud = (D + A) * 40 * 7 * 200 * 2 bytes
identity_cloud = (35*D + 2*A) * 320 * 3 * 2 bytes
cohort_cloud = C * 35 * 192 * 3 * 2 bytes
minute_cloud = 500 * 1440 * 30 * 32 * 2 bytes
history_cloud = 500 * (288*90 + 24*310) * 32 * 2 bytes
fixed_cloud = minute_cloud + history_cloud
            + daily_aggregates + diagnostic_budget + receipts
cloud_total = fixed_cloud + raw_cloud + identity_cloud + cohort_cloud

USD_storage = 0.015 * ceil(max(GB_month - free_GB, 0))
USD_A = 4.50 * ceil(max(A_ops - free_A, 0) / 1000000)
USD_B = 0.36 * ceil(max(B_ops - free_B, 0) / 1000000)
```

O fixed_cloud é aproximadamente 4,03 GB com as hipóteses completas. GB-mês real depende dos picos diários e da ocupação média no ciclo; o quadro usa todo o orçamento reservado continuamente, incluindo reserva e logs no teto. Primeiros meses podem ser menores. Não aplicar tarifa USD/GB a GiB sem conversão nem somar banco, objetos, log ingestion e egress como se fossem o mesmo consumo.

Novos cadastros acima da hipótese elevam o estado de coorte mesmo sem ativação. Dobrar sinais/dia dobra só a parcela raw, não a totalidade do custo. Dobrar sessões anônimas também afeta raw e estado anônimo, sem duplicar sets de contas autenticadas. Dobrar bytes efetivos pode invalidar a provisão local de 20 GiB. Passar para retenção bruta de 30 dias multiplica essa parcela por 30/7. Tracing, log completo por request ou guardar cada heartbeat por anos **não estão** no preço base.

Para tracing opcional: bytes/mês = requisições/dia × fração amostrada × spans/trace × bytes/span × dias. Aplicar também a taxa de erros, porque reter todos os erros durante um incidente pode superar o orçamento de amostragem normal. Fixar teto separado antes de habilitar tracing ou dreno de logs pago.

Medir por sete dias bytes por evento/row/arquivo, índices, WAL, memória, CPU, requests R2, proporção anônima, taxa de descartes e tráfego adicional de Auth. Recalcular o orçamento em percentil alto, em vez de substituir hipóteses por médias pequenas. O monitoramento acrescenta processamento e dados: sua sobrecarga entra no teste de capacidade.

# Revisão adversarial do desenho

Foram feitas três passagens de revisão deste plano pelo mesmo responsável, com inspeção de código/infra, cenários adversariais e verificação matemática. Os exemplos locais são reproduzíveis com `python3 docs/capacity/verify-monitoring-design-2026-10-08.py`. Não se apresenta como revisão independente nem como teste do sistema futuro. As correções abaixo estão incorporadas; a matriz de implementação continua obrigatória.

| Passagem / risco encontrado | Correção adotada | Prova ou gate |
|---|---|---|
| Medição: refresh, abas e tráfego anônimo inflariam “pessoas” | Definições separadas, ator validado, união de sets; heartbeat neutro não cria DAU | Exemplos de dedupe/dia e testes de browser; cobertura explícita |
| Medição: meia-noite e pulso ativo perderiam DAU | Interação nova em pulso é elegível; timer repetido não é | Teste de dia de Brasília e última interação |
| Medição: backend sozinho não vê Supabase direto | Instrumentação de jornadas/serviços do navegador e fontes separadas | Inventário de chamadas diretas e reconciliação |
| Medição: tráfego técnico e HTTP 200 mascarariam demanda/sucesso | Rotas técnicas separadas e resultado semântico por jornada | Perfil de carga e testes de retorno parcial/erro |
| Medição: média de p95 e dois workers dariam histogramas falsos | Buckets/população, epoch/reset e registry multiprocess | Exemplo matemático e teste com duas instâncias/processos |
| Segurança: cliente poderia inventar identidade/rota/coorte | Credencial curta de telemetria, allowlists e classificação server-side | Testes de JWT, replay, admin e cardinalidade |
| Segurança: rotação de HMAC duplicaria MAU | Aliases deduplicados na janela; chave/versão e expurgo | Teste obrigatório de rotação e exclusão/restauração |
| Operação: telemetria esgotaria o limiter do campus | Ingresso com orçamento próprio e sem liberar endpoints de produto | Ensaio de NAT com múltiplas abas |
| Operação: ack em memória, `cp` de SQLite ou PVC RWO seriam confundidos com durabilidade | Commit antes do ack, backup/replay consistente, um escritor e Recreate | Crash/retry/restore isolados; sem promessa de HA |
| Operação: R2 offline ou evento antigo tornaria alguém online | Qualidade/lacunas; presença só por sinal fresco; exportação/TTL limitados | Teste de outages, atraso e expurgo |
| Infra: PVCs locais seriam somados e `emptyDir` provaria perda do Grafana | Uso de diretório separado; banco Grafana externo confirmado | Inventário lido no cluster e detalhes filtrados |
| Custo: franquia compartilhada, arredondamento e backups omitidos | Dois cenários de tarifa; unidades arredondadas; três snapshots compactos | Calculadora e casos de fronteira de cobrança |
| Custo: 50 mil DAU “caberiam” só porque R2 é barato | Espaço local de 51,97 GiB e throughput não validado explícitos | Nova provisão/ensaio antes desse volume |

Não foram identificadas pendências críticas de desenho nas três passagens após essas correções. Permanecem gates de execução e políticas externas abaixo. “Revisado” não significa ausência garantida de defeitos nem produção pronta.

# Gates antes de ativar e checklist de aceite

**G0 — Autoridade e superfície:** confirmar alvo e revisão publicada, ambiente isolado de teste, responsáveis e permissões; não aplicar alterações de cluster/SQL/billing ou envio com a autorização de planejar.

**G1 — Dados e identidade:** confirmar algoritmo JWT/SDK, política de coleta anônima/base de tratamento, coortes e acesso `dashboard`; publicar contrato de eventos e retenção; testar redaction, aliases e exclusão. Não enviar dados reais antes disso.

**G2 — Infra e custo:** conta R2 e franquia verificadas, token privado por bucket, PVC local/afinidade/disk space aprovados, volume com margem e descoberta do scrape real. Monitoramento da ausência do próprio coletor não pode depender só dele. Custo do cluster precisa de confirmação do contrato.

**G3 — Persistência:** commit/ack, duplicata, índices, overload, export/manifest/checksum, expurgo e recuperação medidos; perda de nó não é disfarçada como failover. Resultado precisa alcançar RPO/RTO ou rever as metas.

**G4 — Observação e painel:** séries chegando e privadas, navegação/clientes reais de teste cobertos, dados ausentes/stale sem zero fictício, DAU/WAU/MAU e jornadas reconciliados; custo desconhecido sinalizado. Dados sem cobertura não geram recibo de capacidade.

**G5 — Capacidade e operação:** ensaio representativo, gerador saudável, provedores/quota e orçamento apropriados, recebedor de alerta autorizado, rollback comprovado, perfil de matrícula e recibo com validade. Ativação/retorno, estado curricular e supressão institucional exigem suas provas; D30 não é finalizado antes da janela. Sem G5, a interface pode mostrar demanda observada e envelopes, mas mantém capacidade simultânea não validada.

Aceite final exige evidência de comportamento real por camada: fonte/testes locais; descoberta e scraping; dependências/infra; dados de uso; persistência/restauração; janela de SLO; carga/topologia. Não publicar um card “suportamos X pessoas” a partir de um HTTP 200, baixa CPU, conexão de banco ou arquivo de dashboard.

# Fontes e artefatos de referência

Fonte do projeto: `frontend/src/routes/+layout.svelte`, `frontend/src/lib/utils/api.ts`, serviços Supabase e `ticket.service.ts`; `backend/src/index.ts`, `config/rate_limit.ts`, `utils.ts`, `logger.ts`, `utils/ai_usage_logger.ts`; `mcp_agent/api_producao.py`, `k8s.mcp-agent.Dockerfile`; `supabase/migrations/latest_init_from_export.sql`; dossiers de frontend/backend/IA/dados/segurança/operações e referências de `kubernetes_docs/monitoring/`.

O inventário de 08/10 está em `monitoring-plan-evidence-2026-10-08.json`. O relatório anterior permanece em `relatorio-capacidade-nofluxo-2026-10-07.tex` e seu PDF; estimativas anteriores são hipóteses, não capacidade certificada. Cálculo desta proposta: `monitoring-cost-model-2026-10-08.py` e `monitoring-cost-estimate-2026-10-08.json`; registro das revisões: `monitoring-plan-review-2026-10-08.json`. O script `build-monitoring-plan-2026-10-08.py` regenera o LaTeX a partir deste Markdown usando Pandoc e o preâmbulo do relatório anterior; compilação do `.tex` é independente.

Fontes documentais e conciliação: Plataforma de Marca v1.0 (28/09, p. 1, 4–6, 8–15), Modelo de Negócio/Precificação (setembro, p. 2–6, 8), Levantamento de Custos (agosto, p. 1, 3–6). Originais e reconciliação de valores ficam locais. Não promovem preços, contratos, métricas ou ações de governança a fatos atuais.

Referências primárias consultadas em 08/10/2026:

- [Prometheus: armazenamento, retenção e bytes/sample](https://prometheus.io/docs/prometheus/latest/storage/).
- [Prometheus: histogramas e agregação de percentis](https://prometheus.io/docs/practices/histograms/).
- [Client Python: métricas multiprocess](https://prometheus.github.io/client_python/multiprocess/).
- [Supabase: verificação de JWT e chaves](https://supabase.com/docs/guides/auth/jwts).
- [SQLite: WAL, single-host e concorrência](https://www.sqlite.org/wal.html).
- [SQLite: backup consistente](https://www.sqlite.org/backup.html).
- [OpenTelemetry: filas, persistência e limites de recuperação](https://opentelemetry.io/docs/collector/resiliency/); tracing/OTel não são requisito da primeira versão.
- [k6: modelos de carga aberta/fechada](https://grafana.com/docs/k6/latest/using-k6/scenarios/concepts/open-vs-closed/).
- [k6: taxa constante de chegada](https://grafana.com/docs/k6/latest/using-k6/scenarios/executors/constant-arrival-rate/).
- [Cloudflare R2: preços, franquia e arredondamento](https://developers.cloudflare.com/r2/pricing/).
- [Maritaca: preços atuais, cache/modos e ferramentas](https://docs.maritaca.ai/pt/precos).
- [W3C: WCAG 2.2](https://www.w3.org/TR/WCAG22/).
- [Supabase: preços de plano/disco](https://supabase.com/pricing).

As sugestões de parâmetros, esforço, retenção e capacidade de armazenamento são inferências/propostas do plano. Produção só foi lida para metadados de monitoramento; nenhum conteúdo pessoal, configuração ou serviço foi alterado.
