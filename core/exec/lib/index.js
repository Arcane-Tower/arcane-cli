'use strict';

const path = require('path');
const Package = require('@arcane-cli/package');
const log = require('@arcane-cli/log');
const { exec: spawn } = require('@arcane-cli/utils');

// todo fetch
const SETTINGS = {
	init: '@arcane-cli/init',
	add: '@arcane-cli/add',
	publish: '@arcane-cli/publish'
	// init: '@vue/shared'
}

const CACHE_DIR = 'dependencies';

async function exec() {
	let targetPath = process.env.CLI_TARGET_PATH;
	const homePath = process.env.CLI_HOME_PATH;
	let storeDir = '';
	let pkg;
	log.verbose('targetPath:', targetPath);
	log.verbose('homePath:', homePath);
	
	const cmdObj = arguments[arguments.length - 1]; // commander 对象为最后一个
	const cmdName = cmdObj.name();
	const packageName = SETTINGS[cmdName];
	const packageVersion = 'latest'; // 指定版本
	// const packageVersion = '3.0.3'; // 指定版本
	
	// 是否指定本地命令包
	if (!targetPath) { // 缓存模式
		targetPath = path.resolve(homePath, CACHE_DIR); // ~/.arcane-cli/dependencies 缓存路径
		storeDir = path.resolve(targetPath, 'node_modules'); // ~/.arcane-cli/dependencies/node_modules npm 安装包位置
		log.verbose('targetPath', targetPath);
		log.verbose('storeDir', storeDir);
		// 创建一个 npm 包
		pkg = new Package({
			targetPath,
			storeDir,
			packageName,
			packageVersion,
		});
		const pkgPath = await pkg.exists();
		if (pkgPath) {
			await pkg.update(); // 缓存已安装, 更新
		} else {
			await pkg.install(); // 安装
		}
	} else {
		// 使用本地 npm 包
		pkg = new Package({
			targetPath,
			packageName,
			packageVersion,
		});
	}
	const rootFile = pkg.getRootFilePath(); // npm 包的执行文件
	log.verbose('rootFile: ', rootFile);
	if (rootFile) {
		try {
			// require(rootFile).call(null, Array.from(arguments)); // 当前进程
			// return

			// 多进程执行
			const args = formatArgs([...arguments]);
			log.verbose(args.length);
			const code = `require('${rootFile}').call(null, ${JSON.stringify(args)})`;
			const child = spawn('node', ['-e', code], {
				cwd: process.cwd(),
				stdio: 'inherit',
			});
			child.on('error', e => {
				log.error(e.message);
				process.exit(1);
			});
			child.on('exit', e => {
				log.verbose('命令执行成功:' + e);
				process.exit(e);
			});
		} catch (e) {
			log.error(e.message);
		}
	}
}

function formatArgs(args) {
	const cmd = args[args.length - 1];
	const o = Object.create(null);
	Object.keys(cmd).forEach(key => {
		if (cmd.hasOwnProperty(key) &&
			!key.startsWith('_') &&
			key !== 'parent') {
			o[key] = cmd[key];
		}
	});
	args[args.length - 1] = o;
	return args;
}

module.exports = exec;

