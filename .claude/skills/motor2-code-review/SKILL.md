---
name: motor2-code-review
description: Revise mudanças do Motor 2 no algoritmo, controller, serviços, store ou telas, verificando contratos acadêmicos e fronteiras de dados. Use para revisão de código; não executa publicação.
---

# Revisão do Motor 2

Comece por `npm run kb:query -- "Motor 2 contratos planejamento"`, pelo dossier
backend e pelo dossier frontend. Compare o diff à fonte atual; números de linhas,
fórmulas e fases do plano antigo não são contrato vigente.

## Superfícies

- Backend: `backend/src/controllers/PlanejamentoController.ts`,
  `backend/src/services/plano_formatura.service.ts` e tipos de planejamento.
- Cliente: `frontend/src/lib/services/plano-formatura.service.ts`,
  `frontend/src/lib/stores/plano-formatura.store.svelte.ts` e
  `frontend/src/routes/(protected)/plano-formatura/+page.svelte`.
- Montador: serviços `grade-pool`/`modulo-livre`, store e rota
  `frontend/src/routes/(protected)/planejamento/grade/+page.svelte` quando afetados.

## Critérios

Confira autenticação e vínculo do usuário, entrada camel/snake case, normalização
de códigos, carga integralizada, natureza de disciplina, oferta e equivalências.
Verifique limites/co-requisitos e `materiasNaoAlocadas`; quantidade pequena nessa
lista não prova cobertura total. O controller consulta dados e pode usar IA; não
exija que todo o fluxo seja puro. Compare cálculo/score à fonte e spec atual.

Na UI, confira carregamento, erro, vazio, persistência, mudanças de preferência,
resposta tardia e reatividade Svelte 5. Recomendações são apoio ao planejamento;
não apresentar previsão como formatura garantida ou orientação oficial. Consulte
`docs/marca-e-posicionamento.md` para clareza, acessibilidade e linguagem acolhedora.

Priorize achados com trigger reproduzível, impacto, arquivo/símbolo e correção
concreta. Teste existente não equivale a teste executado. Indique limites da
revisão e mantenha fonte, SQL, teste e deploy separados. Não publique mudanças
ou aplique migrations como efeito da revisão.
