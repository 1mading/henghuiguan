var auth = require('../../services/auth');

Page({
  data: {
    loading: true,
    h5Url: '',
    error: '',
  },
  onLoad() {
    var self = this;
    auth.ensureLogin()
      .then(function(session) {
        var app = getApp();
        if (app) app.globalData.session = session;
        var url = auth.buildH5Url(session);
        self.setData({ h5Url: url, loading: false, error: '' });
      })
      .catch(function(err) {
        var msg = (err && err.message) ? err.message : '登录失败';
        if (/not authorized|未找到|403|forbidden/i.test(msg)) {
          var rt = typeof dd !== 'undefined' ? dd : (typeof my !== 'undefined' ? my : null);
          if (rt && rt.reLaunch) {
            rt.reLaunch({ url: '/pages/unauthorized/unauthorized?msg=' + encodeURIComponent(msg) });
          }
          return;
        }
        self.setData({ loading: false, error: msg });
      });
  },
  onRetry() {
    this.setData({ loading: true, error: '' });
    this.onLoad();
  },
});
