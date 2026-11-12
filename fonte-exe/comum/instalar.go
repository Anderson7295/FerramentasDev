package comum

import (
	"io"
	"os"
	"path/filepath"
	"strings"
)

// PastaApp devolve %LOCALAPPDATA%\<nome>.
func PastaApp(nome string) string {
	base := os.Getenv("LOCALAPPDATA")
	if base == "" {
		base, _ = os.UserConfigDir()
	}
	return filepath.Join(base, nome)
}

// EsteExe devolve o caminho completo deste executável.
func EsteExe() string {
	p, _ := os.Executable()
	if r, err := filepath.EvalSymlinks(p); err == nil {
		p = r
	}
	return p
}

// MesmoArquivo compara caminhos sem diferenciar maiúsculas.
func MesmoArquivo(a, b string) bool {
	return strings.EqualFold(filepath.Clean(a), filepath.Clean(b))
}

// CopiarPara copia este exe para destino (se já não for ele).
func CopiarPara(destino string) error {
	origem := EsteExe()
	if MesmoArquivo(origem, destino) {
		return nil
	}
	if err := os.MkdirAll(filepath.Dir(destino), 0o755); err != nil {
		return err
	}
	in, err := os.Open(origem)
	if err != nil {
		return err
	}
	defer in.Close()
	tmp := destino + ".novo"
	out, err := os.Create(tmp)
	if err != nil {
		return err
	}
	if _, err = io.Copy(out, in); err != nil {
		out.Close()
		return err
	}
	out.Close()
	os.Remove(destino)
	return os.Rename(tmp, destino)
}
