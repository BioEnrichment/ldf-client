/*! @license MIT ©2014-2016 Miel Vander Sande, Ghent University - imec */
/* Writer that serializes a SPARQL query result as a CSV of timestamps and resultcounts */
/* This Writer is for debugging purposes */

var SparqlResultWriter = require('./SparqlResultWriter');

function StatsResultWriter(sparqlIterator, options) {
  SparqlResultWriter.call(this, sparqlIterator);
  this._startTime = process.hrtime();
  this._result = 0;
  this._fragmentsClient = options.fragmentsClient;
}
SparqlResultWriter.subclass(StatsResultWriter);


StatsResultWriter.prototype._writeHead = function () {
  this._push(['Result', 'Delay (ms)', 'Requests (#)'].join(',') + '\n');
};

StatsResultWriter.prototype._transform = function (result, done) {
  var time = process.hrtime(this._startTime);
  this._result++;
  this._push([this._result, time[0] * 1000 + (time[1] / 1000000), this._fragmentsClient.getRequestCount()].join(',') + '\n');
  done();
};

StatsResultWriter.prototype._flush = function (done) {
  var time = process.hrtime(this._startTime);
  this._push(['TOTAL', time[0] * 1000 + (time[1] / 1000000), this._fragmentsClient.getRequestCount()].join(',') + '\n');
  done();
};

module.exports = StatsResultWriter;
