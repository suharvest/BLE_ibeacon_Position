const app = getApp();
const appManager = require('../../utils/appManager');
const jsonMapRenderer = require('../../utils/jsonMapRenderer');

Page({
  data: {
    hasMap: false, // 是否已配置地图
    hasBeacons: false, // 是否已配置Beacon
    isLocating: false, // 是否正在进行定位
    detectedBeaconCount: 0, // 检测到的beacon数量
    currentPosition: null, // 当前位置坐标 {x, y}
    beaconsWithDistance: [], // 带距离信息的beacon列表
    showDebugInfo: true, // 是否显示调试信息
    debugPanelExpanded: false, // 调试面板是否展开
    positionHistory: [], // 保存最近几个位置，用于平滑显示
    mapLoaded: false, // 地图是否已加载
    bluetoothState: 'closed', // 蓝牙状态
    errorMessage: '' // 错误信息
  },
  
  // Canvas实例和渲染上下文
  canvas: null,
  canvasContext: null,
  renderTimer: null,
  setupCanvasInProgress: false, // 防止重复初始化
  
  // 页面加载
  onLoad() {
    console.log('首页加载');
    this.setData({
      errorMessage: '',
      hasMap: false,
      hasBeacons: false,
      mapLoaded: false,
      isLocating: false,
      detectedBeaconCount: 0,
      beaconsWithDistance: [],
      currentPosition: null,
      positionHistory: []
    });
    this.canvas = null;
    this.canvasContext = null;
    this.renderTimer = null;
    this.setupCanvasInProgress = false;
    this.initAppManager();
  },
  
  // 页面显示
  onShow() {
    console.log('首页显示');
    if (appManager.getState().initialized) {
      this.updateStateFromManager();
      if (this.data.hasMap) {
        if (!this.data.mapLoaded || !this.canvas) {
          setTimeout(() => { this.setupCanvas(); }, 300);
        } else {
          this.renderMap();
        }
      }
    }
  },
  
  // 页面隐藏
  onHide() {
    console.log('首页隐藏');
  },
  
  // 页面卸载
  onUnload() {
    console.log('首页卸载');
    if (this.data.isLocating) {
      this.stopLocating();
    }
  },
  
  // 初始化应用管理器
  initAppManager() {
    appManager.init({
      callbacks: {
        onPositionUpdate: this.handlePositionUpdate.bind(this),
        onStateChange: this.handleStateChange.bind(this),
        onBluetoothStateChange: this.handleBluetoothStateChange.bind(this),
        onError: this.handleError.bind(this),
        onMapLoaded: this.handleMapLoaded.bind(this),
        onBeaconsConfigured: this.handleBeaconsConfigured.bind(this)
      }
    })
    .then(() => {
      this.updateStateFromManager();
      if (this.data.hasMap) {
        setTimeout(() => {
          this.setupCanvas();
        }, 300);
      }
    })
    .catch(err => {
      console.error('应用管理器初始化失败:', err);
      wx.showModal({
        title: '初始化失败',
        content: '应用初始化失败: ' + (err.message || String(err)),
        showCancel: false
      });
    });
  },
  
  // 从应用管理器更新状态
  updateStateFromManager() {
    const state = appManager.getState();
    const settings = appManager.getSettings();
    
    this.setData({
      hasMap: state.hasMap,
      hasBeacons: state.configuredBeaconCount > 0,
      isLocating: state.locating,
      detectedBeaconCount: state.detectedBeacons.length,
      beaconsWithDistance: state.detectedBeacons,
      currentPosition: state.lastPosition,
      showDebugInfo: settings.debugMode,
      bluetoothState: state.bluetoothState,
      errorMessage: state.errorMessage || ''
    });
  },
  
  // 设置Canvas并初始化渲染器
  setupCanvas() {
    const that = this;
    if (this.setupCanvasInProgress) { return; }
    this.setupCanvasInProgress = true;
    const initCanvas = (attempts = 0) => {
      if (attempts >= 3) {
        console.error('Canvas初始化失败，超过最大尝试次数');
        that.setupCanvasInProgress = false;
        that.setData({
          errorMessage: 'Canvas初始化失败，请重新启动小程序'
        });
        return;
      }
      const query = wx.createSelectorQuery();
      query.select('#mapCanvas')
        .fields({ node: true, size: true })
        .exec((res) => {
          if (!res || !res[0] || !res[0].node) {
            console.error('获取Canvas节点失败');
            setTimeout(() => { initCanvas(attempts + 1); }, 300);
            return;
          }
          try {
            const canvas = res[0].node;
            that.canvas = canvas;
            if (!canvas || typeof canvas.getContext !== 'function') {
              console.error('Canvas节点无效');
              setTimeout(() => { initCanvas(attempts + 1); }, 300);
              return;
            }
            const ctx = canvas.getContext('2d');
            if (!ctx) {
              console.error('获取2d上下文失败');
              setTimeout(() => { initCanvas(attempts + 1); }, 300);
              return;
            }
            that.canvasContext = ctx;
            const width = res[0].width || 300;
            const height = res[0].height || 280;
            canvas.width = width;
            canvas.height = height;
            if (jsonMapRenderer && typeof jsonMapRenderer.setCanvasSize === 'function') {
              const setSizeSuccess = jsonMapRenderer.setCanvasSize(canvas.width, canvas.height);
            } else { console.warn('jsonMapRenderer 或 setCanvasSize 不可用'); }
            const initRenderer = (rendererAttempts = 0) => {
              if (rendererAttempts >= 3) {
                console.error('渲染器初始化失败，超过最大尝试次数');
                that.setupCanvasInProgress = false;
                that.setData({
                  errorMessage: '渲染器初始化失败，请确保地图数据有效'
                });
                return;
              }
              try {
                const success = appManager.initRenderer(ctx, canvas.width, canvas.height);
                if (success) {
                  if (jsonMapRenderer && typeof jsonMapRenderer.setCanvasSize === 'function') {
                     jsonMapRenderer.setCanvasSize(canvas.width, canvas.height);
                  }
                   that.setupCanvasInProgress = false;
                  that.setData({
                    mapLoaded: true,
                    errorMessage: ''
                  });
                  that.renderMap();
                  if (that.data.isLocating) { that.startRenderLoop(); }
                } else {
                  console.error('地图渲染器初始化失败，第', rendererAttempts + 1, '次尝试');
                  if (rendererAttempts < 2) {
                    setTimeout(() => {
                      initRenderer(rendererAttempts + 1);
                    }, 500);
                  } else {
                    that.setupCanvasInProgress = false;
                    that.setData({
                      errorMessage: '地图渲染器初始化失败，请检查地图数据是否有效'
                    });
                    wx.showToast({
                      title: '地图渲染器初始化失败',
                      icon: 'none',
                      duration: 2000
                    });
                  }
                }
              } catch (renderErr) {
                console.error('初始化渲染器时发生异常:', renderErr);
                if (rendererAttempts < 2) {
                  setTimeout(() => {
                    initRenderer(rendererAttempts + 1);
                  }, 500);
                } else {
                  that.setupCanvasInProgress = false;
                  that.setData({
                    errorMessage: '初始化渲染器异常: ' + (renderErr.message || String(renderErr))
                  });
                }
              }
            };
            try {
              ctx.clearRect(0, 0, width, height);
              ctx.fillStyle = '#f0f0f0';
              ctx.fillRect(0, 0, width, height);
              initRenderer(0);
            } catch (canvasErr) {
              console.error('初始Canvas绘制失败:', canvasErr);
              initRenderer(0);
            }
          } catch (err) {
            console.error('设置Canvas异常:', err);
            that.setupCanvasInProgress = false;
            that.setData({
              errorMessage: '设置画布失败: ' + (err.message || String(err))
            });
          }
        });
    };
    initCanvas(0);
  },
  
  // 渲染地图和所有元素
  renderMap() {
    if (!this.data.mapLoaded || !this.canvas) {
      return;
    }
    try {
      const success = appManager.render({
        showGrid: true,
        showAxes: true,
        showMap: true,
        showBeacons: true,
        showPosition: true,
        showTrajectory: true
      });
      if (!success) {
        console.warn('地图渲染失败');
      }
    } catch (err) {
      console.error('渲染地图出错:', err);
    }
  },
  
  // 开始渲染循环
  startRenderLoop() {
    if (!this.data.mapLoaded || !this.data.isLocating) {
      return;
    }
    this.renderMap();
    this.renderTimer = setTimeout(() => {
      this.startRenderLoop();
    }, 1000);
  },
  
  // 停止渲染循环
  stopRenderLoop() {
    if (this.renderTimer) {
      clearTimeout(this.renderTimer);
      this.renderTimer = null;
    }
  },
  
  // 处理位置更新
  handlePositionUpdate(position, beacons) {
    let positionHistory = [...this.data.positionHistory];
    if (positionHistory.length >= 5) {
      positionHistory = positionHistory.slice(-4);
    }
    positionHistory.push({
      x: position.x,
      y: position.y,
      timestamp: Date.now()
    });
    this.setData({
      currentPosition: position,
      beaconsWithDistance: beacons,
      detectedBeaconCount: beacons.length,
      positionHistory: positionHistory
    });
    this.updatePositionDisplay(position);
  },
  
  // 处理状态变更
  handleStateChange(state) {
    this.updateStateFromManager();
  },
  
  // 处理蓝牙状态变更
  handleBluetoothStateChange(state) {
    this.setData({
      bluetoothState: state
    });
    if (state !== appManager.BLUETOOTH_STATE.AVAILABLE && this.data.isLocating) {
      wx.showToast({
        title: '蓝牙不可用，定位已停止',
        icon: 'none',
        duration: 2000
      });
    }
  },
  
  // 处理错误
  handleError(error) {
    console.error('应用错误:', error);
    this.setData({
      errorMessage: error.message || String(error)
    });
    wx.showToast({
      title: '出错了: ' + (error.message || String(error)),
      icon: 'none',
      duration: 3000
    });
  },
  
  // 处理地图加载
  handleMapLoaded(mapInfo) {
    this.setData({
      hasMap: true
    });
    if (this.data.mapLoaded) {
      this.renderMap();
    } else {
      this.setupCanvas();
    }
  },
  
  // 处理信标配置
  handleBeaconsConfigured(beacons) {
    this.setData({
      hasBeacons: beacons.length > 0
    });
  },
  
  // 平滑更新位置显示
  updatePositionDisplay(position) {
    if (this.data.positionHistory.length < 2) {
      return;
    }
    const recentPositions = this.data.positionHistory.slice(-3);
    let sumX = 0;
    let sumY = 0;
    let sumWeight = 0;
    for (let i = 0; i < recentPositions.length; i++) {
      const weight = i + 1;
      sumX += recentPositions[i].x * weight;
      sumY += recentPositions[i].y * weight;
      sumWeight += weight;
    }
    const smoothX = sumX / sumWeight;
    const smoothY = sumY / sumWeight;
    return {
      x: smoothX,
      y: smoothY
    };
  },
  
  // 定位开关
  toggleLocating() {
    if (this.data.isLocating) {
      this.stopLocating();
    } else {
      this.startLocating();
    }
  },
  
  // 开始定位
  startLocating() {
    if (this.data.isLocating) {
      return;
    }
    if (!this.data.hasMap) {
      wx.showModal({
        title: '提示',
        content: '请先配置地图',
        showCancel: false
      });
      return;
    }
    if (!this.data.hasBeacons) {
      wx.showModal({
        title: '提示',
        content: '请先配置信标',
        showCancel: false
      });
      return;
    }
    wx.showLoading({
      title: '启动定位中...',
    });
    this.setData({
      positionHistory: [],
      errorMessage: ''
    });
    appManager.startLocating()
      .then(() => {
        this.setData({
          isLocating: true
        });
        this.startRenderLoop();
        wx.hideLoading();
      })
      .catch(err => {
        console.error('启动定位失败:', err);
        wx.hideLoading();
        wx.showModal({
          title: '启动失败',
          content: '启动定位失败: ' + (err.message || String(err)),
          showCancel: false
        });
      });
  },
  
  // 停止定位
  stopLocating() {
    if (!this.data.isLocating) {
      return;
    }
    this.stopRenderLoop();
    appManager.stopLocating()
      .then(() => {
        this.setData({
          isLocating: false
        });
      })
      .catch(err => {
        console.error('停止定位失败:', err);
        this.setData({
          isLocating: false
        });
      });
  },
  
  // 切换调试面板显示
  toggleDebugPanel() {
    this.setData({
      debugPanelExpanded: !this.data.debugPanelExpanded
    });
  },
  
  // 前往配置页面
  goToConfig() {
    wx.switchTab({
      url: '../config/config'
    });
  },

  // **** NEW: Clear Trajectory History ****
  clearTrajectoryHistory() {
    try {
        if (appManager && typeof appManager.clearTrajectoryData === 'function') {
            appManager.clearTrajectoryData();
            // Force immediate re-render after clearing
            if (this.data.mapLoaded && this.canvasContext) {
                this.renderMap(); 
            } else {
                console.warn('Map not ready for re-render after clearing trajectory.');
            }
            wx.showToast({ title: '轨迹已清除', icon: 'success', duration: 1000 });
        } else {
            console.error('appManager.clearTrajectoryData function is not available.');
            wx.showToast({ title: '清除轨迹失败', icon: 'none' });
        }
    } catch (err) {
        console.error('Error calling clearTrajectoryHistory:', err);
        wx.showToast({ title: '清除轨迹出错', icon: 'none' });
    }
  }
  // **** END NEW ****
}); 