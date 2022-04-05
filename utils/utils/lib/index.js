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

module.exports = {
	sleep,
	isObject,
	formatPath,
	spinnerStart,
};
