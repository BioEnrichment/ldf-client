/*! @license ©2014 Ruben Verborgh - Multimedia Lab / iMinds / Ghent University */
/** An SparqlIterator returns the results of a SPARQL query. */

var SparqlParser = require('sparql-parser'),
    Iterator = require('./Iterator'),
    TransformIterator = Iterator.TransformIterator,
    GraphPatternIterator = require('./GraphPatternIterator'),
    UnionIterator = require('./UnionIterator'),
    N3 = require('n3'),
    rdf = require('../util/RdfUtil'),
    util = require('util');

// Creates an iterator from a SPARQL query
function SparqlIterator(query, options) {
  // Parse the query and select the appropriate sub-iterator
  try {
    if (typeof(query) === 'string') {
      var parsedQuery = new SparqlParser(options.prefixes).parse(query);
      switch (parsedQuery.type) {
      case 'SELECT':
        return new SparqlSelectIterator(Iterator.single({}), parsedQuery, options);
      case 'CONSTRUCT':
        return new SparqlConstructIterator(Iterator.single({}), parsedQuery, options);
      default:
        throw new Error('No iterator available for query type: ' + parsedQuery.type);
      }
    }
  }
  catch (error) {
    // Report syntax errors directly
    if (error instanceof SparqlParser.SparqlSyntaxError) throw error;
    // All other types of errors indicate the query is not supported
    throw new UnsupportedQueryError(query, error);
  }

  // If the query was already parsed, construct the SparqlIterator superclass
  if (!(this instanceof SparqlIterator))
    return new SparqlIterator(query, options);
  TransformIterator.call(this, true, options);
  this.parsedQuery = query;
}
TransformIterator.inherits(SparqlIterator);



// Creates an iterator for a parsed SPARQL SELECT query
function SparqlSelectIterator(source, query, options) {
  if (!(this instanceof SparqlSelectIterator))
    return new SparqlSelectIterator(query, options);
  SparqlIterator.call(this, query, options);

  this._variables = query.variables;
  this.setSource(new SparqlGraphPatternGroupIterator(source, query.patterns, options));
}
SparqlIterator.inherits(SparqlSelectIterator);

// Executes the SELECT projection
SparqlSelectIterator.prototype._transform = function (bindings, done) {
  this._push(this._variables.reduce(function (row, variable) {
    // Project a simple variable by copying its value
    if (variable !== '*')
      row[variable] = bindings[variable];
    // Project a star selector by copying all values
    else
      for (variable in bindings)
        row[variable] = bindings[variable];
    return row;
  }, Object.create(null)));
  done();
};



// Creates an iterator for a parsed SPARQL CONSTRUCT query
function SparqlConstructIterator(source, query, options) {
  if (!(this instanceof SparqlConstructIterator))
    return new SparqlConstructIterator(query, options);
  SparqlIterator.call(this, query, options);

  this._template = query.template;
  this.setSource(new SparqlGraphPatternGroupIterator(source, query.patterns, options));
}
SparqlIterator.inherits(SparqlConstructIterator);

// Executes the CONSTRUCT projection
SparqlConstructIterator.prototype._transform = function (bindings, done) {
  this._template.forEach(function (triplePattern) {
    this._push(rdf.applyBindings(bindings, triplePattern));
  }, this);
  done();
};




// Creates an iterator for a SPARQL group of graph patterns
function SparqlGraphPatternGroupIterator(source, patterns, options) {
  return patterns.reduce(function (source, pattern) {
     return new SparqlGraphPatternIterator(source, pattern, options);
  }, source);
}
Iterator.inherits(SparqlGraphPatternIterator);




// Creates an iterator for a SPARQL graph pattern
function SparqlGraphPatternIterator(source, queryToken, options) {
  switch (queryToken.type) {
  case 'BGP':
    return new GraphPatternIterator(source, queryToken.triples, options);
  case 'UNION':
    return new UnionIterator(queryToken.patterns.map(function (patternToken) {
      return new SparqlGraphPatternIterator(source.clone(), patternToken, options);
    }), options);
  default:
    throw new Error('Unsupported graph pattern type: ' + queryToken.type);
  }
}
Iterator.inherits(SparqlGraphPatternIterator);



// Error thrown when no combination of iterators can solve the query
function UnsupportedQueryError(query, source) {
  Error.call(this, source);
  this.name = 'UnsupportedQueryError';
  this.query = query;
  this.source = source;
  this.message = 'The following query is not (yet) supported:\n' + query.replace(/^/mg, '  ');
}
util.inherits(UnsupportedQueryError, Error);



module.exports = SparqlIterator;
SparqlIterator.UnsupportedQueryError = UnsupportedQueryError;
