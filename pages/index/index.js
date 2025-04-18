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
  
  // 页面加载
  onLoad() {
    console.log('首页加载');
    
    // 清除任何错误消息和状态
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
    
    // 重置实例变量
    this.canvas = null;
    this.canvasContext = null;
    this.renderTimer = null;
    
    // 初始化应用管理器
    console.log('开始初始化应用管理器...');
    this.initAppManager();
  },
  
  // 页面显示
  onShow() {
    console.log('首页显示');
    // 重新加载数据（由于可能从配置页返回）
    if (appManager.getState().initialized) {
      // 先获取最新状态
      this.updateStateFromManager();
      
      // 初始化Canvas（如果有地图且Canvas尚未初始化）
      if (this.data.hasMap) {
        if (!this.data.mapLoaded || !this.canvas) {
          console.log('地图已配置但Canvas未初始化，正在设置Canvas...');
          // 延迟设置Canvas，确保DOM已渲染完成
          setTimeout(() => {
            this.setupCanvas();
          }, 300);
        } else {
          console.log('Canvas已初始化，刷新地图渲染');
          this.renderMap();
        }
      } else {
        console.log('无地图配置，跳过Canvas初始化');
      }
    } else {
      console.log('应用管理器未初始化，等待初始化完成');
    }
  },
  
  // 页面隐藏
  onHide() {
    console.log('首页隐藏');
  },
  
  // 页面卸载
  onUnload() {
    console.log('首页卸载');
    // 确保停止定位
    if (this.data.isLocating) {
      this.stopLocating();
    }
  },
  
  // 初始化应用管理器
  initAppManager() {
    console.log('初始化应用管理器');
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
      console.log('应用管理器初始化成功');
      this.updateStateFromManager();
      // 初始化Canvas，使用延迟确保DOM已渲染
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
    console.log('开始设置Canvas');
    const that = this;
    
    if (this.setupCanvasInProgress) {
      console.log('Canvas设置已在进行中，跳过重复调用');
      return;
    }
    
    this.setupCanvasInProgress = true;
    
    // 创建一个函数来处理Canvas初始化
    const initCanvas = (attempts = 0) => {
      if (attempts >= 3) {
        console.error('Canvas初始化失败，超过最大尝试次数');
        that.setupCanvasInProgress = false;
        that.setData({
          errorMessage: 'Canvas初始化失败，请重新启动小程序'
        });
        return;
      }
      
      console.log(`Canvas初始化第${attempts + 1}次尝试`);
      
      const query = wx.createSelectorQuery();
      
      query.select('#mapCanvas')
        .fields({ node: true, size: true })
        .exec((res) => {
          if (!res || !res[0]) {
            console.error('获取Canvas节点失败：结果为空');
            // 等待一段时间后重试
            setTimeout(() => {
              initCanvas(attempts + 1);
            }, 300);
            return;
          }
          
          if (!res[0].node) {
            console.error('获取Canvas节点失败：node属性为空');
            // 等待一段时间后重试
            setTimeout(() => {
              initCanvas(attempts + 1);
            }, 300);
            return;
          }
          
          try {
            const canvas = res[0].node;
            // 保存canvas引用
            that.canvas = canvas;
            
            // 检查canvas是否有效
            if (!canvas || typeof canvas.getContext !== 'function') {
              console.error('Canvas节点无效：getContext方法不存在');
              // 等待一段时间后重试
              setTimeout(() => {
                initCanvas(attempts + 1);
              }, 300);
              return;
            }
            
            const ctx = canvas.getContext('2d');
            
            if (!ctx) {
              console.error('获取2d上下文失败');
              // 等待一段时间后重试
              setTimeout(() => {
                initCanvas(attempts + 1);
              }, 300);
              return;
            }
            
            that.canvasContext = ctx;
            
            // 确保Canvas大小有效
            const width = res[0].width || 300;
            const height = res[0].height || 280; // 注意：首页画布高度可能不是固定的280
            console.log('Canvas实际尺寸:', width, 'x', height);
            
            // 设置canvas大小
            canvas.width = width;
            canvas.height = height;
            
            console.log('Canvas尺寸已设置为:', canvas.width, 'x', canvas.height);
            
            // --- 新增：显式设置 jsonMapRenderer 画布尺寸 ---
            if (jsonMapRenderer && typeof jsonMapRenderer.setCanvasSize === 'function') {
              const setSizeSuccess = jsonMapRenderer.setCanvasSize(canvas.width, canvas.height);
              console.log('显式调用 jsonMapRenderer.setCanvasSize 成功:', setSizeSuccess);
            } else {
               console.warn('jsonMapRenderer 或 setCanvasSize 不可用');
            }
            // --- 结束新增 ---


            // 初始化渲染器
            const initRenderer = (rendererAttempts = 0) => {
              if (rendererAttempts >= 3) {
                console.error('渲染器初始化失败，超过最大尝试次数');
                that.setupCanvasInProgress = false;
                that.setData({
                  errorMessage: '渲染器初始化失败，请确保地图数据有效'
                });
                return;
              }
              
              console.log(`渲染器初始化第${rendererAttempts + 1}次尝试`);
              
              try {
                const success = appManager.initRenderer(ctx, canvas.width, canvas.height);
                
                if (success) {
                  console.log('地图渲染器初始化成功');
                  // --- 再次确保尺寸 ---
                  if (jsonMapRenderer && typeof jsonMapRenderer.setCanvasSize === 'function') {
                     jsonMapRenderer.setCanvasSize(canvas.width, canvas.height);
                     console.log('在 initRenderer 成功后再次确认 canvas 尺寸');
                  }
                   // --- 结束再次确保 ---
                   that.setupCanvasInProgress = false;
                  that.setData({
                    mapLoaded: true,
                    errorMessage: '' // 清除可能存在的错误
                  });
                  
                  // 渲染地图
                  that.renderMap();
                  
                  // 如果正在定位，启动渲染循环
                  if (that.data.isLocating) {
                    that.startRenderLoop();
                  }
                } else {
                  console.error('地图渲染器初始化失败，第', rendererAttempts + 1, '次尝试');
                  
                  // 如果这不是最后一次尝试，等待后重试
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
                
                // 如果这不是最后一次尝试，等待后重试
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
            
            // 先进行一些Canvas操作，确保Canvas已准备好
            try {
              // 清空Canvas并绘制一个简单的形状
              ctx.clearRect(0, 0, width, height);
              ctx.fillStyle = '#f0f0f0';
              ctx.fillRect(0, 0, width, height);
              ctx.strokeStyle = '#cccccc';
              ctx.lineWidth = 2;
              ctx.strokeRect(10, 10, width - 20, height - 20);
              
              // 绘制一个加载中的文本
              ctx.fillStyle = '#666666';
              ctx.font = '14px sans-serif';
              ctx.textAlign = 'center';
              ctx.fillText('正在初始化地图...', width / 2, height / 2);
              
              // 延迟一点时间确保Canvas渲染完成，再初始化渲染器
              setTimeout(() => {
                initRenderer(0);
              }, 200);
            } catch (canvasErr) {
              console.error('初始Canvas绘制失败:', canvasErr);
              // 尝试直接初始化渲染器
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
    
    // 开始Canvas初始化过程
    initCanvas(0);
  },
  
  // 渲染地图和所有元素
  renderMap() {
    if (!this.data.mapLoaded || !this.canvas) {
      console.warn('无法渲染地图：地图未加载或Canvas未初始化');
      return;
    }
    
    try {
      // 获取当前渲染器状态用于调试
      const rendererState = appManager.getRendererState ? appManager.getRendererState() : null;
      console.log('===== 开始地图渲染 =====');
      console.log('渲染器状态:', JSON.stringify(rendererState));
      
      if (rendererState && rendererState.mapInfo) {
        console.log('地图尺寸:', rendererState.mapInfo.width, 'x', rendererState.mapInfo.height);
        console.log('实体数量:', rendererState.mapInfo.entities ? rendererState.mapInfo.entities.length : 0);
        if (rendererState.mapInfo.entities && rendererState.mapInfo.entities.length > 0) {
          console.log('第一个实体类型:', rendererState.mapInfo.entities[0].type);
          console.log('第一个实体数据:', JSON.stringify(rendererState.mapInfo.entities[0]).substring(0, 200));
        }
      }
      
      console.log('画布尺寸:', this.canvas.width, 'x', this.canvas.height);
      console.log('缩放比例:', rendererState ? rendererState.scale : '未知');
      console.log('偏移量:', rendererState ? JSON.stringify(rendererState.offset) : '未知');
      
      const success = appManager.render({
        showGrid: true,
        showAxes: true,
        showMap: true,
        showBeacons: true,
        showPosition: true,
        showTrajectory: true
      });
      
      console.log('渲染结果:', success ? '成功' : '失败');
      console.log('===== 地图渲染结束 =====');
      
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
    
    // 渲染地图
    this.renderMap();
    
    // 循环渲染，每秒刷新一次
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
    // 更新位置历史
    let positionHistory = [...this.data.positionHistory];
    
    // 限制历史记录长度
    if (positionHistory.length >= 5) {
      positionHistory = positionHistory.slice(-4);
    }
    
    // 添加新位置
    positionHistory.push({
      x: position.x,
      y: position.y,
      timestamp: Date.now()
    });
    
    // 更新数据
    this.setData({
      currentPosition: position,
      beaconsWithDistance: beacons,
      detectedBeaconCount: beacons.length,
      positionHistory: positionHistory
    });
    
    // 使用平滑位置更新UI
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
    
    // 蓝牙不可用时显示提示
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
    console.log('地图加载成功:', mapInfo);
    this.setData({
      hasMap: true
    });
    
    // 如果Canvas已初始化则渲染地图
    if (this.data.mapLoaded) {
      this.renderMap();
    } else {
      // 否则初始化Canvas
      this.setupCanvas();
    }
  },
  
  // 处理信标配置
  handleBeaconsConfigured(beacons) {
    console.log('信标配置更新, 数量:', beacons.length);
    this.setData({
      hasBeacons: beacons.length > 0
    });
  },
  
  // 平滑更新位置显示
  updatePositionDisplay(position) {
    // 如果位置历史不足，直接使用当前位置
    if (this.data.positionHistory.length < 2) {
      return;
    }
    
    // 获取最近3个位置进行平滑
    const recentPositions = this.data.positionHistory.slice(-3);
    
    // 使用加权平均计算平滑位置
    let sumX = 0;
    let sumY = 0;
    let sumWeight = 0;
    
    for (let i = 0; i < recentPositions.length; i++) {
      // 权重随着索引增大而增大（越新的位置权重越大）
      const weight = i + 1;
      
      sumX += recentPositions[i].x * weight;
      sumY += recentPositions[i].y * weight;
      sumWeight += weight;
    }
    
    const smoothX = sumX / sumWeight;
    const smoothY = sumY / sumWeight;
    
    // 返回平滑后的位置
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
      console.log('已经在定位中，忽略重复调用');
      return;
    }
    
    // 检查是否有地图和信标配置
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
    
    console.log('开始定位');
    
    // 显示加载状态
    wx.showLoading({
      title: '启动定位中...',
    });
    
    // 重置位置历史
    this.setData({
      positionHistory: [],
      errorMessage: ''
    });
    
    // 调用应用管理器开始定位
    appManager.startLocating()
      .then(() => {
        console.log('定位已启动');
        this.setData({
          isLocating: true
        });
        
        // 启动渲染循环
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
    
    console.log('停止定位');
    
    // 停止渲染循环
    this.stopRenderLoop();
    
    // 调用应用管理器停止定位
    appManager.stopLocating()
      .then(() => {
        console.log('定位已停止');
        this.setData({
          isLocating: false
        });
      })
      .catch(err => {
        console.error('停止定位失败:', err);
        
        // 即使出错也更新UI状态
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
  }
}); 