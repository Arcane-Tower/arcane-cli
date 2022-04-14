'use strict';

const Command = require('@arcane-cli/command');
const log = require('@arcane-cli/log');
const fs = require('fs');
const pathExists = require('path-exists').sync;
const fse = require('fs-extra');
const glob = require('glob');
const ejs = require('ejs');
const semver = require('semver');
const inquirer = require('inquirer');
const userHome = require('user-home');
const Package = require('@arcane-cli/package');
const { spinnerStart, sleep, execAsync } = require('@arcane-cli/utils');

const getProjectTemplate = require('./getProjectTemplate');

const TYPE_PROJECT = 'project';
const TYPE_COMPONENT = 'component';

const TEMPLATE_TYPE_NORMAL = 'normal';
const TEMPLATE_TYPE_CUSTOM = 'custom';

const WHITE_COMMAND = ['npm', 'cnpm', 'yarn'];

// arcane-cli init -tp /Users/yangran/workspace/arcane-cli/commands/init -d -f projectDir
// arcane-cli init  -tp /Users/yangran/workspace/arcane-cli/commands/init -d -f test-project
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
				await this.installTemplate();
			}
		} catch (e) {
			log.error(e.message);
			if (process.env.LOG_LEVEL = 'verbose') {
				console.log(e)
			}
		}
	}
	
	
	async installTemplate() {
		log.verbose('templateInfo', this.templateInfo);
		if (this.templateInfo) {
			if (!this.templateInfo.type) {
				this.templateInfo.type = TEMPLATE_TYPE_NORMAL; // 默认 normal
			}
			if (this.templateInfo.type === TEMPLATE_TYPE_NORMAL) {
				await this.installNormalTemplate();
			} else if (this.templateInfo.type === TEMPLATE_TYPE_CUSTOM) {
				await this.installCustomTemplate();
			} else {
				throw new Error('无法识别项目模板类型');
			}
		} else {
			throw new Error('项目模板信息不存在');
		}
	}
	
	checkCommand(cmd) {
		if (WHITE_COMMAND.includes(cmd)) {
			return cmd;
		}
		return null;
	}
	
	async installNormalTemplate() {
		log.verbose('templateNpm', this.templateNpm);
		let spinner = spinnerStart('正在安装模板..');
		await sleep();
		try {
			const templatePath = path.resolve(this.templateNpm.cacheFilePath, 'template');
			log.verbose('templatePath', templatePath)
			const targetPath = process.cwd();
			log.verbose('targetPath', targetPath)
			fse.ensureDirSync(templatePath);
			fse.ensureDirSync(targetPath);
			fse.copySync(templatePath, targetPath);
		} catch (e) {
			throw e;
		} finally {
			spinner.stop(true);
			log.success('模板安装成功 ');
		}
		const templateIgnore = this.templateInfo.ignore || [];
		const ignore = ['**/node_modules/**', ...templateIgnore];
		await this.ejsRender({ ignore });
		const { installCommand, startCommand } = this.templateInfo;
		await this.execCommand(installCommand, '依赖安装失败');
		await this.execCommand(startCommand, '启动命令失败');
	}
	
	async installCustomTemplate() {
		if (await this.templateNpm.exists()) {
			const rootFile = this.templateNpm.getRootFilePath();
			if (fs.existsSync(rootFile)) {
				log.notice('开始执行自定义模板');
				const templatePath = path.resolve(this.templateNpm.cacheFilePath, 'template');
				const options = {
					templateInfo: this.templateInfo,
					projectInfo: this.projectInfo,
					sourcePath: templatePath,
					targetPath: process.cwd()
				};
				const code = `require('${rootFile}')(${JSON.stringify(options)})`
				log.verbose('installCustomTemplate code', code);
				await execAsync('node', ['-e', code], { stdio: 'inherit', cwd: process.cwd() });
				log.success('自定义模板安装成功');
			} else {
				throw new Error('自定义模板入口不存在');
			}
		}
	}
	
	async execCommand(command, errMsg) {
		let ret;
		if (command) {
			const cmdArray = command.split(' '); // npm install --registry=..., npm run serve
			const cmd = this.checkCommand(cmdArray[0]); // npm yarn cnpm
			if (!cmd) {
				throw new Error('命令不存在' + command);
			}
			const args = cmdArray.slice(1);
			ret = await execAsync(cmd, args, {
				stdio: 'inherit',
				cwd: process.cwd()
			});
		}
		if (ret !== 0) { throw new Error(errMsg); }
		return ret;
	}
	
	async ejsRender(options) {
		const dir = process.cwd();
		const projectInfo = this.projectInfo;
		return new Promise((resolve, reject) => {
			glob('**', {
				cwd: dir,
				ignore: options.ignore || '',
				nodir: true, // 忽略文件夹
			}, function (err, files) {
				if (err) { reject(err) }
				Promise.all(files.map(file => {
					const filePath = path.join(dir, file);
					return new Promise((res, rej) => {
						ejs.renderFile(filePath, projectInfo, {}, (err, result) => {
							if (err) { rej(err) }
							else {
								fse.writeFileSync(filePath, result);
								res(result);
							}
						})
					}).then(() => resolve())
						.catch(err => reject(err));
				}))
			})
		})
	}
	
	async downloadTemplate() {
		const { projectTemplate } = this.projectInfo;
		const templateInfo = this.templateInfo = this.templates.find(item => item.npmName === projectTemplate);
		
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
				this.templateNpm = templateNpm;
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
				this.templateNpm = templateNpm;
			} catch (e) {
				throw e;
			} finally {
				spinner.stop(true);
			}
		}
	}
	
	async prepare() {
		const templates = await getProjectTemplate();
		const localPath = process.cwd(); // path.resolve(',')
		if (!templates || templates.length === 0) {
			throw new Error('项目模板不存在');
		}
		this.templates = templates;
		// const localPath = path.resolve('.', this.projectName);
		
		log.verbose('localPath: ', localPath);
		if (!pathExists(localPath)) {
			// fse.mkdirpSync(localPath); // 不存在则创建所有目录
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
		function isValidName(v) {
			return /^[a-zA-Z]+([-][a-zA-Z][a-zA-Z0-9]*|[_][a-zA-Z][a-zA-Z0-9]*|[a-zA-Z0-9])*$/.test(v)
		}
		let projectInfo = {};
		let isProjectNameValid = false;
		if (isValidName(this.projectName)) { // arcane-cli test-project
			isProjectNameValid = true;
			projectInfo.projectName = this.projectName;
		}
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
		this.templates = this.templates.filter(template => template.tag.includes(type));
		const title = type === TYPE_PROJECT ? '项目' : '组件';
		
		const projectNamePrompt = {
			type: 'input',
			name: 'projectName',
			message: `请输入${title}名称`,
			default: '',
			validate: function (v) {
				const done = this.async();
				setTimeout(function () {
					// 1.首字符必须为英文字符
					// 2.尾字符必须为英文或数字，不能为字符
					// 3.字符仅允许"-_"
					if (!isValidName(v)) {
						done('请输入合法的项目名称');
						return;
					}
					done(null, true);
				}, 0);
			},
			filter: function (v) {
				return v;
			}
		};
		let projectPrompt = [];
		if (!isProjectNameValid) {
			projectPrompt.push(projectNamePrompt);
		}
		projectPrompt.push(
			{
				type: 'input',
				name: 'projectVersion',
				message: `请输入${title}版本号`,
				default: '1.0.0',
				validate: function (v) {
					const done = this.async();
					setTimeout(function () {
						if (!(!!semver.valid(v))) { // valid  return null | 1.0.0
							return done('请输入合法的版本号');
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
				message: `请选择${title}模板`,
				choices: this.templates.map(item => ({ value: item.npmName, name: item.name }))
			}
		);
		
		if (type === TYPE_PROJECT) {
			const project = await inquirer.prompt(projectPrompt);
			projectInfo = {
				...projectInfo,
				type,
				...project,
			}
		} else if (type === TYPE_COMPONENT) {
			const descriptionPrompt = {
				type: 'input',
				name: 'componentDescription',
				message: '请输入组件描述信息',
				default: '',
				validate: function (v) {
					const done = this.async();
					setTimeout(function () {
						if (!v) {
							return done('请输入组件描述信息');
						}
						done(null, true);
					}, 0);
				}
			};
			projectPrompt.push(descriptionPrompt);
			const component = await inquirer.prompt(projectPrompt);
			projectInfo = {
				...projectInfo,
				type,
				...component,
			};
		}
		
		if (projectInfo.projectName) {
			projectInfo.name = projectInfo.projectName;
			projectInfo.className = require('kebab-case')(projectInfo.projectName).replace('/^-/', '');
		}
		if (projectInfo.projectVersion) {
			projectInfo.version = projectInfo.projectVersion;
		}
		if (projectInfo.componentDescription) {
			projectInfo.description = projectInfo.componentDescription;
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
