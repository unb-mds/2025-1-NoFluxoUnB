> Material de estudo da disciplina. Esta página não descreve a stack atual do NoFluxoUNB; a arquitetura implementada está na documentação de engenharia.

# Supabase

É uma plataforma que já configura o back-end de um projeto. Ela oferece recursos como API, autenticação, banco de dados, armazenamento de arquivos, entre outros.

# Funcionalidades

## Banco de Dados

O Supabase utiliza o banco de dados **PostgreSQL**.

É possível criar tabelas, relacionamentos, views e funções, seja por meio da **interface gráfica** ou escrevendo comandos SQL.

## Autenticação

O Supabase já oferece um sistema de login completo, com suporte a e-mail/senha, redes sociais, autenticação por link mágico, entre outros. Também possui um sistema de controle de sessão e permissões com **JWT (tokens)**.

## API em tempo real

A plataforma possui um sistema de API em tempo real, que gera automaticamente uma **API REST** e uma **API GraphQL** sempre que uma nova tabela é criada.

Além disso, é possível interagir com o banco de dados diretamente a partir do front-end.

## Painel de Administração

O Supabase fornece uma interface web que permite gerenciar todos os recursos de forma visual, sem a necessidade de configurar um servidor manualmente.

# Recomendações de uso

## Protótipos, MVPs e aplicações simples

A plataforma é ideal para protótipos e MVPs, pois permite criar tabelas, sistemas de autenticação completos, fazer upload de arquivos e utilizar APIs REST e GraphQL de forma muito fácil, rápida e gratuita (dentro de certos limites).

## Quando não é recomendado usar

O Supabase pode deixar de ser a melhor escolha quando:

- A lógica do servidor for muito complexa, exigindo muitas validações ou processamento pesado de dados e imagens;
- Houver dependência de múltiplas integrações externas;
- O projeto exigir controle completo de infraestrutura ou atender milhões de usuários com requisitos críticos de desempenho e segurança.

Nesses casos, pode ser necessário desenvolver uma solução back-end mais customizada.

# Exemplos práticos

### 1. App de Receitas

Vamos supor que você está criando um app chamado **"Minhas Receitas"**:

- No Supabase, você cria uma tabela `receitas`, com campos como `nome`, `ingredientes` e `modo_preparo`.
- Configura o sistema de **autenticação**, para que cada usuário veja apenas suas próprias receitas.
- O front-end (feito em React, Vue etc.) faz chamadas diretas à **API gerada automaticamente**.
- Se o usuário quiser subir uma foto do prato, você utiliza o sistema de **armazenamento** de arquivos.

Assim, você cria um back-end completo sem escrever quase nenhuma linha de código no servidor.

### 2. App de Controle de Hábitos (tipo Habitica)

**Objetivo:**

Permitir que usuários criem e acompanhem hábitos diários, semanais ou mensais. Cada hábito tem:

- Nome
- Frequência
- Última verificação
- Data de criação

**Como o Supabase ajuda:**

| Recurso | O que você faz no Supabase |
| --- | --- |
| **Autenticação** | Ativa login com e-mail/senha (ou Google, se quiser) |
| **Banco de dados (PostgreSQL)** | Cria uma tabela `habitos` com colunas como `id`, `titulo`, `frequencia`, `usuario_id`, `ultima_verificacao` |
| **Relacionamento** | Cada hábito pertence a um usuário (chave estrangeira `usuario_id`) |
| **API REST/GraphQL automática** | Conecta seu front-end diretamente à tabela com segurança |
| **Regras de segurança (RLS)** | Define que cada usuário só pode ver e editar seus próprios hábitos |

---

### 3. Sistema de Reservas de Salas

**Objetivo:**

Funcionários de uma empresa podem reservar salas em determinados horários.

**Como o Supabase ajuda:**

| Recurso | O que você configura |
| --- | --- |
| **Autenticação** | Login apenas para funcionários |
| **Tabela `salas`** | Contém nome da sala, capacidade e localização |
| **Tabela `reservas`** | Campos: `sala_id`, `usuario_id`, `data`, `hora_inicio`, `hora_fim` |
| **Validação (manual)** | Você pode usar *Policies* e *Triggers* para evitar conflitos de horário |
| **Storage (opcional)** | Pode guardar plantas da sala como imagem no bucket de arquivos |

---

### 4. Galeria de Fotos com Upload

**Objetivo:**

Usuários podem fazer upload de fotos, ver sua galeria pessoal e deletar imagens.

**Como o Supabase ajuda:**

| Recurso | O que você faz no Supabase |
| --- | --- |
| **Autenticação** | Login simples para que cada usuário tenha sua própria galeria |
| **Storage (armazenamento)** | Cria um bucket chamado `fotos`, onde cada usuário pode armazenar suas imagens |
| **Regras de acesso** | Define que apenas o dono da imagem pode visualizá-la ou excluí-la |
| **Banco de dados** | Cria uma tabela `fotos` com colunas como `url`, `usuario_id` e `data_envio` |
| **Front-end** | No Vue.js ou React, você usa a biblioteca oficial `@supabase/supabase-js` para: |
|  | - Fazer upload direto do input file |
|  | - Salvar a URL da imagem no banco |
|  | - Exibir a imagem com `<img :src="url">` |

# Resumindo

O Supabase é uma plataforma que facilita bastante o desenvolvimento do back-end de projetos com lógica simples e poucas dependências externas. Ele permite criar e gerenciar tabelas, autenticação, banco de dados, armazenamento e APIs em tempo real, tudo de forma rápida e com suporte tanto por interface gráfica quanto por comandos SQL.
