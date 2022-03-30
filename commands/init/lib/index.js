'use strict';

const Command = require('@arcane-cli/command');
const log = require('@arcane-cli/log');
// arcane-cli init -tp /Users/yangran/workspace/arcane-cli/commands/init -d -f projectDir
class InitCommand extends Command {
	init() {
		this.projectName = this._argv[0] || '';
		this.force = !!this._cmd.force;
		log.verbose('projectName', this.projectName);
		log.verbose('force', this.force);
		log.verbose('cmd', this._cmd);
	}
	
	exec() {
		console.log('init的业务逻辑');
	}
}

function init(argv) {
	return new InitCommand(argv);
}

module.exports = init;
module.exports.InitCommand = InitCommand;
