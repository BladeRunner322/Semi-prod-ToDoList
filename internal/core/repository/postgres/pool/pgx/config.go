package core_pgx_pool

import (
	"fmt"
	"time"

	"github.com/kelseyhightower/envconfig"
)

type Config struct {
	Host     string        `envconfig:"HOST" requered:"true"`
	Port     string        `envconfig:"PORT" default:"5432"`
	User     string        `envconfig:"USER" requered:"true"`
	Password string        `envconfig:"PASSWORD" requered:"true"`
	Database string        `envconfig:"DB" requered:"true"`
	Timeout  time.Duration `envconfig:"TIMEOUT" requered:"true"`
}

func NewConfig() (Config, error) {
	var config Config

	if err := envconfig.Process("POSTGRES", &config); err != nil {
		return Config{}, fmt.Errorf("process envconfig: %w", err)
	}

	return config, nil
}

func NewConfigMust() Config {
	config, err := NewConfig()

	if err != nil {
		err = fmt.Errorf("get Postgres connection pool config: %w", err)
		panic(err)
	}

	return config
}
