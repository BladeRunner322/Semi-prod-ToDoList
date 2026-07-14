package core_config

import (
	"fmt"
	"os"
	"path"
	"time"
)

type Config struct {
	TimeZone  *time.Location
	StaticDir string
}

func NewConfig() (*Config, error) {
	tz := os.Getenv("TIME_ZONE")
	if tz == "" {
		tz = "UTC"
	}

	zone, err := time.LoadLocation(tz)
	if err != nil {
		return nil, fmt.Errorf("load time zone: %s: %w", tz, err)
	}

	projectRoot := os.Getenv("PROJECT_ROOT")
	if projectRoot == "" {
		projectRoot = "."
	}
	staticDir := path.Join(projectRoot, "public/static")

	return &Config{
		TimeZone:  zone,
		StaticDir: staticDir,
	}, nil
}

func NewConfigMust() *Config {
	config, err := NewConfig()
	if err != nil {
		err = fmt.Errorf("get core config: %w", err)
		panic(err)
	}

	return config
}
