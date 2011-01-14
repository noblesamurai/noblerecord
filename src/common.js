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

require('./lib/underscore');
require('./lib/inflection');

NobleMachine = require('./lib/noblemachine/noblemachine').NobleMachine;

var sys = require('sys');

var mysql = require('./mysql');

// Configuration options..
config = {
	database: null,
	/*dbopts: {
		host: '',
		username: '',
		password: '',
		database: ''
	},*/
	logger:  {
		log: function() { },
		warning: function() { },
		error: function() { }
	}
}

exports.config = config;

exports.db_query = function(query) {
	return config.database.query(query);
}
