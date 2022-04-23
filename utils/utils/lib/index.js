'use strict';

const path = require('path');

function formatPath(p) {
	if (p && typeof p === 'string') {
		const sep = path.sep;
		if (sep === '/') {
			return p;
		} else {
			return p.replace(/\\/g, '/');
		}
	}
	return p;
}

function isObject(o) {
	return Object.prototype.toString.call(o) === '[object Object]';
}

function spinnerStart(msg, spinnerString = '|/-\\') {
	const Spinner = require('cli-spinner').Spinner;
	const spinner = new Spinner(msg + ' %s');
	spinner.setSpinnerString(spinnerString);
	spinner.start();
	return spinner;
}

function sleep(timeout = 1000) {
	return new Promise(resolve => setTimeout(resolve, timeout));
}

function objToArray(o) {
	const arr = [];
	Object.keys(o).forEach(key => {
		arr.push({
			key,
			value: o[key],
		});
	});
	return arr;
}

function arrayToObj(arr) {
	const o = {};
	arr.forEach(item => o[item.key] = item.value);
	return o;
}

function exec(command, args, options) {
	const win32 = process.platform === 'win32';
	
	const cmd = win32 ? 'cmd' : command;
	const cmdArgs = win32 ? ['/c'].concat(command, args) : args;
	
	return require('child_process').spawn(cmd, cmdArgs, options || {});
}

function execAsync(command, args, options) {
	return new Promise((resolve, reject) => {
		const p = exec(command, args, options);
		p.on('error', e => {
			reject(e)
		});
		p.on('exit', c => {
			resolve(c);
		});
	});
}

module.exports = {
	sleep,
	isObject,
	formatPath,
	spinnerStart,
	exec,
	execAsync,
	objToArray,
	arrayToObj,
};
