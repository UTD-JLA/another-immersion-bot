VERSION := $(shell cat package.json | jq -r '.version')
VENV_DIR := venv

all: zip

bot: src/**/*.ts src/*.ts
	@echo "Compiling"
	npm run compile
		
	@echo "Bundling"
	npm run bundle

	# hack to get around pkg not being able to find the worker file when bundled with esbuild
	cp build/services/impl/fuseMaterialSource.worker.js bundle/fuseMaterialSource.worker.js
		
	@echo "Packaging"
	npm run package

	mkdir -p dist/bundle
	cp bundle/fuseMaterialSource.worker.js dist/bundle/fuseMaterialSource.worker.js

	cp node_modules/better-sqlite3/build/Release/better_sqlite3.node dist/better_sqlite3.node

	echo "$(VERSION)" > dist/VERSION.txt

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

	@echo "Generating migration files"
	npm run generate-migrations

	mkdir -p ./dist/migrations
	cp -R migrations/* ./dist/migrations

	tar cfz dist-linux-amd64-v$(VERSION).tar.gz -C dist .

.PHONY: clean
clean:
	rm -rf dist bundle build venv
	rm -f py-server.spec
	rm -f dist-*.tar.gz
