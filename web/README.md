# Cliente Angular

Cliente Angular da aplicação **Cynthia**. Para configuração local, execução da API/banco, testes, implantação e limitações conhecidas, consulte o [README principal](../README.md).

Com a API local iniciada em `http://localhost:5140`, execute:

```powershell
npm.cmd install
npm.cmd start
```

O endereço da API para desenvolvimento está em `public/config.js`. Em produção, configure ali a URL pública da API antes de publicar o site estático.

Para validar o cliente:

```powershell
npm.cmd run build
npm.cmd test -- --watch=false --browsers=ChromeHeadless
```
