const request = require('@arcane-cli/request');

module.exports = function() {
	return request({
		url: '/project/template',
	});
};
