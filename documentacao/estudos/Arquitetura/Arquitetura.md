> Material de estudo da disciplina. Esta página não descreve a stack atual do NoFluxoUNB; a arquitetura implementada está na documentação de engenharia.

# Arquitetura de Software 

## O que é Arquitetura de Software?
A arquitetura de um sistema define seus componentes computacionais, os relacionamentos entre eles, os padrões que orientam sua composição e as restrições a serem seguidas. Envolve ainda decisões sobre a estrutura do sistema, controle, protocolos de comunicação, sincronização e acesso a dados, distribuição física dos elementos, atribuição de funcionalidades, além de aspectos como desempenho, escalabilidade e outros atributos de qualidade.

## Principais etapas do processo de arquitetura de software
**1. Definição do problema que o software deve resolver:** O arquiteto precisa compreender o contexto no qual o sistema será aplicado, a partir de uma perspectiva externa. Isso facilita a proposta da solução e a identificação das interfaces necessárias.

**2. Identificação dos componentes do sistema:** Com base no problema definido, são identificados os componentes que irão compor a arquitetura, estabelecendo a estrutura funcional do software.

**3. Descrição dos componentes e conectores em tempo de execução:** Os componentes e conectores devem ser descritos em uma configuração de execução, evidenciando como se comunicam e interagem durante a operação do sistema.

## Tipos de arquiteturas de software
O tipo ou padrão de arquitetura define as classes de elementos que podem aparecer em uma arquitetura e as regras que regem a interconexão entre estes elementos.

## Principais tipos de arquiteturas de software
### Layers (camadas)
- Cada uma das camadas tem funcionalidades específicas no software, o que traz mais flexibilidade para a aplicação. 
- Oferece maior facilidade de desenvolvimento e execução de testes, mas pode ter a escalabilidade comprometida principalmente a partir do momento em que o projeto começa a acumular uma quantidade elevada de camadas.
- Organiza o sistema em camadas hierárquicas, onde cada camada possui uma responsabilidade distinta.
- (ex: apresentação, lógica de negócio, acesso a dados). É comum em sistemas corporativos.

### Client-server (cliente-servidor)
- O processamento da informação se divide em módulos e processos distintos, combinando dados do cliente (solicita serviços) e do servidor (processa e fornece respostas).
- Um dos módulos é responsável pela manutenção da informação e o outro pela obtenção de dados.
- Amplamente usada em aplicações web e sistemas distribuídos.

### Microservices (micros serviços)
- Estrutura o sistema como um conjunto de serviços pequenos, independentes e focados em funcionalidades específicas.
- Se baseia em múltiplos serviços e componentes para desenvolver uma estrutura modular.
- Modelo preferido dos desenvolvedores e arquitetos de software, por permitir escalabilidade e independência dos módulos, que podem usar diferentes linguagens.
- Facilita a escalabilidade e o desenvolvimento independente de partes do sistema.

## Qual a relação com o desenvolvimento low-code
Os tipos de arquiteturas de software tem como principal objetivo maximizar a produtividade no desenvolvimento de softwares que entregam soluções e resolvem os mais diversos problemas.
O que está bastante alinhado ao que o low-code consegue oferecer no que diz respeito a desenvolvimento de sistemas, estabelecendo uma relação bastante favorável para iniciar um projeto partindo dos tipos de arquiteturas de software aliado ao desenvolvimento low-code.
Os avanços tecnológicos e digitais exigem cada vez mais velocidade, flexibilidade, performance e desempenho, por isso o low-code é essencial em uma arquitetura de software.

## Qual o tipo de arquitetura ideal para o projeto?
### A arquitetura Client-server é adequada para este projeto pelos seguintes motivos. 

**1. Separação de responsabilidades**: Permite uma distinção clara entre a interface do usuário (cliente) e o processamento de dados e lógica de negócio (servidor), facilitando a organização e manutenção do sistema.
  
**2. Reutilização e integração**: Possibilita que diferentes interfaces, como aplicações web ou mobile, se conectem ao mesmo servidor, promovendo a reutilização do backend e mantendo a consistência nas funcionalidades.

**3. Centralização de dados**: Todos os dados ficam armazenados no servidor, o que facilita o controle de acesso, a segurança das informações e a integridade dos dados.

**4. Uso de APIs padronizadas**: A comunicação entre cliente e servidor pode ser feita por meio de APIs RESTful, que seguem padrões amplamente utilizados, o que simplifica o desenvolvimento e favorece a interoperabilidade.

**5. Escalabilidade e flexibilidade**: Essa arquitetura permite escalar o servidor conforme a demanda do sistema aumenta, além de possibilitar adaptações futuras com maior facilidade.

![image](https://github.com/user-attachments/assets/62ccc88c-479c-47e0-a6d1-04535601036c)
- Link de referência da imagem: `https://www.simplilearn.com/what-is-client-server-architecture-article`
- Link sobre arquitetura de software: `https://www.inf.ufpr.br/andrey/ci163/IntroduzArquiteturaAl.pdf`

Por: Vitor Trancoso
