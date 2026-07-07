package tasks_postgres_repository

import core_postgres_pool "github.com/BladeRunner322/Semi-prod-ToDoList/internal/core/repository/postgres/pool"

type TasksRepository struct {
	pool core_postgres_pool.Pool
}

func NewTaskRepository(
	pool core_postgres_pool.Pool,
) *TasksRepository {
	return &TasksRepository{
		pool: pool,
	}
}
