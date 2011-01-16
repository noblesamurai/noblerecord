# noblerecord
##### <span style="color: #333">a Rails-inspired ORM system for mysql and node.js</span> 

## introduction

As an evented I/O framework, node lends itself naturally to data transfer and distribution purposes. However, it is limited in this role by the lack of a solid means of database access that retains asynchronicity. NobleRecord attempts to rectify this by drawing inspiration from the intuitive object-relation mapping provided by Ruby's [ActiveRecord](http://ar.rubyonrails.org/).

## dependencies

NobleRecord currently interfaces with mysql by way of [node-mysql-libmysqlclient](https://github.com/Sannis/node-mysql-libmysqlclient). As such, you must ensure that 'mysql-libmysqlclient' is somewhere in NODE_PATH before loading NobleRecord.

The [underscore](http://documentcloud.github.com/underscore/) JavaScript utility library and Ryan Schuft's [inflection](http://code.google.com/p/inflection-js/) project are included in the repository.

## database configuration

Database configuration is asynchronous; the connection is not opened until the first query is passed.

	var NobleRecord = require('noblerecord').NobleRecord;

	NobleRecord.configure_connection({
		host: 'localhost',
		username: 'metagross',
		password: 'pichupika',
		database: 'pokemon'
	});

## models

NobleRecord Models are JavaScript classes associated with individual database tables. Like Ruby's ActiveRecord, the names of tables are by default inferred based on automatic pluralisation of the model name. In keeping with JavaScript conventions, however, CamelCasing is preferred over under_score usage.

	Pokemon = new NobleRecord.Model('Pokemon');
	Pokemon.setTableName('tblPokemon'); // 'Pokemon' is uncountable

Note that there is one asynchronous call that needs to be made following the construction of models but prior to their usage. This will gather schema information from the tables of all defined models.

	var act = new NobleMachine(function() {
		act.toNext(NobleRecord.initialize());
	});

	act.next(function() {
		// Do stuff!
	});

Now you can make and retrieve models to your heart's content... but remember that any step which accesses the database must be performed asynchronously.

	act.next(function() {
		var poke = new Pokemon({ speciesId: 135 });

		poke.nickname = 'Fission';

		act.toNext(poke.save());
	});

	act.next(function() {
		act.toNext(Pokemon.find({ nickname: 'Fission' }));
	});

	act.next(function(poke) {
		poke.speciesId == 135 // true
	});

## model relationships

Only basic one-to-one or one-way relationships are supported at present. The key used in a belongsTo relationship must have the same name as the primary key of the target.

	var Species = new NobleRecord.Model('Species');
	Pokemon.belongsTo('Species');

	act.next(function() {
		act.toNext(poke.getSpecies());
	});

	act.next(function(species) {
		species.name == 'Jolteon' // true
	});

## migrations

NobleRecord includes tentative support for Rails-style database migrations. See the included nrec command for more information, and use at your own risk!

## logging

If you are having difficulties, you may gain some insight into NobleRecord's behaviour by providing it with a logger object. All this logger requires is four string-accepting functions, one for each level of direness.

	NobleRecord.config.logger = { debug: sys.log, log: sys.log, warning: sys.log, error: sys.log }


## contributors
 - [Daniel Assange](http://github.com/somnidea)
 - [Arlen Cuss](http://github.com/celtic)
 - You?

## license

Copyright 2010-2011 Noble Samurai

NobleRecord is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.

NobleRecord is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU General Public License for more details.

You should have received a copy of the GNU General Public License along with NobleRecord.  If not, see http://www.gnu.org/licenses/.

