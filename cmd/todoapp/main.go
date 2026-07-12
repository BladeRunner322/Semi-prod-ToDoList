package main

import (
	"context"
	"fmt"
	"os"
	"os/signal"
	"syscall"
	"time"

	core_config "github.com/BladeRunner322/Semi-prod-ToDoList/internal/core/config.go"
	core_logger "github.com/BladeRunner322/Semi-prod-ToDoList/internal/core/logger"
	core_pgx_pool "github.com/BladeRunner322/Semi-prod-ToDoList/internal/core/repository/postgres/pool/pgx"
	core_http_middlware "github.com/BladeRunner322/Semi-prod-ToDoList/internal/core/transport/http/middleware"
	core_http_server "github.com/BladeRunner322/Semi-prod-ToDoList/internal/core/transport/http/server"
	statistics_postgres_repository "github.com/BladeRunner322/Semi-prod-ToDoList/internal/features/statistics/repository/postgres"
	statistics_service "github.com/BladeRunner322/Semi-prod-ToDoList/internal/features/statistics/service"
	statistics_transport_http "github.com/BladeRunner322/Semi-prod-ToDoList/internal/features/statistics/transport/http"
	tasks_postgres_repository "github.com/BladeRunner322/Semi-prod-ToDoList/internal/features/tasks/repository/postgres"
	tasks_service "github.com/BladeRunner322/Semi-prod-ToDoList/internal/features/tasks/service"
	tasks_transport_http "github.com/BladeRunner322/Semi-prod-ToDoList/internal/features/tasks/transport/http"
	users_postgres_repository "github.com/BladeRunner322/Semi-prod-ToDoList/internal/features/users/repository/postgres"
	users_service "github.com/BladeRunner322/Semi-prod-ToDoList/internal/features/users/service"
	users_transport_http "github.com/BladeRunner322/Semi-prod-ToDoList/internal/features/users/transport/http"
	"go.uber.org/zap"

	_ "github.com/BladeRunner322/Semi-prod-ToDoList/docs"
)

// @title        Golang Todo API
// @version      1.0
// @description  Todo Application REST-API schema
// @host         127.0.0.1:5050
// @BasePath     /api/v1
func main() {
	cfg := core_config.NewConfigMust()
	time.Local = cfg.TimeZone

	ctx, cancel := signal.NotifyContext(
		context.Background(),
		syscall.SIGINT, syscall.SIGTERM,
	)

	defer cancel()

	logger, err := core_logger.NewLogger(core_logger.NewConfigMust())
	if err != nil {
		fmt.Println("failed to init application logger:", err)
		os.Exit(1)
	}
	defer logger.Close()

	logger.Debug("application time zone", zap.Any("zone", time.Local))

	logger.Debug("initialising postgres connection pool")
	pool, err := core_pgx_pool.NewPool(
		ctx,
		core_pgx_pool.NewConfigMust(),
	)

	if err != nil {
		logger.Fatal("failed to init postgres connection pool", zap.Error(err))
	}
	defer pool.Close()

	logger.Debug("initialising feature", zap.String("feature", "users"))
	usersRepository := users_postgres_repository.NewUsersRepository(pool)
	usersService := users_service.NewUsersService(usersRepository)
	usersTransportHTTP := users_transport_http.NewUsersHTTPHandler(usersService)

	logger.Debug("initializing feature", zap.String("feature", "tasks"))
	tasksRepository := tasks_postgres_repository.NewTaskRepository(pool)
	tasksService := tasks_service.NewTasksService(tasksRepository)
	tasksTransportHTTP := tasks_transport_http.NewTasksHTTPHandler(tasksService)

	logger.Debug("initialising feature", zap.String("feature", "statistics"))
	statisticsRepository := statistics_postgres_repository.NewStatisticsRepository(pool)
	statisticsService := statistics_service.NewStatisticsService(statisticsRepository)
	statisticsTransportHTTP := statistics_transport_http.NewStatisticsHTTPHandler(statisticsService)

	logger.Debug("initialising HTTP server")
	httpServer := core_http_server.NewHTTPServer(
		core_http_server.NewConfigMust(),
		logger,
		core_http_middlware.CORS(),
		core_http_middlware.RequestID(),
		core_http_middlware.Logger(logger),
		core_http_middlware.Trace(),
		core_http_middlware.Panic(),
	)

	apiVersionRouterV1 := core_http_server.NewAPIVersionRouter(core_http_server.ApiVersion1)
	apiVersionRouterV1.RegisterRoutes(usersTransportHTTP.Routes()...)
	apiVersionRouterV1.RegisterRoutes(tasksTransportHTTP.Routes()...)
	apiVersionRouterV1.RegisterRoutes(statisticsTransportHTTP.Routes()...)

	// apiVersionRouterV2 := core_http_server.NewAPIVersionRouter(
	// 	core_http_server.ApiVersion2,
	// 	core_http_middlware.Dummy("api v2 middleware"),
	// )
	// apiVersionRouterV2.RegisterRoutes(usersTransportHTTP.Routes()...)

	httpServer.RegisterAPIRouters(
		apiVersionRouterV1,
		// apiVersionRouterV2,
	)

	httpServer.RegisterSwagger()

	if err := httpServer.Run(ctx); err != nil {
		logger.Error("HTTP server run error", zap.Error(err))
	}
}
