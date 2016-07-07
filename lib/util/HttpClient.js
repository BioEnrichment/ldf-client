/*! @license ©2014 Ruben Verborgh - Multimedia Lab / iMinds / Ghent University */

var TransformIterator = require('asynciterator').TransformIterator,
    request = require('./Request'),
    logger = require('../util/Logger.js'),
    zlib = require('zlib'),
    _ = require('lodash'),
    parseLink = require('parse-link-header');

var activeRequests = {}, requestId = 0;

/**
 * Creates a new `HttpClient`.
 * @classdesc An `HttpClient` retrieves representations of resources through HTTP
 * and offers them through an iterator interface.
 * @param {String} [options.request=(the request npm module)] The HTTP request module
 * @param {String} [options.contentType=* / *] The desired content type of representations
 * @constructor
 */
function HttpClient(options) {
  if (!(this instanceof HttpClient))
    return new HttpClient(options);

  options = options || {};
  this._request = options.request || request;
  this._defaultHeaders = _.pick({
    'accept': options.contentType || '*/*',
    'accept-encoding': 'gzip,deflate',
    'accept-datetime': options.datetime && options.datetime.toUTCString(),
  }, _.identity);
  this._queue = [];
  this._activeRequests = 0;
  this._maxActiveRequests = options.concurrentRequests || 20;
  this._logger = options.logger || logger('HttpClient');
}

/**
 * Retrieves a representation of the resource with the given URL.
 * @param {string} url The URL of the resource
 * @param {Object} [headers] Additional HTTP headers to add
 * @param {Object} [options] Additional options for the HTTP request
 * @returns {AsyncIterator} An iterator of the representation
 */
HttpClient.prototype.get = function (url, headers, options) {
  return this.request(url, 'GET', headers, options);
};

/**
 * Retrieves a representation of the resource with the given URL.
 * @param {string} url The URL of the resource
 * @param {string} [method='GET'] method The HTTP method to use
 * @param {Object} [headers] Additional HTTP headers to add
 * @param {Object} [options] Additional options for the HTTP request
 * @returns {AsyncIterator} An iterator of the representation
 */
HttpClient.prototype.request = function (url, method, headers, options) {
  var responseIterator = new TransformIterator(), self = this;

  function performRequest() {
    self._activeRequests++;
    self._logger.info('Requesting', url);

    // Create the request
    var request, startTime = new Date(),
        requestHeaders = _.assign({}, self._defaultHeaders, headers),
        requestOptions = _.assign({
          url: url,
          method: method || 'GET',
          headers: requestHeaders,
          timeout: 5000,
          followRedirect: true,
        }, options);
    try { request = self._request(requestOptions); }
    catch (error) { return setImmediate(emitError, error), responseIterator; }
    activeRequests[request._id = requestId++] = request;

    // Reply to its response
    request.on('response', function (response) {
      // Start a possible queued request
      if (delete activeRequests[request._id])
        self._activeRequests--;
      var nextRequest = self._queue.shift();
      nextRequest && nextRequest();

      // Did we ask for a time-negotiated response, but haven't received one?
      if (requestHeaders['accept-datetime'] && !response.headers['memento-datetime']) {
        // The links might have a timegate that can help us
        var links = response.headers.link && parseLink(response.headers.link);
        if (links && links.timegate) {
          // Respond with a time-negotiated response from the timegate instead
          var timegateResponse = self.request(links.timegate.url, method, headers, options);
          responseIterator.source = timegateResponse;
          responseIterator.copyProperties(timegateResponse,
                                          ['statusCode', 'contentType', 'responseTime']);
          return;
        }
      }

      // Redirect output to the response iterator
      var responseStream = self._decodeResponse(response);
      responseStream.setEncoding && responseStream.setEncoding('utf8');
      responseStream.pause && responseStream.pause();
      responseIterator.source = responseStream;
      // Drain the entire response stream, since unconsumed responses
      // can lead to out-of-memory errors (http://nodejs.org/api/http.html)
      responseIterator.maxBufferSize = Infinity;

      // Emit the metadata
      responseIterator.setProperties({
        statusCode: response.statusCode,
        contentType: (response.headers['content-type'] || '').replace(/\s*(?:;.*)?$/, ''),
        responseTime: new Date() - startTime,
      });
    });

    // Return possible errors on the response iterator
    request.on('error', emitError);
    function emitError(error) {
      if (!this._aborted || !error || error.code !== 'ETIMEDOUT')
        responseIterator.emit('error', error);
      if (request && delete activeRequests[request._id])
        self._activeRequests--;
    }
  }

  // Start or enqueue the request
  if (this._activeRequests < this._maxActiveRequests)
    performRequest();
  else
    this._queue.push(performRequest);

  return responseIterator;
};

// Returns a decompressed stream from the HTTP response
HttpClient.prototype._decodeResponse = function (response) {
  var encoding = response.headers['content-encoding'] || '', decodedResponse = response;
  switch (encoding) {
  case '':
    break;
  case 'gzip':
    response.pipe(decodedResponse = zlib.createGunzip());
    break;
  case 'deflate':
    response.pipe(decodedResponse = zlib.createInflate());
    break;
  default:
    setImmediate(function () {
      response.emit('error', new Error('Unsupported encoding: ' + encoding));
    });
  }
  return decodedResponse;
};

// Abort all active requests
HttpClient.abortAll = function () {
  for (var id in activeRequests) {
    activeRequests[id].abort();
    delete activeRequests[id];
  }
};

module.exports = HttpClient;
