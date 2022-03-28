#! /usr/bin/env node

const importLocal = require('import-local')

if (importLocal(__filename)) {
	return
} else {
  require('../lib/index')(process.argv.slice(2))
}
