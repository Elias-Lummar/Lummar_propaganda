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

## 🛌 Anti-hibernação (Keep-Awake) — camada dupla

TVs modernas (Tizen/WebOS com JS atualizado) hibernavam **durante as imagens**
porque a única coisa que mantinha o painel aceso era a reprodução real de
vídeo. A correção usa duas camadas:

1. **Vídeo-âncora** (`public/js/modules/keep-awake.js`): um `<video>` mudo, em
   loop, em tela cheia atrás do conteúdo, que toca **durante as imagens**.
   Para a TV é mídia ativa, então o painel não hiberna. **Funciona em HTTP
   puro — não depende de certificado.** Durante vídeos o âncora é pausado.
2. **Wake Lock API** (bônus): solicitada quando a página é aberta em **HTTPS**
   com certificado confiável. Em HTTP ela falha de forma silenciosa e o
   vídeo-âncora cobre o caso.

### Habilitar o HTTPS (para a Wake Lock)

```bash
# Gera ./certs/server.key e ./certs/server.crt (SAN: localhost + IP da LAN)
npm run gen-cert

# IP fixo ou hostname extra como SAN:
npm run gen-cert 192.168.0.50
npm run gen-cert signage.lummar.local
```

O servidor passa a ouvir **HTTP (3010) e HTTPS (3443) ao mesmo tempo**, sem
redirect. Abra os apresentadores por `https://IP:3443/presenter` para ativar
a Wake Lock. As TVs continuam funcionando por HTTP normalmente.

> ⚠️ **Smart TV nativa (Tizen/WebOS) costuma recusar certificado self-signed**
> e não permite instalar CA própria. Nesses casos use HTTP (o vídeo-âncora
> mantém a tela acesa) ou o caminho de **certificado real** abaixo.

### Caminho do certificado real (para HTTPS confiável na smart TV)

1. Subdomínio próprio, ex.: `signage.plasticoslummar.com.br`.
2. Certificado **Let's Encrypt via desafio DNS-01** (o servidor é LAN, sem 443
   público) + renovação automática.
3. **DNS interno** resolvendo esse subdomínio para o IP da LAN (no roteador ou
   num Pi-hole/dnsmasq, distribuído por DHCP) — TVs não permitem editar
   "hosts" local.
4. Aponte `./certs/server.crt` e `./certs/server.key` para o cert emitido.

## 🚀 Deploy

Para produção, considere:
- Usar variáveis de ambiente para configurações
- Implementar HTTPS
- Configurar proxy reverso (nginx)
- Backup regular do banco de dados
- Monitoramento de logs