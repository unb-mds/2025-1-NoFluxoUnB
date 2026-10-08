> Material de estudo da disciplina. Esta página não descreve a stack atual do NoFluxoUNB; a arquitetura implementada está na documentação de engenharia.

# 🧠 O que é Flutter?

Flutter é um framework de desenvolvimento de aplicações criado pelo Google que permite construir **aplicativos nativos para Android, iOS, web e desktop** a partir de uma única base de código, utilizando a linguagem **Dart**.

---

## 💎 Vantagens do Flutter

- 🚀 **Desempenho Nativo**: Aplicações compiladas diretamente para código nativo.
- 🔄 **Hot Reload**: Veja alterações no código quase instantaneamente sem reiniciar o app.
- 🧩 **UI Rica e Personalizável**: Widgets altamente customizáveis e bonitos, seguindo Material Design e Cupertino.
- 📦 **Base de Código Única**: Um único projeto para Android, iOS, Web e Desktop.
- 📱 **Compatibilidade com Dispositivos Antigos**: Funciona bem mesmo em versões mais antigas dos sistemas operacionais.
- 🌐 **Comunidade Ativa e Suporte do Google**: Grande quantidade de pacotes e plugins disponíveis.
- 🧪 **Facilidade de Testes**: Suporte nativo a testes de unidade, widget e integração.

---

# 📦 Guia de Instalação do Flutter

Este guia irá te ajudar a instalar o Flutter no seu sistema (Windows, macOS ou Linux) passo a passo.

---

## 🔽 1. Baixando o Flutter

Acesse o site oficial do Flutter:  
👉 [Link oficial para download do Flutter](https://flutter.dev/docs/get-started/install)

Escolha seu sistema operacional e baixe o SDK.

---

## 📁 2. Extraia o Flutter

Extraia o arquivo `.zip` ou `.tar.xz` baixado para o local de sua preferência:

### Linux/macOS
```bash
cd ~
mkdir development
cd development
unzip ~/Downloads/flutter_linux_x.x.x-stable.zip
```

### Windows
Use o Explorer para extrair o `.zip` para `C:\src\flutter` (evite espaços no caminho).

---

## 🛣 3. Adicione o Flutter ao PATH

### Windows
1. Vá em **Painel de Controle > Sistema > Configurações Avançadas do Sistema**.
2. Clique em **Variáveis de Ambiente**.
3. Em **Variáveis de sistema**, selecione `Path` > **Editar**.
4. Adicione: `C:\src\flutter\bin`

### macOS / Linux
Adicione ao final do seu `~/.bashrc`, `~/.zshrc` ou `~/.bash_profile`:

```bash
export PATH="$PATH:$HOME/development/flutter/bin"
```

Depois, rode:

```bash
source ~/.bashrc  # ou .zshrc, dependendo do terminal
```

---

## ✅ 4. Verifique a instalação

Execute:

```bash
flutter doctor
```

Esse comando verifica se você tem os requisitos adicionais instalados e configura o ambiente.

---

## 🧩 5. Instale um Editor de Código

Recomenda-se o **Visual Studio Code** ou o **Android Studio**:

- [VS Code](https://code.visualstudio.com/)
- [Android Studio](https://developer.android.com/studio)

Instale as extensões do Flutter e Dart no editor escolhido.

---

## 📱 6. Configure um Emulador (opcional)

### Android Studio
1. Abra o Android Studio.
2. Vá em **More Actions > Virtual Device Manager**.
3. Clique em **Create Device**.
4. Selecione um modelo (Pixel, Nexus, etc).
5. Baixe uma imagem do sistema (API 30 ou superior).
6. Inicie o emulador.

---

## 🧪 7. Teste a Instalação

Crie um novo projeto de teste:

```bash
flutter create my_app
cd my_app
flutter run
```

---

## 🚀 Pronto!

Agora você está com o Flutter instalado e pronto para desenvolver seus aplicativos!

---

# 📘 Conceitos Básicos do Flutter

Explicações simples e diretas de comandos, propriedades e widgets comuns no Flutter.

---

## 🧱 `children`

- **O que é**: uma **lista de widgets** dentro de um widget pai.
- **Usado em**: `Column`, `Row`, `ListView`, etc.

```dart
Column(
  children: [
    Text('Olá'),
    Text('Mundo'),
  ],
)
```

> O `Column` contém os widgets `Text('Olá')` e `Text('Mundo')`.

---

## 🔁 `setState(() { ... })`

- **O que é**: função usada para **atualizar a interface** quando algo muda.
- **Usado em**: widgets com estado (`StatefulWidget`).

```dart
setState(() {
  contador++;
});
```

> Sempre que você quiser mudar algo na tela, use `setState`.

---

## 🧱 `Scaffold`

- **O que é**: estrutura básica de layout de um app.
- **Contém**: `AppBar`, `body`, `FloatingActionButton`, etc.

```dart
Scaffold(
  appBar: AppBar(title: Text('Título')),
  body: Center(child: Text('Conteúdo')),
)
```

---

## 🎨 `TextStyle`

- **O que é**: define o estilo de um texto.
- **Usado em**: `Text()`, dentro da propriedade `style`.

```dart
Text(
  'Oi!',
  style: TextStyle(fontSize: 24, color: Colors.red),
)
```

---

## 🔲 `Container`

- **O que é**: um "caixote" para agrupar, posicionar e estilizar widgets.
- **Pode ter**: cor, margem, padding, largura, altura, etc.

```dart
Container(
  width: 100,
  height: 100,
  color: Colors.blue,
)
```

---

## ➕ `FloatingActionButton`

- **O que é**: botão redondo flutuante, comum no canto inferior da tela.
- **Usado para**: ações principais, como adicionar algo.

```dart
FloatingActionButton(
  onPressed: () {},
  child: Icon(Icons.add),
)
```

---

## 🎯 `main()`

- **O que é**: o ponto de entrada da aplicação Flutter.

```dart
void main() {
  runApp(MyApp());
}
```

> Sempre que o app é iniciado, o Flutter executa `main()`.

---

## 🔹 `StatelessWidget`

- **O que é**: um widget **sem estado**. Seu conteúdo não muda depois que é construído.
- **Ideal para**: telas ou componentes fixos.

```dart
class MeuWidget extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Text('Olá!');
  }
}
```

---

## 🔸 `StatefulWidget`

- **O que é**: um widget **com estado**. Pode ser atualizado dinamicamente.
- **Ideal para**: interações, animações ou qualquer mudança na interface.

```dart
class MeuWidget extends StatefulWidget {
  @override
  _MeuWidgetState createState() => _MeuWidgetState();
}

class _MeuWidgetState extends State<MeuWidget> {
  int contador = 0;

  @override
  Widget build(BuildContext context) {
    return Text('$contador');
  }
}
```

---

## ↔️ `Row`

- **O que é**: organiza widgets **horizontalmente** (em linha).
- **Usa `children`** para receber os itens.

```dart
Row(
  children: [
    Icon(Icons.star),
    Text('Favorito'),
  ],
)
```

---

## ↕️ `Column`

- **O que é**: organiza widgets **verticalmente** (em coluna).

```dart
Column(
  children: [
    Text('Linha 1'),
    Text('Linha 2'),
  ],
)
```

---

## 🧱 `Padding`

- **O que é**: adiciona **espaço interno** ao redor de um widget.

```dart
Padding(
  padding: EdgeInsets.all(16.0),
  child: Text('Com espaçamento'),
)
```

---

## 🔼 `Expanded`

- **O que é**: faz um widget **ocupar o espaço restante** dentro de um `Row` ou `Column`.

```dart
Row(
  children: [
    Expanded(child: Text('Texto longo que se ajusta')),
    Icon(Icons.arrow_forward),
  ],
)
```

---

## 🌐 `Navigator`

- **O que é**: sistema de **navegação entre telas (routes)** no Flutter.
- **Usado para**: trocar de páginas (telas) no app.

```dart
Navigator.push(
  context,
  MaterialPageRoute(builder: (context) => SegundaTela()),
);
```

> Isso leva o usuário para `SegundaTela`.

---

## 🧪 `TextField`

- **O que é**: campo de entrada de texto (input).
- **Usado para**: formulários, buscas, etc.

```dart
TextField(
  decoration: InputDecoration(
    labelText: 'Digite seu nome',
  ),
)
```

---

## 🎛 `ElevatedButton`

- **O que é**: botão de ação com elevação (sombra).

```dart
ElevatedButton(
  onPressed: () {
    print('Clicado!');
  },
  child: Text('Clique aqui'),
)
```
---

## 📜 `ListView`

- **O que é**: uma lista **rolável** de widgets.
- **Usado para**: mostrar listas de itens dinamicamente ou estaticamente.

```dart
ListView(
  children: [
    ListTile(title: Text('Item 1')),
    ListTile(title: Text('Item 2')),
  ],
)
```

> Também pode ser gerada com `ListView.builder()` para listas grandes.

---

## 🧭 `AppBar`

- **O que é**: a **barra superior** da tela, usada como título ou menu.

```dart
AppBar(
  title: Text('Minha Página'),
  actions: [Icon(Icons.settings)],
)
```

---

## 🖼️ `Image`

- **O que é**: exibe uma imagem da internet ou de arquivo local.

```dart
Image.network('https://linkdaimagem.com/imagem.png')
```

Ou para assets locais:

```dart
Image.asset('assets/imagem.png')
```

> Lembre de declarar os assets no `pubspec.yaml`.

---

## 💬 `AlertDialog`

- **O que é**: uma **janela de diálogo** com mensagem e ações.

```dart
showDialog(
  context: context,
  builder: (context) => AlertDialog(
    title: Text('Atenção'),
    content: Text('Você tem certeza?'),
    actions: [
      TextButton(onPressed: () => Navigator.pop(context), child: Text('Cancelar')),
      ElevatedButton(onPressed: () => {}, child: Text('Confirmar')),
    ],
  ),
);
```

---

## 📝 `Form` + `TextFormField`

- **O que é**: estrutura para criar formulários com validação.

```dart
Form(
  key: _formKey,
  child: Column(
    children: [
      TextFormField(
        validator: (value) {
          if (value == null || value.isEmpty) {
            return 'Campo obrigatório';
          }
          return null;
        },
      ),
    ],
  ),
)
```

---

## 📋 `TextEditingController`

- **O que é**: controlador que permite acessar ou modificar o conteúdo de um `TextField`.

```dart
final controller = TextEditingController();

TextField(controller: controller)

// Pegar o valor digitado:
print(controller.text);
```

---

## 👆 `GestureDetector`

- **O que é**: detecta gestos como toques, arrastar, pressionar, etc.

```dart
GestureDetector(
  onTap: () {
    print('Toque detectado!');
  },
  child: Container(
    color: Colors.blue,
    padding: EdgeInsets.all(20),
    child: Text('Clique aqui'),
  ),
)
```
