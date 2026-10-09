# Política de segurança

## Comunicação de vulnerabilidades

Este checkout não documenta um canal privado confirmado para relatos de segurança.
Confirme com os mantenedores um meio confidencial antes de enviar detalhes, dados
pessoais, tokens ou passos sensíveis. Não use uma issue/PR como se o estado de
rascunho garantisse confidencialidade. Esta política não promete prazos de resposta
ou recursos privados do GitHub cuja habilitação não foi verificada.

Um relato deve identificar revisão afetada, comportamento, reprodução com dados
sintéticos e impacto observado. Não publique segredos nem evidência contendo dados
pessoais. A publicação de uma correção continua sujeita à autorização do mantenedor.

## Controles e limites do repositório

- Segredos ficam em `.env` fora do Git; templates contêm placeholders.
- `.gitleaks.toml` e workflows de segurança descrevem scanners configurados; sua presença não prova ausência de vulnerabilidades.
- Código com service role depende da autorização do handler; SQL RLS é um artefato, não prova de aplicação no ambiente.
- Impersonação exige gates de desenvolvimento/opt-in explícitos e não substitui testes de autenticação real.

Veja o [dossier de segurança](docs/kb/subsystems/auth-security-and-privacy.md)
para os controles efetivamente encontrados na fonte e as fronteiras ainda não verificadas.
