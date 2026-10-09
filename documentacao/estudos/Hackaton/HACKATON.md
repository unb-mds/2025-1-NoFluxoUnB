> Material de estudo da disciplina. Esta página não descreve a stack atual do NoFluxoUNB; a arquitetura implementada está na documentação de engenharia.

# Sistema de Recomendação de Disciplinas da UnB

## 🎯 Objetivo
Sistema que recomenda disciplinas para alunos da UnB usando IA, baseado no curso e área de interesse.

## 📐 Arquitetura do Sistema

![Diagrama da Arquitetura](../../../assets/diagrama.jpeg)

### Fluxo de Dados:
1. **Raspagem**: Coleta dados de disciplinas e cursos do SIGAA
2. **Armazenamento**: Dados são salvos no Amazon S3
3. **Interface**: Aluno interage via Streamlit
4. **Processamento**: 
   - Guardrails processa requisições com multi-agent
   - Knowledge base fornece contexto para recomendações
5. **Resposta**: Sistema retorna recomendações personalizadas

## 💻 Principais Componentes

### 1. Web Scraping
- Coleta dados de cursos e disciplinas do SIGAA
- Extrai ementas, pré-requisitos e informações das turmas
- Salva em arquivos JSON/CSV

### 2. Interface (Streamlit)
- Dashboard com mapa dos campi
- Formulário para curso e área de interesse
- Visualização de recomendações

### 3. IA (AWS Bedrock)
- Gera recomendações personalizadas
- Fornece descrições detalhadas das disciplinas
- Analisa perfil do aluno

## 🔧 Principais Funções

### Web Scraping
```python
def coleta_dados(session, component_id, viewstate, base_url, debug):
    # Coleta detalhes de um componente curricular
    # Retorna: ementa, pré-requisitos, carga horária
```

```python
def get_department_disciplines(session, unidade_id, unidade_nome):
    # Busca todas as disciplinas de um departamento
    # Retorna: lista de disciplinas com seus detalhes
```

### Interface
```python
def extract_disciplinas(text):
    # Extrai nomes de disciplinas do texto gerado pela IA
    # Retorna: lista de disciplinas formatadas
```

### Bedrock Agent
```python
def get_recommendations(curso, area_interesse):
    # Gera recomendações usando IA
    # Retorna: lista de disciplinas recomendadas
```

```python
def disciplina_description(materia):
    # Obtém descrição detalhada de uma disciplina
    # Retorna: informações sobre a disciplina
```

## ⚙️ Configuração Rápida

1. Instale as dependências:
```bash
pip install -r requirements.txt
```

2. Configure o arquivo `.env`:
```env
AWS_DEFAULT_REGION=us-east-1
AWS_ACCESS_KEY_ID=sua_access_key
AWS_SECRET_ACCESS_KEY=sua_secret_key
BEDROCK_AGENT_ID=seu_agent_id
BEDROCK_AGENT_ALIAS_ID=seu_alias_id
```

3. Execute:
```bash
streamlit run app.py
```

## 📊 Fluxo Principal

1. Aluno seleciona curso e área de interesse
2. Sistema consulta dados do SIGAA
3. Bedrock gera recomendações personalizadas
4. Interface exibe resultados e detalhes

## 🔒 Pontos Importantes

- Credenciais AWS devem ser mantidas seguras
- Dados são atualizados periodicamente
- Recomendações são geradas por IA
- Interface é intuitiva e responsiva

## 🚀 Próximos Passos
- Cache de recomendações
- Histórico de consultas
- Planejamento de grade 