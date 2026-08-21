(function () {
  const EVENT_MAP = {
    task_assigned: { mood: 'surprise', text: '有新任务！', unreadDelta: 1 },
    project_assigned: { mood: 'surprise', text: '新项目来了', unreadDelta: 1 },
    task_transfer: { mood: 'surprise', text: '任务转给你了', unreadDelta: 1 },
    task_overdue: { mood: 'anxious', text: '有任务逾期了…', unreadDelta: 1 },
    task_due_soon: { mood: 'anxious', text: '快到期了！', unreadDelta: 1 },
    task_completed: { mood: 'celebrate', text: '又完成一件！', unreadDelta: 0 },
    task_paused: { mood: 'anxious', text: '任务被暂停', unreadDelta: 1 },
    task_rejected: { mood: 'anxious', text: '任务被驳回', unreadDelta: 1 },
    task_comment_mention: { mood: 'happy', text: '有人提到你', unreadDelta: 1 },
    idle: { mood: 'sleep', text: '先眯一会…', unreadDelta: 0 },
    poke: { mood: 'happy', text: '嘿！我在呢', unreadDelta: 0 },
  };

  const petWrap = document.getElementById('petWrap');
  const bubble = document.getElementById('bubble');
  const badge = document.getElementById('badge');
  const panel = document.getElementById('panel');
  const panelBody = document.getElementById('panelBody');
  const hint = document.getElementById('hint');

  let unread = 0;
  let moodTimer = null;
  let bubbleTimer = null;
  let config = null;
  let realtimeHandle = null;
  let pollTimer = null;
  let lastItems = [];
  let dragMoved = false;
  let dragging = false;
  let clickTimer = null;
  let mimicOn = true;
  let mode = 'idle'; // idle | typing | peek | event
  let typingStopTimer = null;
  let idleSleepTimer = null;
  let eventLockUntil = 0;
  let typingBubbleShown = false;
  let wanderOn = true;
  let wanderTimer = null;
  let blinkTimer = null;
  let isWandering = false;

  function setMood(mood) {
    petWrap.classList.remove(
      'mood-happy', 'mood-anxious', 'mood-sleep', 'mood-surprise',
      'mood-celebrate', 'mood-typing', 'mood-peek', 'mood-walk',
      'mood-love', 'mood-sparkle', 'mood-dizzy', 'mood-smug',
      'anxious', 'sleep'
    );
    petWrap.classList.add('mood-' + mood);
    if (mood === 'anxious') petWrap.classList.add('anxious');
    if (mood === 'sleep') petWrap.classList.add('sleep');
  }

  function scheduleBlink() {
    clearTimeout(blinkTimer);
    blinkTimer = setTimeout(() => {
      if (mode === 'typing' || mode === 'sleep') {
        scheduleBlink();
        return;
      }
      petWrap.classList.add('blink');
      setTimeout(() => petWrap.classList.remove('blink'), 120);
      scheduleBlink();
    }, 2200 + Math.random() * 3200);
  }

  function scheduleWander(delayMs) {
    // 主进程按「闲置分钟」决定何时溜达；渲染侧不再抢先开溜
    clearTimeout(wanderTimer);
  }

  function tryStartWander() {
    /* no-op: idle gate lives in main */
  }

  function notice() {
    if (window.petBridge && window.petBridge.noticeAttention) {
      window.petBridge.noticeAttention();
    }
  }

  function onWander(payload) {
    if (!payload) return;
    if (payload.active) {
      const justStarted = !isWandering;
      isWandering = true;
      clearTimeout(idleSleepTimer);
      if (payload.dir < 0) petWrap.classList.add('flip');
      else petWrap.classList.remove('flip');

      // 移动中只改朝向，避免每帧重置 CSS 动画导致“走不起来”
      if (payload.moving && !justStarted) return;

      clearTimeout(moodTimer);
      mode = 'wander';
      const expr = payload.expression || 'walk';
      const mood = (expr === 'happy' || !expr) ? 'walk' : expr;
      setMood(['walk', 'love', 'sparkle', 'dizzy', 'smug'].includes(mood) ? mood : 'walk');
      petWrap.classList.add('mood-walk');
      const lines = ['溜达去～', '四处看看', '活动活动！', '哼哼～'];
      showBubble(lines[Math.floor(Math.random() * lines.length)], 1600);
    } else {
      isWandering = false;
      petWrap.classList.remove('mood-walk');
      if (mode === 'wander') {
        mode = 'idle';
        setMood(unread >= 5 ? 'anxious' : 'happy');
        scheduleIdleSleep();
      }
    }
  }

  function scheduleIdleSleep() {
    clearTimeout(idleSleepTimer);
    idleSleepTimer = setTimeout(() => {
      if (Date.now() < eventLockUntil) return;
      if (mode === 'typing' || mode === 'wander' || isWandering || document.body.classList.contains('panel-open')) return;
      if (window.petBridge && window.petBridge.stopWander) window.petBridge.stopWander('sleep');
      mode = 'idle';
      setMood('sleep');
      showBubble('你不敲键盘，我也歇会儿…', 2200);
    }, 75000);
  }

  function enterTyping() {
    if (!mimicOn) return;
    if (Date.now() < eventLockUntil) return;
    if (document.body.classList.contains('panel-open')) return;
    // 打字打断溜达
    if (window.petBridge && window.petBridge.stopWander) {
      window.petBridge.stopWander('typing');
    }
    clearTimeout(typingStopTimer);
    clearTimeout(idleSleepTimer);
    clearTimeout(moodTimer);
    mode = 'typing';
    setMood('typing');
    if (!typingBubbleShown) {
      typingBubbleShown = true;
      showBubble('你打字，我也敲～', 1800);
    }
    typingStopTimer = setTimeout(() => {
      typingBubbleShown = false;
      if (mode === 'typing') {
        mode = 'idle';
        setMood(unread >= 5 ? 'anxious' : 'happy');
        scheduleIdleSleep();
        // 打字算搭理，计时由 main touchAttention 重置
      }
    }, 900);
  }

  function enterPeek() {
    if (!mimicOn) return;
    if (Date.now() < eventLockUntil) return;
    // 鼠标移动不打断溜达
    if (mode === 'typing' || mode === 'wander' || isWandering) return;
    if (document.body.classList.contains('panel-open')) return;
    clearTimeout(idleSleepTimer);
    if (mode === 'idle' || mode === 'peek') {
      mode = 'peek';
      setMood('peek');
      clearTimeout(moodTimer);
      moodTimer = setTimeout(() => {
        if (mode === 'peek') {
          mode = 'idle';
          setMood('happy');
          scheduleIdleSleep();
        }
      }, 1200);
    }
    scheduleIdleSleep();
  }

  function onActivity(kind) {
    if (kind === 'typing') enterTyping();
    else if (kind === 'mouse') enterPeek();
  }

  function setUnread(n) {
    unread = Math.max(0, n);
    if (unread > 0) {
      badge.textContent = unread > 99 ? '99+' : String(unread);
      badge.classList.add('show');
    } else {
      badge.classList.remove('show');
    }
  }

  function showBubble(text, ms) {
    bubble.textContent = text;
    bubble.classList.add('show');
    clearTimeout(bubbleTimer);
    bubbleTimer = setTimeout(() => bubble.classList.remove('show'), ms || 2600);
  }

  function react(eventType, extraText, opts) {
    const known = EVENT_MAP[eventType];
    const cfg = known || {
      mood: 'happy',
      text: extraText || '有新消息',
      unreadDelta: 0,
    };
    if (window.petBridge && window.petBridge.stopWander) window.petBridge.stopWander('event');
    clearTimeout(moodTimer);
    clearTimeout(typingStopTimer);
    mode = 'event';
    eventLockUntil = Date.now() + 3200;
    typingBubbleShown = false;
    setMood(cfg.mood);
    showBubble(extraText || cfg.text);
    petWrap.classList.remove('shake');
    void petWrap.offsetWidth;
    petWrap.classList.add('shake');
    if (cfg.unreadDelta && !(opts && opts.skipUnread)) {
      setUnread(unread + cfg.unreadDelta);
    }
    const hold = cfg.mood === 'celebrate' ? 2200 : cfg.mood === 'sleep' ? 5000 : 3000;
    moodTimer = setTimeout(() => {
      mode = 'idle';
      setMood(unread >= 5 ? 'anxious' : 'happy');
      scheduleIdleSleep();
    }, hold);
  }

  window.reactPet = react;

  function stopRealtime() {
    if (realtimeHandle) {
      try { realtimeHandle.close(); } catch (_) { /* ignore */ }
      realtimeHandle = null;
    }
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  function startPollFallback() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
    if (!config || !config.token) return;
    const secs = Number(config.realtime && config.realtime.pollSeconds);
    const interval = (Number.isFinite(secs) && secs > 0 ? secs : 60) * 1000;
    pollTimer = setInterval(() => {
      refreshNotifications(false);
    }, interval);
  }

  function connectRealtime() {
    stopRealtime();
    if (!config || !config.token || !window.PetDataSource) return;
    const rt = config.realtime || {};
    if (rt.enabled === false) {
      startPollFallback();
      return;
    }
    realtimeHandle = window.PetDataSource.connectRealtime(config, () => {
      refreshNotifications(true);
    });
    // SSE 未能建立时退回轮询
    if (!realtimeHandle || !realtimeHandle.active) {
      startPollFallback();
    }
  }

  async function refreshNotifications(fromPush) {
    if (!config || !config.token || !window.PetDataSource) return;
    try {
      const data = await window.PetDataSource.fetchNotifications(config);
      setUnread(Number(data.unreadCount) || 0);
      lastItems = data.items || [];
      renderPanel();
      if (fromPush && lastItems[0]) {
        react(lastItems[0].eventType || 'poke', lastItems[0].title || undefined, { skipUnread: true });
      }
    } catch (_) { /* ignore */ }
  }

  function openAppLabel() {
    const name = config && String(config.displayName || '').trim();
    return name ? ('打开' + name) : '打开主站';
  }

  function panelTitleEl() {
    return document.querySelector('.panel-head span');
  }

  function renderPanel() {
    const btnOpen = document.getElementById('btnOpenApp');
    if (btnOpen) btnOpen.textContent = openAppLabel();
    const titleEl = panelTitleEl();
    if (titleEl) titleEl.textContent = '最新消息';

    const btnRead = document.getElementById('btnMarkRead');
    if (btnRead) {
      btnRead.textContent = '全部已读';
      btnRead.disabled = !lastItems.length;
    }

    if (!lastItems.length) {
      panelBody.innerHTML = config && config.token
        ? '暂无未读消息'
        : '尚未登录，可在托盘菜单打开设置';
      return;
    }
    panelBody.innerHTML = lastItems.map((n) => {
      const t = n.title || n.eventType || '通知';
      const body = n.body || '';
      const id = n.id ? String(n.id) : '';
      return '<div class="item" data-id="' + escapeHtml(id) + '">'
        + '<div class="item-main"><strong>' + escapeHtml(t) + '</strong><br/>'
        + escapeHtml(String(body).slice(0, 80)) + '</div>'
        + (id
          ? '<button type="button" class="item-read" data-id="' + escapeHtml(id) + '">已读</button>'
          : '')
        + '</div>';
    }).join('');
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  const SKIN_HELLO = {
    amber: '琥珀猫报到～',
    ash: '灰猫隐身就绪',
    snow: '白猫软乎乎',
    fox: '小狐来啦～',
  };

  function applySkin(skinId) {
    const id = ['amber', 'ash', 'snow', 'fox'].includes(skinId) ? skinId : 'amber';
    petWrap.classList.remove('skin-amber', 'skin-ash', 'skin-snow', 'skin-fox');
    petWrap.classList.add('skin-' + id);
    return id;
  }

  async function applyConfig(cfg) {
    config = cfg || {};
    mimicOn = config.mimicActivity !== false;
    wanderOn = config.wanderEnabled !== false;
    const skin = applySkin(config.skinId);
    if (!wanderOn && window.petBridge && window.petBridge.stopWander) {
      window.petBridge.stopWander('disabled');
    }
    const btnOpen = document.getElementById('btnOpenApp');
    if (btnOpen) btnOpen.textContent = openAppLabel();
    if (config.token) {
      hint.textContent = (config.userName ? ('已登录 · ' + config.userName) : '已登录') + ' · 双击看消息';
      connectRealtime();
      await refreshNotifications(false);
    } else {
      hint.textContent = wanderOn
        ? ('不理它约 ' + (config.wanderIdleMinutes != null ? config.wanderIdleMinutes : 5) + ' 分钟才溜达')
        : (mimicOn ? '打字时我会跟着敲' : '右键托盘可模拟');
      stopRealtime();
      lastItems = [];
      renderPanel();
    }
    return skin;
  }

  // drag window（绝对屏幕坐标，拖拽中关闭点击穿透）
  let dragOriginX = 0;
  let dragOriginY = 0;
  petWrap.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    dragging = true;
    dragMoved = false;
    dragOriginX = e.screenX;
    dragOriginY = e.screenY;
    notice();
    setClickThrough(false);
    if (window.petBridge && window.petBridge.dragStart) {
      window.petBridge.dragStart(e.screenX, e.screenY);
    }
    try { petWrap.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
  });
  petWrap.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    if (Math.abs(e.screenX - dragOriginX) + Math.abs(e.screenY - dragOriginY) > 4) {
      dragMoved = true;
    }
    if (window.petBridge && window.petBridge.dragMove) {
      window.petBridge.dragMove(e.screenX, e.screenY);
    }
  });
  function endDrag(e) {
    if (!dragging) return;
    dragging = false;
    if (e && typeof e.screenX === 'number' && window.petBridge && window.petBridge.dragMove) {
      window.petBridge.dragMove(e.screenX, e.screenY);
    }
    if (window.petBridge && window.petBridge.dragEnd) window.petBridge.dragEnd();
    if (!document.body.classList.contains('panel-open')) {
      const el = document.elementFromPoint(
        (e && e.clientX != null) ? e.clientX : 0,
        (e && e.clientY != null) ? e.clientY : 0
      );
      setClickThrough(!hitInteractive(el));
    }
  }
  petWrap.addEventListener('pointerup', endDrag);
  petWrap.addEventListener('pointercancel', endDrag);
  petWrap.addEventListener('lostpointercapture', () => {
    if (dragging) endDrag();
  });

  // 单击点头；双击有未读则列表，无消息则打开恒慧管
  petWrap.addEventListener('click', (e) => {
    if (dragMoved) return;
    if (e.detail > 1) return;
    clearTimeout(clickTimer);
    clickTimer = setTimeout(() => {
      notice();
      react('poke');
    }, 280);
  });

  petWrap.addEventListener('dblclick', (e) => {
    e.preventDefault();
    clearTimeout(clickTimer);
    if (dragMoved) return;
    onPetDblClick();
  });

  async function onPetDblClick() {
    notice();
    if (!config || !config.token) {
      showBubble('先去托盘打开设置登录～', 2200);
      if (window.petBridge) window.petBridge.openSettings();
      return;
    }
    try {
      await refreshNotifications(false);
    } catch (_) { /* ignore */ }
    if (!lastItems.length) {
      showBubble('暂无新消息，打开主站', 1800);
      if (window.petBridge) window.petBridge.openApp();
      return;
    }
    openPanel();
    const first = lastItems[0];
    if (first) showBubble(first.title || '新消息', 1800);
  }

  function openPanel() {
    notice();
    if (window.petBridge && window.petBridge.setWanderPaused) window.petBridge.setWanderPaused(true);
    if (window.petBridge && window.petBridge.setClickThrough) window.petBridge.setClickThrough(false);
    panel.hidden = false;
    document.body.classList.add('panel-open');
    renderPanel();
    if (window.petBridge && window.petBridge.getBounds) {
      window.petBridge.getBounds().then((b) => {
        if (!b) return;
        if (b.width < 260 || b.height < 300) {
          window.petBridge.setBounds({
            x: b.x,
            y: Math.max(0, b.y - (320 - b.height)),
            width: Math.max(b.width, 280),
            height: Math.max(b.height, 320),
          });
        }
      });
    }
  }

  function closePanel() {
    notice();
    panel.hidden = true;
    document.body.classList.remove('panel-open');
    if (window.petBridge && window.petBridge.setWanderPaused) window.petBridge.setWanderPaused(false);
    if (window.petBridge && window.petBridge.setClickThrough) window.petBridge.setClickThrough(true);
    renderPanel();
  }

  async function markAllRead() {
    notice();
    if (!config || !config.token || !window.PetDataSource || !window.PetDataSource.markNotificationsRead) {
      return;
    }
    try {
      const result = await window.PetDataSource.markNotificationsRead(config, { all: true });
      if (result && result.unreadCount != null) {
        setUnread(Number(result.unreadCount) || 0);
      } else {
        setUnread(0);
      }
      lastItems = [];
      renderPanel();
      showBubble('已全部标为已读', 1600);
      closePanel();
    } catch (_) {
      showBubble('标记已读失败', 1800);
    }
  }

  async function markOneRead(id) {
    notice();
    const nid = String(id || '').trim();
    if (!nid || !config || !config.token || !window.PetDataSource || !window.PetDataSource.markNotificationsRead) {
      return;
    }
    try {
      const result = await window.PetDataSource.markNotificationsRead(config, { ids: [nid] });
      lastItems = lastItems.filter((n) => String(n.id) !== nid);
      if (result && result.unreadCount != null) {
        setUnread(Number(result.unreadCount) || 0);
      } else {
        setUnread(Math.max(0, unread - 1));
      }
      renderPanel();
      if (!lastItems.length) {
        showBubble('已读完啦', 1400);
        closePanel();
      }
    } catch (_) {
      showBubble('标记已读失败', 1800);
    }
  }

  document.getElementById('btnClosePanel').addEventListener('click', (e) => {
    e.stopPropagation();
    closePanel();
  });
  document.getElementById('btnOpenApp').addEventListener('click', (e) => {
    e.stopPropagation();
    window.petBridge && window.petBridge.openApp();
  });
  document.getElementById('btnMarkRead').addEventListener('click', (e) => {
    e.stopPropagation();
    markAllRead();
  });
  panelBody.addEventListener('click', (e) => {
    const btn = e.target && e.target.closest && e.target.closest('.item-read');
    if (btn) {
      e.preventDefault();
      e.stopPropagation();
      markOneRead(btn.getAttribute('data-id'));
      return;
    }
    if (e.target === panelBody) closePanel();
  });

  // 点击面板外空白处收起
  document.addEventListener('pointerdown', (e) => {
    if (!document.body.classList.contains('panel-open')) return;
    if (panel.contains(e.target)) return;
    closePanel();
  }, true);

  // corner resize grip (frameless transparent window)
  const resizeHandle = document.getElementById('resizeHandle');
  let resizing = false;
  let resizeLastX = 0;
  let resizeLastY = 0;
  if (resizeHandle) {
    resizeHandle.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      resizing = true;
      resizeLastX = e.screenX;
      resizeLastY = e.screenY;
      resizeHandle.setPointerCapture(e.pointerId);
    });
    resizeHandle.addEventListener('pointermove', (e) => {
      if (!resizing || !window.petBridge) return;
      const dw = e.screenX - resizeLastX;
      const dh = e.screenY - resizeLastY;
      resizeLastX = e.screenX;
      resizeLastY = e.screenY;
      window.petBridge.resizeBy(dw, dh);
    });
    resizeHandle.addEventListener('pointerup', () => {
      resizing = false;
    });
  }

  if (window.petBridge) {
    window.petBridge.onSimulate((type) => react(type));
    window.petBridge.onConfigUpdated((cfg) => applyConfig(cfg));
    if (window.petBridge.onActivity) {
      window.petBridge.onActivity((kind) => onActivity(kind));
    }
    if (window.petBridge.onWander) {
      window.petBridge.onWander((payload) => onWander(payload));
    }
    window.petBridge.getConfig().then(applyConfig);
  }

  // 透明区域点击穿透：只有鼠标在宠物/面板上才接收点击
  let clickThrough = true;
  function setClickThrough(enabled) {
    if (!window.petBridge || !window.petBridge.setClickThrough) return;
    if (clickThrough === enabled) return;
    clickThrough = enabled;
    window.petBridge.setClickThrough(enabled);
  }
  function hitInteractive(el) {
    if (!el || !el.closest) return false;
    return !!(el.closest('#petWrap') || el.closest('#panel') || el.closest('#resizeHandle'));
  }
  window.addEventListener('mousemove', (e) => {
    if (dragging || resizing) {
      setClickThrough(false);
      return;
    }
    if (document.body.classList.contains('panel-open')) {
      setClickThrough(false);
      return;
    }
    const el = document.elementFromPoint(e.clientX, e.clientY);
    setClickThrough(!hitInteractive(el));
  });
  // 初始穿透
  setClickThrough(true);

  // intro
  setTimeout(() => {
    const skin = applySkin((config && config.skinId) || 'amber');
    const mins = (config && config.wanderIdleMinutes != null) ? config.wanderIdleMinutes : 5;
    showBubble((SKIN_HELLO[skin] || '你好～') + ' · ' + mins + '分钟后溜达');
    setMood('happy');
    scheduleIdleSleep();
    scheduleBlink();
    notice();
  }, 500);
})();
