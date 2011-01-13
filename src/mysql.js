/** LEGAL COPYRIGHT NOTICE
 *
 * Copyright (c) Noble Samurai Pty Ltd, 2008-2010.  All Rights Reserved.  
 *
 * This software is proprietary to and embodies the confidential technology of
 * Noble Samurai Pty Ltd.  Possession, use, dissemination or copying of this
 * software and media is authorised only pursuant to a valid written license
 * from Noble Samurai Pty Ltd.  Questions or requests regarding permission may
 * be sent by email to legal@noblesamurai.com or by post to PO Box 477,
 * Blackburn Victoria 3130, Australia.
 */

/**
 * Wrappings for the node-mysql-libmysqlclient library
 */

require.paths.unshift(__dirname + '/../node-mysql-libmysqlclient');

var sys = require('sys'),
	action = require('action'),
	mysql = require('mysql-libmysqlclient'),
	events = require('events');

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
		var act = new action.StateMachine(function() {
			if (me.isConnected()) {
				act.emitSuccess();
			} else {
				// Listen for connect event
				var reconnected = function() {
					log.debug('Refire!');
					me.removeListener('connect', reconnected);
					act.emitSuccess();
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
		var act = new action.StateMachine(function() {
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
		var act = new action.StateMachine(function() {
			act.transition({
				success: 'query',
				error: 'error',
				action: me._testConnection()
			});
		});
		act.addState('query', function() {
			log.debug('Executing '+sql, 'noblesql');
			var res = me.connection.querySync(sql);

			if ('boolean' == typeof res) {
				try {
					var data = {
						affected_rows: me.connection.affectedRowsSync(),
						insert_id: me.connection.lastInsertIdSync(),
					}
				} catch (e) {
					return act.emitError({
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

			act.emitSuccess(data);
		});
		act.addState('error', function(e) {
			act.emitError(e);
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
