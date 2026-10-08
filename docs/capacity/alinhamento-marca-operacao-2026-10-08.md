# NoFluxo — conciliação de marca, modelo e observação operacional

Revisão de 08/10/2026 dos três PDFs fornecidos pelo mantenedor: Modelo de Negócio
e Precificação (setembro, 8 páginas), Levantamento de Custos para Investidor
(agosto, 6 páginas) e Plataforma de Marca v1.0 (28/09, 15 páginas). Todas as
29 páginas foram lidas e suas tabelas/apresentação revisadas. São fontes
documentais datadas; este registro não valida números comerciais ou produção.

## O que cada fonte resolve

| Fonte / páginas | Conteúdo útil ao alinhamento | Limite de autoridade |
|---|---|---|
| Marca, p. 1, 4, 12–15 | NoFluxo com by Crianex; aluno no centro, gratuidade, tom honesto, acessibilidade | Métricas de tração e propostas ainda precisam de definição/evidência |
| Marca, p. 3, 6 e 14 | Confiança no dado; atualização, reporte com retorno e matriz conferida | Não demonstra os mecanismos funcionando no produto |
| Negócio, p. 2–5 | Contratação por instituição/unidade/curso/uso e analytics futuro | Contratos, tenants e faturamento ainda não implementados por este trabalho |
| Negócio, p. 6 e 8 | Propostas de monetização direta pelo aluno | Divergem da gratuidade da plataforma de 28/09; não viram paywall ou meta de conversão |
| Investimento, p. 3–6 | Separar custo atual, expansão, picos, infraestrutura, IA e operação | Valores são estimativas de agosto; não cotação ou capacidade validada de outubro |

## Conciliação com a fonte e a auditoria

| Alegação nos PDFs | Evidência técnica disponível | Tratamento na documentação |
|---|---|---|
| Usuários “ativos”, crescimento e ativação | Auth/profiles e proxy diário datados; atividade de produto ainda por instrumentar | Não misturar cadastro, sessão e pessoa ativa; reconciliar por janela/coorte |
| Parser PDF com IA e tokens por análise | Caminho atual usa PDF.js no navegador, RPC de casamento e persistência Supabase; outras jornadas usam IA | Medir importação e chamadas LLM separadamente; nenhuma tarifa LLM automática por upload |
| Frontend em Vercel e nó RAGFlow na planilha | Auditoria observa três alvos K3s; IA viva FastAPI/Node, Maritaca/Gemini e pgvector | Itens da planilha são históricos ou candidatos de expansão; evitar dupla contagem |
| Cluster com redundância/autoscaling e fila de importação | Uma réplica por alvo e um nó elegível no retrato; fila/autoscaling não validados | Marcar como proposta; escalar horizontalmente não garante capacidade proporcional |
| Plano premium com IA ilimitada | Cotas, créditos e budget existem no backend; marca exige aluno gratuito | Gratuidade não significa recursos infinitos; explicar limites e preservar proteção de custo |
| Analytics e redução de evasão | Telemetria operacional não demonstra efeito causal acadêmico | Produto institucional separado, agregação e avaliação próprias; sem score individual |
| Papéis e participação societária sugeridos | Material comercial propõe organização; não há aceite desses acordos na tarefa | Não atribuir novos poderes, remuneração, direitos ou owners técnicos a essas propostas |

As metas de expansão comercial não mudam o retrato histórico de 07–08/10. Uma
revisão de texto não autoriza trocar provedor, tier, modelo, arquitetura, cota,
domínio servido ou modo de cobrança.

## Contratos novos de medição

1. **Ativação:** coorte de contas elegíveis criada no dia de Brasília; primeiro
   progresso utilizável após importação/casamento/persistência em até sete dias.
   Janela inicial de sete dias é proposta; coortes imaturas são incompletas.
   Exibir numerador/denominador, cobertura e versão da definição. Visitante que
   explora uma matriz usa funil separado, sem forçar login para contar como pessoa.
2. **Retorno:** D7 e D30 por ação elegível na janela definida, separando retorno ao
   produto de retenção acadêmica. D30 exige estado agregado de coorte com 35 dias,
   atraso tolerado e finalização; não somar DAU para reconstruir MAU antigo.
3. **Confiança curricular:** proporção de matrizes com origem/data/conferência
   válidas, atrasos de atualização, falhas de scrape, backlog de reporte e tempo
   até correção verificada/retorno. Conferência não é inferida de scrape bem-sucedido.
4. **Jornadas úteis:** importação, consulta de fluxograma, plano e grade com
   sucesso semântico e latência. IA inclui primeiro trecho, conclusão, motivo da
   recusa e explicação validável; texto bruto do aluno ou modelo não entra no histórico.
5. **Sustentabilidade:** unidades de uso e custos por operação, não custo bruto
   por “usuário”. Custo por importação separa browser, RPC, egress e LLM opcional.
   Operação gratuita ao aluno ainda tem custo e limite técnico.

Uma jornada repetida pode gerar vários eventos mas uma só unidade de resultado
por attempt ID. Tentar, concluir, cancelar e refazer têm denominadores distintos.
Ticket fechado não equivale a erro curricular corrigido. Pesquisa/NPS depende
de convite/resposta e cobertura; não publicar benchmark da marca como medição.

## Instituições, privacidade e faturamento

Instituição, unidade e contrato são dimensões servidoras de um cadastro curado
futuro. Email, curso ou declaração do cliente não comprovam vínculo institucional.
No estágio atual, o escopo é NoFluxo UnB; valores ausentes aparecem como
`NOT_ENABLED`/`UNKNOWN`, não como zero contratos ou zero receita comprovados.

Não usar identificador de aluno ou instituição como label Prometheus de
cardinalidade livre. Capacidade técnica global fica separada de agrupamentos
institucionais consultados no banco agregado, com autorização por escopo.
Limites de séries/eventos são globais; novos tenants não multiplicam automaticamente
as 500 séries arquivadas ou os objetos exportados por minuto.

Como ponto de partida do desenho, publicar recortes institucionais só com pelo
menos 20 participantes distintos e supressão complementar, inclusive para
filtros, séries e exportações. Esse limiar é parâmetro proposto, não prova de
anonimização/LGPD. Não expor atores, evolução individual, curso pequeno ou
possibilidade de reconstrução por diferença entre consultas. Nenhum endpoint
para IES é aberto nesta mudança.

Faturamento (licença, setup ou operação elegível) exige ledger transacional
separado e reconciliação com contrato. Telemetria best-effort nunca é o único
comprovante para cobrar. Contas matriculadas, contas cadastradas e MAU do app
são três denominadores diferentes. Receita contratada, reconhecida e recebida
também não são intercambiáveis. Preços/equity permanecem no anexo local.

## Capacidade sazonal e custo

Ensaiar janela de matrícula com concentração inicial de 5× e 10× como hipóteses
do levantamento, substituindo-as pela distribuição medida. Picos combinados de
importação, RPC, planejamento, IA e egress podem ter limites distintos. Frio de
cache, retries e queda de provedor não podem ser escondidos por médias mensais.
Fila assíncrona e autoscaling são opções a testar, não proteção já disponível.

Separar os gastos recorrentes atuais do orçamento de expansão e do custo
incremental do monitoramento. O R2 calculado é apenas objetos/operações;
Prometheus, SQLite/PVC, CPU, email, engenharia e suporte têm linhas próprias.
Sem preço/fatura ou taxa de câmbio do período, custo total permanece incompleto.

Proposta de analytics institucional deve ter seu próprio orçamento, dataset,
privacidade e ensaio. Não cabe implicitamente no histórico operacional de 400
dias. Exportar atores exatos além da janela de 35 dias ou guardar trajetória
acadêmica por anos seria outra finalidade, retenção e arquitetura.

## Critérios de aceite

- Marca: NoFluxo/by Crianex, universidade como qualificador; linguagem de apoio,
  origem/data/qualidade visíveis, sem prometer infalibilidade ou endosso oficial.
- Medição: ativação/retorno possuem janela e população; datasets de teste
  reproduzem valores exatos, coortes imaturas e dados ausentes.
- Finanças: preço e projeção separados de medição; câmbio/tarifa versionados;
  custo marginal inclui falhas/retries e não confunde custo variável com lucro.
- Privacidade: supressão resiste a filtros/exports/diferença; ausência de conteúdo
  acadêmico individual, credenciais ou preços privados no material compartilhado.
- Operação: perfil de matrícula, picos e erro curricular afetam alertas/recibos;
  capacidade nova só após ensaio, sem transportar limite antigo à nova arquitetura.

O [Plano de Monitoramento](plano-monitoramento-capacidade-2026-10-08.md)
incorpora esses contratos. O [guia de marca](../marca-e-posicionamento.md)
orienta a comunicação. O anexo financeiro local em `docs/privado/` mantém
valores e contas rastreáveis às páginas dos PDFs, sem alterar os originais.
