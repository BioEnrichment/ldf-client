/*! @license ©2014 Ruben Verborgh - Multimedia Lab / iMinds / Ghent University */
/* An SparqlIterator returns the results of a SPARQL query. */

var SparqlParser = require('sparqljs').Parser,
    AsyncIterator = require('asynciterator'),
    TransformIterator = AsyncIterator.TransformIterator,
    ReorderingGraphPatternIterator = require('../triple-pattern-fragments/ReorderingGraphPatternIterator'),
    UnionIterator = require('./UnionIterator'),
    SortIterator = require('./SortIterator'),
    DistinctIterator = require('./DistinctIterator'),
    SparqlExpressionEvaluator = require('../util/SparqlExpressionEvaluator'),
    _ = require('lodash'),
    util = require('util'),
    rdf = require('../util/RdfUtil'),
    createErrorType = require('../util/CustomError');

// Creates an iterator from a SPARQL query
function SparqlIterator(source, queryText, options) {
  // Shift arguments if `source` was omitted
  if (typeof source === 'string')
    options = queryText, queryText = source, source = null;

  // Transform the query into a cascade of iterators
  try {
    // Create an iterator that projects the bindings according to the query type
    var query = new SparqlParser(options.prefixes).parse(queryText),
        queryIterator, QueryConstructor = queryConstructors[query.queryType];
    if (!QueryConstructor)
      throw new Error('No iterator available for query type: ' + query.queryType);
    queryIterator = new QueryConstructor(null, query, options);

    // Create an iterator for bindings of the query's graph pattern
    var graphIterator = new SparqlGroupsIterator(source || AsyncIterator.single({}),
                              queryIterator.patterns || query.where, options);
    // Create iterators for each order
    for (var i = query.order && (query.order.length - 1); i >= 0; i--) {
      var order = SparqlExpressionEvaluator(query.order[i].expression),
          ascending = !query.order[i].descending;
      graphIterator = new SortIterator(graphIterator, function (a, b) {
        var orderA = '', orderB = '';
        try { orderA = order(a); } catch (error) {}
        try { orderB = order(b); } catch (error) {}
        if (orderA < orderB) return ascending ? -1 :  1;
        if (orderA > orderB) return ascending ?  1 : -1;
        return 0;
      }, options);
    }
    queryIterator.source = graphIterator;

    // Create iterators for modifiers
    if (query.distinct)
      queryIterator = new DistinctIterator(queryIterator, options);
    // Add offsets and limits if requested
    if ('offset' in query || 'limit' in query)
      queryIterator = queryIterator.transform({ offset: query.offset, limit: query.limit });
    queryIterator.queryType = query.queryType;
    return queryIterator;
  }
  catch (error) {
    if (/Parse error/.test(error.message))
      error = new InvalidQueryError(queryText, error);
    else
      error = new UnsupportedQueryError(queryText, error);
    throw error;
  }
}
TransformIterator.subclass(SparqlIterator);

var queryConstructors = {
  SELECT: SparqlSelectIterator,
  CONSTRUCT: SparqlConstructIterator,
  DESCRIBE: SparqlDescribeIterator,
  ASK: SparqlAskIterator,
};



// Creates an iterator for a parsed SPARQL SELECT query
function SparqlSelectIterator(source, query, options) {
  TransformIterator.call(this, source, options);
  this.setProperty('variables', query.variables);
}
SparqlIterator.subclass(SparqlSelectIterator);

// Executes the SELECT projection
SparqlSelectIterator.prototype._transform = function (bindings, done) {
  this._push(this.getProperty('variables').reduce(function (row, variable) {
    // Project a simple variable by copying its value
    if (variable !== '*')
      row[variable] = valueOf(variable);
    // Project a star selector by copying all variable bindings
    else
      for (variable in bindings)
        if (rdf.isVariable(variable))
          row[variable] = valueOf(variable);
    return row;
  }, Object.create(null)));
  done();
  function valueOf(variable) {
    var value = bindings[variable];
    return typeof(value) === 'string' ? rdf.deskolemize(value) : null;
  }
};



// Creates an iterator for a parsed SPARQL CONSTRUCT query
function SparqlConstructIterator(source, query, options) {
  TransformIterator.call(this, source, options);

  // Push constant triple patterns only once
  this._template = query.template.filter(function (triplePattern) {
    return rdf.hasVariables(triplePattern) || this._push(triplePattern);
  }, this);
  this._blankNodeId = 0;
}
SparqlIterator.subclass(SparqlConstructIterator);

// Executes the CONSTRUCT projection
SparqlConstructIterator.prototype._transform = function (bindings, done) {
  var blanks = Object.create(null);
  this._template.forEach(function (triplePattern) {
    // Apply the result bindings to the triple pattern, ensuring no variables are left
    var s = triplePattern.subject, p = triplePattern.predicate, o = triplePattern.object,
        s0 = s[0], p0 = p[0], o0 = o[0];
    if (s0 === '?') { if ((s = rdf.deskolemize(bindings[s])) === undefined) return; }
    else if (s0 === '_') s = blanks[s] || (blanks[s] = '_:b' + this._blankNodeId++);
    if (p0 === '?') { if ((p = rdf.deskolemize(bindings[p])) === undefined) return; }
    else if (p0 === '_') p = blanks[p] || (blanks[p] = '_:b' + this._blankNodeId++);
    if (o0 === '?') { if ((o = rdf.deskolemize(bindings[o])) === undefined) return; }
    else if (o0 === '_') o = blanks[o] || (blanks[o] = '_:b' + this._blankNodeId++);
    this._push({ subject: s, predicate: p, object: o });
  }, this);
  done();
};



// Creates an iterator for a parsed SPARQL DESCRIBE query
function SparqlDescribeIterator(source, query, options) {
  // Create a template with `?var ?p ?o` patterns for each variable
  var variables = query.variables, template = query.template = [];
  for (var i = 0, l = variables.length; i < l; i++)
    template.push(rdf.triple(variables[i], '?__predicate' + i, '?__object' + i));
  query.where = query.where.concat({ type: 'bgp', triples: template });
  SparqlConstructIterator.call(this, source, query, options);
}
SparqlConstructIterator.subclass(SparqlDescribeIterator);

// Creates an iterator for a parsed SPARQL ASK query
function SparqlAskIterator(source, query, options) {
  TransformIterator.call(this, source, options);
}
SparqlIterator.subclass(SparqlAskIterator);

// If an answer to the query exists, output true and end the iterator
SparqlAskIterator.prototype._transform = function (bindings, done) {
  if (!this._hasAnswer) {
    this._hasAnswer = true;
    this._push(true);
    this.close();
  }
  done();
};

// If no answer was received, output false
SparqlAskIterator.prototype._flush = function (done) {
  if (!this._hasAnswer)
    this._push(false);
  done();
};


// Creates an iterator for a list of SPARQL groups
function SparqlGroupsIterator(source, groups, options) {
  // Chain iterators for each of the graphs in the group
  return groups.reduce(function (source, group) {
    return new SparqlGroupIterator(source, group, options);
  }, source);
}
AsyncIterator.subclass(SparqlGroupsIterator);




// Creates an iterator for a SPARQL group
function SparqlGroupIterator(source, group, options) {
  // Reset flags on the options for child iterators
  var childOptions = options.optional ? _.create(options, { optional: false }) : options;

  switch (group.type) {
  case 'bgp':
    return new ReorderingGraphPatternIterator(source, group.triples, options);
  case 'group':
    return new SparqlGroupsIterator(source, group.patterns, childOptions);
  case 'optional':
    childOptions = _.create(options, { optional: true });
    return new SparqlGroupsIterator(source, group.patterns, childOptions);
  case 'union':
    return new UnionIterator(group.patterns.map(function (patternToken) {
      return new SparqlGroupIterator(source.clone(), patternToken, childOptions);
    }), options);
  case 'filter':
    // A set of bindings does not match the filter
    // if it evaluates to 0/false, or errors
    var evaluate = SparqlExpressionEvaluator(group.expression);
    return source.filter(function (bindings) {
      try { return !/^"false"|^"0"/.test(evaluate(bindings)); }
      catch (error) { return false; }
    });
  default:
    throw new Error('Unsupported group type: ' + group.type);
  }
}
AsyncIterator.subclass(SparqlGroupIterator);


// Error thrown when the query has a syntax error
var InvalidQueryError = createErrorType('InvalidQueryError', function (query, cause) {
  this.message = 'Syntax error in query\n' + cause.message;
});

// Error thrown when no combination of iterators can solve the query
var UnsupportedQueryError = createErrorType('UnsupportedQueryError', function (query, cause) {
  this.message = 'The query is not yet supported\n' + cause.message;
});


module.exports = SparqlIterator;
SparqlIterator.InvalidQueryError = InvalidQueryError;
SparqlIterator.UnsupportedQueryError = UnsupportedQueryError;
