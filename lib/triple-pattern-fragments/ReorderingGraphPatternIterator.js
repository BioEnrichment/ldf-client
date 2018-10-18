/*! @license MIT ©2014-2016 Ruben Verborgh, Ghent University - imec */
/* A ReorderingGraphPatternIterator builds bindings by reading matches for a basic graph pattern. */

var AsyncIterator = require('asynciterator'),
    TransformIterator = AsyncIterator.TransformIterator,
    MultiTransformIterator = AsyncIterator.MultiTransformIterator,
    rdf = require('../util/RdfUtil'),
    _ = require('lodash'),
    Logger = require('../util/ExecutionLogger')('ReorderingGraphPatternIterator');

var TriplePatternIterator = require('./TriplePatternIterator');

// Creates a new ReorderingGraphPatternIterator
function ReorderingGraphPatternIterator(parent, pattern, options) {
  // Empty patterns have no effect
  if (!pattern || !pattern.length)
    return new TransformIterator(parent, options);
  // A one-element pattern can be solved by a triple pattern iterator
  if (pattern.length === 1)
    return new TriplePatternIterator(parent, pattern[0], options);
  // For length two or more, construct a ReorderingGraphPatternIterator
  if (!(this instanceof ReorderingGraphPatternIterator))
    return new ReorderingGraphPatternIterator(parent, pattern, options);
  MultiTransformIterator.call(this, parent, options);

  this._pattern = pattern;
  this._options = options || (options = {});
  this._client = options.fragmentsClient;

    ////console.log('MAKING REORDERTHINGY parent', parent ? JSON.stringify(parent._pattern) : 'none', 'pattern', JSON.stringify(this._pattern))
}
MultiTransformIterator.subclass(ReorderingGraphPatternIterator);

var NNCALL = 0
var NCALL = 0

// Creates a pipeline with triples matching the binding of the iterator's graph pattern
ReorderingGraphPatternIterator.prototype._createTransformer = function (bindings) {
  // Apply the context bindings to the iterator's graph pattern
  var boundPattern = rdf.applyBindings(bindings, this._pattern), options = this._options;
  // Select the smallest connected subpattern with the least number of unique variables in the resulting pattern
  var subPatterns = _.sortBy(rdf.findConnectedPatterns(boundPattern), function (patterns) {
        var distinctVariableCount = _.union.apply(_, patterns.map(rdf.getVariables)).length;
        return -(boundPattern.length * distinctVariableCount + patterns.length);
      }),
      subPattern = subPatterns.pop(), remainingPatterns = subPattern.length, pipeline;

    ++ NNCALL
    NCALL = '[[[' + NNCALL  + ']]]'

    //console.log(NCALL, 'Start:', remainingPatterns + ' pattern(s) left to check for ' + JSON.stringify(subPattern))

  // If this subpattern has only one triple pattern, use it to create the pipeline
  if (remainingPatterns === 1)
    return createPipeline(subPattern.pop());

  // Otherwise, we must first find the best triple pattern to start the pipeline
  pipeline = new TransformIterator();

  // Retrieve and inspect the triple patterns' metadata to decide which has least matches
  var bestIndex = 0, minMatches = Infinity;
  subPattern.forEach(function (triplePattern, index) {
      //console.log(NCALL, 'checking:', JSON.stringify(triplePattern))
    var fragment = this._client.getFragmentByPattern(triplePattern);
    fragment.getProperty('metadata', function (metadata) {
        //console.log(NCALL, 'metadata arrived for:', JSON.stringify(triplePattern))
      // We don't need more data from the fragment
      fragment.close();

      // If the fragment errored, we should ignore it
      // While it is not possible to get results for this fragment, it may be
      // possible for one of the others and then we can return to this one
      // later with bindings.
      //
      if(metadata.hadError === true) {
          //console.log(NCALL, '>>>>>>>>>>>>> hadError was true for', JSON.stringify(triplePattern))
          -- remainingPatterns
          return
      }

      // If this triple pattern has no matches, the entire graph pattern has no matches
      // totalTriples can either be 0 (no matches) or undefined (no count in fragment)
      if (!metadata.totalTriples) {
        Logger.warning(NCALL, 'NO total triples for', JSON.stringify(triplePattern), 'closing pipeline')
        return pipeline.close();
      } else {
        //console.log(NCALL, 'total triples for', JSON.stringify(triplePattern), 'is', metadata.totalTriples)
      }
      // This triple pattern is the best if it has the lowest number of matches
      if (metadata.totalTriples < minMatches)
        bestIndex = index, minMatches = metadata.totalTriples;
      // After all patterns were checked, create the pipeline from the best pattern
      if (--remainingPatterns === 0) {
          //console.log(NCALL, 'i checked', subPattern.length ,'patterns and the best one is', JSON.stringify(subPattern[bestIndex]))
        pipeline.source = createPipeline(subPattern.splice(bestIndex, 1)[0]);
      } else {
        //console.log(NCALL, remainingPatterns + ' pattern(s) left to check for ' + JSON.stringify(subPattern))
      }
    });
    // If the fragment errors, set hadError: true in the metadata
    fragment.on('error', function (error) {
      //console.log(NCALL, '>>>>>>>>> errored:', JSON.stringify(triplePattern))
      //Logger.warning(error.message);
      fragment.setProperty('metadata', { hadError: true });
    });
  }, this);
  return pipeline;

  // Creates the pipeline of iterators for the bound graph pattern,
  // starting with a TriplePatternIterator for the triple pattern,
  // then a ReorderingGraphPatternIterator for the remainder of the subpattern,
  // and finally, ReorderingGraphPatternIterators for the remaining subpatterns.
  function createPipeline(triplePattern) {
    // Create the iterator for the triple pattern
    var startIterator = AsyncIterator.single(bindings),
        pipeline = new TriplePatternIterator(startIterator, triplePattern, options);
    // If the chosen subpattern has more triples, create a ReorderingGraphPatternIterator for it
    if (subPattern && subPattern.length !== 0)
      pipeline = new ReorderingGraphPatternIterator(pipeline, subPattern, options);
    // Create ReorderingGraphPatternIterators for all interconnected subpatterns
    while (subPattern = subPatterns.pop())
      pipeline = new ReorderingGraphPatternIterator(pipeline, subPattern, options);
    return pipeline;
  }
};

// Generates a textual representation of the iterator
ReorderingGraphPatternIterator.prototype.toString = function () {
  return '[' + this.constructor.name +
         ' {' + this._pattern.map(rdf.toQuickString).join(' ') + '}]' +
         '\n  <= ' + this.getSourceString();
};

module.exports = ReorderingGraphPatternIterator;
