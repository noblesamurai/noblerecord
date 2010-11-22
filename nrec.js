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

var NobleRecord = require('./noblerecord').NobleRecord;
var NobleMachine = require('noblemachine').NobleMachine;

var command = process.argv[2];

var sys = require('sys'),
	fs = require('fs');

sys.log(process.argv);

switch (command) {
	case 'migrate':
		global.NobleRecord = NobleRecord;
		require(process.cwd() + '/db/migrate/foo');
		break;

	case 'make_schema':
		var act = new NobleMachine(function() {
			act.toNext(NobleRecord.Migration.recreate());
		});

		act.next(function(code) {
			var fd = fs.openSync('db/schema.js', 'w');
			fs.writeSync(fd, code);
			fs.closeSync(fd);
		});

		act.start();
		break;
}
