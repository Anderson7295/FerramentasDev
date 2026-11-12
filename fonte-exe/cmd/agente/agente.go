package main

import (
	"bufio"
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"sync"
	"time"

	"ferramentasdev/comum"
)

var (
	RegexJira   = regexp.MustCompile(`^[A-Z][A-Z0-9]*-\d+$`)
	RegexBranch = regexp.MustCompile(`^[A-Za-z0-9._/\-]+$`)
	RegexOrigem = regexp.MustCompile(`^https?://[A-Za-z0-9.\-]+(:\d+)?$`)
	RegexRepo   = regexp.MustCompile(`^[A-Za-z0-9._\-]+$`)
	RegexLink   = regexp.MustCompile(`^https://[^\s"]+$`)
	Siglas      = []string{"SUP", "MAS", "REL", "DEV"}
	trava       sync.Mutex // atende uma operação por vez, como a versão anterior
	travaLog    sync.Mutex
)

// PastaDados pode ser trocada nos testes.
var PastaDados = pasta

func arqOrigens() string { return filepath.Join(PastaDados(), "sites-autorizados.txt") }

func Log(msg string) {
	travaLog.Lock()
	defer travaLog.Unlock()
	f, err := os.OpenFile(filepath.Join(PastaDados(), "agente.log"), os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o644)
	if err != nil {
		return
	}
	defer f.Close()
	fmt.Fprintf(f, "%s %s\r\n", time.Now().Format("2006-01-02 15:04:05"), msg)
}

// ---------- sites autorizados ----------
func Origens() []string {
	b, err := os.ReadFile(arqOrigens())
	if err != nil {
		return nil
	}
	b = bytes.TrimPrefix(b, []byte{0xEF, 0xBB, 0xBF})
	var r []string
	sc := bufio.NewScanner(bytes.NewReader(b))
	for sc.Scan() {
		if t := strings.TrimSpace(strings.TrimPrefix(sc.Text(), "\uFEFF")); t != "" {
			r = append(r, t)
		}
	}
	return r
}
func OrigemValida(o string) bool { return o != "" && RegexOrigem.MatchString(o) }
func Autorizado(o string) bool {
	if !OrigemValida(o) {
		return false
	}
	for _, x := range Origens() {
		if x == o {
			return true
		}
	}
	return false
}
func PedirAutorizacao(o string) bool {
	if !OrigemValida(o) {
		return false
	}
	if Autorizado(o) {
		return true
	}
	txt := "O site abaixo quer usar o Agente Ferramentas Dev para clonar repositórios, criar branches, rodar o pman e apagar pastas de clone no seu computador:\n\n" + o + "\n\nPermitir este site?"
	if comum.Caixa(titulo, txt, comum.MB_YESNO|comum.MB_ICONQUESTION|comum.MB_DEFBUTTON2|comum.MB_SYSTEMMODAL) == comum.IDYES {
		f, err := os.OpenFile(arqOrigens(), os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o644)
		if err == nil {
			fmt.Fprintf(f, "%s\r\n", o)
			f.Close()
		}
		Log("Site autorizado: " + o)
		return true
	}
	Log("Site recusado: " + o)
	return false
}

// ---------- execução de comandos ----------
type Resultado struct {
	Codigo      int
	Saida, Erro string
	Comando     string
}

func citar(s string) string {
	if s == "" {
		return `""`
	}
	if strings.ContainsAny(s, " \t\"") {
		return `"` + strings.ReplaceAll(s, `"`, `\"`) + `"`
	}
	return s
}

func rodar(c *exec.Cmd, dir, descricao string) Resultado {
	c.Dir = dir
	c.Env = append(os.Environ(), "GIT_TERMINAL_PROMPT=0")
	var o, e bytes.Buffer
	c.Stdout, c.Stderr = &o, &e
	r := Resultado{Comando: descricao}
	if err := c.Run(); err != nil {
		if ee, ok := err.(*exec.ExitError); ok {
			r.Codigo = ee.ExitCode()
		} else {
			r.Codigo = -1
			r.Erro = fmt.Sprintf("Não foi possível executar '%s': %v", descricao, err)
			return r
		}
	}
	r.Saida, r.Erro = o.String(), r.Erro+e.String()
	return r
}

func Executar(exe string, args []string, dir string) Resultado {
	partes := []string{exe}
	for _, a := range args {
		partes = append(partes, citar(a))
	}
	c := exec.Command(exe, args...)
	comum.SemJanela(c)
	return rodar(c, dir, strings.Join(partes, " "))
}

func Git(args []string, dir string) Resultado { return Executar("git", args, dir) }

type EtapaR struct {
	Etapa   string `json:"etapa"`
	Ok      bool   `json:"ok"`
	Detalhe string `json:"detalhe"`
}

func etapa(lista *[]EtapaR, nome string, r Resultado) bool {
	ok := r.Codigo == 0
	det := "> " + r.Comando + "\n" + strings.TrimSpace(r.Saida+"\n"+r.Erro)
	*lista = append(*lista, EtapaR{nome, ok, det})
	return ok
}

// ---------- validações ----------
var regexCaminho = regexCaminhoPadrao()

func PastaBaseValida(p string) (string, error) {
	if p == "" {
		return "", fmt.Errorf(`Informe a pasta "Salvar em".`)
	}
	if !regexCaminho.MatchString(p) {
		return "", fmt.Errorf("Caminho inválido em 'Salvar em': %s (use um caminho completo, ex.: C:\\FontesGit).", p)
	}
	if strings.ContainsAny(p, `<>"|?*`) || regexp.MustCompile(`[\\/]\.\.([\\/]|$)`).MatchString(p) {
		return "", fmt.Errorf("Caminho inválido em 'Salvar em': %s", p)
	}
	a, err := filepath.Abs(p)
	if err != nil {
		return "", err
	}
	return strings.TrimRight(a, `\/`), nil
}

func existeDir(p string) bool { st, err := os.Stat(p); return err == nil && st.IsDir() }
func existe(p string) bool    { _, err := os.Stat(p); return err == nil }

// ---------- /clonar ----------
type PedidoClone struct {
	Jira, Sigla, Link, BranchBase, Branch, PastaBase string
	Push, Pman                                       bool
}

type RespClone struct {
	Ok       bool     `json:"ok"`
	Sigla    string   `json:"sigla"`
	Destino  string   `json:"destino"`
	Etapas   []EtapaR `json:"etapas"`
	Faltando []string `json:"faltando"`
	Erro     *string  `json:"erro"`
}

func Clonar(b PedidoClone) (*RespClone, error) {
	if !RegexJira.MatchString(b.Jira) {
		return nil, fmt.Errorf("Número do Jira inválido: %s", b.Jira)
	}
	okSigla := false
	for _, s := range Siglas {
		okSigla = okSigla || s == b.Sigla
	}
	if !okSigla {
		return nil, fmt.Errorf("Versão inválida: %s", b.Sigla)
	}
	if !RegexLink.MatchString(b.Link) {
		return nil, fmt.Errorf("Link de clone inválido: %s", b.Link)
	}
	for _, x := range []string{b.BranchBase, b.Branch} {
		if !RegexBranch.MatchString(x) || strings.Contains(x, "..") {
			return nil, fmt.Errorf("Nome de branch inválido: %s", x)
		}
	}
	l := strings.TrimSuffix(strings.TrimRight(b.Link, "/"), ".git")
	repo := l[strings.LastIndex(l, "/")+1:]
	if !RegexRepo.MatchString(repo) {
		return nil, fmt.Errorf("Não consegui identificar o nome da rotina pelo link: %s", b.Link)
	}
	raiz, err := PastaBaseValida(b.PastaBase)
	if err != nil {
		return nil, err
	}
	demanda := filepath.Join(raiz, b.Jira)
	pv := filepath.Join(demanda, b.Sigla)
	dest := filepath.Join(pv, repo)
	r := &RespClone{Sigla: b.Sigla, Destino: dest, Etapas: []EtapaR{}, Faltando: []string{}}
	erro := func(s string) { r.Erro = &s }

	if existe(dest) {
		erro("A pasta já existe, versão pulada.")
		r.Etapas = append(r.Etapas, EtapaR{"Verificar pasta", false, "A pasta já existe: " + dest})
		return r, nil
	}
	os.MkdirAll(pv, 0o755)

	okClone := etapa(&r.Etapas, "git clone ("+b.BranchBase+")", Git([]string{"clone", "--branch", b.BranchBase, b.Link, dest}, pv))
	var bowers []string
	if okClone {
		okCheckout := etapa(&r.Etapas, "Criar branch "+b.Branch, Git([]string{"checkout", "-b", b.Branch}, dest))
		if okCheckout && b.Push {
			etapa(&r.Etapas, "git push para o Azure", Git([]string{"push", "-u", "origin", b.Branch}, dest))
		}
		if b.Pman {
			bowers = acharBowers(dest)
			if len(bowers) == 0 {
				r.Etapas = append(r.Etapas, EtapaR{"pman install -f", true, "Nenhum bower.json encontrado na rotina."})
			}
			for _, d := range bowers {
				etapa(&r.Etapas, "pman install -f ("+d+")", rodar(comum.ComandoShell("pman install -f"), d, "cmd.exe /d /c pman install -f"))
			}
		}
	}

	// Validação final: pasta da demanda, pasta da versão, rotina clonada e lib do bower
	for _, p := range []string{demanda, pv} {
		if !existeDir(p) {
			r.Faltando = append(r.Faltando, p)
		}
	}
	if !existe(filepath.Join(dest, ".git")) {
		r.Faltando = append(r.Faltando, dest)
	}
	for _, d := range bowers {
		lib := "lib"
		if bs, err := os.ReadFile(filepath.Join(d, ".bowerrc")); err == nil {
			var j struct{ Directory string }
			if json.Unmarshal(bytes.TrimPrefix(bs, []byte{0xEF, 0xBB, 0xBF}), &j) == nil && j.Directory != "" {
				lib = j.Directory
			}
		}
		if pl := filepath.Join(d, lib); !existeDir(pl) {
			r.Faltando = append(r.Faltando, pl)
		}
	}
	var falhas []string
	for _, e := range r.Etapas {
		if !e.Ok {
			falhas = append(falhas, e.Etapa)
		}
	}
	r.Ok = len(falhas) == 0 && len(r.Faltando) == 0
	if !r.Ok {
		if len(falhas) > 0 {
			erro("Falhou: " + strings.Join(falhas, ", "))
		} else {
			erro("Validação: pasta não encontrada")
		}
	}
	e := ""
	if r.Erro != nil {
		e = *r.Erro
	}
	Log(fmt.Sprintf("clonar %s %s -> %s : ok=%v %s", b.Jira, b.Sigla, dest, r.Ok, e))
	return r, nil
}

func acharBowers(raiz string) []string {
	ign := regexp.MustCompile(`[\\/](\.git|bower_components|node_modules)([\\/]|$)`)
	m := map[string]bool{}
	filepath.WalkDir(raiz, func(p string, d os.DirEntry, err error) error {
		if err != nil {
			return nil
		}
		if d.IsDir() && ign.MatchString(p) {
			return filepath.SkipDir
		}
		if !d.IsDir() && strings.EqualFold(d.Name(), "bower.json") {
			m[filepath.Dir(p)] = true
		}
		return nil
	})
	r := make([]string, 0, len(m))
	for k := range m {
		r = append(r, k)
	}
	sort.Strings(r)
	return r
}

// ---------- limpeza ----------
func linhas(s string) int {
	n := 0
	for _, l := range strings.Split(s, "\n") {
		if strings.TrimSpace(l) != "" {
			n++
		}
	}
	return n
}

type ItemLimpeza struct {
	Branch      string `json:"branch"`
	Alterados   int    `json:"alterados"`
	NaoEnviados int    `json:"naoEnviados"`
	Stash       int    `json:"stash"`
	Pendente    bool   `json:"pendente"`
	Detalhe     string `json:"detalhe"`
	Caminho     string `json:"caminho"`
	Demanda     string `json:"demanda"`
	Versao      string `json:"versao"`
	Repo        string `json:"repo"`
}

func InfoClone(dir string) ItemLimpeza {
	st := Git([]string{"status", "--porcelain"}, dir)
	ne := Git([]string{"log", "--branches", "--not", "--remotes", "--oneline"}, dir)
	sh := Git([]string{"stash", "list"}, dir)
	br := Git([]string{"rev-parse", "--abbrev-ref", "HEAD"}, dir)
	i := ItemLimpeza{Branch: strings.TrimSpace(br.Saida), Alterados: linhas(st.Saida), NaoEnviados: linhas(ne.Saida), Stash: linhas(sh.Saida)}
	var det []string
	if st.Codigo != 0 {
		det = append(det, "não foi possível ler o status do git")
	}
	if i.Alterados > 0 {
		det = append(det, fmt.Sprintf("%d arquivo(s) alterado(s) sem commit", i.Alterados))
	}
	if i.NaoEnviados > 0 {
		det = append(det, fmt.Sprintf("%d commit(s) não enviado(s)", i.NaoEnviados))
	}
	if i.Stash > 0 {
		det = append(det, fmt.Sprintf("%d stash(es)", i.Stash))
	}
	i.Pendente = len(det) > 0
	i.Detalhe = strings.Join(det, ", ")
	return i
}

func subpastas(p string) []os.DirEntry {
	es, _ := os.ReadDir(p)
	var r []os.DirEntry
	for _, e := range es {
		if e.IsDir() {
			r = append(r, e)
		}
	}
	return r
}

func ListarLimpeza(pastaBase string) (map[string]any, error) {
	raiz, err := PastaBaseValida(pastaBase)
	if err != nil {
		return nil, err
	}
	itens := []ItemLimpeza{}
	for _, dem := range subpastas(raiz) {
		if !RegexJira.MatchString(dem.Name()) {
			continue
		}
		pd := filepath.Join(raiz, dem.Name())
		for _, ver := range subpastas(pd) {
			pv := filepath.Join(pd, ver.Name())
			for _, rep := range subpastas(pv) {
				pr := filepath.Join(pv, rep.Name())
				if !existe(filepath.Join(pr, ".git")) {
					continue
				}
				i := InfoClone(pr)
				i.Caminho, i.Demanda, i.Versao, i.Repo = pr, dem.Name(), ver.Name(), rep.Name()
				itens = append(itens, i)
			}
		}
	}
	return map[string]any{"ok": true, "itens": itens}, nil
}

func vazia(p string) bool {
	es, err := os.ReadDir(p)
	return err == nil && len(es) == 0
}

func ApagarLimpeza(pastaBase string, caminhos []string) (map[string]any, error) {
	raiz, err := PastaBaseValida(pastaBase)
	if err != nil {
		return nil, err
	}
	res := []map[string]any{}
	for _, c := range caminhos {
		err := func() error {
			full, err := filepath.Abs(c)
			if err != nil {
				return err
			}
			full = strings.TrimRight(full, `\/`)
			ver := filepath.Dir(full)
			dem := filepath.Dir(ver)
			base := filepath.Dir(dem)
			if !strings.EqualFold(base, raiz) || !RegexJira.MatchString(filepath.Base(dem)) {
				return fmt.Errorf("Fora da estrutura <Salvar em>\\<DEMANDA>\\<VERSÃO>\\<rotina>.")
			}
			if !existe(filepath.Join(full, ".git")) {
				return fmt.Errorf("Não é um clone git.")
			}
			filepath.WalkDir(full, func(p string, d os.DirEntry, err error) error {
				if err == nil && !d.IsDir() {
					os.Chmod(p, 0o666) // tira o somente leitura (arquivos do .git)
				}
				return nil
			})
			if err := os.RemoveAll(full); err != nil {
				return err
			}
			for _, p := range []string{ver, dem} {
				if vazia(p) {
					os.Remove(p)
				}
			}
			Log("apagado " + full)
			return nil
		}()
		if err != nil {
			res = append(res, map[string]any{"caminho": c, "ok": false, "erro": err.Error()})
		} else {
			res = append(res, map[string]any{"caminho": c, "ok": true})
		}
	}
	return map[string]any{"ok": true, "resultados": res}, nil
}

// ---------- HTTP ----------
func Responder(w http.ResponseWriter, req *http.Request, codigo int, obj any) {
	h := w.Header()
	if o := req.Header.Get("Origin"); OrigemValida(o) {
		h.Set("Access-Control-Allow-Origin", o)
		h.Set("Vary", "Origin")
	}
	h.Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
	h.Set("Access-Control-Allow-Headers", "Content-Type")
	h.Set("Access-Control-Allow-Private-Network", "true")
	if obj == nil {
		w.WriteHeader(codigo)
		return
	}
	h.Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(codigo)
	json.NewEncoder(w).Encode(obj)
}

func versaoCmd(exe string, a ...string) any {
	r := Executar(exe, a, os.Getenv("USERPROFILE"))
	if r.Codigo == 0 {
		return strings.TrimSpace(strings.Split(strings.TrimSpace(r.Saida+r.Erro), "\n")[0])
	}
	return nil
}

func Tratar(w http.ResponseWriter, req *http.Request) {
	defer func() {
		if e := recover(); e != nil {
			Log(fmt.Sprint("Erro: ", e))
			Responder(w, req, 400, map[string]any{"ok": false, "erro": fmt.Sprint(e)})
		}
	}()
	rota := strings.TrimRight(req.URL.Path, "/")
	o := req.Header.Get("Origin")
	falhar := func(err error) {
		Log("Erro: " + err.Error())
		Responder(w, req, 400, map[string]any{"ok": false, "erro": err.Error()})
	}
	if req.Method == http.MethodOptions {
		Responder(w, req, 204, nil)
		return
	}
	if rota == "/status" && req.Method == http.MethodGet {
		var pman any
		if _, err := exec.LookPath("pman"); err == nil {
			pman = "pman"
		}
		Responder(w, req, 200, map[string]any{"ok": true, "versao": Versao, "autorizado": Autorizado(o), "git": versaoCmd("git", "--version"), "pman": pman})
		return
	}
	if req.Method != http.MethodPost {
		Responder(w, req, 404, map[string]any{"ok": false, "erro": "Rota não encontrada."})
		return
	}
	trava.Lock()
	defer trava.Unlock()
	if rota == "/autorizar" {
		Responder(w, req, 200, map[string]any{"ok": true, "autorizado": PedirAutorizacao(o)})
		return
	}
	if !Autorizado(o) {
		Responder(w, req, 403, map[string]any{"ok": false, "erro": "Site não autorizado no agente."})
		return
	}
	var corpo struct {
		PedidoClone
		Caminhos []string
	}
	if err := json.NewDecoder(req.Body).Decode(&corpo); err != nil && err.Error() != "EOF" {
		falhar(fmt.Errorf("Pedido inválido: %v", err))
		return
	}
	var (
		resp any
		err  error
	)
	switch rota {
	case "/clonar":
		resp, err = Clonar(corpo.PedidoClone)
	case "/limpeza/listar":
		resp, err = ListarLimpeza(corpo.PastaBase)
	case "/limpeza/apagar":
		resp, err = ApagarLimpeza(corpo.PastaBase, corpo.Caminhos)
	default:
		Responder(w, req, 404, map[string]any{"ok": false, "erro": "Rota não encontrada."})
		return
	}
	if err != nil {
		falhar(err)
		return
	}
	Responder(w, req, 200, resp)
}
