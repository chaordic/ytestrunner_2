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
var path = require('path'),
    mkdirp = require('mkdirp'),
    log = require('./util/log'),
    fs = require('fs'),
    CoverageReporter = require('./coverage').Reporter,
    colors = require('colors');

/*
 * calculates the line and function coverage given coverage info
 */
function calculateCoveragePercent(coverage) {
    if (!(coverage && typeof coverage === 'object')) {
        return null;
    }

    var ret = { calledLines: 0, coveredLines: 0, calledFunctions: 0, coveredFunctions: 0 };
    Object.keys(coverage).forEach(function (key) {
        var data = coverage[key];
        ret.calledLines += data.calledLines || 0;
        ret.calledFunctions += data.calledFunctions || 0;
        ret.coveredLines += data.coveredLines || 0;
        ret.coveredFunctions += data.coveredFunctions || 0;
    });

    ret.lineCoverage = ret.coveredLines ? Math.round(ret.calledLines * 100 * 100 / ret.coveredLines) / 100 : 0;
    ret.functionCoverage = ret.coveredFunctions ? Math.round(ret.calledFunctions * 100 * 100 / ret.coveredFunctions) / 100 : 0;
    return ret;
}
/*
 * given an object, return a shallow copy with lowercase keys
 */
function lcKeys(obj) {
    var ret = {};
    Object.keys(obj).forEach(function (k) {
        ret[k.toLowerCase()] = obj[k];
    });
    return ret;
}
/**
 * an abstract test runner that provides a common processing mechanism that subclasses can hook into. For our purposes,
 * the only difference between the subclasses we wish to support have to do with how test files are loaded and run and
 * what the main objects are called.
 *
 * @class BaseTestRunner
 * @param options
 * @constructor
 */
function BaseTestRunner(options) {

    options = options || {};
    this.verbose = !!options.verbose;
    this.coverage = options.coverage;
    this.saveResults = !!options.saveResults;
    this.resultsFile = options.resultsFile || path.resolve(process.cwd, 'results');
    this.resultsFormat = (options.resultsFormat || 'junitxml').toLowerCase();
    this.saveCoverage = !!options.saveCoverage;
    this.coverageFile = options.coverageFile || path.resolve(process.cwd, 'coverage', 'test-coverage');
    this.coverageReportFormat = (options.coverageReportFormat || 'lcov');
    this.testLibPath = options.testLibPath || ''; //for unit tests only
    this.colors = options.colors;
    this.badFiles = [];
}

BaseTestRunner.prototype = {
    /**
     * hook for subclasses to initialize themselves, typically by loading the test library they support. Called once
     * at the beginning of running tests.
     * @method init
     * @protected
     */
    init: function () {
    },
    /**
     * interface method that subclasses must implement to load a test file. Throwing in this method when things go
     * wrong is absolutely ok.
     * @method loadFile
     * @param file the absolute path of the test file to be loaded
     * @protected
     */
    loadFile: function (file) {
        throw new Error('loadFile: must override');
    },
    /**
     * interface method that subclasses must implement to start tests having
     * loaded all files.
     * @method startTests
     * @param callback the callback to be called after all tests are run.
     * @protected
     */
    startTests: function (callback) {
        throw new Error('startTests must be overridden');
    },
    /**
     * loads and runs all the test files supplied, calling back with a status at the end. The mechanics
     * of how test files are loaded and how tests are started are delegated to subclasses.
     * @method runTests
     * @param files an array of test file names that need to be loaded and run. Relative paths are resolved against `cwd`
     * @param callback the callback that is called with an error or data when tests complete. ////TODO: document data object
     */
    runTests: function (files, callback) {

        var that = this;
        if (!Array.isArray(files)) {
            throw new Error("[files] argument was not an array");
        }

        this.init();

        log.shout('load tests');
        files.forEach(function (file) {
            try {
                file = path.resolve(process.cwd(), file);
                if (that.verbose) { console.warn('Loading file [' + file + ']'); }
                that.loadFile(file);
            } catch (ex) {
                that.badFiles.push(file);
                console.error('Error loading file [' + file + ']');
                log.logError(ex);
            }
        });

        log.shout('run tests');
        try {
            this.startTests(function (err, data) {
                return callback(err, data);
            });
        } catch (ex) {
            log.logError(ex);
            return callback(new Error('Error starting tests:' + ex));
        }
    },
    /**
     * attaches test event handlers to the supplied test runner. These are used to keep track of test
     * success and failures. On completion of tests, the handler will also write test results and coverage
     * if requested and call the callback function with information about the test run.
     *
     * @method attachTestEventHandlers
     * @param runner the test runner object on which to attach events
     * @param testFormat the testformat object containing all known test formatter functions
     * @param callback the main callback to call with an interpreted version of test results
     * @protected
     */
    attachTestEventHandlers: function (runner, testFormat, callback) {

        var that = this,
            stats = { passed: 0, failed: 0, skipped: 0, failedTests: [] },
            testHandler = function (event) {
                switch (event.type) {
                case runner.TEST_PASS_EVENT:
                    stats.passed += 1;
                    break;
                case runner.TEST_FAIL_EVENT:
                    stats.failedTests.push({ test: event.testCase.name + '::' + event.testName, cause: event.error });
                    stats.failed += 1;
                    break;
                case runner.TEST_IGNORE_EVENT:
                    stats.skipped += 1;
                    break;
                }
            };

        runner.subscribe(runner.TEST_CASE_BEGIN_EVENT, testHandler);
        runner.subscribe(runner.TEST_CASE_COMPLETE_EVENT, testHandler);
        runner.subscribe(runner.TEST_PASS_EVENT, testHandler);
        runner.subscribe(runner.TEST_FAIL_EVENT, testHandler);
        runner.subscribe(runner.TEST_IGNORE_EVENT, testHandler);

        runner.subscribe(runner.COMPLETE_EVENT, function onComplete(event) {

            var data = stats,
                results = event.results,
                format = that.resultsFormat, //already lowercase
                lcFormat = lcKeys(testFormat),
                coverage = runner.getCoverage ? runner.getCoverage() : null,
                xtn = format === 'json' ? '.json' : format === 'tap' ? '.tap' : '.xml',
                formatter = lcFormat[format],
                resultsFile = that.resultsFile + xtn,
                coverageFile = that.coverageFile + '.json',
                reporter,
                skipCallback,
                covStats,
                realCallback,
                summary,
                counter = 0,
                err2failure;

            err2failure = function (obj) {
                counter += 1;
                var str = String(counter) + '. ' + obj.test + "\n",
                    cause = obj.cause;
                if (cause) {
                    if (cause.name) {
                        str += '\tCause: ' + cause.name + (cause.hasOwnProperty('unexpected') ? ' [ was: ' + cause.unexpected + ' ]\n' : '\n');
                    }
                    if (cause.message) {
                        str += '\t' + cause.message + '\n';
                    }
                    if (cause.hasOwnProperty('expected') && cause.hasOwnProperty('actual')) {
                        str += '\t\texpected: ' + cause.expected + ', actual: ' + cause.actual + '\n';
                    }
                    if (cause.stack && cause.stack.toString) {
                        str += '\t\t' + cause.stack.toString().replace(/\n/g, '\n\t\t') + '\n';
                    }
                }
                return str;
            };

            covStats = calculateCoveragePercent(coverage);
            data.total = data.passed + data.failed + data.skipped;
            data.badFiles = that.badFiles;

            summary = 'Final summary: Passed: ' + data.passed + ', Failed: ' + data.failed + ', Skipped: ' + data.skipped +
                ', Total: ' + data.total + ', Load errors: ' + data.badFiles.length +
                ', Line coverage: ' + (covStats ? covStats.lineCoverage + '%' : 'Unknown') +
                ', Function coverage: ' + (covStats ? covStats.functionCoverage + '%' : 'Unknown');

            realCallback = function (err, data) {
                log.shout(summary, true);
                callback(err, data);
            };

            if (data.passed + data.failed === 0 || data.failed > 0 || data.badFiles.length > 0) {
                data.error = '';
                if (data.passed + data.failed === 0) {
                    data.error += 'No tests actually executed\n';
                }
                if (data.failed > 0) {
                    data.error += String(data.failed) + ' test(s) failed. Details:\n\n' + stats.failedTests.map(err2failure).join('\n') + '\n';
                }
                if (data.badFiles.length > 0) {
                    data.error += String(data.badFiles.length) + ' test(s) could not be loaded. Details:\n\t' + data.badFiles.join('\t\n')
                        + '\n' + 'If the files loaded were not supposed to be, exclude them using the --exclude option';
                }
                if (that.colors) { summary = summary.red; }
            } else {
                data.ok = true;
                data.info = String(data.passed) + ' tests passed';
                if (data.skipped > 0) {
                    data.info += ', ' + String(data.skipped) + ' test(s) skipped';
                }
                if (that.colors) { summary = summary.green; }
            }

            if (results) {
                if (that.saveResults) {
                    that.writeFile('test results', resultsFile, formatter(results));
                }

                if (data.error) {
                    log.logError(data.error);
                }
            } else {
                console.log('Empty test results');
            }

            if (coverage) {
                if (that.saveCoverage) {
                    that.writeFile('coverage data', coverageFile, JSON.stringify(coverage));
                    if (that.covFormat !== 'json') {
                        skipCallback = true;
                        reporter = new CoverageReporter({ verbose: that.verbose });
                        reporter.writeReport(coverageFile, path.dirname(coverageFile), that.coverageReportFormat, function (err) {
                            if (err) {
                                log.logError(err);
                            }
                            realCallback(null, data);
                        });
                    }
                }
            } else {
                console.log('Empty coverage results');
            }

            if (!skipCallback) {
                realCallback(null, data);
            }
        });
    },
    /**
     * synchronously writes a file with some content, creating intermediate directories as necessary. Errors are logged
     * to stderr in the event of failures but are swallowed and not propagated back to the caller.
     * @method writeFile
     * @param what the kind of content that is being written. Used in error messages.
     * @param file the filename to write
     * @param contents the contents to write as a string
     * @private
     */
    writeFile: function (what, file, contents) {
        var dir = path.dirname(file);

        try {
            mkdirp.sync(dir);
            try {
                fs.writeFileSync(file, contents, 'utf8');
            } catch (writeError) {
                console.error('Could not write ' + what + ' to ' + file);
                log.logError(writeError);
            }
        } catch (mkdirError) {
            console.error('Could not create directory [' + dir + ']');
            console.error(what + 'will not be written');
            log.logError(mkdirError);
        }
    }
};

module.exports = BaseTestRunner;

