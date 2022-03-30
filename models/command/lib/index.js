'use strict';

const semver = require('semver');
const colors = require('colors');
const log = require('@arcane-cli/log');

const LOWEST_NODE_VERSION = '12.0.0';

class Command {
	/**
	 *
	 * @param argv: Array [...args, cmd]
	 */
	constructor(argv) {
		if (!argv) {
			throw new Error('参数不能为空！');
		}
		if (!Array.isArray(argv)) {
			console.log(argv)
			throw new Error('参数必须为数组！');
		}
		if (argv.length < 1) {
			throw new Error('参数列表为空！');
		}
		this._argv = argv;
		let runner = new Promise((resolve, reject) => {
			let chain = Promise.resolve();
			chain = chain.then(() => this.checkNodeVersion());
			chain = chain.then(() => this.initArgs());
			chain = chain.then(() => this.init());
			chain = chain.then(() => this.exec());
			chain.catch(err => {
				log.error(err.message);
			})
		});
	}
	
	initArgs() {
		/**
		 * -tp /Users/yangran/workspace/arcane-cli/commands/init -d -f projectDir
		 * ['projectDir', Command]
		 */
		this._cmd = this._argv[this._argv.length - 1]; // 最后一个是命令
		this._argv = this._argv.slice(0, this._argv.length - 1); // 除最后一个其他事参数
	}
	
	checkNodeVersion() {
		if (!semver.gte(process.version, LOWEST_NODE_VERSION)) {
			throw new Error(colors.red(`arcane-cli node 版本必须大于 v${LOWEST_NODE_VERSION}`));
		}
	}
	
	init() {
		throw new Error('init必须实现！');
	}
	
	exec() {
		throw new Error('exec必须实现！');
	}
}

module.exports = Command;
