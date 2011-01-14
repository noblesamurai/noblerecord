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
	migration = require('./src/migration'),
    model = require('./src/model'),
    util = require('./src/util')
	mysql = require('./src/mysql');

var NobleRecord = {};

var sys = require('sys');



NobleRecord.configure_connection = function(dbopts) {
	common.config.database = new mysql.DbConnection(dbopts);
}

NobleRecord.initialize = function() {
	return model.Model.fillSchemas();
}

_.extend(NobleRecord, common, migration, model);
NobleRecord.util = util;

exports.NobleRecord = NobleRecord;

