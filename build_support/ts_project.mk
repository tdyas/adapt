#
# Default Makefile for TypeScript projects.
#

include $(dir $(lastword $(MAKEFILE_LIST)))/common.mk

# Always run inside Docker
include $(BUILD_SUPPORT)/dockerize.mk
ifeq ($(IN_DOCKER),true)


all: test
.PHONY: all

include $(BUILD_SUPPORT)/node_modules.mk

#
# Files
#
TS_SRC_FILES := $(shell find src/ -type f -regex '.*\.tsx?')
TS_TEST_FILES := $(shell find test/ -type f -regex '.*\.tsx?')
TS_FILES := $(TS_SRC_FILES) $(TS_TEST_FILES)
JS_FILES := $(addprefix dist/, $(addsuffix .js, $(basename $(filter-out %.d.ts,$(TS_FILES)))))


build: $(NODE_INSTALL_DONE) $(JS_FILES)
.PHONY: build

clean:
	npm run clean
.PHONY: clean

cleaner: clean
	rm -rf node_modules DebugOut
.PHONY: cleaner

$(JS_FILES): $(NODE_INSTALL_DONE) $(TS_FILES) tsconfig.json
	npm run build


test: build dist/.test_success
.PHONY: test

dist/.test_success: $(JS_FILES)
	npm run test
	touch $@

lint: $(NODE_INSTALL_DONE) dist/.lint_success
.PHONY: lint

dist/.lint_success: $(TS_FILES) tslint.json $(REPO_ROOT)/tslint.json
	npm run lint
	touch $@

# No additional requirements for prepush besides test and lint (which are
# handled by the top level Makefile)
prepush:
.PHONY: prepush

NPM_PACK_DIR := dist/pack
pack: build
	rm -rf $(NPM_PACK_DIR)
	mkdir $(NPM_PACK_DIR)
	cd $(NPM_PACK_DIR) && npm pack ../..
.PHONY: pack

endif # IN_DOCKER
