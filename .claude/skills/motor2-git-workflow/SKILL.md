---
name: motor2-git-workflow
description: Organize diffs e commits locais de uma mudança do Motor 2, preservando trabalho concorrente e separando entrega local de publicação. Use quando a tarefa pedir preparação de commit ou revisão Git.
---

# Entrega Git do Motor 2

Leia `AGENTS.md`, `COMMIT_GUIDELINES.md` e o dossier de projeto. Inspecione status,
branch, diff staged/unstaged e merge/rebase em andamento antes de agir. Não
conclua um merge iniciado por outra tarefa só porque a skill foi invocada.

Preserve trabalho concorrente. Separe fonte, testes, documentação e evidências;
inclua somente os caminhos da entrega autorizada. Não use `git add .` como
atalho em checkout compartilhado. Nunca adicione `.env`, PDFs pessoais,
`docs/privado/`, configurações locais ou artefatos de sessão.

Use as checagens relevantes ao diff; mantenha owner e consumidores KB atualizados.
Inventário/hash deve acompanhar o documento final. Renove snapshot após revisão,
sem usá-lo para esconder drift. Confira `git diff --cached --check` e o diff
staged antes de um commit autorizado, com Conventional Commits. Commit local
não prova deploy nem aceitação do usuário.

Se criar branch, siga o nome solicitado; sem nome explícito, use prefixo `codex/`
e `--no-track` ao partir de uma ref. Não invente upstream de `origin/main`.
Use comparação de branch com merge-base quando a finalidade for a diferença da PR.

Push, merge de PR, deploy e escrita no banco são ações distintas que exigem a
autorização correspondente. A skill não a concede. Não aplique SQL para “fechar
checklist”. `.claude/settings.json` bloqueia alguns prefixos e restringe comandos;
não é garantia de bloqueio de toda forma equivalente. Não contorne o controle.

Ao terminar, informe commit/revisão, validações e estado real da árvore. Preserve
pendências de merge e dados locais; não limpe a árvore apagando trabalho alheio.
