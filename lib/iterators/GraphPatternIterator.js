/*! @license ©2014 Ruben Verborgh - Multimedia Lab / iMinds / Ghent University */
/** A GraphPatternIterator extends bindings by reading matches for a basic graph pattern. */

var Iterator = require('./Iterator'),
    TransformIterator = Iterator.TransformIterator,
    rdf = require('../rdf/RdfUtil'),
    _ = require('lodash');

var TriplePatternIterator = require('./TriplePatternIterator');

// Creates a new GraphPatternIterator
function GraphPatternIterator(parent, pattern, options) {
  // Empty patterns have no effect; return a pass-through iterator
  if (!pattern || !pattern.length)
    return new Iterator.passthrough(parent, options);
  // A one-element pattern can be solved by a triple pattern iterator
  if (pattern.length === 1)
    return new TriplePatternIterator(parent, pattern[0], options);
  // For length two or more, construct a GraphPatternIterator
  if (!(this instanceof GraphPatternIterator))
    return new GraphPatternIterator(parent, pattern, options);
  TransformIterator.call(this, parent, options);

  options = options || {};
  this._options = options;
  this._pattern = pattern;
  this._client = options.fragmentsClient;
}
TransformIterator.inherits(GraphPatternIterator);

GraphPatternIterator.prototype._read = function (push) {
  // First, try to read from the existing pipeline
  var pipeline = this._pipeline;
  if (pipeline && !pipeline.ended) {
    var bindings = pipeline.read();
    return bindings && push(bindings);
  }

  // A new pipeline must be created; read the next bindings from the source
  var bindingsContext = this._source.read();
  if (bindingsContext === null)
    return this._source.ended && this._end();
  // Apply the context bindings to the iterator's graph pattern
  var boundPattern = rdf.applyBindings(bindingsContext.bindings, this._pattern);
  // Select the smallest connected subpattern
  var subPatterns = _.sortBy(rdf.findConnectedPatterns(boundPattern), 'length'),
      subPattern = subPatterns.pop(), tripleCounts = [], metadataFound = 0;

  // If this subpattern has only one triple pattern, use it to build the pipeline
  if (subPattern.length === 1)
    return this._createPipeline(bindingsContext, subPattern[0], null, subPatterns);

  // Otherwise, find the triple pattern in this subpattern that is best to start with
  var bestIndex = 0, bestCount = Infinity, patternsChecked = 0;
  subPattern.forEach(function (triplePattern, index) {
    var fragment = this._client.getFragmentByPattern(triplePattern), self = this;
    fragment.getMetadata(function (metadata) {
      // If there are no matches, the entire graph pattern has no matches
      if (metadata.totalTriples === 0) return;
      // This triple pattern is the best if it has the lowest number of matches
      if (metadata.totalTriples < bestCount)
        bestIndex = index, bestCount = metadata.totalTriples;
      // If all patterns have been checked, create the iterator pipeline
      if (++patternsChecked === subPattern.length) {
        var bestPattern = subPattern.splice(bestIndex, 1)[0];
        self._createPipeline(bindingsContext, bestPattern, subPattern, subPatterns);
      }
    });
  }, this);
};

// Creates a pipeline of iterators,
// starting with a TriplePatternIterator for the triple pattern,
// then a GraphPatternIterator for the remainder of that subpattern,
// and finally, GraphPatternIterators for the remaining subpatterns.
GraphPatternIterator.prototype._createPipeline =
function (bindingsContext, triplePattern, subPattern, subPatterns) {
  // Create the iterator for the triple pattern
  var pipeline = Iterator.single(bindingsContext);
  pipeline = new TriplePatternIterator(pipeline, triplePattern, this._options);

  // If the chosen subpattern has more triples, create a GraphPatternIterator for it
  if (subPattern && subPattern.length !== 0)
    pipeline = new GraphPatternIterator(pipeline, subPattern, this._options);

  // Create GraphPatternIterators for all interconnected subpatterns
  while (subPattern = subPatterns.pop())
    pipeline = new GraphPatternIterator(pipeline, subPattern, this._options);

  // Store the pipeline and react on its events
  this._pipeline = pipeline;
  pipeline.on('readable', this._pushBound);
  pipeline.on('end',      this._pushBound);
};

// Flushes remaining data after the source has ended
GraphPatternIterator.prototype._flush = function (push) {
  // The pipeline might still have triples, so try to fill the buffer
  this._fillBufferOrEmitEnd();
};

module.exports = GraphPatternIterator;
