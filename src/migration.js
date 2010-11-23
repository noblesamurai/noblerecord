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

var TableDefinition = function(name, definer) {
	var t = this;
	var columns = [];

	var definitions = {
		column: function(name, type, options) {
			var col = { name: name, type: type };
			_.extend(col, options);
			columns.push(col);
		},

		timestamps: function(options) {
			this.column('createdAt', 'datetime', options);
			this.column('updatedAt', 'datetime', options);
		}
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

	// Generates the SQL fragment defining a given column.
	function columnToSQL(col) {
		var sql = "`" + col.name + "` ";

		sql += typeToSQL(col.type);

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
			sql += ", PRIMARY KEY (`" + col.name + "`)";
		}

		return sql;
	}

	return {
		makeCreateSQL: function() {
			var sql = " CREATE TABLE `" + name + "` (";
			sql += columns.map(columnToSQL).join(", ");
			sql += " ) ENGINE=INNODB;\n";

			return sql;
		}
	};
}

var DatabaseDefinition = function() {
	var me = {};

	me.queries = [];

	return _.extend(me, {
		create_table: function(name, definer) {
			var t = new TableDefinition(name, definer);
			this.queries.push(t.makeCreateSQL());
		},

		drop_table: function(name) {
			this.queries.push(" DROP TABLE `" + name + "`;");
		}
	});
};

// Array of all migrations in order of their construction.
var Migrations = []; 

function queryAll(db, queries) {
	var realQueries = queries.slice();

	var act = new NobleMachine();

	act.next(function() {
		act.toNext(db.query(realQueries.shift()))	
	});

	act.next(function() {
		if (realQueries.length > 0) {
			act.toPrev();
		} else {
			act.toLast();
		}
	});

	return act;
}

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
		up.queries.push("INSERT INTO tblSchemaMigrations SET `filename` = " + util.serialize(me.filename) + ";");
		down.queries.push("DELETE FROM tblSchemaMigrations WHERE `filename` = " + util.serialize(me.filename) + ";");
	}

	_.extend(me, {
		raise: function() {
			return queryAll(db, up.queries);
		},

		lower: function() {
			return queryAll(db, down.queries);
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
