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
const Package = require('@arcane-cli/package');
const { spinnerStart, sleep, execAsync, objToArray, arrayToObj } = require('@arcane-cli/utils');

const PAGE_TEMPLATE = [
	{
		name: 'vue2首页模板',
		npmName: 'arcane-cli-template-page-vue2',
		version: '1.0.1',
		targetPath: 'src/views/Home',
		
	}
]

process.on('unhandledRejection', e => {}); // 监听 promise 错误

// arcane-cli add -tp /Users/yangran/workspace/arcane-cli/commands/add -d
class AddCommand extends Command {
	init() {
		// 获取 add 命令的初始化参数
	}
	
	async exec() {
		// 1 获取页面安装目录
		this.dir = process.cwd();
		// 2 选择页面模板
		this.pageTemplate = await this.getPageTemplate();
		// 3 安装页面模板 检查重名目录
		await this.prepare();
		// 3.1 下载页面模板到缓存目录
		await this.downloadTemplate()
		// 3.2 将页面模板拷贝到目标目录
		await this.installTemplate();
		// 4 合并页面模板依赖
		// 5 页面模板安装完成
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
		// await this.execCommand('npm install', path.dirname(targetPkgPath));
		log.success('安装页面模板依赖成功');
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
	
	async prepare() {
		this.targetPath = path.resolve(this.dir, this.pageTemplate.pageName);
		if (await pathExists(this.targetPath)) {
			throw new Error('页面文件夹已存在');
		}
	}
	
	async downloadTemplate() {
		const targetPath = path.resolve(userHome, '.arcane-cli', 'template');
		const storeDir = path.resolve(targetPath, 'node_modules');
		const { npmName, version } = this.pageTemplate;
		const pageTemplatePackage = new Package({
			targetPath,
			storeDir,
			packageName: npmName,
			packageVersion: version,
		});
		if (!await pageTemplatePackage.exists()) {
			const spinner = spinnerStart('正在下载页面模板');
			await sleep();
			try {
				await pageTemplatePackage.install();
			} catch (e) {
				throw e;
			} finally {
				spinner.stop(true);
				if (await pageTemplatePackage.exists()) {
					log.success('下载页面模板成功');
					this.pageTemplatePackage = pageTemplatePackage;
				}
			}
		} else {
			const spinner = spinnerStart('正在更新页面模板');
			await sleep();
			try {
				await pageTemplatePackage.update();
			} catch (e) {
				throw e;
			} finally {
				spinner.stop(true);
				if (await pageTemplatePackage.exists()) {
					log.success('更新页面模板成功');
					this.pageTemplatePackage = pageTemplatePackage;
				}
			}
		}
	}
	
	async getPageTemplate() {
		const pageTemplateName = (await inquirer.prompt({
			type: 'list',
			name: 'pageTemplateName',
			message: '请选择页面模板',
			choices: this.createChoices(),
		})).pageTemplateName;
		// 2.1 输入页面名称
		const pageTemplate = PAGE_TEMPLATE.find(item => item.npmName === pageTemplateName);
		if (!pageTemplate) {
			throw new Error('页面模板数据不存在');
		}
		const { pageName } = (await inquirer.prompt({
			type: 'input',
			name: 'pageName',
			message: '请输入页面名称',
			default: '',
			validate: function (value) {
				const done = this.async();
				if (!value || !value.trim()) {
					done('请输入页面名称');
					return;
				}
				done(null, true);
			}
		}));
		pageTemplate.pageName = pageName.trim();
		return pageTemplate;
	}
	
	createChoices() {
		return PAGE_TEMPLATE.map(item => ({
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

