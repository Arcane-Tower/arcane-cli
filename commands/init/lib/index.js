'use strict';

const Command = require('@arcane-cli/command');
const log = require('@arcane-cli/log');
const fs = require('fs');
const pathExists = require('path-exists').sync;
const fse = require('fs-extra');
const semver = require('semver');
const inquirer = require('inquirer');
const userHome = require('user-home');
const Package = require('@arcane-cli/package');
const { spinnerStart, sleep } = require('@arcane-cli/utils');

const getProjectTemplate = require('./getProjectTemplate');

const TYPE_PROJECT = 'project';
const TYPE_COMPONENT = 'component';

// arcane-cli init -tp /Users/yangran/workspace/arcane-cli/commands/init -d -f projectDir
class InitCommand extends Command {
	init() {
		this.projectName = this._argv[0] || '';
		this.force = !!this._cmd.force;
		log.verbose('projectName', this.projectName);
		log.verbose('force', this.force);
		log.verbose('cmd', this._cmd);
	}
	
	async exec() {
		try {
			const projectInfo = await this.prepare();
			if (projectInfo) {
				log.verbose('projectInfo: ', projectInfo);
				this.projectInfo = projectInfo;
				await this.downloadTemplate();
			}
		} catch (e) {
			log.error(e.message);
		}
	}
	
	async downloadTemplate() {
		const { projectTemplate } = this.projectInfo;
		const templateInfo = this.templates.find(item => item.npmName === projectTemplate);
		const targetPath = path.resolve(userHome, '.arcane-cli', 'template');
		const storeDir = path.resolve(targetPath, 'node_modules');
		const { npmName, version } = templateInfo;
		log.verbose('downloadTemplate npmName version:', npmName + '@' + version);
		const templateNpm = new Package({
			targetPath,
			storeDir,
			packageName: npmName,
			packageVersion: version,
		});
		if (!await templateNpm.exists()) {
			const spinner = spinnerStart('正在下载模板。。。');
			await sleep();
			try {
				await templateNpm.install();
				log.success('模板下载成功');
			} catch (e) {
				throw e;
			} finally {
				spinner.stop(true);
			}
		} else {
			const spinner = spinnerStart('正在更新模板。。。');
			await sleep();
			try {
				await templateNpm.update();
				log.success('更新模板成功');
			} catch (e) {
				throw e;
			} finally {
				spinner.stop(true);
			}
		}
	}
	
	async prepare() {
		const templates = await getProjectTemplate();
		// const localPath = process.cwd(); // path.resolve(',')
		if (!templates || templates.length === 0) {
			throw new Error('项目模板不存在');
		}
		this.templates = templates;
		const localPath = path.resolve('.', this.projectName);
		
		log.verbose('localPath: ', localPath);
		if (!pathExists(localPath)) {
			fse.mkdirpSync(localPath); // 不存在则创建所有目录
		}
		if (!this.isDirEmpty(localPath)) {
			let ifContinue = false;
			if (!this.force) {
				ifContinue = (await inquirer.prompt({
					type: 'confirm',
					name: 'ifContinue',
					default: false,
					message: '当前文件夹不为空,是否继续创建项目?'
				})).ifContinue;
				if (!ifContinue) { return; }
			}
			
			if (ifContinue || this.force) {
				const { confirmDelete } = await inquirer.prompt({
					type: 'confirm',
					name: 'confirmDelete',
					default: false,
					message: '是否确认清空当前目录?'
				});
				if (confirmDelete) {
					fse.emptyDirSync(localPath);
				}
			}
		}
		return this.getProjectInfo();
	}
	
	async getProjectInfo() {
		let projectInfo = {};
		const { type } = await inquirer.prompt({
			type: 'list',
			name: 'type',
			message: '请选择初始化类型',
			default: TYPE_PROJECT,
			choices: [
				{
					name: '项目',
					value: TYPE_PROJECT
				},
				{
					name: '组件',
					value: TYPE_COMPONENT
				}
			]
		});
		log.verbose('type: ', type);
		if (type === TYPE_PROJECT) {
			const project = await inquirer.prompt(
				[
					{
						type: 'input',
						name: 'projectName',
						message: '请输入项目名称',
						default: '',
						validate: function (v) {
							const done = this.async();
							setTimeout(function () {
								// 1.首字符必须为英文字符
								// 2.尾字符必须为英文或数字，不能为字符
								// 3.字符仅允许"-_"
								if (!/^[a-zA-Z]+([-][a-zA-Z][a-zA-Z0-9]*|[_][a-zA-Z][a-zA-Z0-9]*|[a-zA-Z0-9])*$/.test(v)) {
									done('请输入合法的项目名称');
									return;
								}
								done(null, true);
							}, 0);
						},
						filter: function (v) {
							return v;
						}
					},
					{
						type: 'input',
						name: 'projectVersion',
						message: '请输入项目版本号',
						default: '1.0.0',
						validate: function (v) {
							const done = this.async();
							setTimeout(function () {
								if (!(!!semver.valid(v))) { // valid  return null | 1.0.0
									done('请输入合法的版本号');
									return;
								}
								done(null, true);
							}, 0);
						},
						filter: function (v) {
							if (!!semver.valid(v)) {
								return semver.valid(v);
							} else {
								return v;
							}
						},
					},
					{
						type: 'list',
						name: 'projectTemplate',
						message: '请选择项目模板',
						choices: this.templates.map(item => ({ value: item.npmName, name: item.name }))
					}
				]
			);
			projectInfo = {
				type,
				...project
			}
		} else if (type === TYPE_COMPONENT) {
		
		}
		return projectInfo;
	}
	
	isDirEmpty(path) {
		let fileList = fs.readdirSync(path);
		fileList = fileList.filter(file => (
			!file.startsWith('.') && ['node_modules'].indexOf(file) < 0 // .git .idea node_modules 不影响
		));
		return !fileList || fileList.length <= 0;
	}
}

function init(argv) {
	return new InitCommand(argv);
}

module.exports = init;
module.exports.InitCommand = InitCommand;
