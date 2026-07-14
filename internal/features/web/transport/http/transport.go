package web_transport_http

import (
	"net/http"

	core_http_server "github.com/BladeRunner322/Semi-prod-ToDoList/internal/core/transport/http/server"
)

type WebHTTPHandler struct {
	webService    WebService
	staticHandler http.Handler
}

type WebService interface {
	GetMainPage() ([]byte, error)
}

func NewWebHTTPHandler(
	webService WebService,
	staticDir string,
) *WebHTTPHandler {
	fs := http.StripPrefix("/static/", http.FileServer(http.Dir(staticDir)))

	return &WebHTTPHandler{
		webService:    webService,
		staticHandler: fs,
	}
}

func (h *WebHTTPHandler) Routes() []core_http_server.Route {
	return []core_http_server.Route{
		{
			Path:    "/",
			Handler: h.GetMainPage,
		},
		{
			Path:    "/static/",
			Handler: h.staticHandler.ServeHTTP,
		},
	}
}
