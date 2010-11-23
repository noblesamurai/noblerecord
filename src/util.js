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

var common = require('./common');

/**
 * Pads a number to a two-char string if needed.
 * @param num Number to be padded.
 */
function padNum(num) {
    if (num.toString().length == 1) {
        return "0" + num;
    } else {
        return num.toString();
    }
}

/**
 * Converts Date object into strings of form "yyyy-mm-dd hh:mm:ss"
 */
function makeDateStr(date, sep) {
	if (sep === undefined) sep = true;

	var year = date.getFullYear().toString(),
		month = padNum(date.getMonth()+1),
		day = padNum(date.getDate()),
		hours = padNum(date.getHours()),
		minutes = padNum(date.getMinutes()),
		seconds = padNum(date.getSeconds());

	if (sep) {
		return year + '-' + month + '-' + day + ' ' + hours + ':' + minutes + ':' + seconds;
	} else {
		return year + month + day + hours + minutes + seconds;
	}
}

/**
 * Attempt to serialize a value as a string acceptable for an SQL statement.
 */
function serialize(val) {
	if (val == null) {
		return 'NULL'

	} else if (typeof val == 'string') {
		return "'" + val.replace(/(')/g, '\\$1') + "'";
	
	} else if (typeof val == 'number') {
		if (isNaN(val)) {
			return 'NULL';
		} else {
			return val.toString();
		}

	} else if ([true, false].indexOf(val) != -1) {
		return val.toString().toUpperCase();

	} else if (val instanceof Date) {
		return "'" + makeDateStr(val) + "'";

	} else {
		throw "Unable to serialize variable of type `" + typeof val + "`!";
	}
}

// Attempt to determine the appropriate migration type from INFORMATION_SCHEMA data.
function detectSQLType(col) {
	if (col['COLUMN_KEY'] == 'PRI') {
		return 'primary_key';
	}

	switch (col['DATA_TYPE']) {
		case 'varchar':
			return 'string';
		case 'int':
		case 'tinyint':
			if (col['COLUMN_TYPE'] == 'tinyint(1)') {
				return 'boolean';
			} else {
				return 'integer';
			}
		case 'text':
		case 'float':
		case 'decimal':
		case 'datetime':
		case 'timestamp':
		case 'time':
		case 'date':
		case 'binary':
		case 'boolean':
			return col['DATA_TYPE'];
		default:
			throw "Unsupported SQL type `" + col['DATA_TYPE'] + "`!";
	}
}

// Convert a friendly type specifying string into an SQL-recognizable form.
function typeToSQL(type) {
	switch (type) {
		case 'primary_key':
			return "INTEGER AUTO_INCREMENT"

		case 'string':
			return "VARCHAR(255)";

		case 'text':
			return "TEXT CHARACTER SET UTF8";

		case 'integer':
			return "INT";

		case 'float':
		case 'decimal':
		case 'datetime':
		case 'timestamp':
		case 'time':
		case 'date':
		case 'binary':
		case 'boolean':
		default:
			return type.toUpperCase();
	}
}

_.extend(exports, {
	padNum: padNum,
	makeDateStr: makeDateStr,
	serialize: serialize,
	detectSQLType: detectSQLType,
	typeToSQL: typeToSQL
});
