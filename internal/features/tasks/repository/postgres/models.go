package tasks_postgres_repository

import (
	"time"

	"github.com/BladeRunner322/Semi-prod-ToDoList/internal/core/domain"
)

type TaskModel struct {
	ID           int
	Version      int
	Title        string
	Description  *string
	Completed    bool
	CreatedAt    time.Time
	CompletedAt  *time.Time
	AuthorUserID int
}

func taskDomainFromModel(taskModel TaskModel) domain.Task {
	return domain.NewTask(
		taskModel.ID,
		taskModel.Version,
		taskModel.Title,
		taskModel.Description,
		taskModel.Completed,
		taskModel.CreatedAt,
		taskModel.CompletedAt,
		taskModel.ID,
	)
}

func TaskDomainsFromModels(taskModels []TaskModel) []domain.Task {
	domains := make([]domain.Task, len(taskModels))

	for i, model := range taskModels {
		domains[i] = taskDomainFromModel(model)
	}

	return domains
}
