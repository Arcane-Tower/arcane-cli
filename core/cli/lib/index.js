'use strict';

module.exports = core;

const path = require('path')
const log = require('@arcane-cli/log');
const exec = require('@arcane-cli/exec');
const colors = require('colors');
const semver = require('semver');
const commander = require('commander');
const userHome = require('user-home');
const pathExists = require('path-exists').sync;

const pkg = require('../package.json');
const { DEFAULT_CLI_HOME } = require('./const');

const program = new commander.Command();

async function core() {
	try {
		await prepare();
		registerCommand();
	} catch (e) {
		log.error(e.message || 'cli error')
		if (process.env.LOG_LEVEL = 'verbose') {
			console.log(e)
		}
	}
}

function registerCommand() {
	log.verbose('当前运行目录: ', __dirname)
	
	program
		.name(Object.keys(pkg.bin)[0])
		.usage('<command> [options]')
		.version(pkg.version)
		.option('-d, --debug', 'debugger 模式', false)
		.option('-tp --targetPath <targetPath>', '制定本地调试文件路径', ''); // /Users/yangran/workspace/arcane-cli/commands/init
	
	program
		.command('init [projectName]')
		.option('-f, --force', 'force create project')
		.action(exec);
	
	program.on('option:debug', () => {
		if (program.debug) {
			process.env.LOG_LEVEL = 'verbose';
		} else {
			process.env.LOG_LEVEL = 'info';
		}
		log.level = process.env.LOG_LEVEL;
	});
	
	program.on('option:targetPath', function() {
		process.env.CLI_TARGET_PATH = program.targetPath;
	})
	
	program.on('command:*', (args) => {
		const availableCommands = program.commadns.map(cmd => cmd.name());
		log.warn(colors.red('not found cmd: ' + args));
		if (availableCommands.length > 0) {
			log.info(colors.red('可用命令: ', availableCommands.join(',')));
		}
	});
	
	program.parse(process.argv);
	
	if (program.args && program.args.length < 1) {
		program.outpuHelp();
		console.log('\n');
	}
}

async function checkGlobalUpdate() {
	const { version: currentVersion, name: npmName } = pkg;
	const { getNpmSemverVersion } = require('@arcane-cli/npm-info')
	const lastVersion = await getNpmSemverVersion(currentVersion, npmName);
	if (lastVersion && semver.gt(lastVersion, currentVersion)) {
		log.warn(colors.yellow(`${npmName} now version: ${currentVersion}, last version: ${lastVersion}\n command: npm install -g ${npmName}`))
	}
}

async function prepare() {
	checkPkgVersion();
	checkRoot();
	checkUserHome();
	checkEnv();
	await checkGlobalUpdate()
}

/**
 * @env
 * CLI_HOME: 将设置的缓存目录
 * CLI_HOME_PATH: 缓存目录
 * LOG_LEVEL: 日志级别
 */
function checkEnv() {
	const env = require('dotenv')
	const envPath = path.resolve(__dirname, '.env')
	const envUserPath = path.resolve(userHome, '.env')
	if (pathExists(envPath)) {
		env.config({ path: envPath });
	}
	if (pathExists(envUserPath)) {
		env.config({ path: envUserPath });
	}
	createDefaultConfig()
	log.verbose('CLI_HOME_PATH: ', process.env.CLI_HOME_PATH)
	
}

function createDefaultConfig() {
	const config = {
		home: userHome
	};
	if (process.env.CLI_HOME) {
		config['home'] = path.join(userHome, process.env.CLI_HOME);
	} else {
		config['home'] = path.join(userHome, DEFAULT_CLI_HOME);
	}
	process.env.CLI_HOME_PATH = config.home
}

function checkUserHome() {
	if (!userHome || !pathExists(userHome)) {
		throw new Error(colors.red('用户 user-home 不存在'))
	}
}

function checkRoot() {
	const rootCheck = require('root-check')
	rootCheck() // root 降级 防止 sudo 创建文件无法删除
  // process.geteuid() // root 为 0
}

function checkPkgVersion() {
	log.info(pkg.version)
}
