
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
			var t = new NobleRecord.TableDefinition(name, definer);
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

	var db = common.config.database;

	var up = new NobleRecord.DatabaseDefinition();
	var down = new NobleRecord.DatabaseDefinition();

	if (opts.up) opts.up(up);
	if (opts.down) opts.down(down);

	_.extend(me, {
		raise: function() {
			return queryAll(db, up.queries);
		},
		lower: function() {
			return queryAll(db, down.queries);
		}
	});

	NobleRecord.Migrations.push(me);

	return me;
}

// Recreates migration code from INFORMATION_SCHEMA.
Migration.recreate = function() {
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
		
		sys.log("\n"+code);
		act.toNext(code);
	});

	return act;
}

_.extend(exports, {
	Migrations: Migrations,
	Migration: Migration
});
