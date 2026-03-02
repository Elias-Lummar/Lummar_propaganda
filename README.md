# Sistema de Gerenciamento de Propagandas

Um sistema web completo para gerenciamento e exibição de propagandas com backend Node.js + Express e banco de dados SQLite.

## 🚀 Funcionalidades

### Painel Administrativo (`/admin`)
- ✅ Cadastro de propagandas com upload de imagens/vídeos
- ✅ Agendamento com data/hora de início e fim
- ✅ Configuração de efeitos de transição (fade, slide, smoke, blink)
- ✅ Listagem com status das propagandas (ativa, agendada, expirada)
- ✅ Edição e exclusão de propagandas
- ✅ Interface responsiva com Bootstrap

### Página de Apresentação (`/presenter`)
- ✅ Exibição automática de propagandas ativas
- ✅ Suporte a imagens e vídeos
- ✅ Efeitos de transição personalizáveis
- ✅ Modo tela cheia para TVs
- ✅ Controles ocultos (aparecem no hover)
- ✅ Atualização automática a cada 5 minutos

### Backend
- ✅ API REST com Express.js
- ✅ Banco de dados SQLite
- ✅ Upload de arquivos com Multer
- ✅ Validação de tipos de arquivo
- ✅ Gerenciamento automático de arquivos

## 🛠️ Instalação e Execução

```bash
# Instalar dependências
npm install

# Iniciar o servidor
npm start
```

O sistema estará disponível em:
- **Painel Admin**: http://localhost:3000/admin
- **Apresentação**: http://localhost:3000/presenter

## 📁 Estrutura do Projeto

```
/
├── server.js              # Servidor principal Express
├── package.json           # Dependências e scripts
├── db/
│   ├── database.js        # Configuração SQLite
│   └── advertisements.db  # Banco de dados (criado automaticamente)
├── public/
│   ├── admin.html         # Interface administrativa
│   ├── presenter.html     # Página de apresentação
│   ├── css/
│   │   ├── admin.css      # Estilos do admin
│   │   └── presenter.css  # Estilos da apresentação
│   ├── js/
│   │   ├── admin.js       # Funcionalidades do admin
│   │   └── presenter.js   # Funcionalidades da apresentação
│   └── uploads/           # Arquivos enviados
└── README.md
```

## 🎨 Efeitos de Transição

- **Fade**: Transição suave de opacidade
- **Slide**: Entrada pela lateral esquerda
- **Smoke**: Efeito de desfoque suave
- **Blink**: Troca direta sem animação

## 📊 Banco de Dados

Tabela `ads`:
- `id` - Chave primária (autoincremento)
- `title` - Título da propaganda
- `file_path` - Caminho do arquivo
- `start_time` - Data/hora de início
- `end_time` - Data/hora de fim
- `transition_type` - Tipo de transição
- `transition_duration` - Duração da transição (segundos)

## 🎯 API Endpoints

- `GET /api/ads` - Listar todas as propagandas
- `GET /api/ads/active` - Listar propagandas ativas
- `POST /api/ads` - Criar nova propaganda
- `PUT /api/ads/:id` - Atualizar propaganda
- `DELETE /api/ads/:id` - Excluir propaganda
- `POST /api/upload` - Upload de arquivo

## 🖥️ Uso para TV

1. Abra `/presenter` no navegador da TV
2. Pressione `F` para tela cheia
3. O sistema rodará automaticamente
4. Controles disponíveis:
   - `F` - Alternar tela cheia
   - `Espaço` - Play/Pause
   - `Setas` - Navegar manualmente
   - `ESC` - Sair da tela cheia

## 📱 Responsividade

- Interface administrativa totalmente responsiva
- Otimizada para tablets e smartphones
- Página de apresentação otimizada para telas grandes

## 🔧 Tecnologias Utilizadas

- **Backend**: Node.js, Express.js
- **Banco**: SQLite3
- **Frontend**: HTML5, CSS3, JavaScript ES6+
- **UI**: Bootstrap 5, Font Awesome
- **Upload**: Multer
- **CORS**: Habilitado para desenvolvimento

## 📝 Notas Técnicas

- Suporte a arquivos até 100MB
- Formatos aceitos: JPG, PNG, GIF, MP4, AVI, MOV, WEBM
- Atualização automática das propagandas ativas
- Limpeza automática de arquivos ao excluir propagandas
- Validação de datas e horários
- Tratamento de erros robusto

## 🚀 Deploy

Para produção, considere:
- Usar variáveis de ambiente para configurações
- Implementar HTTPS
- Configurar proxy reverso (nginx)
- Backup regular do banco de dados
- Monitoramento de logs