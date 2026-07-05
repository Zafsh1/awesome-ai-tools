# FreeFlow — build workflow (mirrors the XcodeGen + Makefile pattern)
#
#   make bootstrap   Install build tooling (xcodegen) via Homebrew
#   make project     Generate FreeFlow.xcodeproj from project.yml
#   make open        Generate the project and open it in Xcode
#   make build       Build the app from the command line (Debug)
#   make run         Build and launch the app
#   make clean       Remove generated project and build products

APP_NAME := FreeFlow
SCHEME   := FreeFlow
BUILD_DIR := build

.PHONY: bootstrap project open build run clean

bootstrap:
	@command -v xcodegen >/dev/null 2>&1 || brew install xcodegen

project: bootstrap
	xcodegen generate

open: project
	open $(APP_NAME).xcodeproj

build: project
	xcodebuild -project $(APP_NAME).xcodeproj \
		-scheme $(SCHEME) \
		-configuration Debug \
		-derivedDataPath $(BUILD_DIR) \
		build

run: build
	open $(BUILD_DIR)/Build/Products/Debug/$(APP_NAME).app

clean:
	rm -rf $(APP_NAME).xcodeproj $(BUILD_DIR)
