# Cynthia — opiniões sobre lugares

Cynthia é uma aplicação Angular e ASP.NET Core para publicar opiniões, descobrir locais cadastrados pela comunidade e encontrar lugares próximos em um mapa OpenStreetMap/Leaflet. O PostgreSQL persiste contas, locais, opiniões e interações.

> Esta é uma primeira versão funcional. Recursos ainda pendentes estão listados em **Limitações conhecidas**.

## Tecnologias

- Angular 20, TypeScript, Router, Reactive Forms, HttpClient e Leaflet.
- ASP.NET Core 10 Web API, ASP.NET Core Identity, JWT e Entity Framework Core 10.
- PostgreSQL 17 e Docker Compose.
- Mailpit para e-mail local de confirmação e recuperação.

## Pré-requisitos

- .NET SDK 10.
- Docker Desktop instalado e iniciado (Docker Compose v2).
- Node.js 20.19+ (ou 22.12+); Node 24 também é compatível para o front-end.

## Iniciar a API com um único comando

No PowerShell, na pasta raiz do projeto:

```powershell
dotnet run --project .\src\OpinionApp.Api\OpinionApp.Api.csproj
```

Na primeira execução, o Docker pode baixar as imagens do PostgreSQL e Mailpit. Em modo Development, a API inicia esses serviços automaticamente, aguarda o banco, aplica as migrations e sobe o servidor. Não é necessário configurar variáveis ou executar comandos `docker`, `dotnet ef`, nem gerar segredos manualmente.

O processo gera e persiste a chave local do JWT em `%LOCALAPPDATA%\Cynthia`, fora do repositório. A credencial fixa do banco Compose é **somente para desenvolvimento local** e não deve ser reutilizada em produção. Se o Docker Desktop não estiver iniciado, o comando informa que é necessário iniciá-lo.

- API: <http://localhost:5140>
- Swagger: <http://localhost:5140/swagger>
- Saúde (confirma conexão com o banco): <http://localhost:5140/health>
- Mailpit (caixa de entrada local): <http://localhost:8025>

Mantenha a janela da API aberta. Para parar a API, pressione `Ctrl+C`. Os dados do PostgreSQL permanecem no volume Docker entre execuções.

### Usar PostgreSQL do Supabase no desenvolvimento

As chaves `sb_publishable_...` e `sb_secret_...` são chaves da API do Supabase, não credenciais PostgreSQL. A API Cynthia conecta diretamente ao banco usando Npgsql. Edite `src/OpinionApp.Api/appsettings.Local.json` e substitua os dados de exemplo pelos valores exibidos em **Connect** no painel do Supabase:

```json
{
  "ConnectionStrings": {
    "Default": "Host=SEU_HOST;Port=5432;Database=postgres;Username=SEU_USUARIO;Password=SUA_SENHA_DO_BANCO;SSL Mode=Require;Trust Server Certificate=true"
  }
}
```

Esse arquivo é local e está ignorado pelo Git. Não o adicione ao repositório nem compartilhe a senha. Depois, inicie normalmente com `dotnet run --project .\src\OpinionApp.Api\OpinionApp.Api.csproj`. Quando a connection string aponta para um host remoto, a API não inicia PostgreSQL via Docker e aplica as migrations ao iniciar. Para voltar ao banco local, remova ou renomeie `appsettings.Local.json`.

Não use a `sb_secret` como senha do banco nem a publique no front-end. Se uma senha do banco ou chave secreta foi compartilhada, redefina-a no painel do Supabase e atualize o arquivo local. Se o hostname não resolver, confira se copiou exatamente o endereço exibido no painel; em redes IPv4, tente o host e as credenciais de **Session pooler**.

## Publicar a API no Render com Docker

Crie um **Web Service** conectado ao repositório e selecione **Docker**. Deixe **Root Directory** em branco para que o Render encontre o `Dockerfile` na raiz. O Dockerfile compila e publica a API ASP.NET Core 10 e escuta na porta fornecida pelo Render.

Configure no painel do serviço, em **Environment**, os valores abaixo usando a connection string PostgreSQL exibida pelo Supabase e os segredos de produção:

| Variável | Valor |
| --- | --- |
| `ConnectionStrings__Default` | Connection string PostgreSQL do Supabase (host, porta, usuário, senha e SSL) |
| `Jwt__SigningKey` | Segredo aleatório de pelo menos 32 bytes |
| `Jwt__Issuer` | `Cynthia` |
| `Jwt__Audience` | `Cynthia.Web` |
| `Frontend__BaseUrl` | URL pública do front-end |
| `Cors__AllowedOrigins__0` | Origem pública do front-end, sem barra final |
| `Email__Host`, `Email__Port`, `Email__From` | SMTP de produção para confirmação e recuperação de conta |
| `Email__Username`, `Email__Password` | Credenciais SMTP, se exigidas pelo provedor |
| `Email__EnableSsl` | `true` quando exigido pelo provedor SMTP |
| `SupabaseStorage__Endpoint`, `SupabaseStorage__Bucket`, `SupabaseStorage__Region` | Endpoint S3, bucket público e região do projeto Supabase |
| `SupabaseStorage__AccessKey`, `SupabaseStorage__SecretKey` | Credenciais S3 armazenadas somente como segredos do serviço |

Não configure `sb_secret` como senha do PostgreSQL. O Render injeta `PORT`; o container usa essa porta automaticamente. Em Production, a API não tenta iniciar Docker Compose e executa as migrations na inicialização. Publique o front-end separadamente e configure a URL da API nele.

### Usar armazenamento S3 do Supabase para fotos

O feed e as fotos de perfil usam o serviço S3-compatible do Supabase quando a API recebe a configuração completa abaixo. O bucket `Cynthia` precisa existir e estar configurado como **público** para que as imagens das publicações sejam exibidas diretamente no feed. A API mantém a chave secreta no servidor; nunca configure essas credenciais no Angular, em `web/public/config.js` ou em qualquer JSON enviado ao navegador.

Para desenvolvimento, adicione os valores atuais (depois de rotacionar qualquer chave que já tenha sido compartilhada) em `src/OpinionApp.Api/appsettings.Local.json`, arquivo já ignorado pelo Git:

```json
{
  "SupabaseStorage": {
    "Endpoint": "https://qqengbaunxelnffazspx.storage.supabase.co/storage/v1/s3",
    "Bucket": "Cynthia",
    "Region": "REGIAO_DO_PROJETO",
    "AccessKey": "SUA_NOVA_ACCESS_KEY",
    "SecretKey": "SUA_NOVA_SECRET_KEY"
  }
}
```

Substitua `REGIAO_DO_PROJETO` pela região indicada nas configurações do seu projeto Supabase. Em produção, configure `SupabaseStorage__Endpoint`, `SupabaseStorage__Bucket`, `SupabaseStorage__Region`, `SupabaseStorage__AccessKey` e `SupabaseStorage__SecretKey` como variáveis de ambiente/segredos do serviço. Se a configuração S3 não for informada, a API continua usando o armazenamento local de desenvolvimento. A API aplica a migration de imagem automaticamente ao iniciar.

No compositor do feed, escolha uma imagem JPEG, PNG ou WebP de até 5 MB; ela será enviada à API junto com a publicação e armazenada no bucket. O endereço público da foto é salvo com a publicação e retornado no feed.

## Iniciar o front-end

Em outro PowerShell:

```powershell
Set-Location .\web
npm.cmd install
npm.cmd start
```

Abra <http://localhost:4200>. O cliente Angular pode continuar sendo iniciado separadamente; a API sobe suas dependências locais por conta própria. O endereço da API está em [config.js](web/public/config.js). Para outra hospedagem, altere esse endereço antes de publicar (não coloque segredos no arquivo).

## Cadastro e fotos de perfil

O formulário de cadastro solicita nome de usuário, data de nascimento (`dd/mm/aaaa`), e-mail, senha e confirmação da senha. A data é validada e permanece privada. A foto é opcional: JPEG, PNG ou WebP até 5 MB. Após selecionar um arquivo, a tela exibe uma prévia retangular; a imagem é validada no servidor e armazenada fora da pasta pública. Fotos também podem ser alteradas em **Perfil e configurações**.

Sem configuração do Supabase S3, as fotos locais ficam em `src/OpinionApp.Api/App_Data` (ignorada pelo Git). Esse armazenamento local é adequado para desenvolvimento; em produção, configure o armazenamento de objetos acima.

## Fluxo para testar

1. Crie uma conta; opcionalmente, selecione uma foto e confira a prévia retangular.
2. Use senha de pelo menos 10 caracteres, com maiúscula, minúscula, número e símbolo; confirme a senha e informe nascimento no formato indicado.
3. Abra Mailpit em <http://localhost:8025> e confirme o e-mail.
4. Entre, publique uma opinião, associe um local e use as curtidas/comentários.
5. Abra o mapa para permitir a localização ou pesquisar/navegar manualmente; locais persistidos aparecem para outras contas.
6. Para cadastrar um local, selecione **Cadastrar local**, ajuste o marcador no mapa e salve.

## Configuração de produção

Em produção, configure secrets no provedor (não em arquivos versionados):

| Variável | Uso |
| --- | --- |
| `ConnectionStrings__Default` | Connection string PostgreSQL |
| `Jwt__SigningKey` | Segredo aleatório de pelo menos 32 bytes |
| `Jwt__Issuer`, `Jwt__Audience` | Emissor e audiência do access token |
| `Jwt__AccessTokenMinutes` | Validade do access token (padrão: 15 minutos) |
| `Email__Host`, `Email__Port`, `Email__Username`, `Email__Password` | SMTP |
| `Email__EnableSsl`, `Email__From` | TLS e endereço remetente |
| `Frontend__BaseUrl` | Base para links de confirmação e recuperação |
| `Cors__AllowedOrigins__0` | Origem Angular permitida |

O [.env.example](.env.example) contém nomes de configuração sem segredos. Nunca registre senhas, refresh tokens ou códigos de confirmação nos logs. Em produção, use HTTPS, segredos gerenciados e um banco com backup.

## Migrations, build e testes

As migrations existentes são aplicadas automaticamente pelo `dotnet run` em Development. Para adicionar uma nova migration, instale `dotnet-ef` 10 (`dotnet tool install --global dotnet-ef --version 10.0.12`) e execute a ferramenta quando precisar atualizar o schema:

```powershell
dotnet ef migrations add NomeDaMigration --project .\src\OpinionApp.Infrastructure --startup-project .\src\OpinionApp.Api
dotnet build .\OpinionApp.slnx
dotnet test .\OpinionApp.slnx
Set-Location .\web
npm.cmd run build
npm.cmd test -- --watch=false --browsers=ChromeHeadless
```

As migrations versionadas ficam em `src/OpinionApp.Infrastructure/Persistence/Migrations`.

## Endpoints principais

- Autenticação: `POST /api/auth/register`, `login`, `session`, `confirm-email`, `resend-confirmation`, `refresh`, `logout`, `forgot-password`, `reset-password`.
- Usuários: `GET/PUT /api/users/me`, `POST /api/users/me/profile-photo`, `GET /api/users/search`, `GET /api/users/{id}`, `GET /api/users/{id}/posts`.
- Publicações: `GET /api/posts`, `GET/POST /api/posts/{id}`, `PUT/DELETE /api/posts/{id}`, `PUT/DELETE /api/posts/{id}/like`, `GET/POST /api/posts/{id}/comments`.
- Locais: `GET /api/places`, `GET /api/places/{id}`, `GET /api/places/{id}/posts`, `GET /api/places/search?q=...`, `GET /api/places/nearby?latitude=...&longitude=...&radiusMeters=...`, `POST /api/places`.
- Saúde: `GET /health`.

Feed e buscas são paginados. A API utiliza validações, DTOs, Problem Details, autorização por autor e exclusão lógica de opiniões/comentários.

## Segurança e privacidade

- Identity aplica hash de senhas, confirmação obrigatória de e-mail, regras de senha e bloqueio após falhas de login.
- JWT de curta duração; refresh token aleatório em cookie `HttpOnly`/`SameSite=Strict`, armazenado como hash e rotacionado/revogado. O access token é mantido somente em memória no navegador.
- CORS restrito, rate limit nos endpoints de autenticação e cabeçalhos básicos de segurança.
- A data de nascimento não é incluída nos perfis públicos. Imagens passam por checagem de assinatura real, formato e limite de tamanho.
- O mapa pede permissão de localização ao abri-lo, mas não salva nem compartilha a posição do usuário.
- Opiniões são renderizadas como texto, não como HTML.

Em implantação, mantenha API e front-end em domínios compatíveis com o cookie `SameSite=Strict`. Domínios de sites diferentes requerem estratégia CSRF explícita e configuração de cookies/CORS revisada.

## Mapas e implantação gratuita

- Tiles OpenStreetMap são públicos, exibem atribuição e não oferecem SLA para tráfego intenso. Respeite a política de uso; migre para um provedor de tiles se necessário.
- A busca geográfica não exige serviço pago: pré-filtra latitude/longitude no PostgreSQL e calcula distância Haversine no servidor. Sem PostGIS, o raio máximo é 50 km e o resultado é limitado.
- O mapa não usa geocodificação externa nesta versão.
- Para implantação, o Angular pode ser servido em Cloudflare Pages, a API em um host de contêiner e o banco em PostgreSQL gerenciado. Planos gratuitos podem impor suspensão por inatividade, quotas, limites ou expiração; verifique termos atuais, mantenha backups e prepare migração.
- SMTP local é Mailpit. Para produção, configure SMTP por variáveis de ambiente e verifique limites/termos do provedor.

## Limitações conhecidas

- Ainda não há edição/exclusão de locais, alteração de senha na sessão, denúncias, moderação ou administração.
- Falta front-end para perfil público, busca de usuários e páginas dedicadas de detalhes de opinião/local.
- Comentários podem ser criados/listados, mas ainda não editados/excluídos.
- Não há média de notas: a primeira versão prioriza opiniões textuais.
- Parte das consultas/regras ainda reside nos controllers; os contratos e camadas existentes podem ser evoluídos para serviços e repositórios específicos.
- Os testes cobrem cálculo geográfico e autenticação no cliente; ainda faltam testes de integração abrangentes com PostgreSQL/Identity e fluxos completos do mapa/feed.
- `npm audit --omit=dev` não apontou vulnerabilidades de produção. A auditoria total relata alertas altos em dependências de desenvolvimento transitivas do Karma/Chokidar/Braces; a sugestão automática requer downgrade incompatível do Karma.
