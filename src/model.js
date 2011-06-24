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
 * along with   If not, see <http://www.gnu.org/licenses/>.
 */

var sys = require('sys');

var common = require('./common'),
	util = require('./util'),
	mysql = require('./mysql'),
	logger = require('./logger');

var Models = {};

var db_query = common.db_query;

/**
 * Poor man's ActiveRecord::Base, essentially. Some trickiness involved to maintain asynchronicity.
 */
var Model = function(ident, defFunc) {

	/**
	 * Here's the actual class we're making.
	 */
	var model = function(params) {
		var me = this;

		if (Object.keys(model.columns).length == 0) {
			logger.error("Attempting to initialize `" + model.ident + "` instance before filling schema!");
			return null;
		} else if (model.primary === undefined) {
			logger.error("No primary key found for `" + model.ident + "`!");
			return null;
		}

		Object.defineProperty(me, 'values', {
			value: {},
			enumerable: false,
			writable: true,
			configurable: true,
		}); // Raw column values, accessed by setter/getter functions.

		params = params || {};

		/* --- Instance Methods --- */

		/**
		 * Saves the object's properties corresponding to table columns into the database.
		 */
		function save() {
			var act = new NobleMachine(function() {
				setStrs = [];

				for (var key in model.columns) {
					if ([model.primary].indexOf(key) == -1 && me[key] !== undefined) {
						setStrs.push('`' + key + '`' + " = " + util.serialize(me[key]));
					}
				}

				if (model.columns['updatedAt'])
					setStrs.push('`updatedAt` = NOW()');

				var sql;
				if (me[model.primary]) {
					sql = "UPDATE " + model.table
							+ " SET " + setStrs.join(',')
							+ " WHERE `" + model.primary + "` = " + me[model.primary];
				} else {
					if (model.columns['createdAt'])
						setStrs.push('`createdAt` = NOW()');

					sql = "INSERT"
							+ " INTO " + model.table
							+ " SET " + setStrs.join(',');
				}


				act.toNext(db_query(sql));
			});

			act.next(function(result) {
				//log.debug("RESULT: " + JSON.stringify(result));

				if (result.insert_id) {
					me[model.primary] = result.insert_id;
				} else if (!me[model.primary]) {
					act.toError("No insert_id, and no extant primary key!");
					return;
				}

				
				logger.log("Successfully saved `" + model.ident + "` record `" + me[model.primary] + "`");

				act.toNext(me);
			});

			act.error(function(err) {
				logger.error("Error saving `" + model.ident + "` record: " + JSON.stringify(err));
				act.emitError(err);
			});

			return act;
		}

		/**
		 * Reloads the object's properties with the current database values.
		 */
		function reload() {
			var params = {}

			params[model.primary] = me[model.primary]
		
			var act = new NobleMachine(model.find(params));

			act.next(function(newInst) {
				if (newInst) {
					for (var col in model.columns) {
						me[col] = newInst[col];
					}

					act.toNext(me);
				} else {
					for (var key in model.columns) {
						me[key] = undefined
					}

					act.toNext(null);
				}
			});

			return act;
		}

		/**
		 * Removes this object's corresponding database row.
		 */
		function destroy() {
			var act = new NobleMachine(function() {
				if (me.onDestroy) {
					var preact = me.onDestroy();
					if (preact && preact.start instanceof Function) {
						act.toNext(preact)
						return;
					}
				}
			});

			act.next(function() {
				var sql = "DELETE FROM " + model.table
						+ " WHERE `" + model.primary + "` = " + me[model.primary];

				act.toNext(db_query(sql));
			});

			act.next(function() {
				logger.log("Successfully deleted `" + model.ident + "` record `" + me[model.primary] + "`");

				for (var param in me) {
					delete me[param];	
				}
			});

			act.error(function(err) {
				logger.error("Error deleting `" + model.ident + "` record: " + JSON.stringify(err));
				act.emitError(err);
			});

			return act;
		}

		// Generic setter for SQL-correspondent values. Forces typecasting for database compatibility.
		function setValue(key, val) {
			//sys.log(key + ": " + JSON.stringify(val));

			if (val === null) {
				me.values[key] = null;
			} else if (val === undefined) {
				me.values[key] = undefined;
			} else {
				type = model.columns[key]['DATA_TYPE'];

				switch (type) {
					case 'datetime':
					case 'timestamp':
						me.values[key] = new Date(val);
						break;
					case 'text':
					case 'varchar':
						me.values[key] = val.toString();
						break;
					case 'int':
					case 'tinyint':
						if (model.columns[key]['COLUMN_TYPE'] == 'tinyint(1)') {
							me.values[key] = !!val // Boolean
						} else {
							me.values[key] = parseInt(val);
						}
						break;
					default:
						me.values[key] = val;
				}
			}
		}

		// Generic getter for SQL-correspondent values.
		function getValue(key) {
			return me.values[key];
		}

		for (var key in model.columns) {
			me.__defineSetter__(key, setValue.bind(me, key));
			me.__defineGetter__(key, getValue.bind(me, key));

			if (params[key] !== undefined) {
				setValue(key, params[key]);
			}
		}

		_.extend(me, {
			save: save,
			reload: reload,
			destroy: destroy,
			setValue: setValue
		});

		if (defFunc !== undefined) {
			defFunc(me);
		}

		return me;
	}

	// This should be a unique, proper-cased identifier for the model as a whole.
	model.ident = ident;

	// Will be filled with INFORMATION_SCHEMA data.
	model.columns = {};

	// Guess the table name based on clever pluralization of the identifier.
	model.table = 'tbl' + ident.pluralize();

	/* --- Definition Methods --- */

	// Use this to override the default guess based on ident pluralization.
	model.setTableName = function(name) {
		model.table = name;
	}

	model.hasOne = function(foreignIdent) {
		model.prototype["get" + foreignIdent] = function() {
			var foreign = Models[foreignIdent];

			var opts = {}
			opts[model.primary] = this[model.primary];
			return foreign.find(opts);
		}
	}

	model.belongsTo = function(foreignIdent) {
		model.prototype["get" + foreignIdent] = function() {
			var foreign = Models[foreignIdent];

			var opts = {}
			opts[foreign.primary] = this[foreign.primary];
			return foreign.find(opts);
		}
	}

	/* --- Retrieval Methods --- */

	/**
	 * Executes a SELECT query on the table associated with this class and returns
	 * the result.
	 * @param where Qualifier to be passed to WHERE e.g "`this` = 'that'""
	 * @param fields Fields to return. Defaults to '*'.
	 */
	model.select = function(where, fields) {
		fields = fields || '*';

		var act = new NobleMachine(function() {
			var sql = "SELECT " + fields + " FROM " + model.table +
					  (where.length ? " WHERE " : '') + where + ";"

			act.toNext(db_query(sql));
		});

		act.next(function(result) {
			if (result.affected_rows == -1)
				act.toNext([]);
			else
				act.toNext(result.map(function(sqlobj) {
					return new model(sqlobj);
				}));
		});

		act.error(function(err) {
			logger.error("Error executing select statement for `" + model.ident +"`: " + JSON.stringify(err));
			act.emitError(err);
		});

		return act;
	}

	/**
     * A very simple SELECT query wrapper that returns a list of model instances.
	 * @param params Key-value pairs to be matched.
	 * @param conjunction Default 'AND'.
	 * @param fields Fields to return. Default in select().
     */
	model.where = function(params, conjunction, fields) {
		conjunction = conjunction || 'AND'
		var where = '';
		var first = true;

		logger.log("Finding all `" + model.ident + "`" + (params === undefined ? '' : " matching: " + sys.inspect(params) + " with conjunction '" + conjunction + "'"));

		if (params) {
			for (var key in model.columns) {
				if (params[key] !== undefined) {
					where += (first ? '' : " " + conjunction + " ")
					if (params[key] == null) {
						where += "`" + key + "` IS NULL";
					} else {
						where += "`" + key + "` = " + util.serialize(params[key]);
					}

					first = false;
				}
			}
		}

		return model.select(where, fields);
	}

	/**
	 * Emits first result from where() query
	 * @param params Params for find().
	 */
	model.find = function(params) {
		var act = new NobleMachine(function() {
			act.toNext(model.where(params));
		});

		act.next(function(objs) {
			act.toNext(objs.length ? objs[0] : null);
		});

		return act;
	}

	/**
	 * Retrieves every record of this type!
	 */
	model.all = function() {
		return model.where({});
	}

	/* --- Initialization Methods --- */

	/**
	 * This action queries the database to determine the structure of the table we are bound to.
	 */
	model.fillSchema = function() {
		var act = new NobleMachine(function() {
			var sql = "SELECT * FROM INFORMATION_SCHEMA.COLUMNS"
					+ " WHERE TABLE_SCHEMA = '" + common.config.database.options.database + "'"
					+ " AND TABLE_NAME = '" + model.table + "';";

			act.toNext(db_query(sql));
		});

		act.next(function(res) {
			if (res.length == 0) {
				act.toError("No columns found for table `" + model.table + "`.");
				return;
			}

			res.forEach(function(col) {
				model.columns[col['COLUMN_NAME']] = col;

				if (col['COLUMN_KEY'] == 'PRI') { // Primary key!
					model.primary = col['COLUMN_NAME'];
				}
			});

			if (!model.primary) {
				act.toError("Could not detect primary key for table `" + model.table + "`.");
				return;
			}
		});

		return act;
	}

	Models[model.ident] = model;

	return model;
}

// Fill schemas for all defined models.
Model.fillSchemas = function() {
	var act = new NobleMachine(function() {
		for (var ident in Models) {
			act.next(Models[ident].fillSchema());
		}
	});

	return act;
}

_.extend(exports, {
	Models: Models,
	Model: Model
});
