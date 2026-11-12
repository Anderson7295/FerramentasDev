package main

import "testing"

func TestParametros(t *testing.T) {
	u := "appcontroller:?exe=C%3A%5CUsers%5Ca%20b%5CAppController.exe&h=x.cloudtotvs.com.br%3A491&u=mf.manager&p=%23Mub%26l%2Bt"
	for _, v := range []string{u, "appcontroller://?exe=C%3A%5CUsers%5Ca%20b%5CAppController.exe&h=x.cloudtotvs.com.br%3A491&u=mf.manager&p=%23Mub%26l%2Bt/"} {
		exe, h, us, p, err := Parametros(v)
		if err != nil || exe != `C:\Users\a b\AppController.exe` || h != "x.cloudtotvs.com.br:491" || us != "mf.manager" || p != "#Mub&l+t" {
			t.Fatalf("%q %q %q %q %v", exe, h, us, p, err)
		}
	}
	if _, _, _, _, err := Parametros("appcontroller:?exe=a&h=b&u=c"); err == nil {
		t.Fatal("esperava erro")
	}
}
