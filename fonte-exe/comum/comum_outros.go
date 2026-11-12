//go:build !windows

package comum

import (
	"fmt"
	"os"
	"os/exec"
)

// Versões simples para testes fora do Windows.
const (
	MB_OK, MB_YESNO, MB_YESNOCANCEL, MB_ICONERROR, MB_ICONQUESTION, MB_ICONINFO, MB_DEFBUTTON2, MB_SYSTEMMODAL = 0, 4, 3, 0x10, 0x20, 0x40, 0x100, 0x1000
	IDYES, IDNO                                                                                                = 6, 7
)

var RespostaTeste = IDYES

func Caixa(titulo, texto string, tipo uint32) int {
	fmt.Println("[caixa]", titulo, texto)
	return RespostaTeste
}
func Info(titulo, texto string) { fmt.Println("[info]", titulo, texto) }
func Erro(titulo, texto string) { fmt.Println("[erro]", titulo, texto) }
func RegistrarProtocolo(nome, descricao, comando string) error {
	fmt.Println("[reg] protocolo", nome, comando)
	return nil
}
func RemoverProtocolo(nome string)                        {}
func DefinirInicioAutomatico(nome, comando string) error  { return nil }
func RemoverInicioAutomatico(nome string)                 {}
func IniciarDesacoplado(exe string, args ...string) error { return exec.Command(exe, args...).Start() }
func SemJanela(c *exec.Cmd)                               {}
func ComandoShell(linha string) *exec.Cmd                 { return exec.Command("sh", "-c", linha) }
func EncerrarOutros(nomeExe string)                       {}
func ApagarPastaDepois(pasta string)                      { os.RemoveAll(pasta) }
