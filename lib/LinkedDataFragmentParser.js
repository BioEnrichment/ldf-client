/*! @license ©2013 Ruben Verborgh - Multimedia Lab / iMinds / Ghent University */
/** A LinkedDataFragmentParser parses a response from a Linked Data Server */

var cheerio = require('cheerio'),
    url = require('url');

// Creates a new LinkedDataFragmentParser
function LinkedDataFragmentParser() {}

LinkedDataFragmentParser.prototype = {
  // Parses the specified document
  parse: function (document, baseUrl) {
    var $ = cheerio.load(document),
        total = parseInt($('dd.total').text(), 10),
        triples = $('.triple').map(function () {
          return {
            subject: $('.subject', this).first().attr('title'),
            predicate: $('.predicate', this).first().attr('title'),
            object: $('.object', this).first().attr('title'),
          };
        });
    return {
      // Gets the URL to the results for the given triple pattern
      getQueryLink: function (subject, predicate, object) {
        var link = url.parse(baseUrl);
        delete link.search;
        link.query = { subject: subject ? toEntity(subject) : '',
                       predicate: predicate ? toEntity(predicate) : '',
                       object: object ? toEntity(object) : '' };
        return url.format(link);
      },

      // The triples in the fragment
      triples: triples,

      // The total number of matches for the pattern
      matchCount: total,
    };
  },
};

function toEntity(uriOrLiteral) {
  return (/^[^"]/).test(uriOrLiteral) ? '<' + uriOrLiteral + '>' : uriOrLiteral;
}

module.exports = LinkedDataFragmentParser;
