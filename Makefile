VERSION := $(shell cat package.json | jq -r '.version')
VENV_DIR := venv

all: zip

bot: src/**/*.ts src/*.ts
	@echo "Compiling $<"
	npm run compile
		
	@echo "Bundling"
	npm run bundle
		
	@echo "Packaging"
	npm run package

	# hack to get around pkg not being able to find the worker file when bundled with esbuild
	mkdir -p dist/scripts
	cp build/services/impl/memoryMaterialSource.worker.js dist/scripts/memoryMaterialSource.worker.js

py-server: py-server/main.py
	python3 -m venv $(VENV_DIR)
	$(VENV_DIR)/bin/pip install -r ./py-server/requirements.txt
	$(VENV_DIR)/bin/pip install pyinstaller
	$(VENV_DIR)/bin/pyinstaller ./py-server/main.py -n py-server -F --hidden-import='PIL._tkinter_finder'

data-update: scripts/data-update/*.go
	cd scripts/data-update && go build -o ../../dist/data-update

zip: bot py-server data-update
	cp LICENSE ./dist
	cp README-dist.txt ./dist/README.txt
	mkdir -p ./dist/data
	mkdir -p ./dist/locales
	cp -R data/* ./dist/data
	cp -R locales/* ./dist/locales

	tar cfz dist-linux-amd64-v$(VERSION).tar.gz -C dist .

.PHONY: clean
clean:
	rm -rf dist bundle build venv
	rm -f py-server.spec
	rm -f dist-*.tar.gz
