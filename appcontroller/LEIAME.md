# Gerador de comando AppController

Site estático (HTML/CSS/JS puro, sem build). Para publicar, copie `index.html`, `style.css`, `app.js` e a pasta `launcher/` para o servidor web.

Gera: `"<Diretório AppController.exe>" -h <Host> -u <Usuário> -p <Senha>`

Comando manual: Copiar comando, Win+R (Executar do Windows), Ctrl+V e Enter.

- Gerar comando / Executar só ficam ativos com os 4 campos obrigatórios preenchidos.
- Clientes ficam salvos no navegador (localStorage), inclusive incompletos. No Chrome/Edge, "Criar arquivo da lista" vincula um .json no computador (ex.: `C:\FerramentasDev\clientes-tcloud.json`): a partir daí salvar/excluir gravam no arquivo e a página carrega dele automaticamente. Exportar/Importar .json continuam disponíveis. A senha fica salva em texto puro.
- Executar direto (seção 2 do site): rode uma vez o `instalar-launcher.cmd` de `launcher/AppControllerLauncher.zip` (registra o protocolo `appcontroller:` só para o usuário atual, sem admin) e clique em "Já instalei". O site mostra o passo a passo. O launcher só executa arquivos chamados `AppController.exe` que existam no disco.
- Alternativa sem instalar nada: Baixar .bat (duplo clique abre a conexão).
