// FerramentasDevAgente.exe — Agente local do Gerador de branches (http://localhost:47615)
//   - duplo clique: instala (ou atualiza/desinstala) para o usuário atual e inicia o agente
//   - --servir (ou chamado pelo protocolo ferramentasdev-agente:): roda o servidor local
//
// Só atende sites autorizados pelo usuário e só executa git e pman.
package main

import (
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"ferramentasdev/comum"
)

const (
	titulo    = "Agente Ferramentas Dev"
	nomeExe   = "FerramentasDevAgente.exe"
	protocolo = "ferramentasdev-agente"
	nomeRun   = "FerramentasDevAgente"
	Porta     = 47615
	Versao    = "2.2"
)

func pasta() string   { return comum.PastaApp("FerramentasDevAgente") }
func destino() string { return filepath.Join(pasta(), nomeExe) }

func main() {
	args := os.Args[1:]
	a := ""
	if len(args) > 0 {
		a = strings.ToLower(args[0])
	}
	switch {
	case a == "--servir" || strings.HasPrefix(a, protocolo+":"):
		servir()
	case a == "--desinstalar":
		desinstalar()
	case a == "--instalar":
		instalar(false)
	default:
		instalar(true)
	}
}

func instalar(perguntar bool) {
	jaInstalado := false
	if _, err := os.Stat(destino()); err == nil {
		jaInstalado = true
	}
	if perguntar && jaInstalado {
		r := comum.Caixa(titulo, "O agente já está instalado neste computador.\n\nSim: reinstalar / atualizar\nNão: desinstalar\nCancelar: sair", comum.MB_YESNOCANCEL|comum.MB_ICONQUESTION)
		if r == comum.IDNO {
			desinstalar()
			return
		}
		if r != comum.IDYES {
			return
		}
	}
	comum.EncerrarOutros(nomeExe)
	time.Sleep(700 * time.Millisecond)
	if err := comum.CopiarPara(destino()); err != nil {
		comum.Erro(titulo, "Não foi possível copiar o agente para\n"+destino()+"\n\n"+err.Error())
		os.Exit(1)
	}
	cmd := `"` + destino() + `" --servir`
	if err := comum.DefinirInicioAutomatico(nomeRun, cmd); err != nil {
		comum.Erro(titulo, "Não foi possível configurar o início automático:\n"+err.Error())
	}
	if err := comum.RegistrarProtocolo(protocolo, "URL:Agente Ferramentas Dev", cmd); err != nil {
		comum.Erro(titulo, "Não foi possível registrar o protocolo:\n"+err.Error())
	}
	os.Remove(filepath.Join(pasta(), "agente-ferramentasdev.ps1")) // sobra da versão PowerShell
	// O agente nunca deve rodar como administrador: as pastas clonadas ficariam com
	// dono "Administradores" e o git/TortoiseGit recusaria o commit.
	var errIni error
	if comum.Elevado() {
		errIni = comum.AbrirComoUsuario(protocolo + ":iniciar")
	} else {
		errIni = comum.IniciarDesacoplado(destino(), "--servir")
	}
	if errIni != nil {
		comum.Erro(titulo, "Agente instalado, mas não foi possível iniciá-lo:\n"+errIni.Error())
		os.Exit(1)
	}
	if !aguardarAgente(10 * time.Second) {
		comum.Erro(titulo, fmt.Sprintf("Agente instalado em\n%s\n\nmas ele não respondeu na porta %d. Verifique se outro programa usa essa porta ou se o antivírus bloqueou o agente.", pasta(), Porta))
		os.Exit(1)
	}
	if agenteElevado() {
		comum.Erro(titulo, "O agente que está rodando foi aberto como administrador, e assim as pastas clonadas ficam com outro dono e o commit falha.\n\nReinicie o computador (o agente volta sozinho, sem administrador) ou execute este instalador de novo com \"Executar como administrador\" para trocar o agente.")
		os.Exit(1)
	}
	comum.Info(titulo, fmt.Sprintf("Pronto! O agente foi instalado e está em execução (porta %d).\nEle inicia sozinho junto com o Windows.\n\nVolte ao site e clique em \"Verificar de novo\".", Porta))
}

func aguardarAgente(lim time.Duration) bool {
	cli := http.Client{Timeout: time.Second}
	fim := time.Now().Add(lim)
	for time.Now().Before(fim) {
		if r, err := cli.Get(fmt.Sprintf("http://127.0.0.1:%d/status", Porta)); err == nil {
			r.Body.Close()
			return r.StatusCode == 200
		}
		time.Sleep(300 * time.Millisecond)
	}
	return false
}

func agenteElevado() bool {
	cli := http.Client{Timeout: 2 * time.Second}
	r, err := cli.Get(fmt.Sprintf("http://127.0.0.1:%d/status", Porta))
	if err != nil {
		return false
	}
	defer r.Body.Close()
	var s struct{ Elevado bool }
	json.NewDecoder(r.Body).Decode(&s)
	return s.Elevado
}

func desinstalar() {
	comum.EncerrarOutros(nomeExe)
	comum.RemoverInicioAutomatico(nomeRun)
	comum.RemoverProtocolo(protocolo)
	comum.ApagarPastaDepois(pasta())
	comum.Info(titulo, "Agente removido deste computador.")
}

func servir() {
	os.MkdirAll(pasta(), 0o755)
	l4, err := net.Listen("tcp", fmt.Sprintf("127.0.0.1:%d", Porta))
	if err != nil {
		// Já existe uma instância rodando (ou a porta está ocupada): sai em silêncio.
		Log(fmt.Sprintf("Não foi possível abrir a porta %d: %v", Porta, err))
		return
	}
	Log("Agente iniciado na porta " + fmt.Sprint(Porta) + " (v" + Versao + ")")
	srv := &http.Server{Handler: http.HandlerFunc(Tratar)}
	if l6, err := net.Listen("tcp", fmt.Sprintf("[::1]:%d", Porta)); err == nil {
		go srv.Serve(l6)
	}
	srv.Serve(l4)
}
