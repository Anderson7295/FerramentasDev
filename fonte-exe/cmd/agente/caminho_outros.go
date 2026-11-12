//go:build !windows

package main

import "regexp"

func regexCaminhoPadrao() *regexp.Regexp { return regexp.MustCompile(`^/`) }
