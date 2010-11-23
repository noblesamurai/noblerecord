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

var util = require('./src/util');
var NobleRecord = require('./noblerecord').NobleRecord;
var NobleMachine = require('noblemachine').NobleMachine;

var command = process.argv.slice(2).join(' ');

var sys = require('sys'),
	fs = require('fs');

sys.log(command);

global.NobleRecord = NobleRecord;
require(process.cwd() + '/db/config');

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

function parseDateStr(datestr) {
}

switch (command) {
	case 'init':
		break;

	case 'migrate':
	case 'migrate all':
		var filenames = fs.readdirSync('db/migrate');
		filenames.forEach(function(filename) {
			var match = filename.match(/(\d+)_(.+?)\.js/);
			if (!match) return;

			var datestr = match[1], ident = match[2];

			// HACK (Daniel): Should probably restructure this so that the filename passing is more transparent.
			NobleRecord.Migration.currentFilename = filename;

			require(process.cwd() + '/db/migrate/' + datestr + '_' + ident);

			var migr = NobleRecord.Migrations[NobleRecord.Migrations.length-1];
		});

		var act = new NobleMachine(function() {
			act.toNext(NobleRecord.Migrations.raiseAll());
		});

		act.next(function() {
			act.toNext(generate_schema());
		});

		act.start();

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
		break;

	case 'generate schema':
		generate_schema().start();
		break;

	case 'create_database':
		require(process.cwd() + '/db/schema');

		var act = new NobleMachine(function() {
			act.toNext(NobleRecord.Migrations.raiseAll());
		});

		act.start();
		break;
}
