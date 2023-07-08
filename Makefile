VERSION := $(shell cat package.json | jq -r '.version')

all: zip

bot: src/**/*.ts src/*.ts
	@echo "Compiling $<"
	npm run compile
		
	@echo "Bundling"
	npm run bundle
		
	@echo "Packaging"
	npm run package

py-server: py-server/main.py
	python3 -m venv venv
	. ./venv/bin/activate
	pip install -r ./py-server/requirements.txt
	pip install pyinstaller
	pyinstaller ./py-server/main.py -n py-server -F --hidden-import='PIL._tkinter_finder'

zip: bot py-server
	cp LICENSE ./dist
	cp README.md ./dist

	tar cfz dist-linux-amd64-v$(VERSION).tar.gz -C dist .

.PHONY: clean
clean:
	rm -rf dist bundle build venv
	rm -f py-server.spec
	rm -f dist-*.tar.gz
