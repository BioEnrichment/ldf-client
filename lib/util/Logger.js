/*! @license ©2013 Ruben Verborgh - Multimedia Lab / iMinds / Ghent University */

var rdf = require('./RdfUtil');

/**
 * Creates a new `Logger`.
 * @constructor
 * @classdesc A `Logger` provides debug output.
 * @param name The name of the logger
 */
function Logger(name) {
  if (!(this instanceof Logger))
    return new Logger(name);
  this._prefix = name ? name + ':' : '';
}

/**
 * Logs an information message.
 * @param {...Object} item An item to log.
 */
Logger.prototype.info = function () {
  var items = Array.prototype.map.call(arguments, this._format, this);
  items.unshift(this._prefix);
  this._print(items);
};

/**
 * Formats the item for logging, depending on its type.
 * @protected
 * @param {Object} item The item to format.
 * @returns {Object} the formatted item
 */
Logger.prototype._format = function (item) {
  // Don't format falsy items
  if (!item)
    return item;
  // Format an array
  if (item instanceof Array)
    return item.map(this._format, this);
  // Format a triple
  if (item.subject && item.predicate && item.object)
    return rdf.toQuickString(item);
  // Return any other item unaltered
  return item;
};

/**
 * Outputs the items to the console.
 * @param {...Object} item An item to output.
 * @protected
 */
Logger.prototype._print = function (items) {
  console.error.apply(console, items);
};

/**
 * Disables all loggers.
 */
Logger.disable = function () {
  Logger.prototype.info = function () { };
};

module.exports = Logger;
