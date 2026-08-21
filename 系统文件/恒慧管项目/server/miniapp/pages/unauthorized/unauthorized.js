Page({
  data: { msg: '您的账号尚未开通恒慧管，请联系管理员登记钉钉 userid。' },
  onLoad(query) {
    if (query && query.msg) {
      this.setData({ msg: decodeURIComponent(query.msg) });
    }
  },
});
