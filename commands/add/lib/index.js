'use strict';

const Command = require('@arcane-cli/command');
const log = require('@arcane-cli/log');
const fs = require('fs');
const pathExists = require('path-exists').sync;
const fse = require('fs-extra');
const ejs = require('ejs');
const glob = require('glob');
const pkgUp = require('pkg-up');
const semver = require('semver');
const inquirer = require('inquirer');
const userHome = require('user-home');
const request = require('@arcane-cli/request');
const Package = require('@arcane-cli/package');
const { spinnerStart, sleep, execAsync, objToArray, arrayToObj } = require('@arcane-cli/utils');

const ADD_MODE_SECTION = 'section';
const ADD_MODE_PAGE = 'page';

const TYPE_CUSTOM = 'custom';
const TYPE_NORMAL = 'normal';

process.on('unhandledRejection', e => {}); // 监听 promise 错误

// arcane-cli add -tp /Users/yangran/workspace/arcane-cli/commands/add -d src/views
// arcane-cli add -tp /Users/yangran/workspace/arcane-cli/commands/add -d src/views/MyHome
class AddCommand extends Command {
	init() {
		// 获取 add 命令的初始化参数
		this.dir = path.resolve(process.cwd(), this._argv[0] || '')
	}
	
	async exec() {
		this.addMode = await this.getAddMode();
		log.verbose('addMode', this.addMode);
		if (this.addMode === ADD_MODE_PAGE) {
			await this.installPageTemplate();
		} else {
			await this.installSectionTemplate();
		}
	}
	
	getPageTemplate() {
		return request({
			url: '/page/template',
			method: 'get',
		});
	}
	
	async getSectionTemplate() {
		return request({
			url: '/section/template',
			method: 'get',
		});
	}
	
	async installSectionTemplate() {
		log.verbose('start mode', this.addMode)
		// 1. 获取区块安装文件夹
		// this.dir = process.cwd();
		// 2. 选择代码片段模板
		this.sectionTemplate = await this.getTemplate(ADD_MODE_SECTION);
		// 3. 安装代码片段模板
		// 3.1 检查目录重名问题
		await this.prepare(ADD_MODE_SECTION);
		// 3.2 代码片段模板下载
		await this.downloadTemplate(ADD_MODE_SECTION);
		// 3.3 代码片段安装
		await this.installSection();
	}
	
	async installPageTemplate() {
		log.verbose('start mode', this.addMode)
		// 1 获取页面安装目录
		// this.dir = process.cwd();
		// 2 选择页面模板
		this.pageTemplate = await this.getTemplate();
		// 3 安装页面模板 检查重名目录
		await this.prepare();
		// 3.1 下载页面模板到缓存目录
		await this.downloadTemplate()
		// 3.2 将页面模板拷贝到目标目录
		await this.installTemplate();
		// 4 合并页面模板依赖
		// 5 页面模板安装完成
	}
	
	async getAddMode() {
		const res = await inquirer.prompt({
			type: 'list',
			name: 'addMode',
			message: '请选择代码复用模式',
			choices: [{
				name: '代码片段',
				value: ADD_MODE_SECTION,
			}, {
				name: '页面模板',
				value: ADD_MODE_PAGE,
			}],
		});
		return res.addMode;
	}
	
	async installSection() {
		// 1 选择要插入的源码文件
		const files = fs.readdirSync(this.dir, { withFileTypes: true })
			.map(file => file.isFile() ? file.name : null)
			.filter(Boolean)
			.map(file => ({ name: file, value: file }));
		console.log(files)
		if (files.length === 0) {
			throw new Error(`${this.dir}下没有文件`);
		}
		const { codeFile } = await inquirer.prompt({
			type: 'list',
			message: '请选择插入代码片段的文件',
			name: 'codeFile',
			choices: files,
		});
		// 2 输入插入的行数
		const { lineNumber } = await inquirer.prompt({
			type: 'input',
			message: '请输入要插入的行数',
			name: 'lineNumber',
			validate: function (value) {
				const done = this.async();
				if (!value || !value.trim()) {
					done('行数不得为空');
				} else if (Number(value) >= 0 && Math.floor(value) === Number(value)) {
					done(null, true);
				} else {
					done('行数必须为正整数');
				}
			}
		});
		
		log.verbose('codeFile:', codeFile);
		log.verbose('lineNumber:', lineNumber);
		
		// 3 对所要插入的文件进行分割 -> Array
		const codeFilePath = path.resolve(this.dir, codeFile);
		const codeContent = fs.readFileSync(codeFilePath, 'utf-8');
		const codeContentArr = codeContent.split('\n');
		
		// 4 以组件形式插入代码片段
		const componentName = this.sectionTemplate.sectionName.toLocaleLowerCase();
		const componentNameOriginal = this.sectionTemplate.sectionName;
		codeContentArr.splice(lineNumber, 0, `<${componentName}></${componentName}>`);
		
		// 5 插入代码片段的 import 语句
		const scriptIndex = codeContentArr.findIndex(code => code.replace(/\s/g, '') === '<script>');
		codeContentArr.splice(scriptIndex + 1, 0, `import ${componentNameOriginal} from './components/${componentNameOriginal}/index.vue'`);
		log.verbose('codeContentArr', codeContentArr);
		
		// 6 代码Arr 还原为 string
		const newCodeContent = codeContentArr.join('\n');
		fs.writeFileSync(codeFilePath, newCodeContent, 'utf-8');
		log.success('代码片段写入成功');
		
		// 7 创建代码片段组件目录
		fse.ensureDirSync(this.targetPath);
		const templatePath = path.resolve(this.sectionTemplatePackage.cacheFilePath, 'template', this.sectionTemplate.targetPath ? this.sectionTemplate.targetPath : ''); // database 没 section 则 直接拷 template 目录
		const targetPath = this.targetPath;
		log.verbose('templatePath', templatePath)
		fse.copySync(templatePath, targetPath);
		// glob('**/', {
		// 	cwd: templatePath,
		// }, function(err, files) {
		// 	console.log(files)
		// }) // todo 把 templatePath 下的片段目录作为选项进行选择
		log.success('代码片段拷贝拷贝成功');
		
	}
	
	async installTemplate() {
		log.info('正在安装页面模板');
		log.verbose('pageTemplate', this.pageTemplate);
		// 模板路径
		const templatePath = path.resolve(this.pageTemplatePackage.cacheFilePath, 'template', this.pageTemplate.targetPath);
		// 目标路径
		const targetPath = this.targetPath;
		log.verbose('templatePath', templatePath)
		if (!await pathExists(templatePath)) {
			throw new Error('页面模板不存在');
		}
		log.verbose('targetPath', targetPath);
		fse.ensureDirSync(templatePath);
		fse.ensureDirSync(targetPath);
		// 分流自定义安装模板
		if (this.pageTemplate.type === TYPE_CUSTOM) {
			await this.installCustomPageTemplate({ templatePath, targetPath });
		} else {
			await this.installNormalPageTemplate({ templatePath, targetPath })
		}

	}
	
	async installCustomPageTemplate({ templatePath, targetPath }) {
		// 获取自定义模板入口 pkg.main: index.js
		const rootFile = this.pageTemplatePackage.getRootFilePath();
		if (fs.existsSync(rootFile)) {
			log.notice('开始执行自定义模板');
			const options = {
				templatePath,
				targetPath,
				pageTemplate: this.pageTemplate,
			};
			const code = `require('${rootFile}')(${JSON.stringify(options)})`;
			await execAsync('node', ['-e', code], { stdio: 'inherit', cwd: process.cwd() });
			log.success('自定义模板安装成功');
		} else {
			throw new Error('自定义模板入口文件不存在！');
		}
	}
	
	async installNormalPageTemplate({ templatePath, targetPath }) {
		fse.copySync(templatePath, targetPath);
		await this.ejsRender({ targetPath });
		await this.dependencisesMerge({ templatePath, targetPath })
		log.success('安装页面模板成功');
	}
	
	async dependencisesMerge({ templatePath, targetPath }) {
		
		function depDiff(templateDepArr, targetDepArr) {
			let finalDep = [...targetDepArr];
			templateDepArr.forEach(templateDep => {
				const duplicatedDep = targetDepArr.find(targetDep => templateDep.key === targetDep.key);
				if (duplicatedDep) {
					const templateRange = semver.validRange(templateDep.value).split('<')[1];
					const targetRange = semver.validRange(duplicatedDep.value).split('<')[1];
					// 判断上限
					if (templateRange !== targetRange) {
						log.warn(`${templateDep.key}冲突，${templateDep.value} => ${duplicatedDep.value}`);
					}
				} else {
					log.verbose('模板有新依赖:', templateDep);
					finalDep.push(templateDep);
				}
			})
			return finalDep;
		}
		
		const templatePkgPath = pkgUp.sync({ cwd: templatePath });
		const targetPkgPath = pkgUp.sync({ cwd: targetPath });
		log.verbose('templatePkgPath', templatePkgPath)
		log.verbose('targetPkgPath', targetPkgPath)
		const templatePkg = fse.readJsonSync(templatePkgPath);
		const targetPkg = fse.readJsonSync(targetPkgPath);
		
		log.verbose('templatePkg', templatePkg)
		log.verbose('targetPkg', targetPkg)
		const templateDep = templatePkg.dependencies || {};
		const targetDep = targetPkg.dependencies || {};
		
		const templateDepArr = objToArray(templateDep);
		const targetDepArr = objToArray(targetDep);
		
		log.verbose('templateDepArr', templateDepArr)
		log.verbose('targetDepArr', targetDepArr)
		
		const newDep = depDiff(templateDepArr, targetDepArr);
		targetPkg.dependencies = arrayToObj(newDep);
		fse.writeJsonSync(targetPkgPath, targetPkg, { spaces: 2 });
		log.info('正在安装页面模板依赖 ');
		await this.execCommand('npm install', path.dirname(targetPkgPath));
		log.success('安装页面模板依赖成功');
	}
	
	async execCommand(command, cwd) {
		let ret;
		if (command) {
			const cmdArray = command.split(' ');
			const cmd = cmdArray[0];
			const args = cmdArray.slice(1);
			ret = await execAsync(cmd, args, {
				stdio: 'inherit',
				cwd,
			});
		}
		if (ret !== 0) {
			throw new Error(command + '命令执行失败');
		}
		return ret;
	}
	
	async ejsRender({ targetPath }) {
		const pageTemplate = this.pageTemplate
		const { ignore } = pageTemplate
		return new Promise((resolve, reject) => {
			glob('**', {
				cwd: targetPath,
				nodir: true,
				ignore: ignore || '',
			}, function (err, files) {
				if (err) { reject(err) }
				else {
					Promise.all(files.map(file => {
						const filePath = path.resolve(targetPath, file);
						return new Promise((res, rej) => {
							ejs.renderFile(filePath, {
								name: pageTemplate.pageName.toLocaleLowerCase(),
							}, {}, (err, result) => {
								if (err) { rej(err) }
								else {
									fse.writeFileSync(filePath, result);
									res(result);
								}
							})
						})
					}))
						.then(resolve)
						.catch(e => reject(e));
				}
			});
		})
	}
	
	async prepare(addMode = ADD_MODE_PAGE) {
		if (addMode === ADD_MODE_PAGE) {
			this.targetPath = path.resolve(this.dir, this.pageTemplate.pageName);
		} else {
			this.targetPath = path.resolve(this.dir, 'components', this.sectionTemplate.sectionName);
		}
		if (await pathExists(this.targetPath)) {
			throw new Error('页面文件夹已存在');
		}
	}
	
	async downloadTemplate(addMode = ADD_MODE_PAGE) {
		const name = addMode === ADD_MODE_PAGE ? '页面' : '代码片段';
		const targetPath = path.resolve(userHome, '.arcane-cli', 'template');
		const storeDir = path.resolve(targetPath, 'node_modules');
		const { npmName, version } = addMode === ADD_MODE_PAGE ? this.pageTemplate : this.sectionTemplate;
		const templatePackage = new Package({
			targetPath,
			storeDir,
			packageName: npmName,
			packageVersion: version,
		});
		if (!await templatePackage.exists()) {
			const spinner = spinnerStart(`正在下载${name}模板`);
			await sleep();
			try {
				await templatePackage.install();
			} catch (e) {
				throw e;
			} finally {
				spinner.stop(true);
				if (await templatePackage.exists()) {
					log.success(`下载${name}模板成功`);
					if (addMode === ADD_MODE_PAGE) {
						this.pageTemplatePackage = templatePackage;
					} else {
						this.sectionTemplatePackage = templatePackage;
					}
				}
			}
		} else {
			const spinner = spinnerStart(`正在更新${name}模板`);
			await sleep();
			try {
				await templatePackage.update();
			} catch (e) {
				throw e;
			} finally {
				spinner.stop(true);
				if (await templatePackage.exists()) {
					log.success(`更新${name}模板成功`);
					if (addMode === ADD_MODE_PAGE) {
						this.pageTemplatePackage = templatePackage;
					} else {
						this.sectionTemplatePackage = templatePackage;
					}
				}
			}
		}
	}
	
	async getTemplate(addMode = ADD_MODE_PAGE) {
		const name = addMode === ADD_MODE_PAGE ? '页面' : '代码片段';
		
		if (addMode === ADD_MODE_PAGE) {
			const pageTemplateData = await this.getPageTemplate();
			this.pageTemplateData = pageTemplateData;
		} else {
			const sectionTemplateData = await this.getSectionTemplate();
			this.sectionTemplateData = sectionTemplateData;
		}
		
		const pageTemplateName = (await inquirer.prompt({
			type: 'list',
			name: 'pageTemplateName',
			message: `请选择${name}模板`,
			choices: this.createChoices(addMode),
		})).pageTemplateName;
		// 2.1 输入页面名称
		const pageTemplate = (addMode === ADD_MODE_PAGE ? this.pageTemplateData : this.sectionTemplateData).find(item => item.npmName === pageTemplateName);
		if (!pageTemplate) {
			throw new Error(`${name}模板数据不存在`);
		}
		const { pageName } = (await inquirer.prompt({
			type: 'input',
			name: 'pageName',
			message: `请输入${name}名称`,
			default: '',
			validate: function (value) {
				const done = this.async();
				if (!value || !value.trim()) {
					done(`请输入${name}名称`);
					return;
				}
				done(null, true);
			}
		}));
		if (addMode === ADD_MODE_PAGE) {
			pageTemplate.pageName = pageName.trim();
		} else {
			pageTemplate.sectionName = pageName.trim();
		}
		return pageTemplate;
	}
	
	createChoices(addMode = ADD_MODE_PAGE) {
		return (addMode === ADD_MODE_PAGE ?  this.pageTemplateData : this.sectionTemplateData).map(item => ({
			name: item.name,
			value: item.npmName,
		}));
	}
}


function add(argv) {
	log.verbose('add argv: ', argv)
	return new AddCommand(argv);
}

module.exports = add;
module.exports.AddCommand = AddCommand;

