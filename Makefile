include .env
export

export PROJECT_ROOT=$(shell pwd)

env-up:
	@docker compose up -d todoapp-postgres

env-down:
	@docker compose down todoapp-postgres

env-cleanup:
	@read -p "Очистить все volume файлы окружения? Опасность утери данных. [y/N]: " ans; \
	if [ "$$ans" = "y" ]; then \
		docker compose down todoapp-postgres port-forwarder && \
		sudo rm -rf $(PROJECT_ROOT)/out/pgdata && \
		echo "Файлы окружения очищены"; \
	else \
		echo "Очистка окружения отменена"; \
	fi

env-port-forward:
	@docker compose up -d port-forwarder

env-port-close:
	@docker compose down port-forwarder

migrate-create:
	@if [ -z "$(seq)" ]; then \
		echo "Отсутствует необходимый параметр seq, Пример: make migrate-create seq=init"; \
		exit 1; \
	fi; \
	docker compose run --rm todoapp-postgres-migrate \
		create \
		-ext sql \
		-dir /migrations \
		-seq "$(seq)"

migrate-up:
	@make migrate-action action=up

migrate-down:
	@make migrate-action action=down

migrate-action:
	@if [ -z "$(action)" ]; then \
		echo "Отсутствует необходимый параметр action, Пример: make migrate-action action=up"; \
		exit 1; \
	fi; \
	docker compose run --rm todoapp-postgres-migrate \
	-path /migrations \
	-database postgres://$(POSTGRES_USER):$(POSTGRES_PASSWORD)@todoapp-postgres:5432/$(POSTGRES_DB)?sslmode=disable \
	"$(action)"

todoapp-run:
	@export LOGGER_FOLDER=$(PROJECT_ROOT)/out/logs && \
	export POSTGRES_HOST=localhost && \
	go mod tidy && \
	go run $(PROJECT_ROOT)/cmd/todoapp/main.go

setup-pgdata:
	@mkdir -p $(PROJECT_ROOT)/out/pgdata
	@sudo chown -R $(shell id -u):$(shell id -g) $(PROJECT_ROOT)/out/pgdata
	@chmod -R 755 $(PROJECT_ROOT)/out/pgdata
	@echo "✅ $(PROJECT_ROOT)/out/pgdata готова (владелец — $(shell id -un))"

fix-perms:
	@if [ -d "migrations" ]; then \
		sudo chown -R $(shell id -u):$(shell id -g) migrations; \
		echo "✅ Права на migrations исправлены"; \
	else \
		echo "⚠️ Папка migrations не существует"; \
	fi

wait-for-postgres:
	@echo "Ожидание запуска PostgreSQL..."
	@until docker compose exec todoapp-postgres pg_isready -U $(POSTGRES_USER) -d $(POSTGRES_DB) > /dev/null 2>&1; do \
		sleep 1; \
	done
	@echo "✅ PostgreSQL готов"

start-all:
	make setup-pgdata
	make fix-perms
	make env-up
	make wait-for-postgres
	make migrate-up
	make env-port-forward
	make todoapp-run