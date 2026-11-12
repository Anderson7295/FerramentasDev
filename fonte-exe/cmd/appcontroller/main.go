// AppControllerLauncher.exe
//   - duplo clique: instala (ou atualiza/desinstala) o protocolo appcontroller: para o usuário atual
//   - chamado pelo navegador com "appcontroller:?exe=...&h=...&u=...&p=...": abre o AppController.exe
package main

import (
	"fmt"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"ferramentasdev/comum"
)

const (
	titulo    = "AppController Launcher"
	protocolo = "appcontroller"
	nomeExe   = "AppControllerLauncher.exe"
)

func pasta() string   { return comum.PastaApp("AppControllerLauncher") }
func destino() string { return filepath.Join(pasta(), nomeExe) }

func main() {
	args := os.Args[1:]
	switch {
	case len(args) > 0 && strings.HasPrefix(strings.ToLower(args[0]), protocolo+":"):
		if err := abrir(args[0]); err != nil {
			comum.Erro(titulo, err.Error())
			os.Exit(1)
		}
	case len(args) > 0 && strings.EqualFold(args[0], "--desinstalar"):
		desinstalar()
	case len(args) > 0 && strings.EqualFold(args[0], "--instalar"):
		instalar(false)
	default:
		instalar(true)
	}
}

// Parametros extrai exe, host, usuário e senha da URL appcontroller:
func Parametros(u string) (exe, host, usuario, senha string, err error) {
	q := u[len(protocolo)+1:]
	q = strings.TrimLeft(q, "/")
	q = strings.TrimPrefix(q, "?")
	if i := strings.Index(q, "?"); i >= 0 {
		q = q[i+1:]
	}
	q = strings.TrimRight(q, "/")
	v, err := url.ParseQuery(q)
	if err != nil {
		return "", "", "", "", fmt.Errorf("Endereço inválido: %v", err)
	}
	exe, host, usuario, senha = strings.Trim(v.Get("exe"), `" `), v.Get("h"), v.Get("u"), v.Get("p")
	for nome, val := range map[string]string{"Diretório AppController.exe": exe, "Host": host, "Usuário": usuario, "Senha": senha} {
		if val == "" {
			return "", "", "", "", fmt.Errorf("Campo '%s' não informado.", nome)
		}
	}
	return
}

func abrir(u string) error {
	exe, host, usuario, senha, err := Parametros(u)
	if err != nil {
		return err
	}
	// Segurança: só executa um arquivo chamado AppController.exe que exista no disco
	if !strings.EqualFold(filepath.Base(strings.ReplaceAll(exe, `\`, "/")), "AppController.exe") {
		return fmt.Errorf("Somente AppController.exe pode ser executado.\n%s", exe)
	}
	if st, err := os.Stat(exe); err != nil || st.IsDir() {
		return fmt.Errorf("Arquivo não encontrado:\n%s", exe)
	}
	c := exec.Command(exe, "-h", host, "-u", usuario, "-p", senha)
	c.Dir = filepath.Dir(exe)
	if err := c.Start(); err != nil {
		return fmt.Errorf("Não foi possível abrir o AppController:\n%v", err)
	}
	return nil
}

func instalar(perguntar bool) {
	jaInstalado := false
	if _, err := os.Stat(destino()); err == nil {
		jaInstalado = true
	}
	if perguntar && jaInstalado {
		r := comum.Caixa(titulo, "O launcher já está instalado neste computador.\n\nSim: reinstalar / atualizar\nNão: desinstalar\nCancelar: sair", comum.MB_YESNOCANCEL|comum.MB_ICONQUESTION)
		if r == comum.IDNO {
			desinstalar()
			return
		}
		if r != comum.IDYES {
			return
		}
	}
	if err := comum.CopiarPara(destino()); err != nil {
		comum.Erro(titulo, "Não foi possível copiar o launcher para\n"+destino()+"\n\n"+err.Error())
		os.Exit(1)
	}
	if err := comum.RegistrarProtocolo(protocolo, "URL:AppController Launcher", `"`+destino()+`" "%1"`); err != nil {
		comum.Erro(titulo, "Não foi possível registrar o protocolo:\n"+err.Error())
		os.Exit(1)
	}
	// remove sobras da versão antiga (PowerShell)
	os.Remove(filepath.Join(pasta(), "appcontroller-launcher.ps1"))
	comum.Info(titulo, "Pronto! O launcher foi instalado.\n\nVolte ao site, clique em \"Já instalei\" e depois em \"Executar (CMD)\".\n\nNa primeira vez, o navegador pergunta se pode abrir o AppController Launcher: marque \"Sempre permitir\" e clique em Abrir.")
}

func desinstalar() {
	comum.RemoverProtocolo(protocolo)
	comum.ApagarPastaDepois(pasta())
	comum.Info(titulo, "Launcher removido deste computador.")
}
