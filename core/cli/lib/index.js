'use strict';

module.exports = core;

const path = require('path')
const log = require('../../../utils/log/lib/index');
const colors = require('colors');
const semver = require('semver');
const userHome = require('user-home');
const pathExists = require('path-exists').sync;

const pkg = require('../package.json');
const { LOWEST_NODE_VERSION, DEFAULT_CLI_HOME } = require('./const');

let args;

async function core() {
	try {
		checkPkgVersion();
		checkNodeVersion();
		checkRoot();
		checkUserHome();
		checkInputArgs();
		checkEnv();
		await checkGlobalUpdate()
	} catch (e) {
		log.error(e.message || 'cli error')
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

function checkInputArgs() {
	args = require('minimist')(process.argv.slice(2))
	if (args.debug) {
		process.env.LOG_LEVEL = 'verbose';
	} else {
		process.env.LOG_LEVEL = 'info';
	}
	log.level = process.env.LOG_LEVEL;
	log.verbose('当前运行目录: ', __dirname)
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
	if (!semver.gte(process.version, LOWEST_NODE_VERSION)) {
		throw new Error(colors.red(`arcane-cli node 版本必须大于 v${LOWEST_NODE_VERSION}`));
	}
}

function checkNodeVersion() {
	log.info(pkg.version)
}

