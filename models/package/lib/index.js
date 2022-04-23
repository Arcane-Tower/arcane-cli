'use strict';

const path = require('path');
const fse = require('fs-extra');
const pkgDir = require('pkg-dir').sync;
const pathExists = require('path-exists').sync;
const npminstall = require('npminstall');
const { isObject, formatPath } = require('@arcane-cli/utils');
const { getNpmLatestVersion, getDefaultRegistry } = require('@arcane-cli/npm-info');
const log = require('@arcane-cli/log');

// npm package
class Index {
	constructor(options) {
		if (!options || !isObject(options)) {
			throw new Error('class Package [options] is object required!');
		}
		// npm 包目标路径
		this.targetPath = options.targetPath;
		// npm 包缓存路径, 本地包无缓存 ~/.arcane-cli/dependencies/
		this.storeDir = options.storeDir; // ${path}/node_modules 缓存模式 || undefined 本地包
		this.packageName = options.packageName;
		this.packageVersion = options.packageVersion;
		this.cacheFilePathPrefix = this.packageName.replace('/', '_'); // ~/.arcane-cli/dependencies/node_modules 下的真实路径
	}
	
	async prepare() {
		if (this.storeDir && !pathExists(this.storeDir)) {
			fse.mkdirpSync(this.storeDir); // 不存在则创建所有目录
		}
		if (this.packageVersion === 'latest') {
			this.packageVersion = await getNpmLatestVersion(this.packageName);
		}
	}
	
	get cacheFilePath() {
		return path.resolve(this.storeDir, `_${this.cacheFilePathPrefix}@${this.packageVersion}@${this.packageName}`); // 软链接真实指向文件
	}
	
	getSpecificCacheFilePath(packageVersion) {
		return path.resolve(this.storeDir, `_${this.cacheFilePathPrefix}@${packageVersion}@${this.packageName}`);
	}
	
	async exists() {
		if (this.storeDir) { // 缓存模式
			await this.prepare();
			return pathExists(this.cacheFilePath);
		} else { // 本地包模式
			return pathExists(this.targetPath);
		}
	}
	
	async install() {
		await this.prepare();
		return npminstall({
			root: this.targetPath,
			storeDir: this.storeDir,
			register: getDefaultRegistry(),
			pkgs: [
				{
					name: this.packageName,
					version: this.packageVersion,
				}
			]
		});
	}
	
	async update() {
		await this.prepare();
		const latestPackageVersion = await getNpmLatestVersion(this.packageName); // 最新版本
		const latestFilePath = this.getSpecificCacheFilePath(latestPackageVersion); // 看缓存目录是否有最新本
		if (!pathExists(latestFilePath)) {
			await npminstall({
				root: this.targetPath,
				storeDir: this.storeDir,
				register: getDefaultRegistry(),
				pkgs: [
					{
						name: this.packageName,
						version: this.packageVersion,
					}
				]
			});
			this.packageVersion = latestPackageVersion; // 更新最新版本
		} else {
			this.packageVersion = latestPackageVersion;
		}
		log.verbose('current npm package version', this.packageVersion)
	}
	
	getRootFilePath() {
		function _getRootFile(targetPath) {
			const dir = pkgDir(targetPath); // 找到 package.json
			if (dir) {
				const pkgFile = require(path.resolve(dir, 'package.json'));
				if (pkgFile && pkgFile.main) {
					return formatPath(path.resolve(dir, pkgFile.main)); // 返回 npm 包入口文件
				}
			}
		}
		
		if (this.storeDir) {
			return _getRootFile(this.cacheFilePath);
		} else {
			return _getRootFile(this.targetPath);
		}
	}
}

module.exports = Index;
