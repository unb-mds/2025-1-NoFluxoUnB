# Relações do grafo

- `OWNS`: dossier responsável pela superfície de código/configuração.
- `WATCHES`: consumidor que também precisa revisar uma mudança nessa superfície.
- `RELATED_TO`: vínculo explícito entre dossiers.
- `BELONGS_TO`: decisão/invariante/questão contida num documento canônico.
- `SUPERSEDES`: decisão nova substitui uma decisão preservada.

O grafo é saída derivada; sua existência não prova implementação, teste ou publicação.
Esta adaptação usa apenas as relações efetivamente derivadas pelo tooling; leitura/escrita
de tabelas e fluxos de requisição permanecem explicados com fonte nos dossiers.
