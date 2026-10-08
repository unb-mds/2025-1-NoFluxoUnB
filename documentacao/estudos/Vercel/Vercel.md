> Material de estudo da disciplina. Esta página não descreve a stack atual do NoFluxoUNB; a arquitetura implementada está na documentação de engenharia.

# Vercel (Hosteamento gratuito de sites)

## O que é Vercel?
A Vercel é uma plataforma de hospedagem e implantação de aplicações web, focada principalmente em projetos frontend, como Next.js, React, Vue.js e outras tecnologias modernas.
Ela oferece **deploy automático** a partir de repositórios do GitHub, GitHub, Bitbucket, escabilidade automática e integração com diversas ferramentas.

## Conceitos Essenciais

### Integração com Git
- A Vercel sincroniza com seu repositório (GitHub/GitLab/Bitbucket).

- Cada push na branch principal (ex.: `main`) dispara um deploy automático.

- Você pode configurar preview deployments (versões de teste para cada PR/pull request).

### Build e Output
- A Vercel detecta automaticamente a tecnologia do projeto (Next.js, React, Angular, etc.).

- Durante o deploy, ela executa o comando de build padrão (ex.: `next build` para Next.js).

- O resultado é otimizado e distribuído na **CDN global**(Content Delivery Network, ou "Rede de Distribuição de Conteúdo") da Vercel.

### Deploy
Processo de enviar e disponibilizar um site/aplicação em um servidor para que outras pessoas possam acessá-lo.

**Como fazer um deploy na Vercel?**
- Crie uma conta no GitHub, ou acesse uma existente.
  
-  Baixar o git
  
-   Criar o repositório no GitHub e criar o repositório localmente.
   - **Comandos**
      - Configurar email no Git
         - `git config --global user.email "seu@email.com"`
     
      - Configurar nome de usuário no Git
         - `git config --global user.name "Seu nome"`
            - (Substitua "Seu Nome" pelo seu nome ou username do GitHub.)

      - Inicializar o repositório localmente
         - `git init`
            - Cria uma pasta .git para versionamento no diretório atual.

      - Adicionar todos os arquivos ao staging
         - `git add .`
           
      - Criar commit (versionamento local)
         - `git commit -m "Mensagem"`
           
      - Renomear branch principal para main
         - `git branch -M main`
           
      - Vincular repositório local ao GitHub
         - `git remote add origin https://github.com/seu-user/nome-repo.git`


### CI/CD (Continuous Integration/Continuous Deployment)
Automação do processo de biuld, teste e deploy do código a cada atualização.
- A Vercel **já faz isso automaticamente** ao conectar um repositório
- Toda vez que você fizer um `git push`, a Vercel:
  - Executa um novo biuld.
  - Roda testes (se configurados).
  - Faz deploy em produção (ou preview).

###  Cache e Otimizações
- **Static Files**: Arquivos estáticos (HTML, CSS, JS) são servidos via CDN super-rápida.

- **ISR (Incremental Static Regeneration)**: Atualiza páginas estáticas em tempo real sem rebuild completo (Next.js).

### Preview Deployment
Um link temporário para testar mudanças antes de ir para produção.

**Como fazer?**
  - A Vercel gera automaticamente um preview para cada:
    - Pull Request no GitHub.
    - Commit em branches não-principais (ex: `git push origin feature/nova-pagina`).
  - Você pode compartilhar esse link com usa equipe para revisão.
 
### Production Deployment
Versão final do site (acessível pelo domínio principal).

**Como fazer?**

- Merge no branch principal (`main` ou `master`), a Vercel faz deploy automático em produção.
- Ou promova manualmente um preview para produção no painel da Vercel.


## Imagem Explicativa

![deployVercel](https://github.com/user-attachments/assets/f80eb937-2032-4ddc-8a61-a1a25f317ad5)
