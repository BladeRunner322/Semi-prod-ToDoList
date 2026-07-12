package tasks_transport_http

import (
	"net/http"

	"github.com/BladeRunner322/Semi-prod-ToDoList/internal/core/domain"
	core_logger "github.com/BladeRunner322/Semi-prod-ToDoList/internal/core/logger"
	core_http_request "github.com/BladeRunner322/Semi-prod-ToDoList/internal/core/transport/http/request"
	core_http_response "github.com/BladeRunner322/Semi-prod-ToDoList/internal/core/transport/http/response"
)

type CreateTaskRequest struct {
	Title        string  `json:"title" validate:"required,min=1,max=100"         example:"Дота 2"`
	Description  *string `json:"description" validate:"omitempty,min=1,max=1000" example:"Апнуть 1500 ммр"`
	AuthorUserID int     `json:"author_user_id" validate:"required"              example:"5"`
}

type CreateTaskResponse TaskDTOResponse

// CreateTask   godoc
// @Summary     Создание задачи
// @Description Создание новой задачи в системе
// @Tags        tasks
// @Accept      json
// @Produce     json
// @Param       request body     CreateTaskRequest true           "CreateTask тело запроса"
// @Success     201     {object} CreateTaskResponse               "Успешное создание задачи"
// @Failure     400     {object} core_http_response.ErrorResponse "Bad request"
// @Failure     404     {object} core_http_response.ErrorResponse "Author not found"
// @Failure     500     {object} core_http_response.ErrorResponse "Internal server error"
// @Router      /tasks [post]
func (h *TasksHTTPHandler) CreateTask(rw http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	log := core_logger.FromContext(ctx)
	responseHandler := core_http_response.NewHTTPResponseHandler(log, rw)

	var request CreateTaskRequest

	if err := core_http_request.DecodeAndValidateRequest(r, &request); err != nil {
		responseHandler.ErrorResponse(
			err,
			"failed to decode and validate HTTP requesr",
		)

		return
	}

	taskDomain := domain.NewTaskUninitialized(
		request.Title,
		request.Description,
		request.AuthorUserID,
	)

	taskDomain, err := h.tasksService.CreateTask(ctx, taskDomain)
	if err != nil {
		responseHandler.ErrorResponse(
			err,
			"failed to create task",
		)

		return
	}

	response := CreateTaskResponse(taskDTOFromDomain(taskDomain))

	responseHandler.JSONResponse(response, http.StatusCreated)
}
