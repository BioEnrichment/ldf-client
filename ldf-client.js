/*! @license ©2013 Ruben Verborgh - Multimedia Lab / iMinds / Ghent University */
/** Main ldf-client module exports. */
var SparqlResultWriter = require('./lib/writers/SparqlResultWriter');
SparqlResultWriter.register('application/json', './JSONResultWriter');
SparqlResultWriter.register('application/sparql-results+json', './SparqlJSONResultWriter');
SparqlResultWriter.register('application/sparql-results+xml', './SparqlXMLResultWriter');

module.exports = {
  SparqlIterator: require('./lib/triple-pattern-fragments/SparqlIterator.js'),
  FragmentsClient: require('./lib/triple-pattern-fragments/FragmentsClient'),
  Logger: require('./lib/util/Logger'),
  SparqlResultWriter: SparqlResultWriter,
  Iterator: require('./lib/iterators/Iterator.js'),
  MultiTransformIterator: require('./lib/iterators/MultiTransformIterator.js'),
  Util: require('./lib/util/RdfUtil.js'),
  HttpClient: require('./lib/util/HttpClient'),
  MetadataExtractor: require('./lib/extractors/MetadataExtractor'),
  CompositeExtractor: require('./lib/extractors/CompositeExtractor'),
  ControlsExtractor: require('./lib/extractors/ControlsExtractor'),
  FragmentsClient: require('./lib/triple-pattern-fragments/FragmentsClient')
};
