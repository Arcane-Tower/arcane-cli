'use strict';

const Command = require('@arcane-cli/command');
const log = require('@arcane-cli/log');
const path = require('path');
const fs = require('fs');
const fse = require('fs-extra');
const Git = require('@arcane-cli/git');

class PublishCommand extends Command {
	init() {
		log.verbose('publish', this._argv, this._cmd);
		this.options = {
			refreshServer: this._cmd.refreshServer,
			refreshToken: this._cmd.refreshToken,
			refreshOwner: this._cmd.refreshOwner,
		}
	}
	
	async exec() {
		try {
			const startTime = new Date().getTime();
			this.prepare();
			// git flow
			const git = new Git(this.projectInfo, this.options);
			await git.prepare();
			await git.commit();
			// clound build
			const endTime = new Date().getTime();
			log.info('本次发布耗时: ', Math.floor((endTime - startTime) / 1000) + 's');
		} catch (e) {
			log.error(e.message);
			if (process.env.LOG_LEVEL === 'verbose') {
				console.log(e);
			}
		}
	}
	
	prepare() {
		const projectPath = process.cwd();
		const pkgPath = path.resolve(projectPath, 'package.json');
		log.verbose('package.json', pkgPath);
		if (!fs.existsSync(pkgPath)) {
			throw new Error('package.json 不存在');
		}
		
		const pkg = fse.readJsonSync(pkgPath);
		const { name, version, scripts } = pkg;
		log.verbose('package.json', name, version, scripts);
		if (!name || !version || !scripts || !scripts.build) {
			throw new Error('package.json 信息不全');
		}
		this.projectInfo = { name, version, dir: projectPath };
		
	}
	
}

function publish(argv) {
	return new PublishCommand(argv)
}

module.exports = publish;
module.exports.PublishCommand = PublishCommand;
