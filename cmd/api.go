package main

import (
	"net/http"

	"github.com/abihf/moviemeter/api"
)

func main() {
	http.HandleFunc("/list.json", api.Handler)
	panic(http.ListenAndServe(":3000", nil))
}
