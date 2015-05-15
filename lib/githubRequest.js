module.exports = githubRequest;

var P = require("bluebird");
var request = require('request-promise');
var errors = require('request-promise/errors');

function githubRequest(options, followNext) {
  var allPages;

  if (followNext) allPages = [];

  return makeRequest(options);

  function makeRequest(options) {
    return request(options)
      .then(verifyRateLimits)
      .catch(errors.StatusCodeError, handle403);
  }

  function handle403(reason) {
    if (reason.statusCode === 403) {
      var headers = reason.response.headers;
      return getRateLimitPromiseFromHeaders(headers);
    }

    console.log('Could not handle answer from github', reason);
    throw new Error(reason);
  }

  function verifyRateLimits(response) {
    var rateLimitPromise = getRateLimitPromiseFromHeaders(response.headers);
    if (rateLimitPromise) return rateLimitPromise;
    var pageResults = JSON.parse(response.body);
    if (followNext) allPages.push(pageResults);

    var nextLink = followNext && getNextFormLink(response.headers.link);
    if (nextLink) {
      options.uri = nextLink;
      return makeRequest(options);
    }

    return followNext ? allPages : pageResults;
  }

  function getRateLimitPromiseFromHeaders(headers) {
    var rateLimit = parseRateLimit(headers);
    console.log('Rate limit: ' + rateLimit.limit + '/' + rateLimit.remaining);
    if (rateLimit.remaining === 0) {
      var waitTime = rateLimit.reset - new Date();
      console.log('Rate limit exceeded, waiting before retry: ' + waitTime + 'ms');
      console.log('Current time is ' + (new Date()) + '; Reset: ' + (new Date(rateLimit.reset)));
      return P.delay(waitTime).then(resume);
    }
  }

  function resume() {
    return makeRequest(options);
  }
}

function parseRateLimit(headers) {
  var resetUTC = parseInt(headers['x-ratelimit-reset'], 10) * 1000;

  return {
    limit: parseInt(headers['x-ratelimit-limit'], 10),
    remaining: parseInt(headers['x-ratelimit-remaining'], 10),
    reset: resetUTC
  };
}

function getNextFormLink(link) {
  if (typeof link !== 'string') return;
  var linkMatch = link.match(/<(.+)>; rel="next"/);

  return linkMatch && linkMatch[1];
}