/*! @license ©2014 Miel Vander Sande - Multimedia Lab / iMinds / Ghent University */
/* Writer that serializes a SPARQL query result as a plain JSON array */

var SparqlResultWriter = require('./SparqlResultWriter');

function StatsResultWriter(sparqlIterator) {
  SparqlResultWriter.call(this, true, sparqlIterator);

  // Init stats
  this.startTime = process.hrtime();
  this.result = 0;

}
SparqlResultWriter.inherits(StatsResultWriter);

StatsResultWriter.prototype._writeHead = function () {
};

StatsResultWriter.prototype._transform = function (result, done) {
  var time = process.hrtime(this.startTime);
  this.result++;
  this._push([this.result, time[0] * 1000 + (time[1] / 1000000)].join(',') + '\n');
  done();
};

StatsResultWriter.prototype._end = function () {
  var time = process.hrtime(this.startTime);
  this._push(['TOTAL', time[0] * 1000 + (time[1] / 1000000)].join(',') + '\n');
  SparqlResultWriter.prototype._end.call(this);
};

module.exports = StatsResultWriter;
