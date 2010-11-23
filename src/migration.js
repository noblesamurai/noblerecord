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

var sys = require('sys');

var common = require('./common'),
	util = require('./util');

var logger = common.config.logger;

// Generates the SQL fragment defining a given column.
function columnToSQL(col) {
	var sql = "`" + col.name + "` ";

	sql += util.typeToSQL(col.type);

	if (col['additional']) {
		sql += ' ' + col['additional'];
	}

	if (!col['allow_null']) {
		sql += " NOT NULL";
	}

	if (col['default']) {
		var def = col['default']

		sql += " DEFAULT " + serialize(def);
	}

	if (col.type == 'primary_key') {
		sql += " PRIMARY KEY";
	}

	return sql;
}

/**
 * Table definition class. Converts friendly definition function calls into SQL-querying actions.
 * @param name Name of the table.
 * @param context Either 'create' or 'alter'.
 * @param definer Function given by user which makes the definition calls.
 */
var TableDefinition = function(tablename, context, definer) {
	var me = {};
	var db = common.config.database;

	me.act = new NobleMachine(); // Query subactions are added as states to this.

	var needsTableCreation = (context == 'create');

	function nextQuery(query) {
		me.act.next(db.query(query));
	}

	var definitions = {
		add_column: function(name, type, options) {
			var col = { name: name, type: type };
			_.extend(col, options);
			
			// If we haven't yet made the table, use the first added column as part of the create statement.
			// All following columns are added via ALTER TABLE. This is because a table cannot be created
			// with zero columns.
			if (needsTableCreation) {
				nextQuery("CREATE TABLE `" + tablename + "` ( " + columnToSQL(col) + " ) ENGINE=INNODB;");
				needsTableCreation = false;
			} else {
				nextQuery("ALTER TABLE `" + tablename + "` ADD " + columnToSQL(col) + ";");
			}
		},

		timestamps: function(options) {
			this.column('createdAt', 'datetime', options);
			this.column('updatedAt', 'datetime', options);
		}
	};

	definitions.column = definitions.add_column;
	
	if (context == 'alter') {
		_.extend(definitions, {
			change_column: function(name, type, options) {
				var col = { name: name, type: type };
				_.extend(col, options);

				nextQuery("ALTER TABLE `" + tablename + "` MODIFY " + columnToSQL(col) + ";");
			},

			remove_column: function(name) {
				nextQuery("ALTER TABLE `" + tablename + "` DROP COLUMN `" + name + "`;");
			},

			// There doesn't seem to be a proper RENAME COLUMN statement in MySQL.
			// As such, it is necessary to use CHANGE after extracting the current column definition.
			rename_column: function(name, newname) {
				var act = new NobleMachine(function() {
					act.toNext(db.query("SHOW COLUMNS FROM `" + tablename + "`;"));
				});

				act.next(function(result) {
					var sql = "ALTER TABLE `" + tablename + "` CHANGE `" + name + "` `" + newname + "`";

					result.forEach(function(coldatum) {
						if (coldatum['Field'] == name) {
							sql += " " + coldatum['Type'];
							
							if (coldatum['Null'] == 'NO') {
								sql += " NOT NULL";
							}

							if (coldatum['Key'] == 'PRI') {
								sql += " PRIMARY KEY";
							}

							sql += coldatum['Extra'];

							if (coldatum['Default'] != 'NULL') {
								sql += " DEFAULT " + coldatum['Default'];
							}
						}
					});
					sql += ";";

					act.toNext(db.query(sql));
				});

				me.act.next(act);
			},
		});
	}

	var types = ['primary_key', 'string', 'text', 'integer', 'boolean', 'datetime', 'timestamp']
	types.forEach(function(type) {
		definitions[type] = function() {
			var options = {}; defs = this;

			var args = Array.prototype.slice.call(arguments);

			args.forEach(function(arg) {
				if (typeof arg == "object") {
					_.extend(options, arg);
				} 
			});

			args.forEach(function(arg) {
				if (typeof arg == "string") {
					defs.column(arg, type, options);
				}
			});
		}
	});

	definer(definitions);

	return me;
}

/**
 * Database definition class. Conglomerates TableDefinitions and SQL actions corresponding to friendly definition calls.
 */
var DatabaseDefinition = function() {
	var me = {};
	var db = common.config.database;

	me.act = new NobleMachine();

	return _.extend(me, {
		create_table: function(name, definer) {
			var t = new TableDefinition(name, 'create', definer);
			me.act.next(t.act);
		},

		alter_table: function(name, definer) {
			var t = new TableDefinition(name, 'alter', definer);
			me.act.next(t.act);
		},

		drop_table: function(name) {
			me.act.next(db.query(" DROP TABLE `" + name + "`;"));
		},

		rename_table: function(name, newname) {
			me.act.next(db.query(" ALTER TABLE `" + name + "` RENAME `" + newname + "`"));
		},
	});
};

// Array of all migrations in order of their construction.
var Migrations = []; 

var Migration = function(opts) {
	var me = this;

	me.filename = null;

	var db = common.config.database;

	var up = new DatabaseDefinition();
	var down = new DatabaseDefinition();

	if (opts.up) opts.up(up);
	if (opts.down) opts.down(down);

	if (Migration.currentFilename) {
		me.filename = Migration.currentFilename;
		up.act.next(db.query("INSERT INTO tblSchemaMigrations SET `filename` = " + util.serialize(me.filename) + ";"));
		down.act.next(db.query("DELETE FROM tblSchemaMigrations WHERE `filename` = " + util.serialize(me.filename) + ";"));
	}

	_.extend(me, {
		raise: function() {
			return up.act;
		},

		lower: function() {
			return down.act;
		},
	});

	Migrations.push(me);

	return me;
}

// Recreates migration code from INFORMATION_SCHEMA.
Migration.recreate = function() {
	var db = common.config.database;

	var act = new NobleMachine(function() {
		var sql = "SELECT * FROM INFORMATION_SCHEMA.COLUMNS"
				+ " WHERE TABLE_SCHEMA = '" + db.options.database + "';";

		act.toNext(db.query(sql));
	});

	var tables = {};
	var code = '';

	act.next(function(cols) {
		cols.forEach(function(col) {
			var tableName = col['TABLE_NAME'];

			if (tableName == 'tblSchemaMigrations') {
				return;
			}

			if (tables[tableName] === undefined) 
				tables[tableName] = {};

			tables[tableName][col['COLUMN_NAME']] = col;
		});

		code += "new NobleRecord.Migration({\n"
		code += "  up: function(m) {\n";
		for (var tableName in tables) {
			var columns = tables[tableName];

			var timestamps = false;
			if (columns['createdAt'] && columns['updatedAt']) {
				delete columns['createdAt'];
				delete columns['updatedAt'];
				timestamps = true;
			}

			code += "    m.create_table('" + tableName + "', function(t) {\n";
			for (var colName in columns) {
				var col = columns[colName];
				code += "      t." + util.detectSQLType(col) + "('" + colName + "');\n";
			}

			if (timestamps) {
				code += "      t.timestamps();\n";
			}
			code += "    });\n";
		}
		code += "  }\n";
		code += "});\n";
		
		act.toNext(code);
	});

	return act;
}

_.extend(exports, {
	Migrations: Migrations,
	Migration: Migration
});

/**
 * Create the migration metadata table if it doesn't already exist.
 */
Migrations.makeTable = function() {
	var sql = "CREATE TABLE IF NOT EXISTS `tblSchemaMigrations` ("
			+ "  `filename` VARCHAR(255) NOT NULL"
			+ " ) ENGINE=INNODB;";
	return common.config.database.query(sql);
}

/**
 * Queries the database and emits array of all raised migrations.
 */
Migrations.getRaised = function() {
	var db = common.config.database;

	var act = new NobleMachine(function() {
		act.toNext(Migrations.makeTable());
	});

	act.next(function() {
		act.toNext(db.query("SELECT * FROM `tblSchemaMigrations`;"));
	});

	act.next(function(result) {
		var filenames = result.map(function(datum) { return datum.filename; });

		sys.log(filenames);
		
		var migrations = [];
		Migrations.forEach(function(migr) {
			if (filenames.indexOf(migr.filename) != -1) migrations.push(migr);
		});

		act.toNext(migrations);
	});

	return act;
}

/**
 * Raise or lower the first or last migration as appropriate.
 */
Migration.apply = function(dir) {
	var act = new NobleMachine(function() {
		act.toNext(Migrations.getRaised());
	});

	act.next(function(raised) {
		if (dir == 'raise') {
			for (var i = 0; i < Migrations.length; i++) {
				if (raised.indexOf(Migrations[i]) == -1) {
					act.toNext(Migratons[i].raise());
					break;
				}
			}
		} else if (dir == 'lower') {
			act.toNext(raised[raised.length-1].lower());
		}
	});

	return act;
}

Migration.raise = function() { return Migration.apply('raise'); }
Migration.lower = function() { return Migration.apply('lower'); }

/**
 * Raise or lower all extant migrations for which such an action is needed.
 */
Migrations.applyAll = function(dir) {
	var act = new NobleMachine(function() {
		act.toNext(Migrations.getRaised());
	});

	act.next(function(raised) {
		if (dir == 'raise') {
			Migrations.forEach(function(migr) {
				if (raised.indexOf(migr) == -1) {
					act.next(migr.raise());
				}
			});
		} else if (dir == 'lower') {
			raised.forEach(function(migr) {
				act.next(migr.lower());
			});
		}
	});

	return act;
}

Migrations.raiseAll = function() { return Migrations.applyAll('raise') }
Migrations.lowerAll = function() { return Migrations.applyAll('lower') }
