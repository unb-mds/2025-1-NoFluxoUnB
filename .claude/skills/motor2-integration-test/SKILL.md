---
name: motor2-integration-test
description: Verifique o contrato HTTP autenticado de POST /planejamento/gerar-plano e sua relação com o frontend, usando dependências controladas. Use para integração do Motor 2; não é teste unitário ou aceite de produção.
---

# Integração HTTP do Motor 2

Leia o dossier backend, `backend/src/controllers/PlanejamentoController.ts`
(`parseBody`, handler `gerar-plano`), `backend/src/utils.ts` e o serviço de plano
frontend. Comentários de cabeçalho podem conservar um payload antigo; a
implementação e o consumidor atual definem o contrato observado.

`POST /planejamento/gerar-plano` exige autorização e `User-ID`. Confirme como
o handler valida o vínculo, com identidade de teste válida e também adversarial.
A porta vem de `PORT`; 3325 é o exemplo de ambiente, não valor garantido.

Entrada enviada pelo serviço Svelte:

```json
{
  "curriculo_completo": "CURRICULO_SINTETICO",
  "codigos_concluidos": [],
  "semestre_atual": 2,
  "limite_creditos": 24
}
```

Obtenha currículo, perfil, oferta e carga de fixtures de teste. Não adivinhe uma
matriz real nem injete service role como usuário. `montarDadosPlano` consulta
Supabase e pode disparar avaliação de dificuldade via LLM; use doubles ou
staging autorizado. Iniciar API local não isola serviços remotos automaticamente.

Verifique sem auth, identidade incompatível, body inválido, caso válido, lacuna
de dados, limites de crédito, equivalências/co-requisitos e erro do provedor.
Observe status e estrutura `PlanoFormaturav2`, inclusive não alocadas; HTTP 200
sozinho não comprova correção acadêmica. Derive expectativas da implementação
e do contrato aceito, não do antigo requisito “equilibrado capado em 24”.

Prefira integração HTTP com dependências controladas; se testes existentes
chamam só funções/handlers, relate essa cobertura menor. Mantenha auth, método,
rota e retorno semântico no ensaio. Registre ambiente, revisão, comandos,
resultados e lacunas; não aplique migrations ou gaste crédito para validar
uma suposição sem autorização específica.
