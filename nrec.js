/**
 * Copyright 2010 Noble Samurai
 * 
 * NobleRecord is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 * 
 * NobleRecord is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 * 
 * You should have received a copy of the GNU General Public License
 * along with NobleRecord.  If not, see <http://www.gnu.org/licenses/>.
 */

var common = require('./src/common'),
	util = require('./src/util');

var NobleRecord = require('./noblerecord').NobleRecord;
var NobleMachine = require('./src/lib/noblemachine/noblemachine').NobleMachine;

var sys = require('sys');

var command = process.argv.slice(2, 4).join(' ');

sys.log(command);

var sys = require('sys'),
	fs = require('fs');

global.NobleRecord = NobleRecord;

if (command != 'init') {
	require(process.cwd() + '/db/config');
}

function generate_schema() {
	var act = new NobleMachine(function() {
		act.toNext(NobleRecord.Migration.recreate());
	});

	act.next(function(code) {
		var fd = fs.openSync('db/schema.js', 'w');
		fs.writeSync(fd, code);
		fs.closeSync(fd);
	});

	return act;
}

var logger = common.config.logger;

function dateFromFilename(fn) {
	var match = fn.match(/(\d+)_(.+?)\.js/);
	if (!match) return null;

	var datestr = match[1];

	var m = datestr.match(/(\d\d\d\d)(\d\d)(\d\d)(\d\d)(\d\d)(\d\d)/);
	return new Date(m[1], m[2], m[3], m[4], m[5], m[6]);
}

function migrate(dir) {
	var filenames = fs.readdirSync('db/migrate');

	filenames = filenames.filter(function(fn) {
		return fn.match(/(\d+)_(.+?)\.js/);
	});

	filenames = filenames.sort(function(f1, f2) {
		var d1 = dateFromFilename(f1);
		var d2 = dateFromFilename(f2);

		return d1-d2;
	});

	filenames.forEach(function(filename) {
		// HACK (Daniel): Should probably restructure this so that the filename passing is more transparent.
		NobleRecord.Migration.currentFilename = filename;

		require(process.cwd() + '/db/migrate/' + filename.match("(.*)\.js")[1]);

		var migr = NobleRecord.Migrations[NobleRecord.Migrations.length-1];
	});

	var act = new NobleMachine(function() {
		if (dir == 'all') {
			act.toNext(NobleRecord.Migrations.raiseAll());
		} else if (dir == 'up') {
			act.toNext(NobleRecord.Migration.raise());
		} else if (dir == 'down') {
			act.toNext(NobleRecord.Migration.lower());
		}
	});

	act.next(function() {
		act.toNext(generate_schema());
	});

	act.error(function(err) {
		logger.log(JSON.stringify(err));
	});

	act.start();
}

function nicemkdir(path) {
	try {
		fs.mkdirSync(path, 0744);
	} catch (err) {
		if (err.message.search('File exists') == -1) {
			throw err
		}
	}
}

switch (command) {
	case 'init':
		nicemkdir('db');
		nicemkdir('db/migrate');

		var code = "/**\n"
				 + " * This file is loaded by the 'nrec' command, and specifies the database/logging options\n"
				 + " * which provide the context for NobleRecord. You will likely want to require this file\n"
				 + " * from within your application as well.\n"
				 + " */\n"
				 + "\n"
				 + "NobleRecord.config.database = null;\n"
				 + "NobleRecord.config.logger = {\n"
				 + "  log: sys.log,\n"
				 + "  warning: sys.log,\n"
				 + "  error: sys.log\n"
				 + "};\n";

		var fd = fs.openSync('db/config.js', 'w');
		fs.writeSync(fd, code);
		fs.closeSync(fd);
		break;

	case 'migrate':
	case 'migrate all':
		migrate('all');
		break;

	case 'migrate down':
		migrate('down');
		break;

	case 'migrate up':
		migrate('up');
		break;

	case 'generate migration':
		var date = new Date();

		var arg = process.argv.slice(4).join('_');
		if (arg.length == 0) arg = "migration";

		var filename = util.makeDateStr(date, false) + "_" + arg + ".js";

		var code = '';
		code += "new NobleRecord.Migration({\n";
		code += "  up: function(m) {\n";
		code += "  \n";
		code += "  },\n";
		code += "  \n";
		code += "  down: function(m) {\n";
		code += "  \n";
		code += "  }\n";
		code += "});\n";
		
		var fd = fs.openSync('db/migrate/' + filename, 'w');
		fs.writeSync(fd, code);
		fs.closeSync(fd);

		logger.log("Generated new migration at `db/migrate/" + filename + "`.");
		break;

	case 'generate schema':
		generate_schema().start();
		break;

	case 'fill database':
		require(process.cwd() + '/db/schema');

		var act = new NobleMachine(function() {
			act.toNext(NobleRecord.Migrations.raiseAll());
		});

		act.error(function(err) {
			logger.error(JSON.stringify(err));
		});

		act.start();
		break;
}

