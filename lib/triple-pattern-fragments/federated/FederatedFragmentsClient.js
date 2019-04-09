/*! @license MIT ©2015-2016 Miel Vander Sande, Ghent University - imec */

var FragmentsClient = require('../FragmentsClient'),
    BufferedIterator = require('../../asynciterator').BufferedIterator,
    Logger = require('../../util/ExecutionLogger')('FederatedFragmentsClient'),
    rdf = require('../../util/RdfUtil'),
    _ = require('lodash');

function FederatedFragmentsClient(startFragments, options) {
  if (!(this instanceof FederatedFragmentsClient))
    return new FederatedFragmentsClient(startFragments, options);

  // If only one fragment is given, create a simple client instead
  if (!_.isArray(startFragments))
    return new FragmentsClient(startFragments, options);
  if (startFragments.length === 1)
    return new FragmentsClient(startFragments[0], options);

  // Create clients for each of the start fragments
  var clients = this._clients = (startFragments || []).map(function (startFragment) {
    var client = new FragmentsClient(startFragment, options);
    client._emptyPatterns = []; // patterns without matches
    return client;
  });

  // Set the default options
  this._options = _.extend({
    errorThreshold: clients.length - 1, // continue if all but one client fail
  }, options);
}

FederatedFragmentsClient.prototype.getFragmentByPattern = function (pattern) {
  var fragments = [];
  this._clients.forEach(function (client) {
    // Check whether the pattern is a bound version of a pattern we know to be empty;
    // if so, the current (more specific) pattern will not have matches either.
    var empty = _.some(client._emptyPatterns, rdf.isBoundPatternOf.bind(null, pattern));
    if (!empty) {
      var fragment = client.getFragmentByPattern(pattern);

        Logger.debug('ffc getFragmentByPattern: get metadata for', JSON.stringify(pattern))
        
      fragment.getProperty('metadata', function (metadata) {
        Logger.debug('ffc getFragmentByPattern: got metadata for', JSON.stringify(pattern))
        if (metadata.totalTriples === 0) {
          Logger.debug('pattern', JSON.stringify(pattern), 'is empty')
          client._emptyPatterns.push(pattern);
        }
      });
      fragments.push(fragment);
    }
  });
  Logger.debug('ffc getFragmentByPattern: constructing CompoundFragment from ' + fragments.length + ' fragments')
  return new CompoundFragment(fragments, this._options);
};

/** Aborts all requests. */
FederatedFragmentsClient.prototype.abortAll = function () {
  this._clients.forEach(function (client) { client.abortAll(); });
};

var NCF = 0

// Creates a new compound Triple Pattern Fragment
function CompoundFragment(fragments, options) {
    var ID = 'COMPOUNDFRAGMENT' + (++ NCF)

  Logger.debug(ID + ' is ' + fragments.join(','))

  if (!(this instanceof CompoundFragment))
    return new CompoundFragment(fragments, options);
  BufferedIterator.call(this, options);

  // If no fragments are given, the fragment is empty
  if (!fragments || !fragments.length)
    return this.empty(), this;

  // Index fragments for processing and initialize metadata
  var fragmentsPending = fragments.length,
      metadataPending  = fragments.length,
        numFragments = fragments.length,
      errorThreshold   = options.errorThreshold || 0,
      combinedMetadata = this._metadata = { totalTriples: 0 };
  fragments = this._fragments = _.indexBy(fragments, getIndex);

  Logger.debug(ID + ' error threshold starts at ' + errorThreshold)

  this.ID = ID

  // Combine all fragments into a single fragment
  var compoundFragment = this;
  _.each(fragments, function (fragment, index) {

      var errored = false

    fragment.on('readable', setReadable);

    // Process the metadata of the fragment
    var processMetadata = _.once(function (metadata) {
        -- metadataPending

      if(metadata.hadError) {
        Logger.debug(ID, 'i got the metadata for ' + fragment + ' and it had hadError true')
        handleError()
        return
      }
      // Sum the metadata if it exists
      if (metadata.totalTriples)
        combinedMetadata.totalTriples += metadata.totalTriples;
      // If no metadata is pending anymore, we can emit it
      if (metadataPending === 0)
        compoundFragment.setProperty('metadata', combinedMetadata);
    });
    fragment.getProperty('metadata', processMetadata);

    // Process the end of the fragment
    var fragmentDone = _.once(function () {
      // Remove the fragment from the queue
      delete fragments[index];
      // If no fragments are pending anymore, the iterator ends
      if (--fragmentsPending === 0) {
        Logger.debug(ID, 'No more fragments pending in compound fragment')
        compoundFragment.close();
      }
    });
    fragment.once('end', fragmentDone);

    // Process a fragment error
    fragment.once('error', function (error) {
        handleError()
    });

    function handleError(error) {
      if (errored)
        return
      errored = true
      Logger.debug(ID, 'CompoundFragment handleError: errorThreshold is now ' + (errorThreshold) + ' (we have ' + numFragments + ' fragments)')
      Logger.debug(ID, 'Error is', error)
      // Only error if the threshold across fragments has been reached
      if (errorThreshold-- === 0) {
        Logger.debug(ID, 'reached error threshold of ffc CompoundFragment')
        combinedMetadata.hadError = true
        compoundFragment.setProperty('metadata', combinedMetadata);
        compoundFragment.emit('error', error || new Error('all failed silently'));
        fragmentDone()
        return
      }
      // Otherwise, silently assume this fragment has no results
      processMetadata({});
      fragmentDone();
    }
  });

  // Make the compound fragment become readable
  function setReadable() { compoundFragment.readable = true; }
}
BufferedIterator.subclass(CompoundFragment);

// Reads elements of the first non-empty child fragments
CompoundFragment.prototype._read = function (count, done) {
  var fragments = this._fragments;
  Logger.debug(this.ID + ' READ ' + count)
  for (var index in fragments) {
    var fragment = fragments[index], item;
    // Try to read as much items from the fragment as possible

    for (; ;) {
      item = fragment.read()
      Logger.debug(this.ID + ' ' + index + ' returned ' + item)

      if (item) {
        this._push(item)
        count--;
      } else {
        break
      }
      // Stop if we have read sufficient elements
      if (!count) break;
    }
  }
  done();
};

// Empties the fragment
CompoundFragment.prototype.empty = function () {
  if (!this.getProperty('metadata'))
    this.setProperty('metadata', { totalTriples: 0 });
  this.close();
};

// Returns a textual representation of the fragment
CompoundFragment.prototype.toString = function () {
  return this.toString() + '{' +
         _.map(this._fragments, function (f) { return f.toString(); }).join(', ') + '}';
};

// Collection iterator that returns the second argument (index)
function getIndex(element, index) { return index; }

module.exports = FederatedFragmentsClient;
