/*! @license ©2014 Ruben Verborgh - Multimedia Lab / iMinds / Ghent University */

var RdfUtil = require('../../lib/rdf/RdfUtil'),
    N3 = require('n3');

describe('RdfUtil', function () {
  it('should include all N3.Util properties', function () {
    for (var item in N3.Util)
      RdfUtil.should.have.property(item, N3.Util[item]);
  });

  describe('isVariable', function () {
    it('should match variables starting with a question mark', function () {
      RdfUtil.isVariable('?abc').should.be.true;
    });

    it('should match variable URIs', function () {
      RdfUtil.isVariable('urn:var#abc').should.be.true;
    });

    it('should not match blank nodes', function () {
      RdfUtil.isVariable('_:foo').should.be.false;
    });

    it('should not match other URIs', function () {
      RdfUtil.isVariable('http://example.org/?foo').should.be.false;
    });

    it('should not match literals', function () {
      RdfUtil.isVariable('"?abc"').should.be.false;
    });
  });

  describe('isVariableOrBlank', function () {
    it('should match variables starting with a question mark', function () {
      RdfUtil.isVariableOrBlank('?abc').should.be.true;
    });

    it('should match variable URIs', function () {
      RdfUtil.isVariableOrBlank('urn:var#abc').should.be.true;
    });

    it('should match blank nodes', function () {
      RdfUtil.isVariableOrBlank('_:foo').should.be.true;
    });

    it('should not match other URIs', function () {
      RdfUtil.isVariableOrBlank('http://example.org/?foo_:').should.be.false;
    });

    it('should not match literals', function () {
      RdfUtil.isVariableOrBlank('"_:abc"').should.be.false;
    });
  });

  describe('tripleFilter', function () {
    describe('without parameter', function () {
      var filter = RdfUtil.tripleFilter();
      it('should match any triple', function () {
        filter(RdfUtil.triple('a', 'b', 'c')).should.be.true;
      });
    });

    describe('with a falsy parameter', function () {
      var filter = RdfUtil.tripleFilter(null);
      it('should match any triple', function () {
        filter(RdfUtil.triple('a', 'b', 'c')).should.be.true;
      });
    });

    describe('with a fixed subject', function () {
      var filter = RdfUtil.tripleFilter({ subject: 'a', object: 'urn:var#o' });
      it('should match any triple with that subject', function () {
        filter(RdfUtil.triple('a', 'b', 'c')).should.be.true;
      });
      it('should not match triples with a different subject', function () {
        filter(RdfUtil.triple('b', 'a', 'd')).should.be.false;
      });
    });

    describe('with a fixed predicate and object', function () {
      var filter = RdfUtil.tripleFilter({ predicate: 'b', object: 'c' });
      it('should match any triple with that predicate and object', function () {
        filter(RdfUtil.triple('a', 'b', 'c')).should.be.true;
      });
      it('should not match triples with a different predicate', function () {
        filter(RdfUtil.triple('a', 'd', 'c')).should.be.false;
      });
      it('should not match triples with a different object', function () {
        filter(RdfUtil.triple('a', 'b', 'd')).should.be.false;
      });
      it('should not match triples with a different predicate and object', function () {
        filter(RdfUtil.triple('a', 'd', 'e')).should.be.false;
      });
    });
  });

  describe('findBindings', function () {
    describe('binding a matching 1-variable pattern to a triple', function () {
      var pattern = RdfUtil.triple('?a', 'b', 'c');
      var triple = RdfUtil.triple('a', 'b', 'c');
      var bindings = RdfUtil.findBindings(pattern, triple);
      it('should find the correct bindings', function () {
        expect(bindings).to.deep.equal({ '?a': 'a' });
      });
    });

    describe('binding a non-matching 1-variable pattern to a triple', function () {
      var pattern = RdfUtil.triple('?a', 'b', 'a');
      var triple = RdfUtil.triple('a', 'b', 'c');
      it('should throw an error', function () {
        (function () {
          var bindings = RdfUtil.findBindings(pattern, triple);
        })
        .should.throw('Cannot bind a to c');
      });
    });

    describe('binding a matching 3-variable pattern to a triple', function () {
      var pattern = RdfUtil.triple('?a', '_:b', '?c');
      var triple = RdfUtil.triple('a', 'b', 'c');
      var bindings = RdfUtil.findBindings(pattern, triple);
      it('should find the correct bindings', function () {
        expect(bindings).to.deep.equal({ '?a': 'a', '_:b': 'b', '?c': 'c' });
      });
    });

    describe('binding a non-matching 3-variable pattern to a triple', function () {
      var pattern = RdfUtil.triple('?a', '?b', '?a');
      var triple = RdfUtil.triple('a', 'b', 'c');
      it('should throw an error', function () {
        (function () { RdfUtil.findBindings(pattern, triple); })
        .should.throw('Cannot bind ?a to c because it was already bound to a.');
      });
    });
  });

  describe('extendBindings', function () {
    describe('with non-overlapping bindings', function () {
      var pattern = RdfUtil.triple('?a', 'b', 'c');
      var triple = RdfUtil.triple('a', 'b', 'c');
      var oldBindings = { '?x': 'x' };
      var bindings = RdfUtil.extendBindings(oldBindings, pattern, triple);
      it('should find the correct bindings', function () {
        expect(bindings).to.deep.equal({ '?x': 'x', '?a': 'a' });
      });
      it('should not modify existing bindings', function () {
        expect(oldBindings).to.deep.equal({ '?x': 'x' });
      });
    });

    describe('with overlapping, matching bindings', function () {
      var pattern = RdfUtil.triple('?a', 'b', 'c');
      var triple = RdfUtil.triple('a', 'b', 'c');
      var oldBindings = { '?x': 'x', '?a': 'a' };
      var bindings = RdfUtil.extendBindings(oldBindings, pattern, triple);
      it('should find the correct bindings', function () {
        expect(bindings).to.deep.equal({ '?x': 'x', '?a': 'a' });
      });
      it('should not modify existing bindings', function () {
        expect(oldBindings).to.deep.equal({ '?x': 'x', '?a': 'a' });
      });
    });

    describe('with overlapping, non-matching bindings', function () {
      var pattern = RdfUtil.triple('?a', '?b', '?c');
      var triple = RdfUtil.triple('a', 'b', 'c');
      var oldBindings = { '?x': 'x', '?c': 'y' };
      it('should throw an error', function () {
        (function () { RdfUtil.extendBindings(oldBindings, pattern, triple); })
        .should.throw('Cannot bind ?c to c because it was already bound to y.');
      });
      it('should not modify existing bindings', function () {
        expect(oldBindings).to.deep.equal({ '?x': 'x', '?c': 'y' });
      });
    });
  });

  describe('addBinding', function () {
    describe('binding a new variable to a URI', function () {
      var oldBindings = { '?x': 'x' };
      var bindings = RdfUtil.addBinding(oldBindings, '?a', 'a');
      it('should find the correct bindings', function () {
        expect(bindings).to.deep.equal({ '?x': 'x', '?a': 'a' });
      });
      it('should modify existing bindings', function () {
        expect(oldBindings).to.equal(bindings);
      });
    });

    describe('binding a new variable to a literal', function () {
      var oldBindings = { '?x': 'x' };
      var bindings = RdfUtil.addBinding(oldBindings, '?a', '"a"@en');
      it('should find the correct bindings', function () {
        expect(bindings).to.deep.equal({ '?x': 'x', '?a': '"a"@en' });
      });
      it('should modify existing bindings', function () {
        expect(oldBindings).to.equal(bindings);
      });
    });

    describe('binding a new variable to a blank node', function () {
      var oldBindings = { '?x': 'x' };
      it('should throw an error', function () {
        (function () { RdfUtil.addBinding(oldBindings, '?a', '_:b'); })
        .should.throw('Right-hand side may not be variable.');
      });
      it('should not modify existing bindings', function () {
        expect(oldBindings).to.deep.equal({ '?x': 'x' });
      });
    });

    describe('binding a new variable to a variable', function () {
      var oldBindings = { '?x': 'x' };
      it('should throw an error', function () {
        (function () { RdfUtil.addBinding(oldBindings, '?a', '_:b'); })
        .should.throw('Right-hand side may not be variable.');
      });
      it('should not modify existing bindings', function () {
        expect(oldBindings).to.deep.equal({ '?x': 'x' });
      });
    });

    describe('binding an existing non-conflicting variable to a URI', function () {
      var oldBindings = { '?x': 'x', '?a': 'a' };
      var bindings = RdfUtil.addBinding(oldBindings, '?a', 'a');
      it('should find the correct bindings', function () {
        expect(bindings).to.deep.equal({ '?x': 'x', '?a': 'a' });
      });
      it('should modify existing bindings', function () {
        expect(oldBindings).to.equal(bindings);
      });
    });

    describe('binding an existing non-conflicting variable to a literal', function () {
      var oldBindings = { '?x': 'x', '?a': '"a"@en' };
      var bindings = RdfUtil.addBinding(oldBindings, '?a', '"a"@en');
      it('should find the correct bindings', function () {
        expect(bindings).to.deep.equal({ '?x': 'x', '?a': '"a"@en' });
      });
      it('should modify existing bindings', function () {
        expect(oldBindings).to.equal(bindings);
      });
    });

    describe('binding an existing non-conflicting variable to a blank node', function () {
      var oldBindings = { '?x': 'x', '?a': 'a' };
      it('should throw an error', function () {
        (function () { RdfUtil.addBinding(oldBindings, '?a', '_:b'); })
        .should.throw('Right-hand side may not be variable.');
      });
      it('should not modify existing bindings', function () {
        expect(oldBindings).to.deep.equal({ '?x': 'x', '?a': 'a' });
      });
    });

    describe('binding an existing non-conflicting variable to a variable', function () {
      var oldBindings = { '?x': 'x', '?a': 'a' };
      it('should throw an error', function () {
        (function () { RdfUtil.addBinding(oldBindings, '?a', '_:b'); })
        .should.throw('Right-hand side may not be variable.');
      });
      it('should not modify existing bindings', function () {
        expect(oldBindings).to.deep.equal({ '?x': 'x', '?a': 'a' });
      });
    });

    describe('binding an existing conflicting variable to a URI', function () {
      var oldBindings = { '?x': 'x', '?a': 'b' };
      it('should throw an error', function () {
        (function () { RdfUtil.addBinding(oldBindings, '?a', 'a'); })
        .should.throw('Cannot bind ?a to a because it was already bound to b.');
      });
      it('should not modify existing bindings', function () {
        expect(oldBindings).to.deep.equal({ '?x': 'x', '?a': 'b' });
      });
    });

    describe('binding an existing conflicting variable to a literal', function () {
      var oldBindings = { '?x': 'x', '?a': '"b"@en' };
      it('should throw an error', function () {
        (function () { RdfUtil.addBinding(oldBindings, '?a', '"a"@en'); })
        .should.throw('Cannot bind ?a to "a"@en because it was already bound to "b"@en.');
      });
      it('should not modify existing bindings', function () {
        expect(oldBindings).to.deep.equal({ '?x': 'x', '?a': '"b"@en' });
      });
    });

    describe('binding an existing conflicting variable to a blank node', function () {
      var oldBindings = { '?x': 'x', '?a': 'a' };
      it('should throw an error', function () {
        (function () { RdfUtil.addBinding(oldBindings, '?a', '_:b'); })
        .should.throw('Right-hand side may not be variable.');
      });
      it('should not modify existing bindings', function () {
        expect(oldBindings).to.deep.equal({ '?x': 'x', '?a': 'a' });
      });
    });

    describe('binding an existing conflicting variable to a variable', function () {
      var oldBindings = { '?x': 'x', '?a': 'a' };
      it('should throw an error', function () {
        (function () { RdfUtil.addBinding(oldBindings, '?a', '_:b'); })
        .should.throw('Right-hand side may not be variable.');
      });
      it('should not modify existing bindings', function () {
        expect(oldBindings).to.deep.equal({ '?x': 'x', '?a': 'a' });
      });
    });
  });
});
