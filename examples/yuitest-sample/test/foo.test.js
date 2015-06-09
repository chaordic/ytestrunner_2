var Y = require('yuitest'),
    Assert = Y.Assert;

Y.TestRunner.add(new Y.TestCase({

    name : 'Foo Test Case',

    "should get correct value for foo": function () {
        Assert.areSame('wrong foo', require('../lib/foo').getFoo(), 'Something is wrong here and I will be omitted in you stdout!');
    }
}));
