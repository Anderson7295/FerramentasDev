# Instaladores .exe (Go)

- `cmd/appcontroller` → AppControllerLauncher.exe (Gerador de comando AppController)
- `cmd/agente` → FerramentasDevAgente.exe (agente local do Gerador de branches, porta 47615)

Compilar (em qualquer sistema com Go 1.26+):

    GOOS=windows GOARCH=amd64 go build -trimpath -ldflags "-s -w -H windowsgui" -o AppControllerLauncher.exe ./cmd/appcontroller
    GOOS=windows GOARCH=amd64 go build -trimpath -ldflags "-s -w -H windowsgui" -o FerramentasDevAgente.exe ./cmd/agente

Duplo clique instala para o usuário atual (sem admin); um segundo duplo clique oferece atualizar ou desinstalar.
