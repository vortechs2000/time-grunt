'use strict';
var _ = require ('lodash');
var chalk = require('chalk');
var table = require('text-table');
var hooker = require('hooker');
var dateTime = require('date-time');
var prettyMs = require('pretty-ms');
var argv = process.argv;

var write = process.stdout.write.bind(process.stdout);

function log(str) {
	write(str + '\n', 'utf8')
}

module.exports = function (grunt,options) {
	var BAR_CHAR = process.platform === 'win32' ? '■' : '▇';
	var now = new Date();
	var startTimePretty = dateTime();
	var startTime = now.getTime();
	var prevTime = startTime;
	var prevTaskName = 'loading tasks';
	var tableData = [];
	var defaults = {
	    time_color: 'blue',
	    bar_color: 'blue',
	    total_color: 'bold.blue',
	    timestamp_color: 'gray'
	};

	options = _.extend({}, defaults, options);

        var timestamp_color_func = eval('chalk.' + options.timestamp_color);
	var time_color_func = eval('chalk.' + options.time_color);
	var bar_color_func = eval('chalk.' + options.bar_color);
	var total_color_func = eval('chalk.bold.' + options.total_color);


	if (argv.indexOf('--help') !== -1 ||
	    argv.indexOf('-h') !== -1 ||
	    argv.indexOf('--version') !== -1 ||
	    argv.indexOf('-V') !== -1 ||
	    argv.indexOf('--verbose') !== -1 ||
	    argv.indexOf('--v') !== -1) {
		return;
	}

	// crazy hack to work around stupid node-exit
	// Can this be removed now that node-exit#4 has been resolved?
	// https://github.com/cowboy/node-exit/issues/4
	var originalExit = process.exit;

	function exit(exitCode) {
		clearInterval(interval);
		process.emit('timegruntexit', exitCode);
		exit = function() {};
	}

	var interval = setInterval(function () {
		process.exit = exit;
	}, 100);
	process.exit = exit;

	hooker.hook(grunt.log, 'header', function () {
		var name = grunt.task.current.nameArgs;
		var diff = Date.now() - prevTime;

		if (prevTaskName && prevTaskName !== name) {
			tableData.push([prevTaskName, diff]);
		}

		prevTime = Date.now();
		prevTaskName = name;
	});

	function formatTable(tableData) {
		var totalTime = Date.now() - startTime;

		var longestTaskName = tableData.reduce(function (acc, row) {
			var avg = row[1] / totalTime;
			if (avg < 0.01 && !grunt.option('verbose')) {
				return acc;
			}
			return Math.max(acc, row[0].length);
		}, 0);

		var maxColumns = process.stdout.columns || 80;
		var maxBarWidth;

		if (longestTaskName > maxColumns / 2) {
			maxBarWidth = (maxColumns - 20) / 2;
		} else {
			maxBarWidth = maxColumns - (longestTaskName + 20);
		}

		function shorten(taskName) {
			var nameLength = taskName.length;

			if (nameLength <= maxBarWidth) {
				return taskName;
			}

			var partLength = Math.floor((maxBarWidth - 3) / 2);
			var start = taskName.substr(0, partLength + 1);
			var end = taskName.substr(nameLength - partLength);
			return start.trim() + '...' + end.trim();
		}

		function createBar(percentage) {
			var rounded = Math.round(percentage * 100);

			if (rounded === 0) {
				return '0%';
			}

			var barLength = Math.ceil(maxBarWidth * percentage) + 1;
			var bar = new Array(barLength).join(BAR_CHAR);
			return bar + ' ' + rounded + '%';
		}

		var tableDataProcessed = tableData.map(function (row) {
			var avg = row[1] / totalTime;
			if (avg < 0.01 && !grunt.option('verbose')) {
				return;
			}
			return [shorten(row[0]), time_color_func(prettyMs(row[1])), bar_color_func(createBar(avg))];
		}).reduce(function (acc, row) {
			if (row) {
				acc.push(row);
				return acc;
			}
			return acc;
		}, []);

		tableDataProcessed.push([total_color_func('Total', prettyMs(totalTime))]);

		return table(tableDataProcessed, {
			align: [ 'l', 'r', 'l' ],
			stringLength: function (str) {
				return chalk.stripColor(str).length;
			}
		});
	}

	process.on('SIGINT', function () {
		process.exit();
	});

	process.once('timegruntexit', function (exitCode) {
		clearInterval(interval);
		process.exit = originalExit;

		hooker.unhook(grunt.log, 'header');

		var diff = Date.now() - prevTime;
		if (prevTaskName) {
			tableData.push([prevTaskName, diff]);
		}

		// `grunt.log.header` should be unhooked above, but in some cases it's not
		log('\n\n' + chalk.underline('Execution Time') + timestamp_color_func(' (' + startTimePretty + ')'));
		log(formatTable(tableData) + '\n');
		process.exit(exitCode);
	});
};
