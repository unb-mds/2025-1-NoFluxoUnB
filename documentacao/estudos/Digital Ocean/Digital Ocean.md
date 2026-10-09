> Material de estudo da disciplina. Esta página não descreve a stack atual do NoFluxoUNB; a arquitetura implementada está na documentação de engenharia.

# DigitalOcean: Hospedagem de Backend e App Platform

## Índice
- [O que é a DigitalOcean?](#🌐-o-que-é-a-digitalocean)
- [Hospedagem de Backend](#💾-hospedagem-de-backend)
- [App Platform](#🚀-app-platform-o-que-é)
  - [Recursos da App Platform](#🛠️-principais-recursos-da-app-platform)
  - [Como funciona](#⚙️-como-a-app-platform-funciona)
  - [Imagem ilustrativa](#🖼️-ilustração-de-como-a-app-platform-funciona)
- [Vantagens](#✅-vantagens)
- [Conclusão](#📌-conclusão)

## 🌐 O que é a DigitalOcean?

A **DigitalOcean** é uma provedora de serviços em nuvem voltada principalmente para desenvolvedores, startups e pequenas empresas. Ela oferece soluções simples e acessíveis para o desenvolvimento, implantação e escalabilidade de aplicações web e backend.

## 💾 Hospedagem de Backend

A DigitalOcean oferece várias formas de hospedar backends, como:

- **Droplets**: Servidores virtuais (VMs) que podem ser usados para rodar aplicações, bancos de dados, APIs, entre outros.
- **Managed Databases**: Serviços gerenciados para bancos de dados como PostgreSQL, MySQL e Redis.
- **Kubernetes**: Plataforma gerenciada para orquestração de contêineres.
- **Spaces e Volumes**: Armazenamento em nuvem para arquivos e dados persistentes.

Esses recursos permitem que desenvolvedores tenham controle total sobre sua infraestrutura backend.

## 🚀 App Platform: O que é?

A **App Platform** é a plataforma de desenvolvimento como serviço (**PaaS**) da DigitalOcean. Ela permite que você implemente e escale aplicações web e APIs com facilidade.

### 🛠️ Principais recursos da App Platform:

- **Deploy automático via GitHub, GitLab ou diretório local**.
- **Suporte a várias linguagens**: Node.js, Python, PHP, Go, Ruby e mais.
- **Deploy de aplicações estáticas e dinâmicas**.
- **SSL automático e integração com domínios personalizados**.
- **Escalabilidade automática vertical e horizontal**.
- **Ambientes de preview para pull requests**.

### ⚙️ Como a App Platform funciona

A **App Platform** da DigitalOcean automatiza todo o processo de deploy de uma aplicação a partir do seu código-fonte. O fluxo básico funciona assim:

1. **Fonte do código**  
   Você conecta seu repositório do **GitHub**, **GitLab** ou faz upload do código manualmente.

2. **Deploy automático**  
   A App Platform detecta a linguagem e as dependências da aplicação e configura o ambiente automaticamente.

3. **Build da aplicação**  
   Ela executa o processo de build com base no seu `package.json` ou outras convenções padrão (dependendo da linguagem/framework).

4. **Publicação**  
   Após o build, a aplicação é automaticamente publicada e disponibilizada em um domínio da DigitalOcean (ou um domínio personalizado seu).

5. **Escalabilidade**  
   Você pode configurar escalonamento automático vertical (recursos) e horizontal (instâncias) com base na demanda.

6. **Atualizações contínuas**  
   Sempre que você fizer push no repositório (ou abrir um pull request, se configurado), a App Platform pode redeployar automaticamente a nova versão.

### 🖼️ Ilustração de como a App Platform funciona:

![Infraestrutura de um aplicativo implantado na App Platform](https://docs.digitalocean.com/screenshots/app-platform/infra-diagram_app.9cf59db2eda87b7582134267b38f45941646dd8a2534dfedefb3c6bcf7f446a7.png)

> Fonte: [Documentação oficial da DigitalOcean](https://docs.digitalocean.com/products/app-platform/details/intro-faq/)

## ✅ Vantagens

- Interface simples e amigável.
- Custos acessíveis e previsíveis.
- Ideal para startups, MVPs e projetos em crescimento.
- Infraestrutura confiável e escalável.

## 📌 Conclusão

A DigitalOcean oferece uma solução robusta e acessível para hospedagem de aplicações backend. Com a **App Platform**, desenvolvedores podem focar mais no código e menos na infraestrutura, aproveitando uma plataforma moderna e automatizada para implantar e gerenciar seus projetos com eficiência.