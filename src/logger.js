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

exports.debug = function() { if (common.config.logger && common.config.logger.debug) common.config.logger.debug.apply(this, arguments) }
exports.log = function() { if (common.config.logger && common.config.logger.log) common.config.logger.log.apply(this, arguments) }
exports.warning = function() { if (common.config.logger && common.config.logger.warning) common.config.logger.warning.apply(this, arguments) }
exports.error = function() { if (common.config.logger && common.config.logger.error) common.config.logger.error.apply(this, arguments) }
