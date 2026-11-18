//go:build windows

package comum

import (
	"os"
	"os/exec"
	"strconv"
	"syscall"
	"unsafe"

	"golang.org/x/sys/windows"
	"golang.org/x/sys/windows/registry"
)

const (
	MB_OK              = 0x0
	MB_YESNO           = 0x4
	MB_YESNOCANCEL     = 0x3
	MB_ICONERROR       = 0x10
	MB_ICONQUESTION    = 0x20
	MB_ICONINFO        = 0x40
	MB_DEFBUTTON2      = 0x100
	MB_SYSTEMMODAL     = 0x1000
	MB_SETFOREGROUND   = 0x10000
	MB_TOPMOST         = 0x40000
	IDYES              = 6
	IDNO               = 7
	createNoWindow     = 0x08000000
	detachedProcess    = 0x00000008
	createNewProcGroup = 0x00000200
)

var msgBox = syscall.NewLazyDLL("user32.dll").NewProc("MessageBoxW")

// Caixa mostra uma janela de mensagem do Windows e devolve o botão clicado.
func Caixa(titulo, texto string, tipo uint32) int {
	t, _ := syscall.UTF16PtrFromString(texto)
	c, _ := syscall.UTF16PtrFromString(titulo)
	r, _, _ := msgBox.Call(0, uintptr(unsafe.Pointer(t)), uintptr(unsafe.Pointer(c)), uintptr(tipo|MB_TOPMOST|MB_SETFOREGROUND))
	return int(r)
}

func Info(titulo, texto string) { Caixa(titulo, texto, MB_OK|MB_ICONINFO) }
func Erro(titulo, texto string) { Caixa(titulo, texto, MB_OK|MB_ICONERROR) }

// RegistrarProtocolo cria HKCU\Software\Classes\<nome> apontando para comando.
func RegistrarProtocolo(nome, descricao, comando string) error {
	k, _, err := registry.CreateKey(registry.CURRENT_USER, `Software\Classes\`+nome, registry.ALL_ACCESS)
	if err != nil {
		return err
	}
	k.SetStringValue("", descricao)
	k.SetStringValue("URL Protocol", "")
	k.Close()
	c, _, err := registry.CreateKey(registry.CURRENT_USER, `Software\Classes\`+nome+`\shell\open\command`, registry.ALL_ACCESS)
	if err != nil {
		return err
	}
	defer c.Close()
	return c.SetStringValue("", comando)
}

func RemoverProtocolo(nome string) {
	for _, s := range []string{`\shell\open\command`, `\shell\open`, `\shell`, ``} {
		registry.DeleteKey(registry.CURRENT_USER, `Software\Classes\`+nome+s)
	}
}

const chaveRun = `Software\Microsoft\Windows\CurrentVersion\Run`

func DefinirInicioAutomatico(nome, comando string) error {
	k, _, err := registry.CreateKey(registry.CURRENT_USER, chaveRun, registry.ALL_ACCESS)
	if err != nil {
		return err
	}
	defer k.Close()
	return k.SetStringValue(nome, comando)
}

func RemoverInicioAutomatico(nome string) {
	if k, err := registry.OpenKey(registry.CURRENT_USER, chaveRun, registry.ALL_ACCESS); err == nil {
		k.DeleteValue(nome)
		k.Close()
	}
}

// IniciarDesacoplado abre um processo que continua depois que este termina.
func IniciarDesacoplado(exe string, args ...string) error {
	c := exec.Command(exe, args...)
	c.SysProcAttr = &syscall.SysProcAttr{CreationFlags: detachedProcess | createNewProcGroup, HideWindow: true}
	return c.Start()
}

// SemJanela evita abrir console ao executar git, cmd etc.
func SemJanela(c *exec.Cmd) {
	c.SysProcAttr = &syscall.SysProcAttr{CreationFlags: createNoWindow, HideWindow: true}
}

// ComandoShell executa uma linha no cmd.exe (usado para o pman).
func ComandoShell(linha string) *exec.Cmd {
	c := exec.Command(os.Getenv("ComSpec"))
	if c.Path == "" {
		c = exec.Command("cmd.exe")
	}
	c.SysProcAttr = &syscall.SysProcAttr{CreationFlags: createNoWindow, HideWindow: true, CmdLine: `cmd.exe /d /c ` + linha}
	return c
}

// EncerrarOutros finaliza outras instâncias do mesmo executável.
func EncerrarOutros(nomeExe string) {
	c := exec.Command("taskkill.exe", "/F", "/IM", nomeExe, "/FI", "PID ne "+strconv.Itoa(os.Getpid()))
	SemJanela(c)
	c.Run()
}

// ApagarPastaDepois remove a pasta alguns segundos depois (o exe pode estar em uso).
func ApagarPastaDepois(pasta string) {
	c := exec.Command("cmd.exe")
	c.SysProcAttr = &syscall.SysProcAttr{CreationFlags: createNoWindow | detachedProcess, HideWindow: true,
		CmdLine: `cmd.exe /d /c ping -n 3 127.0.0.1 >nul & rmdir /s /q "` + pasta + `"`}
	c.Start()
}

// Elevado indica se este processo está rodando como administrador.
func Elevado() bool {
	return windows.GetCurrentProcessToken().IsElevated()
}

// AbrirComoUsuario abre um endereço (ex.: protocolo) pelo Explorer, que roda
// sem privilégio de administrador mesmo quando este processo está elevado.
func AbrirComoUsuario(endereco string) error {
	return exec.Command("explorer.exe", endereco).Start()
}
