var config = require('../config');

/** 兼容 dd / my，以及 request / httpRequest */
function pickHTTPApi() {
  if (typeof my !== 'undefined' && typeof my.request === 'function') {
    return { kind: 'request', api: my };
  }
  if (typeof dd !== 'undefined' && typeof dd.request === 'function') {
    return { kind: 'request', api: dd };
  }
  if (typeof my !== 'undefined' && typeof my.httpRequest === 'function') {
    return { kind: 'httpRequest', api: my };
  }
  if (typeof dd !== 'undefined' && typeof dd.httpRequest === 'function') {
    return { kind: 'httpRequest', api: dd };
  }
  return null;
}

function parseBody(raw) {
  if (raw == null) return null;
  if (typeof raw === 'string') {
    try { return JSON.parse(raw); } catch (e) { return raw; }
  }
  return raw;
}

function request(path, method, data) {
  var impl = pickHTTPApi();
  if (!impl) {
    return Promise.reject(new Error('当前环境无网络 API，请在钉钉客户端或开发者工具中打开'));
  }

  var url = String(config.API_BASE_URL || '').replace(/\/+$/, '') + path;
  var upperMethod = (method || 'GET').toUpperCase();
  var bodyStr = data != null ? JSON.stringify(data) : '';

  return new Promise(function(resolve, reject) {
    if (impl.kind === 'request') {
      impl.api.request({
        url: url,
        method: upperMethod,
        data: data,
        headers: { 'Content-Type': 'application/json' },
        success: function(res) {
          var body = parseBody(res.data);
          if (body && body.success === false) {
            var err = new Error(body.message || '请求失败');
            err.response = body;
            reject(err);
            return;
          }
          resolve(body);
        },
        fail: function(err) { reject(err || new Error('网络请求失败')); },
      });
      return;
    }

    impl.api.httpRequest({
      url: url,
      method: upperMethod,
      headers: { 'Content-Type': 'application/json' },
      data: bodyStr,
      success: function(res) {
        var body = parseBody(res.data);
        if (body && body.success === false) {
          var err2 = new Error(body.message || '请求失败');
          err2.response = body;
          reject(err2);
          return;
        }
        resolve(body);
      },
      fail: function(err) { reject(err || new Error('网络请求失败')); },
    });
  });
}

module.exports = {
  post: function(path, data) { return request(path, 'POST', data); },
  get: function(path) { return request(path, 'GET'); },
};
