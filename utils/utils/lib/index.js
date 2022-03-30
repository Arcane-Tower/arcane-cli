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

module.exports = {
	isObject,
	formatPath,
};
