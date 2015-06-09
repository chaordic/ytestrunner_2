/*
 Copyrights for code authored by Yahoo! Inc. is licensed under the following
 terms:

 MIT License

 Copyright (c) 2011 Yahoo! Inc. All Rights Reserved.

 Permission is hereby granted, free of charge, to any person obtaining a copy
 of this software and associated documentation files (the "Software"), to
 deal in the Software without restriction, including without limitation the
 rights to use, copy, modify, merge, publish, distribute, sublicense, and/or
 sell copies of the Software, and to permit persons to whom the Software is
 furnished to do so, subject to the following conditions:

 The above copyright notice and this permission notice shall be included in
 all copies or substantial portions of the Software.

 THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
 FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
 DEALINGS IN THE SOFTWARE.
 */
var util = require('util'),
    path = require('path'),
    fs = require('fs'),
    spawn = require('child_process').spawn;

/**
 * library that uses the yui coverage report tool for generating coverage reports
 * @class Reporter
 * @param opts {Object}
 * @constructor
 */
function Reporter(opts) {

    opts = opts || {};
    this.verbose = !!opts.verbose;
    this.java = opts.java || 'java';
    /*jslint nomen: true */
    this.jarFile = opts.jarFile || path.resolve(__dirname, '..', 'vendor', 'yuitest-coverage-report.jar');
}

Reporter.prototype = {
    writeReport: function (jsonFile, outputDir, format, callback) {

        if (typeof format === 'function') {
            callback = format;
            format = 'lcov';
        }

        var args = [ '-jar', this.jarFile, '--format', format, '-o', outputDir],
            that = this,
            handle;

        args.push(jsonFile);

        if (this.verbose) {
            console.log(this.java + ' ' + args.join(' '));
        }

        handle = spawn(this.java, args);
        handle.stdout.on('data', function (data) { if (that.verbose) { process.stdout.write(data); } });
        handle.stderr.on('data', function (data) { if (that.verbose) { process.stderr.write(data); } });
        handle.on('exit', function (code) {
            if (code === 0) {
                return callback(null);
            } else {
                return callback('Report generation failed for file[' + jsonFile + '], run wth verbose for details');
            }
        });
    }
};

module.exports = Reporter;