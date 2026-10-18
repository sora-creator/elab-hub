(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ELABTeacherBootstrapScheduler = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  function create(options) {
    options = options || {};
    var expected = new Set(options.actions || []);
    var maxConcurrent = Math.max(1, Number(options.maxConcurrent) || 2);
    var claimed = new Set(), inflight = new Map(), queue = [], idleWaiters = [];
    var active = 0, peak = 0, stopped = false, terminalError = null;

    function rejectQueued(error) {
      while (queue.length) queue.shift().reject(error);
    }

    function notifyIdle() {
      if (active || queue.length) return;
      while (idleWaiters.length) idleWaiters.shift()();
    }

    function pump() {
      while (!stopped && active < maxConcurrent && queue.length) {
        (function (entry) {
          active += 1;
          peak = Math.max(peak, active);
          Promise.resolve().then(entry.task).then(function (value) {
            entry.resolve(value);
          }, function (error) {
            stopped = true;
            terminalError = error;
            entry.reject(error);
            rejectQueued(error);
          }).then(function () {
            active -= 1;
            notifyIdle();
            pump();
          });
        })(queue.shift());
      }
    }

    function schedule(action, key, task) {
      var logicalKey = String(key || action || '');
      if (!expected.has(action) || claimed.has(action)) {
        if (inflight.has(logicalKey)) return inflight.get(logicalKey);
        if (stopped) return Promise.reject(terminalError);
        return Promise.resolve().then(task);
      }
      claimed.add(action);
      if (stopped) return Promise.reject(terminalError);
      var promise = new Promise(function (resolve, reject) {
        queue.push({action: action, key: logicalKey, task: task, resolve: resolve, reject: reject});
        pump();
      });
      inflight.set(logicalKey, promise);
      promise.then(function () { if (inflight.get(logicalKey) === promise) inflight.delete(logicalKey); },
        function () { if (inflight.get(logicalKey) === promise) inflight.delete(logicalKey); });
      return promise;
    }

    function snapshot() {
      return {maxConcurrent: maxConcurrent, active: active, queued: queue.length, peak: peak,
        claimed: claimed.size, inflight: inflight.size, stopped: stopped};
    }

    function whenIdle() {
      if (!active && !queue.length) return Promise.resolve();
      return new Promise(function (resolve) { idleWaiters.push(resolve); });
    }

    return {schedule: schedule, snapshot: snapshot, whenIdle: whenIdle};
  }

  return {create: create};
});
