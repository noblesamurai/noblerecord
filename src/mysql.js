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

/**
 * Wrappings for the node-mysql-libmysqlclient library
 */

var sys = require('sys'),
	mysql = require('mysql-libmysqlclient'),
	events = require('events');

var NobleMachine = require('./lib/noblemachine/noblemachine').NobleMachine;

var states = {
	CLOSED: 0,
	CONNECTING: 1,
	CONNECTED: 2,
	CLOSING: 3,
};

function DbConnection (options) {
	var me = this;

	events.EventEmitter.call(me);

	me.options = _.extend({
		// Default options
		host: 'localhost',
		username: 'root',
		password: '',
		database: 'test',
	}, options);

	me.connection = undefined;
	me.state = states.CLOSED;

	me.escape = function() {
		if (undefined == me.connection) me.connection = mysql.createConnectionSync();
		return me.connection.escapeSync.apply(me.connection, Array.prototype.slice.call(arguments));
	};

	me.errno = function() {
		return me.connection ? me.connection.errnoSync() : undefined;
	};

	me.error = function() {
		return me.connection ? me.connection.errorSync() : undefined;
	};

	me.errorListener = function(reason) {
		log.log('Connection error: '+reason, 'noblesql');
		me.closeListener(reason);
	};

	me.closeListener = function(reason) {
		log.log('Connection closed', 'noblesql');
		
		// Check if we should reconnect
		if (me.state == states.CLOSED || me.state == states.CLOSING) {
			// No, we wanted to close
			me.state = states.CLOSED;
		} else if (me.state == states.CONNECTING || me.state == states.CONNECTED) {
			// Should we only try to connect a few times?
			// After a delay, retry the connection
			log.log('Connection lost in state ' + me.state + ', reconnecting', 'noblesql');
			setTimeout(function() {
				me.connect().start();
			}, 1000);
		} else {
			log.log('Connection closed, but unknown connection state: '+me.state, 'noblesql');
		}
	};

	me.isConnected = function() {
		return me.state == states.CONNECTED;
	};

	/**
 	 * Ensure the connection is still valid.
	 * Reconnect if required.
	 */
	me._testConnection = function() {
		var act = new NobleMachine();
		
		act.next.wait(function() {
			if (me.isConnected()) {
				act.toNext();
			} else {
				// Listen for connect event
				var reconnected = function() {
					log.debug('Refire!');
					me.removeListener('connect', reconnected);
					act.toNext();
				};
				me.addListener('connect', reconnected);

				// Attempt reconnect
				if (me.state != states.CONNECTING) {
					me.connect().start();
				}
			}
		});

		return act;
	};

	me.connect = function() {
		log.debug('Connect called with state'+me.state, 'noblesql');
		var act = new NobleMachine(function() {
			switch (me.state) {
				case states.CONNECTING:
				// A connection attempt is already in progress!
				case states.CONNECTED:
				// Already connected!
				return act.emitSuccess();
			}

			me.state = states.CONNECTING;

			if (undefined !== me.connection) {
				try {
					me.connection.closeSync();
				} catch (e) {
					// Connection was not quite opened, ignore this
				}
			}

			log.debug('Connecting to '+JSON.stringify(me.options), 'noblesql');

            // Proper initialisation order to get RECONNECT working. Ref:
            // https://github.com/Sannis/node-mysql-libmysqlclient/issues/issue/67#issue/67/comment/567467
            me.connection = mysql.createConnectionSync();
            me.connection.initSync();
            me.connection.setOptionSync(me.connection.MYSQL_OPT_RECONNECT, 1);

            var success = me.connection.realConnectSync(me.options.host, me.options.username, me.options.password,
                                        me.options.database);
            if (!success) {
                sys.p(me.connection.connectError);
                act.emitError(me.connection.connectError);
                return;
            }

			me.connection.addListener('close', me.closeListener);
			me.connection.addListener('error', me.errorListener);

			me.connection.close = me.connection.closeSync;

			me.state = states.CONNECTED;
			log.log('Connected!', 'noblesql');
			me.emitConnect();
			act.emitSuccess();
		});
		return act;
	};

	me.query = function(sql) {
		var act = new NobleMachine(function() {
			act.toNext(me._testConnection());
		});

		act.next(function() {
			log.debug('Executing '+sql, 'noblesql');
			var res = me.connection.querySync(sql);

			if ('boolean' == typeof res) {
				try {
					var data = {
						affected_rows: me.connection.affectedRowsSync(),
						insert_id: me.connection.lastInsertIdSync(),
					}
				} catch (e) {
					return act.toError({
						errno: me.connection.errnoSync(),
						message: me.connection.errorSync(),
					});
				}
			} else {
				var data = res.fetchAllSync();
				var fields = res.fetchFieldsSync();

				// Type mapping
				fields.forEach(function(field) {
					data.forEach(function(datum) {
						if (datum[field.name] !== undefined) {
							if (field.type == 1) { // Boolean
								datum[field.name] = !!datum[field.name]
							}
						}
					});
				});
			}

			act.toNext(data);
		});

		return act;
	};

	me.close = function() {
		log.log('Closing connection', 'noblesql');
		me.state = states.CLOSING;
		if (undefined != me.connection) {
            try {
                me.connection.closeSync();
            } catch (err) {
                if (err.message.search("Not connected") == -1) {
                    throw err;
                }
            }
		}
	};

	me.emitConnect = function() {
		me.emit.apply(me, ['connect'].concat(
			Array.prototype.slice.call(arguments)));
	};

	return this;
}
sys.inherits(DbConnection, events.EventEmitter);

_.extend(exports, {
	DbConnection: DbConnection,
});
