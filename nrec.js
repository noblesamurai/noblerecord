#!/usr/bin/env node
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
	nrutil = require('./src/nrutil');

var NobleRecord = require('./noblerecord').NobleRecord;
var NobleMachine = require('noblemachine').NobleMachine;

var util = require('util');

var command = process.argv[2];
var args = process.argv.slice(3);

var util = require('util'),
	fs = require('fs');

global.NobleRecord = NobleRecord;

(function() {

	function usage() {
		if (command == undefined || command == '-h') {
			util.print("Usage: nrec COMMAND [ARGS]\n");
			util.print("\n");
			util.print("The following commands are supported:\n");
			util.print(" init            Create default configuration from template.\n");
			util.print(" generate        Create a new migration or recreate the schema.\n");
			util.print(" migrate         Run all migrations, or one at a time.\n");
			util.print(" load schema     Load the entire schema file, and mark all migrations as run.\n");
			util.print("\n");
			util.print("All commands can be run with -h for more information.\n");
			util.print("\n");
		} else if (command == 'init') {
			util.print("Usage: nrec init\n");
			util.print("\n");
			util.print("Creates the following paths in the current working directory:\n");
			util.print("  ./db/\n");
			util.print("  ./db/migrate/\n");
			util.print("  ./db/config.js\n");
			util.print("\n");
		} else if (command == 'generate') {
			util.print("Usage: nrec generate [generator] [arguments]\n");
			util.print("\n");
			util.print("The following generators are supported:\n");
			util.print(" migration [name]      Generate a new migration with the given file identifier.\n");
			util.print(" schema:               Creates or recreates the current schema specification.\n");
			util.print("\n");

		} else if (command == 'migrate') {
			util.print("Usage: nrec migrate [dir]\n");
			util.print("\n");
			util.print("If no direction is supplied, runs all unraised migrations.\n");
			util.print("With a direction, runs a single migration:\n");
			util.print(" up      Raise the first unraised migration.\n");
			util.print(" down    Lower the last raised migration.\n");
			util.print("\n");
		}

	}

	if (command === undefined || command === '-h' || args.indexOf('-h') != -1) {
		usage();
		return;
	}
		

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

/*		require(process.cwd() + '/db/migrate/' + filename.match("(.*)\.js")[1]);
	});*/
		var datestr = match[1];

		var m = datestr.match(/(\d\d\d\d)(\d\d)(\d\d)(\d\d)(\d\d)(\d\d)/);
		return new Date(m[1], m[2], m[3], m[4], m[5], m[6]);
	}

	function getSortedMigrationFiles() {
		var filenames = fs.readdirSync('db/migrate');

		filenames = filenames.filter(function(fn) {
			return fn.match(/(\d+)_(.+?)\.js/);
		});

		filenames = filenames.sort(function(f1, f2) {
			var d1 = dateFromFilename(f1);
			var d2 = dateFromFilename(f2);

			return d1-d2;
		});

		return filenames;
	}

	function migrate(dir) {
		var filenames = getSortedMigrationFiles();

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
					 + "NobleRecord.configure_connection({\n"
					 + "  host: '',\n"
					 + "  username: '',\n"
					 + "  password: '',\n"
					 + "  database: ''\n"
					 + "});\n"
					 + "NobleRecord.config.logger = {\n"
					 + "  log: util.log,\n"
					 + "  warning: util.log,\n"
					 + "  error: util.log\n"
					 + "};\n";

			var fd = fs.openSync('db/config.js', 'w');
			fs.writeSync(fd, code);
			fs.closeSync(fd);
			break;

		case 'generate':
			switch (args[0]) {
				case 'migration':
					var date = new Date();

					var arg = process.argv.slice(4).join('_');
					if (arg.length == 0) arg = "migration";

					var filename = nrutil.makeDateStr(date, false) + "_" + arg + ".js";

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

				case 'schema':
					generate_schema().start();
					break;

				default:
					usage();
			}
			break;


		case 'migrate':
			switch (args[0]) {
				case 'down':
					migrate('down');
					break;

				case 'up':
					migrate('up');
					break;

				default:
					migrate('all');
					break;
			}
			break;

		case 'load':
			switch (args[0]) {
				case 'schema':
					require(process.cwd() + '/db/schema');

					var act = new NobleMachine(function() {
						act.toNext(NobleRecord.Migrations.raiseAll());
					});

					act.next(function() {
						var db = common.config.database;

						var filenames = getSortedMigrationFiles();
						
						filenames.forEach(function(fn) {
							var subact = new NobleMachine(function() {
								subact.toNext(db.query("INSERT INTO tblSchemaMigrations SET `filename` = " + nrutil.serialize(fn) + ";"));
							});

							act.next(subact);
						});
					});

					act.error(function(err) {
						logger.error(JSON.stringify(err));
					});

					act.start();
					break;

				default:
					usage();
			}
			break;
		
		default:
			usage();
			
	}
})();
