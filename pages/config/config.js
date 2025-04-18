// config.js
const app = getApp();
const appManager = require('../../utils/appManager');
// 只保留JSON地图格式处理
const dxfParser = require('../../utils/dxfParser');

Page({
  data: {
    activeTab: 'beacon', // 当前激活的标签页
    beacons: [], // beacon配置列表
    mapInfo: {
      jsonContent: null, // JSON地图数据
      fileType: 'json', // 默认为json
    },
    signalPathLossExponent: 2.5, // 信号传播因子n
    
    // 弹窗相关
    showBeaconModal: false, // 是否显示Beacon编辑弹窗
    beaconModalMode: 'add', // 弹窗模式：add 添加, edit 编辑
    editingBeaconIndex: -1, // 当前编辑的Beacon索引
    editingBeacon: {
      uuid: '',
      major: '',
      minor: '',
      x: '',
      y: '',
      txPower: ''
    },
    
    // 删除确认
    showDeleteConfirmModal: false,
    deletingBeaconIndex: -1,
    
    // 扫描相关
    isScanning: false, // 是否正在扫描
    showScanResultModal: false, // 是否显示扫描结果弹窗
    scanResults: [], // 扫描到的beacon列表
    
    // 调试相关
    showDebugInfo: false, // 是否显示调试信息
    bluetoothStatus: '未初始化',
    scannedDevicesCount: 0,
    lastAdvertData: '',
    allDevices: [], // 所有扫描到的设备，不仅限于iBeacon
    
    // 地图交互相关
    coordSelectMode: false, // 是否处于坐标选择模式
    mapScale: 1, // 地图缩放比例
    mapOffset: { x: 0, y: 0 }, // 地图偏移量
    canvasInfo: null, // 画布信息
    currentMapData: null, // 当前地图数据
    viewInfo: null, // 用于存储地图绘制信息
    tempBeaconData: null, // 临时保存的Beacon数据
    mapSize: { width: 0, height: 0 }, // 地图尺寸
    tempSelectedCoords: null, // 临时选择的坐标
  },
  
  // 页面加载
  onLoad() {
    // 加载存储的数据
    this.loadData();
  },
  
  // 加载数据
  loadData() {
    // 1. 从appManager获取状态
    if (appManager && appManager.getState) {
      const state = appManager.getState();
      console.log('从appManager获取应用状态:', state);
      
      // 加载信标配置
      if (state.configuredBeaconCount > 0) {
        // 从beaconManager获取配置的信标
        const configuredBeacons = appManager.getState().configuredBeacons || [];
        if (Array.isArray(configuredBeacons) && configuredBeacons.length > 0) {
          console.log('从appManager加载到信标配置数据:', configuredBeacons.length, '个');
          this.setData({
            beacons: configuredBeacons
          });
        }
      } else {
        console.log('appManager中没有配置的信标');
      }
      
      // 2. 如果appManager中没有信标数据，尝试从本地存储获取
      if (!this.data.beacons || this.data.beacons.length === 0) {
        try {
          const beacons = wx.getStorageSync('beacons') || [];
          if (Array.isArray(beacons) && beacons.length > 0) {
            console.log('从本地存储加载到信标配置:', beacons.length, '个');
            this.setData({
              beacons: beacons
            });
            
            // 同步到appManager
            appManager.saveBeaconsToStorage(beacons)
              .then(() => console.log('将本地存储的信标同步到appManager成功'))
              .catch(err => console.error('同步信标到appManager失败:', err));
          }
        } catch (e) {
          console.error('加载信标配置失败:', e);
        }
      }
      
      // 加载地图信息
      try {
        // 从本地存储获取
        const mapInfo = wx.getStorageSync('mapInfo');
        if (mapInfo) {
          this.setData({
            mapInfo: mapInfo
          });
        }
        
        // 从appManager检查地图状态
        if (state.hasMap) {
          console.log('从appManager检测到地图配置，尝试加载');
          
          // 如果本地存储中没有mapInfo，但appManager中有，则初始化地图预览
          if (!this.data.mapInfo.jsonContent && this.data.activeTab === 'map') {
            setTimeout(() => {
              this.initMapPreview();
            }, 300);
          }
        }
      } catch (e) {
        console.error('加载地图信息失败:', e);
      }
      
      // 加载信号因子
      try {
        // 从beaconManager获取信号因子
        const factor = appManager.getState().signalFactor;
        if (factor && !isNaN(parseFloat(factor))) {
          console.log('从appManager加载信号因子:', factor);
          this.setData({
            signalPathLossExponent: parseFloat(factor)
          });
        } else {
          // 尝试从本地存储获取
          const storedFactor = wx.getStorageSync('signalPathLossExponent');
          if (storedFactor && !isNaN(parseFloat(storedFactor))) {
            this.setData({
              signalPathLossExponent: parseFloat(storedFactor)
            });
          }
        }
      } catch (e) {
        console.error('加载信号因子失败:', e);
      }
    } else {
      console.error('appManager未初始化或不可用，尝试从本地存储加载');
      this.loadFromLocalStorage();
    }
  },
  
  // 从本地存储加载数据的备用方法
  loadFromLocalStorage() {
    // 加载信标配置
    try {
      const beacons = wx.getStorageSync('beacons') || [];
      if (Array.isArray(beacons)) {
        this.setData({
          beacons: beacons
        });
      }
    } catch (e) {
      console.error('从本地存储加载信标配置失败:', e);
    }
    
    // 加载地图信息
    try {
      const mapInfo = wx.getStorageSync('mapInfo');
      if (mapInfo) {
        this.setData({
          mapInfo: mapInfo
        });
      }
    } catch (e) {
      console.error('从本地存储加载地图信息失败:', e);
    }
    
    // 加载信号因子
    try {
      const factor = wx.getStorageSync('signalPathLossExponent');
      if (factor && !isNaN(parseFloat(factor))) {
        this.setData({
          signalPathLossExponent: parseFloat(factor)
        });
      }
    } catch (e) {
      console.error('从本地存储加载信号因子失败:', e);
    }
  },
  
  // 切换标签页
  switchTab(e) {
    const tab = e.currentTarget.dataset.tab;
    
    // 清除任何可能存在的临时选择点
    if (tab === 'map' && this.data.tempSelectedCoords) {
      this.setData({ tempSelectedCoords: null });
    }
    
    this.setData({ activeTab: tab });
    
    // 如果切换到地图标签页且有地图，初始化预览
    if (tab === 'map' && this.data.mapInfo.jsonContent) {
      this.initMapPreview();
    }
  },
  
  // 初始化地图预览
  initMapPreview() {
    console.log('初始化地图预览');
    
    // 防止重复初始化
    if (this.initMapPreviewInProgress) {
      console.log('地图预览初始化已在进行中，跳过重复调用');
      return;
    }
    
    this.initMapPreviewInProgress = true;
    
    // 确保临时选择点被清除
    if (this.data.tempSelectedCoords) {
      console.log('发现临时选择坐标，主动清除');
      this.setData({ tempSelectedCoords: null });
    }
    
    const query = wx.createSelectorQuery();
    query.select('#mapCanvas')  // 使用正确的canvas ID
      .fields({ node: true, size: true })
      .exec((res) => {
        // 重置状态标志
        this.initMapPreviewInProgress = false;
        
        if (!res || !res[0]) {
          console.error('获取Canvas节点失败：结果为空');
          wx.showToast({
            title: '获取画布节点失败',
            icon: 'none',
            duration: 2000
          });
          return;
        }
        
        if (!res[0].node) {
          console.error('获取Canvas节点失败：node属性为空');
          wx.showToast({
            title: '画布节点无效',
            icon: 'none',
            duration: 2000
          });
          return;
        }
        
        const canvas = res[0].node;
        
        // 检查canvas是否有效
        if (!canvas || typeof canvas.getContext !== 'function') {
          console.error('Canvas节点无效：getContext方法不存在');
          wx.showToast({
            title: 'Canvas节点无效',
            icon: 'none',
            duration: 2000
          });
          return;
        }
        
        console.log('Canvas尺寸:', res[0].width, 'x', res[0].height);
        
        // 设置Canvas大小，适应不同设备
        const width = res[0].width || 300;
        const height = 280; // 固定高度
        canvas.width = width;
        canvas.height = height;
        
        console.log('Canvas大小已设置为:', canvas.width, 'x', canvas.height);
        
        try {
          const ctx = canvas.getContext('2d');
          
          if (!ctx) {
            console.error('获取2d上下文失败');
            wx.showToast({
              title: '获取Canvas上下文失败',
              icon: 'none',
              duration: 2000
            });
            return;
          }
          
          // 清空Canvas
          ctx.clearRect(0, 0, width, height);
          
          // 添加边框，便于调试
          ctx.strokeStyle = '#cccccc';
          ctx.lineWidth = 1;
          ctx.strokeRect(0, 0, width, height);
          
          // 获取地图数据
          const mapInfo = this.data.mapInfo;
          
          // 绘制JSON
          if (mapInfo && mapInfo.jsonContent) {
            console.log('准备绘制JSON地图，实体数量:', mapInfo.jsonContent.entities ? mapInfo.jsonContent.entities.length : 0);
            this.drawJSONMap(ctx, canvas.width, canvas.height);
            
            // 添加地图点击事件
            this.setupMapClickEvent(canvas);
            
            console.log('地图预览初始化完成');
          } else {
            console.error('没有有效的地图内容');
            
            // 显示提示信息
            ctx.fillStyle = '#666666';
            ctx.font = '14px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('请上传JSON格式地图', width/2, height/2 - 10);
            ctx.fillText('(需包含width, height和entities字段)', width/2, height/2 + 20);
            return;
          }
        } catch (err) {
          console.error('初始化地图预览出错:', err);
          wx.showToast({
            title: '初始化地图预览失败: ' + (err.message || String(err)),
            icon: 'none',
            duration: 2000
          });
        }
      });
  },
  
  // 上传地图
  uploadMap() {
    console.log('开始上传地图');
    wx.chooseMessageFile({
      count: 1,
      type: 'file',
      extension: ['json'],  // 只支持JSON格式
      success: (res) => {
        console.log('文件选择成功:', res);
        
        if (!res.tempFiles || !res.tempFiles.length) {
          wx.showModal({
            title: '上传失败',
            content: '未能获取所选文件',
            showCancel: false
          });
          return;
        }
        
        const tempFilePath = res.tempFiles[0].path;
        const fileName = res.tempFiles[0].name || '';
        const fileSize = res.tempFiles[0].size || 0;
        
        console.log(`选择的文件: 名称=${fileName}, 大小=${fileSize}字节, 路径=${tempFilePath}`);
        
        // 显示加载提示
        wx.showLoading({
          title: '解析地图文件...',
          mask: true
        });
        
        // 读取JSON文件
        wx.getFileSystemManager().readFile({
          filePath: tempFilePath,
          encoding: 'utf8',
          success: (readRes) => {
            try {
              if (!readRes || !readRes.data) {
                throw new Error('文件内容为空');
              }
              
              console.log('JSON文件读取成功, 内容长度:', readRes.data.length);
              
              // 解析JSON
              let jsonData;
              try {
                jsonData = JSON.parse(readRes.data);
                console.log('JSON解析成功:', jsonData);
              } catch (parseErr) {
                console.error('JSON解析失败:', parseErr);
                wx.hideLoading();
                wx.showModal({
                  title: 'JSON解析错误',
                  content: '文件不是有效的JSON格式: ' + parseErr.message,
                  showCancel: false
                });
                return;
              }
              
              // 验证JSON格式
              if (!this.validateMapJSON(jsonData)) {
                wx.hideLoading();
                wx.showModal({
                  title: '格式错误',
                  content: '地图文件格式无效，请确保JSON包含width、height和entities字段',
                  showCancel: false
                });
                return;
              }
              
              // 更新地图数据
              this.setData({
                'mapInfo.jsonContent': jsonData,
                'mapInfo.fileType': 'json'
              });
              
              // 保存到本地存储
              this.saveMapToStorage();
              
              wx.hideLoading();
              wx.showToast({
                title: '地图加载成功',
                icon: 'success'
              });
              
              // 延迟初始化地图预览，确保Canvas和存储操作完成
              setTimeout(() => {
                console.log('延迟初始化地图预览...');
                this.initMapPreview();
              }, 500);
            } catch (e) {
              wx.hideLoading();
              console.error('解析JSON文件失败:', e);
              wx.showModal({
                title: '解析错误',
                content: '无法解析JSON文件: ' + e.message,
                showCancel: false
              });
            }
          },
          fail: (err) => {
            wx.hideLoading();
            console.error('读取文件失败:', err);
            wx.showModal({
              title: '读取失败',
              content: '无法读取文件: ' + (err.errMsg || '未知错误'),
              showCancel: false
            });
          }
        });
      },
      fail: (err) => {
        console.error('选择文件失败:', err);
        wx.showToast({
          title: '选择文件失败',
          icon: 'none'
        });
      }
    });
  },
  
  // 验证地图JSON
  validateMapJSON(jsonData) {
    // 检查必须的字段
    if (!jsonData) {
      console.error('JSON数据为空');
      return false;
    }
    
    if (typeof jsonData.width !== 'number' || jsonData.width <= 0) {
      console.error('JSON地图缺少有效的width字段');
      return false;
    }
    
    if (typeof jsonData.height !== 'number' || jsonData.height <= 0) {
      console.error('JSON地图缺少有效的height字段');
      return false;
    }
    
    if (!Array.isArray(jsonData.entities)) {
      console.error('JSON地图缺少entities数组');
      return false;
    }
    
    // 检查实体是否有效
    if (jsonData.entities.length === 0) {
      console.warn('警告: 地图JSON不包含任何实体');
      // 仍然允许空地图，但提出警告
    } else {
      // 验证至少有一个有效的实体
      let hasValidEntity = false;
      for (const entity of jsonData.entities) {
        if (entity && entity.type) {
          hasValidEntity = true;
          break;
        }
      }
      
      if (!hasValidEntity) {
        console.error('JSON地图不包含任何有效实体');
        return false;
      }
    }
    
    console.log('JSON地图验证通过');
    return true;
  },
  
  // 保存地图到本地存储
  saveMapToStorage() {
    try {
      // 获取地图数据
      const mapData = this.data.mapInfo.jsonContent;
      if (!mapData) {
        console.error('无法保存地图：地图数据为空');
        return;
      }
      
      // 使用appManager保存地图数据
      appManager.loadMapData(mapData)
        .then(() => {
          console.log('地图信息已通过appManager保存');
        })
        .catch(err => {
          console.error('通过appManager保存地图失败:', err);
          // 作为备份，同时保存到原来的存储位置
          wx.setStorageSync('mapInfo', this.data.mapInfo);
          app.globalData.mapInfo = this.data.mapInfo;
        });
    } catch (e) {
      console.error('保存地图信息失败:', e);
      // 备份保存方式
      wx.setStorageSync('mapInfo', this.data.mapInfo);
      app.globalData.mapInfo = this.data.mapInfo;
    }
  },
  
  // 保存地图配置
  saveMapConfig() {
    // 保存到全局数据和本地存储
    app.globalData.mapInfo = this.data.mapInfo;
    
    // 使用appManager保存地图数据
    const mapData = this.data.mapInfo.jsonContent;
    
    console.log('===== 开始保存地图配置 =====');
    if (mapData) {
      console.log('地图尺寸:', mapData.width, 'x', mapData.height);
      console.log('实体数量:', mapData.entities ? mapData.entities.length : 0);
      
      if (mapData.entities && mapData.entities.length > 0) {
        let polylineCount = 0, circleCount = 0, textCount = 0, otherCount = 0;
        let closedCount = 0, filledCount = 0;
        
        mapData.entities.forEach(entity => {
          if (!entity || !entity.type) return;
          
          switch(entity.type.toLowerCase()) {
            case 'polyline': 
              polylineCount++; 
              if (entity.closed) closedCount++;
              if (entity.fill || entity.fillColor) filledCount++;
              break;
            case 'circle': circleCount++; break;
            case 'text': textCount++; break;
            default: otherCount++;
          }
        });
        
        console.log('实体统计: 折线=' + polylineCount + 
                   ', 圆形=' + circleCount + 
                   ', 文本=' + textCount + 
                   ', 其他=' + otherCount);
        console.log('折线属性: 闭合=' + closedCount + 
                   ', 填充=' + filledCount);
        
        // 输出第一个实体的详细信息
        console.log('第一个实体示例:', JSON.stringify(mapData.entities[0]).substring(0, 200));
        
        // 如果是折线，输出点的数量
        if (mapData.entities[0].type.toLowerCase() === 'polyline' && Array.isArray(mapData.entities[0].points)) {
          console.log('第一个折线点数:', mapData.entities[0].points.length);
        }
      }
      
      wx.showLoading({
        title: '保存中...',
        mask: true
      });
      
      appManager.loadMapData(mapData)
        .then(() => {
          console.log('地图配置保存成功');
          wx.hideLoading();
          wx.showToast({
            title: '配置已保存',
            icon: 'success'
          });
          
          // 输出渲染器状态
          const rendererState = appManager.getRendererState ? appManager.getRendererState() : null;
          if (rendererState && rendererState.mapInfo) {
            console.log('保存后渲染器状态:');
            console.log('- 地图尺寸:', rendererState.mapInfo.width, 'x', rendererState.mapInfo.height);
            console.log('- 实体数量:', rendererState.mapInfo.entities ? rendererState.mapInfo.entities.length : 0);
          }
          
          // 重新绘制预览
          this.initMapPreview();
        })
        .catch(err => {
          console.error('保存地图配置失败:', err);
          wx.hideLoading();
          wx.showModal({
            title: '保存失败',
            content: '保存地图配置失败: ' + (err.message || String(err)),
            showCancel: false
          });
        });
    } else {
      console.log('没有地图数据可保存');
      wx.showToast({
        title: '没有地图数据可保存',
        icon: 'none'
      });
    }
    console.log('===== 保存地图配置结束 =====');
  },
  
  // 更新信号传播因子
  updateSignalFactor(e) {
    const value = e.detail.value;
    this.setData({
      signalPathLossExponent: value
    });
  },
  
  // 保存通用设置
  saveSettings() {
    // 获取信号因子
    const factor = parseFloat(this.data.signalPathLossExponent);
    
    // 使用appManager保存信号因子
    try {
      appManager.saveSignalFactorToStorage(factor)
        .then(() => {
          console.log('信号因子通过appManager保存成功');
          wx.showToast({
            title: '设置已保存',
            icon: 'success'
          });
        })
        .catch(err => {
          console.error('通过appManager保存信号因子失败:', err);
          // 备份保存方式
          app.globalData.signalPathLossExponent = factor;
          wx.setStorageSync('signalPathLossExponent', factor);
          
          wx.showToast({
            title: '设置已保存',
            icon: 'success'
          });
        });
    } catch (e) {
      console.error('保存信号因子失败:', e);
      // 备份保存方式
      app.globalData.signalPathLossExponent = factor;
      wx.setStorageSync('signalPathLossExponent', factor);
      
      wx.showToast({
        title: '设置已保存',
        icon: 'success'
      });
    }
  },
  
  // 显示添加/编辑Beacon弹窗
  showBeaconModal(e) {
    const mode = e.currentTarget.dataset.mode;
    
    if (mode === 'add') {
      // 添加模式，重置表单
      this.setData({
        showBeaconModal: true,
        beaconModalMode: 'add',
        editingBeaconIndex: -1,
        editingBeacon: {
          uuid: '',
          major: '',
          minor: '',
          x: '',
          y: '',
          txPower: '-59' // 默认值
        }
      });
    }
  },
  
  // 编辑beacon
  editBeacon(e) {
    const index = e.currentTarget.dataset.index;
    const beacon = this.data.beacons[index];
    
    // 设置编辑表单数据
    this.setData({
      showBeaconModal: true,
      beaconModalMode: 'edit',
      editingBeaconIndex: index,
      editingBeacon: { ...beacon }
    });
  },
  
  // 隐藏beacon弹窗
  hideBeaconModal() {
    console.log('关闭Beacon配置窗口');
    
    // 更新UI状态
    this.setData({
      showBeaconModal: false
    });
    
    // 无论当前是否在地图标签页，都尝试清理临时坐标点并重绘地图
    this.coordinateSelectionCleanup();
  },
  
  // 更新beacon表单字段
  updateBeaconField(e) {
    const field = e.currentTarget.dataset.field;
    const value = e.detail.value;
    
    this.setData({
      [`editingBeacon.${field}`]: value
    });
  },
  
  // 确认编辑/添加beacon
  confirmBeaconEdit() {
    // 验证数据
    const beacon = this.data.editingBeacon;
    
    // UUID必填验证
    if (!beacon.uuid || beacon.uuid.trim() === '') {
      wx.showToast({
        title: 'UUID不能为空',
        icon: 'none'
      });
      return;
    }
    
    // 坐标必需是数字
    if (!beacon.x || beacon.x.toString().trim() === '') {
      wx.showToast({
        title: 'X坐标不能为空',
        icon: 'none'
      });
      return;
    }
    
    if (!beacon.y || beacon.y.toString().trim() === '') {
      wx.showToast({
        title: 'Y坐标不能为空',
        icon: 'none'
      });
      return;
    }
    
    if (!beacon.txPower || beacon.txPower.toString().trim() === '') {
      wx.showToast({
        title: '信号功率不能为空',
        icon: 'none'
      });
      return;
    }
    
    const x = parseFloat(beacon.x);
    const y = parseFloat(beacon.y);
    const txPower = parseFloat(beacon.txPower);
    
    if (isNaN(x) || isNaN(y)) {
      wx.showToast({
        title: '坐标必须是有效数字',
        icon: 'none'
      });
      return;
    }
    
    if (isNaN(txPower)) {
      wx.showToast({
        title: '信号功率必须是有效数字',
        icon: 'none'
      });
      return;
    }
    
    // 构建Beacon对象（确保格式统一且数据类型正确）
    const beaconToSave = {
      uuid: beacon.uuid.trim().toUpperCase(), // 统一为大写
      displayName: beacon.displayName ? beacon.displayName.trim() : beacon.uuid.trim(),
      deviceId: beacon.deviceId || null,
      major: beacon.major ? parseInt(beacon.major) : 0,
      minor: beacon.minor ? parseInt(beacon.minor) : 0,
      x: x,
      y: y,
      txPower: txPower
    };
    
    // 验证UUID格式
    const uuidRegex = /^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/i;
    if (!uuidRegex.test(beaconToSave.uuid)) {
      console.warn('UUID格式不标准:', beaconToSave.uuid);
      // 不阻止保存，但提出警告
      wx.showModal({
        title: 'UUID格式警告',
        content: 'UUID格式不是标准格式，这可能导致Beacon无法正确匹配。是否仍然保存？',
        success: (res) => {
          if (res.confirm) {
            this.saveBeaconData(beaconToSave);
          }
        }
      });
      return;
    }
    
    // 保存Beacon数据
    this.saveBeaconData(beaconToSave);
  },
  
  // 保存Beacon数据到列表和存储
  saveBeaconData(beaconToSave) {
    // 更新或添加Beacon
    const beacons = [...this.data.beacons];
    
    if (this.data.beaconModalMode === 'add') {
      // 检查是否已存在相同UUID的Beacon
      const existingIndex = beacons.findIndex(b => b.uuid === beaconToSave.uuid);
      if (existingIndex >= 0) {
        wx.showModal({
          title: '重复UUID',
          content: '已存在相同UUID的Beacon，是否更新现有配置？',
          success: (res) => {
            if (res.confirm) {
              beacons[existingIndex] = beaconToSave;
              this.finalizeBeaconSave(beacons, '更新成功');
            }
          }
        });
        return;
      }
      
      // 添加新的Beacon
      beacons.push(beaconToSave);
      console.log('添加新Beacon成功');
      
      // 通知用户
      this.finalizeBeaconSave(beacons, 'Beacon添加成功');
    } else {
      // 编辑现有Beacon
      const index = this.data.editingBeaconIndex;
      if (index >= 0 && index < beacons.length) {
        beacons[index] = beaconToSave;
        console.log('更新Beacon成功, 索引:', index);
        
        // 通知用户
        this.finalizeBeaconSave(beacons, 'Beacon更新成功');
      } else {
        console.error('无效的Beacon索引:', index);
        wx.showToast({
          title: '更新失败：无效索引',
          icon: 'none'
        });
        return;
      }
    }
  },
  
  // 完成Beacon保存操作
  finalizeBeaconSave(beacons, successMessage) {
    // 更新状态
    this.setData({
      beacons: beacons,
      showBeaconModal: false,
      editingBeacon: {
        uuid: '',
        major: '',
        minor: '',
        x: '',
        y: '',
        txPower: ''
      }
    });
    
    // 保存到本地存储
    try {
      // 1. 使用appManager保存到正确的存储中
      appManager.saveBeaconsToStorage(beacons)
        .then(() => {
          console.log('Beacon列表已通过appManager保存');
          
          wx.showToast({
            title: successMessage,
            icon: 'success'
          });
        })
        .catch(err => {
          console.error('通过appManager保存Beacon失败:', err);
          // 作为备份，同时保存到原来的存储位置
          wx.setStorageSync('beacons', beacons);
          app.globalData.beacons = beacons;
          
          wx.showToast({
            title: successMessage,
            icon: 'success'
          });
        });
    } catch (e) {
      console.error('保存Beacon列表失败:', e);
      // 备份保存方式
      wx.setStorageSync('beacons', beacons);
      app.globalData.beacons = beacons;
      
      wx.showToast({
        title: '保存失败',
        icon: 'none'
      });
    }
  },
  
  // 显示删除确认弹窗
  showDeleteConfirm(e) {
    const index = e.currentTarget.dataset.index;
    
    this.setData({
      showDeleteConfirmModal: true,
      deletingBeaconIndex: index
    });
    
    // 阻止事件冒泡
    e.stopPropagation();
  },
  
  // 取消删除
  cancelDelete() {
    this.setData({
      showDeleteConfirmModal: false,
      deletingBeaconIndex: -1
    });
  },
  
  // 确认删除
  confirmDelete() {
    const index = this.data.deletingBeaconIndex;
    
    if (index < 0 || index >= this.data.beacons.length) {
      this.cancelDelete();
      return;
    }
    
    // 删除beacon
    const beacons = [...this.data.beacons];
    beacons.splice(index, 1);
    
    // 更新数据
    this.setData({
      beacons: beacons,
      showDeleteConfirmModal: false,
      deletingBeaconIndex: -1
    });
    
    // 保存到appManager
    try {
      appManager.saveBeaconsToStorage(beacons)
        .then(() => {
          console.log('删除后的Beacon列表已通过appManager保存');
          wx.showToast({
            title: '删除成功',
            icon: 'success'
          });
        })
        .catch(err => {
          console.error('删除后通过appManager保存Beacon失败:', err);
          // 作为备份，保存到原来的存储
          app.globalData.beacons = beacons;
          wx.setStorageSync('beacons', beacons);
          
          wx.showToast({
            title: '删除成功',
            icon: 'success'
          });
        });
    } catch (e) {
      console.error('删除后保存Beacon失败:', e);
      // 备份保存方式
      app.globalData.beacons = beacons;
      wx.setStorageSync('beacons', beacons);
      
      wx.showToast({
        title: '删除成功',
        icon: 'success'
      });
    }
  },
  
  // 开始扫描Beacon
  startScanBeacons() {
    if (this.data.isScanning) {
      console.log('已经在扫描中，忽略重复请求');
      return;
    }
    
    // 初始化蓝牙
    this.initBluetooth()
      .then(() => {
        this.setData({
          isScanning: true,
          showScanResultModal: true,
          scanResults: [],
          scannedDevicesCount: 0,
          allDevices: []
        });
        
        console.log('开始扫描Beacon设备');
        this.startDiscovery();
      })
      .catch(err => {
        this.showBluetoothError(err);
      });
  },
  
  // 初始化蓝牙
  initBluetooth() {
    return new Promise((resolve, reject) => {
      console.log('初始化蓝牙适配器');
      this.setData({ bluetoothStatus: '初始化中...' });
      
      wx.openBluetoothAdapter({
        success: (res) => {
          console.log('蓝牙适配器初始化成功', res);
          this.setData({ bluetoothStatus: '已初始化' });
          
          // 开始监听蓝牙适配器状态
          wx.onBluetoothAdapterStateChange((res) => {
            console.log('蓝牙适配器状态变化:', res);
            
            const status = res.available ? (res.discovering ? '扫描中' : '已就绪') : '不可用';
            this.setData({ bluetoothStatus: status });
            
            if (!res.available && this.data.isScanning) {
              // 蓝牙变为不可用，停止扫描
              this.stopScanBeacons();
              wx.showToast({
                title: '蓝牙已断开',
                icon: 'none'
              });
            }
          });
          
          resolve();
        },
        fail: (err) => {
          console.error('蓝牙适配器初始化失败', err);
          this.setData({ bluetoothStatus: '初始化失败' });
          reject(err);
        }
      });
    });
  },
  
  // 显示蓝牙错误信息
  showBluetoothError(err) {
    let errorMsg = '蓝牙初始化失败';
    if (err.errCode === 10001) {
      errorMsg = '蓝牙未打开，请打开设备蓝牙';
    } else if (err.errCode === 10008) {
      errorMsg = '请求外部设备时需配对，请在系统设置中配对';
    } else if (err.errCode === 10009) {
      errorMsg = '未授权支持蓝牙，请检查小程序权限设置';
    } else if (err.errMsg) {
      errorMsg = err.errMsg;
    }
    
    wx.showModal({
      title: '蓝牙错误',
      content: errorMsg,
      showCancel: false
    });
  },
  
  // 开始扫描设备
  startDiscovery() {
    console.log('准备开始设备扫描');
    
    // 配置模式下，扫描所有可见的蓝牙设备，不限于iBeacon
    console.log('配置模式：扫描所有可见的蓝牙设备');
    
    // 开始搜索普通蓝牙设备，通过广播数据解析iBeacon
    wx.startBluetoothDevicesDiscovery({
      allowDuplicatesKey: true, // 允许重复上报设备
      success: (res) => {
        console.log('开始蓝牙设备扫描成功:', res);
        this.setData({ bluetoothStatus: '扫描中' });
        
        // 监听发现新设备事件
        wx.onBluetoothDeviceFound((res) => {
          if (!res.devices || res.devices.length === 0) {
            return;
          }
          
          // 更新扫描计数
          this.setData({
            scannedDevicesCount: this.data.scannedDevicesCount + res.devices.length
          });
          
          // 处理找到的设备
          res.devices.forEach(device => {
            console.log('发现蓝牙设备:', device);
            this.setData({
              allDevices: [...this.data.allDevices, device]
            });
            
            // 更新最新的广播数据用于调试
            if (device.advertisData) {
              this.setData({
                lastAdvertData: Array.from(new Uint8Array(device.advertisData))
                  .map(b => b.toString(16).padStart(2, '0'))
                  .join(' ')
              });
            }
            
            // 尝试解析advertisData判断是否为iBeacon
            if (device.advertisData) {
              const iBeaconInfo = this.parseAdvertisData(device.advertisData);
              
              // 如果没有找到标准格式，尝试备用解析方法
              const finalBeaconInfo = iBeaconInfo || this.parseAdvertisDataAlternative(device.advertisData);
              
              if (finalBeaconInfo && finalBeaconInfo.isIBeacon) {
                console.log('找到iBeacon设备:', finalBeaconInfo);
                
                // 构建beacon对象
                const beacon = {
                  uuid: finalBeaconInfo.uuid,
                  major: finalBeaconInfo.major || 0,
                  minor: finalBeaconInfo.minor || 0,
                  rssi: device.RSSI,
                  deviceId: device.deviceId,
                  txPower: finalBeaconInfo.txPower || -59 // 默认值
                };
                
                // 添加到扫描结果
                this.addBeaconToScanResults(beacon);
              }
            }
          });
        });
        
        // 30秒后自动停止扫描
        setTimeout(() => {
          if (this.data.isScanning) {
            console.log('扫描超时，自动停止');
            this.stopScanBeacons();
          }
        }, 30000);
      },
      fail: (err) => {
        console.error('开始蓝牙设备扫描失败:', err);
        this.setData({ 
          isScanning: false, 
          bluetoothStatus: '扫描失败'
        });
        
        // 显示错误信息
        wx.showModal({
          title: '扫描失败',
          content: '启动蓝牙设备扫描失败: ' + (err.errMsg || '未知错误'),
          showCancel: false
        });
      }
    });
  },
  
  // 解析iBeacon广播数据 - 更灵活的版本
  parseAdvertisData(advertisData) {
    try {
      const buffer = new ArrayBuffer(advertisData.byteLength);
      const dataView = new DataView(buffer);
      
      // 复制数据到新的buffer
      for (let i = 0; i < advertisData.byteLength; i++) {
        dataView.setUint8(i, advertisData[i]);
      }
      
      // 尝试多种iBeacon格式的检测
      
      // 1. 标准Apple iBeacon格式
      // 寻找Apple公司ID和iBeacon类型
      const findAppleBeaconData = () => {
        // 查找iBeacon前缀: 0x02, 0x15 - 适用于一些标准iBeacon
        if (dataView.byteLength >= 23 && dataView.getUint8(0) === 0x02 && dataView.getUint8(1) === 0x15) {
          return { startIndex: 2 };
        }
        
        // 查找完整的Apple公司ID前缀: 0x4C, 0x00 (Apple), 0x02 (iBeacon类型), 0x15 (数据长度)
        for (let i = 0; i < dataView.byteLength - 4; i++) {
          if (dataView.getUint8(i) === 0x4C && 
              dataView.getUint8(i+1) === 0x00 && 
              dataView.getUint8(i+2) === 0x02 && 
              dataView.getUint8(i+3) === 0x15) {
                return { startIndex: i + 4 };
          }
        }
        
        return null;
      };
      
      const beaconFormat = findAppleBeaconData();
      
      if (beaconFormat) {
        const startIndex = beaconFormat.startIndex;
        
        // 确保有足够的数据
        if (startIndex + 20 <= dataView.byteLength) {
          // 解析UUID
          let uuid = '';
          for (let i = startIndex; i < startIndex + 16; i++) {
            let hex = dataView.getUint8(i).toString(16);
            if (hex.length === 1) {
              hex = '0' + hex;
            }
            uuid += hex;
            
            // 添加连字符以符合标准UUID格式
            if ((i - startIndex) === 3 || (i - startIndex) === 5 || 
                (i - startIndex) === 7 || (i - startIndex) === 9) {
              uuid += '-';
            }
          }
          
          // 解析Major值 (2字节)
          const major = dataView.getUint16(startIndex + 16, false);
          
          // 解析Minor值 (2字节)
          const minor = dataView.getUint16(startIndex + 18, false);
          
          // 解析Tx Power (1字节)
          const txPower = dataView.getInt8(startIndex + 20);
          
          return {
            isIBeacon: true,
            uuid: uuid.toUpperCase(),
            major: major,
            minor: minor,
            txPower: txPower
          };
        }
      }
    } catch (e) {
      console.error('解析广播数据出错', e);
    }
    
    return null;
  },
  
  // 添加一个备用的解析方法，专门处理特定厂商的iBeacon格式
  parseAdvertisDataAlternative(advertisData) {
    try {
      console.log('尝试备用解析方法');
      
      // 将原始数据转换为十六进制数组，方便查看
      const rawBytes = Array.from(new Uint8Array(advertisData))
        .map(b => b.toString(16).padStart(2, '0'));
      console.log('原始字节:', rawBytes);
      
      // 如果数据长度不足，无法解析
      if (advertisData.byteLength < 25) {
        console.log('数据长度不足，无法解析iBeacon格式');
        return null;
      }
      
      const buffer = new ArrayBuffer(advertisData.byteLength);
      const dataView = new DataView(buffer);
      
      // 复制数据到新的buffer
      for (let i = 0; i < advertisData.byteLength; i++) {
        dataView.setUint8(i, new Uint8Array(advertisData)[i]);
      }
      
      // 搜索特定模式
      // 尝试查找iBeacon标记，通常在不同位置
      let startIndex = -1;
      
      // 特别处理：有些设备可能会在不同位置包含iBeacon前缀
      for (let i = 0; i < dataView.byteLength - 4; i++) {
        // 标准iBeacon格式: 4C 00 02 15
        if (dataView.getUint8(i) === 0x4C && 
            dataView.getUint8(i+1) === 0x00 && 
            dataView.getUint8(i+2) === 0x02 && 
            dataView.getUint8(i+3) === 0x15) {
          startIndex = i + 4;
          console.log('找到标准iBeacon前缀，起始索引:', startIndex);
          break;
        }
        // 简化版前缀: 02 15 (有些设备可能省略了公司ID)
        else if (dataView.getUint8(i) === 0x02 && 
                 dataView.getUint8(i+1) === 0x15) {
          startIndex = i + 2;
          console.log('找到简化iBeacon前缀，起始索引:', startIndex);
          break;
        }
      }
      
      if (startIndex === -1) {
        console.log('未找到iBeacon前缀');
        return null;
      }
      
      // 确保有足够的数据来解析UUID、Major、Minor和txPower
      if (startIndex + 20 > dataView.byteLength) {
        console.log('数据不足以解析完整的iBeacon');
        return null;
      }
      
      // 解析UUID
      let uuid = '';
      for (let i = startIndex; i < startIndex + 16; i++) {
        let hex = dataView.getUint8(i).toString(16);
        if (hex.length === 1) {
          hex = '0' + hex;
        }
        uuid += hex;
        
        // 按照标准UUID格式添加连字符
        if ((i - startIndex) === 3 || (i - startIndex) === 5 || 
            (i - startIndex) === 7 || (i - startIndex) === 9) {
          uuid += '-';
        }
      }
      
      // 解析Major和Minor值
      const major = dataView.getUint16(startIndex + 16, false);
      const minor = dataView.getUint16(startIndex + 18, false);
      
      // Tx Power通常在UUID、Major和Minor之后
      const txPower = dataView.getInt8(startIndex + 20);
      
      console.log(`备用方法解析结果 - UUID: ${uuid}, Major: ${major}, Minor: ${minor}, TxPower: ${txPower}`);
      
      return {
        isIBeacon: true,
        uuid: uuid.toUpperCase(),
        major: major,
        minor: minor,
        txPower: txPower
      };
    } catch (e) {
      console.error('备用解析方法出错:', e);
      return null;
    }
  },
  
  // 添加扫描到的beacon到结果列表
  addBeaconToScanResults(beacon) {
    try {
      // 确保beacon对象有效
      if (!beacon || !beacon.uuid) {
        console.warn('无效的Beacon数据，跳过', beacon);
        return;
      }
      
      console.log('处理扫描到的Beacon:', beacon);
      
      // 检查是否已存在相同的beacon (基于UUID-major-minor组合)
      const beaconId = `${beacon.uuid}-${beacon.major || 0}-${beacon.minor || 0}`;
      const existingIndex = this.data.scanResults.findIndex(item => 
        item.uuid === beacon.uuid && 
        item.major === beacon.major && 
        item.minor === beacon.minor
      );
      
      // 构建beacon信息对象
      const beaconInfo = {
        uuid: beacon.uuid,
        major: beacon.major,
        minor: beacon.minor,
        rssi: beacon.rssi,
        accuracy: beacon.accuracy,
        proximity: beacon.proximity,
        deviceId: beacon.deviceId || '',
        // 使用displayName或从UUID生成的简短名称
        displayName: beacon.deviceId ? `Beacon (${beacon.major},${beacon.minor})` : beacon.uuid.substring(0, 8)
      };
      
      // 如果已存在，更新RSSI；否则添加到列表
      if (existingIndex >= 0) {
        // 更新RSSI
        const updatedResults = [...this.data.scanResults];
        updatedResults[existingIndex].rssi = beacon.rssi;
        updatedResults[existingIndex].accuracy = beacon.accuracy;
        updatedResults[existingIndex].proximity = beacon.proximity;
        
        this.setData({
          scanResults: updatedResults
        });
        
        console.log(`更新已存在的Beacon RSSI: ${beacon.rssi}dBm`);
      } else {
        // 添加新的beacon
        this.setData({
          scanResults: [...this.data.scanResults, beaconInfo]
        });
        
        console.log('添加新的Beacon到扫描结果:', beaconInfo);
      }
    } catch (err) {
      console.error('添加Beacon到扫描结果时出错', err);
    }
  },
  
  // 从扫描结果中选择beacon
  selectBeaconFromScan(e) {
    const index = e.currentTarget.dataset.index;
    const beacon = this.data.scanResults[index];
    
    if (!beacon || !beacon.uuid) {
      console.error('选择的Beacon数据无效');
      wx.showToast({
        title: '选择的设备无效',
        icon: 'none'
      });
      return;
    }
    
    console.log('选择Beacon:', beacon);
    
    // 停止扫描
    this.stopScanBeacons();
    
    // 隐藏扫描结果弹窗
    this.setData({
      showScanResultModal: false
    });
    
    // 打开beacon编辑弹窗，填入扫描数据
    this.setData({
      showBeaconModal: true,
      beaconModalMode: 'add',
      editingBeaconIndex: -1,
      editingBeacon: {
        uuid: beacon.uuid,
        major: beacon.major || 0,
        minor: beacon.minor || 0,
        deviceId: beacon.deviceId || '',
        displayName: beacon.displayName || beacon.uuid.substring(0, 8),
        x: '',
        y: '',
        txPower: -59 // 默认值
      }
    });
    
    // 提示用户添加位置信息
    wx.showToast({
      title: '请设置位置信息',
      icon: 'none'
    });
  },
  
  // 停止扫描Beacon
  stopScanBeacons() {
    this.setData({ 
      isScanning: false,
      bluetoothStatus: '已停止扫描'
    });
    
    console.log('停止蓝牙设备扫描');
    
    // 停止搜索蓝牙设备
    wx.stopBluetoothDevicesDiscovery({
      success: function(res) {
        console.log('停止蓝牙设备扫描成功:', res);
      },
      fail: function(err) {
        console.error('停止蓝牙设备扫描失败:', err);
      },
      complete: function() {
        // 解除监听器
        wx.offBluetoothDeviceFound();
      }
    });
    
    // 关闭蓝牙适配器
    wx.closeBluetoothAdapter({
      success: function(res) {
        console.log('关闭蓝牙适配器成功:', res);
      },
      fail: function(err) {
        console.error('关闭蓝牙适配器失败:', err);
      }
    });
  },
  
  // 隐藏扫描结果弹窗
  hideScanResultModal() {
    this.stopScanBeacons();
    this.setData({ showScanResultModal: false });
  },
  
  // 切换调试信息显示
  toggleDebugInfo() {
    this.setData({
      showDebugInfo: !this.data.showDebugInfo
    });
  },
  
  // 设置地图点击事件
  setupMapClickEvent(canvas) {
    console.log('设置地图点击事件');
    // 保存canvas实例，确保在其他函数中可以访问
    this.canvasInstance = canvas;
    
    // 注意：微信小程序中Canvas的点击事件需要在WXML中通过bindtouchstart绑定
    // 在onMapCanvasTouchStart函数中处理实际的点击逻辑
    console.log('已设置地图点击事件处理器，canvas实例已保存');
  },
  
  // 请求从地图上选择坐标
  selectCoordinateFromMap() {
    // 检查是否已加载地图
    if (!this.data.mapInfo.jsonContent) {
      wx.showModal({
        title: '提示',
        content: '请先上传地图',
        showCancel: false
      });
      return;
    }
    
    // 保存当前编辑的Beacon数据
    const currentBeacon = {...this.data.editingBeacon};
    
    // 隐藏Beacon编辑弹窗并进入坐标选择模式
    this.setData({
      showBeaconModal: false,
      tempBeaconData: currentBeacon,  // 保存临时数据
      activeTab: 'map',
      coordSelectMode: true,
      tempSelectedCoords: null  // 清空之前选择的坐标
    });
    
    // 确保地图已经绘制
    setTimeout(() => {
      this.initMapPreview();
    }, 200);
    
    // 显示提示，改用轻提示
    wx.showToast({
      title: '请在地图上点击选择位置',
      icon: 'none',
      duration: 2000
    });
  },
  
  // 修复Canvas触摸事件处理程序
  onMapCanvasTouchStart(e) {
    console.log('mapCanvas触摸事件触发', e);
    
    // 检查是否在坐标选择模式
    if (!this.data.coordSelectMode) {
      console.log('不在坐标选择模式，忽略点击');
      return;
    }
    
    console.log('当前处于坐标选择模式，处理点击事件');
    
    // 获取触摸坐标
    const touch = e.touches[0];
    const x = touch.x;
    const y = touch.y;
    
    console.log('触摸坐标:', x, y);
    
    // 获取当前地图信息，用于调试
    console.log('当前地图信息:', {
      mapScale: this.data.mapScale,
      mapOffset: this.data.mapOffset,
      mapSize: this.data.mapSize
    });
    
    // 转换点击坐标到地图坐标系
    const mapCoords = this.pixelToMeter(x, y);
    
    // 检查坐标是否有效
    if (!mapCoords) {
      console.warn('坐标转换失败，可能点击在地图范围外');
      wx.showToast({
        title: '请在地图区域内点击',
        icon: 'none'
      });
      return;
    }
    
    console.log('地图点击有效，转换后的米坐标:', mapCoords);
    
    // 保存选择的坐标并重绘地图显示选中点
    this.setData({
      tempSelectedCoords: {
        x: parseFloat(mapCoords.x.toFixed(2)),
        y: parseFloat(mapCoords.y.toFixed(2)),
        pixelX: x,
        pixelY: y
      }
    });
    
    // 在地图上绘制选中点
    this.drawSelectedPoint();
    
    // 显示可点击确认的提示
    wx.showToast({
      title: '点击"确认"使用该位置',
      icon: 'none',
      duration: 1500
    });
  },
  
  // 在地图上绘制选中的点
  drawSelectedPoint() {
    if (!this.canvasInstance || !this.data.tempSelectedCoords) return;
    
    // 获取Canvas绘图上下文
    const ctx = this.canvasInstance.getContext('2d');
    
    // 重新绘制地图
    this.drawJSONMap(ctx, this.canvasInstance.width, this.canvasInstance.height);
    
    // 获取选中点的像素坐标
    const { x, y } = this.data.tempSelectedCoords;
    const pixelCoords = this.meterToPixel(x, y);
    
    // 绘制选中点标记 - 红色圆点
    ctx.beginPath();
    ctx.arc(pixelCoords.x, pixelCoords.y, 8, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 0, 0, 0.7)';
    ctx.fill();
    
    // 绘制外边框 - 白色
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 2;
    ctx.stroke();
    
    // 绘制坐标文本
    ctx.font = '12px sans-serif';
    ctx.fillStyle = 'white';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(`(${x}, ${y})`, pixelCoords.x, pixelCoords.y - 12);
  },
  
  // 添加一个统一的函数来处理临时选择的坐标点清理和地图重绘
  coordinateSelectionCleanup() {
    console.log('清理临时选择坐标点并重绘地图');
    
    // 清除临时选择点数据
    this.setData({ 
      tempSelectedCoords: null,
      coordSelectMode: false // 确保坐标选择模式关闭
    });
    
    // 强制重绘当前地图
    if (this.canvasInstance && this.canvasContext) {
      const ctx = this.canvasContext;
      
      // 完全清除Canvas内容 - 使用更彻底的清除方法
      ctx.globalCompositeOperation = 'source-over';
      ctx.clearRect(0, 0, this.canvasInstance.width, this.canvasInstance.height);
      
      console.log('Canvas已完全清除，准备重绘');
      
      // 先用纯色覆盖整个画布，确保之前的内容被完全清除
      ctx.fillStyle = '#f0f0f0';
      ctx.fillRect(0, 0, this.canvasInstance.width, this.canvasInstance.height);
      
      // 延迟执行地图重绘，确保清除操作已完成
      setTimeout(() => {
        // 重新绘制地图和信标
        if (this.data.mapInfo && this.data.mapInfo.jsonContent) {
          console.log('重绘JSON地图');
          this.drawJSONMap(ctx, this.canvasInstance.width, this.canvasInstance.height);
          console.log('重绘信标');
          this.drawBeaconsOnMap(ctx);
        } else {
          // 如果没有地图，绘制默认背景
          ctx.fillStyle = '#f0f0f0';
          ctx.fillRect(0, 0, this.canvasInstance.width, this.canvasInstance.height);
          ctx.strokeStyle = '#cccccc';
          ctx.lineWidth = 2;
          ctx.strokeRect(0, 0, this.canvasInstance.width, this.canvasInstance.height);
        }
      }, 50); // 短暂延迟确保UI更新
    } else {
      console.log('Canvas未初始化，无法重绘地图');
    }
  },
  
  // 取消坐标选择
  cancelCoordinateSelection() {
    console.log('===== 取消坐标选择函数被调用 =====');
    wx.showToast({
      title: '正在取消选择',
      icon: 'none',
      duration: 1000
    });
    
    // 显式更新多个值，避免批量更新可能导致的问题
    this.setData({
      coordSelectMode: false
    }, () => {
      console.log('coordSelectMode已设置为false');
      // 确保UI状态更新后再继续
      this.setData({
        showBeaconModal: true
      }, () => {
        console.log('showBeaconModal已设置为true');
        // 最后更新编辑中的Beacon数据
        this.setData({
          editingBeacon: this.data.tempBeaconData || this.data.editingBeacon
        }, () => {
          console.log('editingBeacon已更新');
          // 确保所有状态都更新后，再执行地图重绘
          setTimeout(() => {
            console.log('准备执行坐标清理和地图重绘');
            this.forceClearCoordinateSelection();
          }, 100);
        });
      });
    });
  },
  
  // 添加一个用于强制清除临时选择点的函数
  forceClearCoordinateSelection() {
    console.log('===== 强制清除临时选择点 =====');
    
    // 先强制清除数据
    this.setData({ 
      tempSelectedCoords: null
    }, () => {
      console.log('tempSelectedCoords已重置为null');
      
      // 在这里进行一次切换标签页的操作，确保回到地图标签页
      if (this.data.activeTab !== 'map') {
        console.log('当前不在地图标签页，先切换到地图标签页');
        this.switchTab({ currentTarget: { dataset: { tab: 'map' } } });
        
        // 给一点时间让地图标签页初始化
        setTimeout(() => {
          this.forceRefreshMapCanvas();
        }, 300);
      } else {
        // 如果已经在地图标签页，直接刷新Canvas
        this.forceRefreshMapCanvas();
      }
    });
  },
  
  // 强制刷新地图画布
  forceRefreshMapCanvas() {
    console.log('===== 强制刷新地图画布 =====');
    
    // 尝试重新初始化Canvas
    if (this.data.activeTab === 'map' && this.data.mapInfo && this.data.mapInfo.jsonContent) {
      console.log('重新初始化地图预览');
      this.initMapPreview();
      
      // 从预览初始化后，可能需要一点时间
      setTimeout(() => {
        if (this.canvasInstance && this.canvasContext) {
          console.log('Canvas成功初始化，开始重绘');
          
          // 提示用户操作已完成
          wx.showToast({
            title: '已取消选择',
            icon: 'success',
            duration: 1000
          });
        } else {
          console.error('Canvas初始化失败，无法重绘地图');
          wx.showToast({
            title: '地图刷新失败',
            icon: 'none',
            duration: 1000
          });
        }
      }, 300);
    } else {
      console.error('无法刷新地图：不在地图标签页或无地图数据');
    }
  },
  
  // 确认坐标选择
  confirmCoordinateSelection() {
    const { tempSelectedCoords, tempBeaconData } = this.data;
    
    if (!tempSelectedCoords) {
      wx.showToast({
        title: '请先在地图上选择坐标',
        icon: 'none'
      });
      return;
    }
    
    console.log('确认选择坐标:', tempSelectedCoords);
    
    // 确保有beacon数据
    if (!tempBeaconData) {
      console.error('没有临时beacon数据，无法确认坐标');
      return;
    }
    
    // 更新beacon数据中的坐标
    const updatedBeacon = {
      ...tempBeaconData,
      x: tempSelectedCoords.x,
      y: tempSelectedCoords.y
    };
    
    // 清理临时状态
    this.coordinateSelectionCleanup();
    
    // 更新编辑中的beacon数据和显示
    this.setData({
      editingBeacon: updatedBeacon,
      [`editingBeacon.x`]: tempSelectedCoords.x.toFixed(2),
      [`editingBeacon.y`]: tempSelectedCoords.y.toFixed(2),
      activeTab: 'beacon', // 切回beacon配置tab
      showBeaconModal: true // 确保beacon编辑弹窗显示
    });
    
    console.log('坐标更新完成, 返回beacon配置');
  },
  
  // 像素坐标转米坐标
  pixelToMeter(pixelX, pixelY) {
    const { mapScale, mapOffset, mapSize } = this.data;
    
    // 检查点击是否在地图范围内
    const minX = mapOffset.x;
    const maxX = mapOffset.x + mapSize.width * mapScale;
    const minY = mapOffset.y;
    const maxY = mapOffset.y + mapSize.height * mapScale;
    
    if (pixelX < minX || pixelX > maxX || pixelY < minY || pixelY > maxY) {
      console.warn('点击位置在地图范围外');
      return null;
    }
    
    // JSON格式直接使用米坐标，需要考虑Y轴反转
    const x = ((pixelX - mapOffset.x) / mapScale).toFixed(2);
    const y = ((mapSize.height - (pixelY - mapOffset.y) / mapScale)).toFixed(2);
    return { x: parseFloat(x), y: parseFloat(y) };
  },
  
  // 米坐标转像素坐标
  meterToPixel(meterX, meterY) {
    const { mapScale, mapOffset, mapSize } = this.data;
    
    // JSON格式直接使用米坐标，需要考虑Y轴反转
    const x = meterX * mapScale + mapOffset.x;
    const y = mapOffset.y + (mapSize.height - meterY) * mapScale;
    return { x, y };
  },
  
  // 绘制beacons到地图上
  drawBeaconsOnMap(ctx) {
    // 获取beacons
    const beacons = this.data.beacons;
    
    if (!beacons || beacons.length === 0) {
      console.log('没有可绘制的信标');
      return;
    }
    
    console.log('绘制信标，共', beacons.length, '个');
    
    // 绘制beacons
    beacons.forEach((beacon, index) => {
      // 计算屏幕坐标
      const pixelCoords = this.meterToPixel(beacon.x, beacon.y);
      
      if (!pixelCoords) {
        console.warn('无法计算信标坐标', beacon);
        return;
      }
      
      const x = pixelCoords.x;
      const y = pixelCoords.y;
      
      console.log(`绘制信标 ${index+1}: (${beacon.x}, ${beacon.y}) => (${x}, ${y})`);
      
      // 绘制信标外圈
      ctx.beginPath();
      ctx.arc(x, y, 10, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(51, 102, 204, 0.2)'; // 浅蓝色透明填充
      ctx.fill();
      
      // 绘制信标内圈
      ctx.beginPath();
      ctx.arc(x, y, 6, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(51, 102, 204, 0.7)'; // 深蓝色填充
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      
      // 绘制信标编号
      ctx.font = 'bold 12px sans-serif';
      ctx.fillStyle = '#333333';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText((index + 1).toString(), x, y);
      
      // 绘制信标详情标签
      ctx.font = '10px sans-serif';
      ctx.fillStyle = '#333333';
      ctx.textAlign = 'start';
      ctx.textBaseline = 'top';
      const majorMinor = `${beacon.major}-${beacon.minor}`;
      ctx.fillText(majorMinor, x + 12, y - 5);
    });
  },
  
  // 添加绘制JSON地图的函数
  drawJSONMap(ctx, canvasWidth, canvasHeight) {
    const jsonData = this.data.mapInfo.jsonContent;
    
    if (!jsonData) {
      console.error('地图数据为空');
      
      // 绘制错误提示
      ctx.fillStyle = 'red';
      ctx.font = '14px sans-serif';
      ctx.fillText('地图数据为空', 20, 30);
      return;
    }
    
    if (!jsonData.entities) {
      console.error('地图数据缺少entities字段');
      
      // 绘制错误提示
      ctx.fillStyle = 'red';
      ctx.font = '14px sans-serif';
      ctx.fillText('地图数据缺少entities字段', 20, 30);
      return;
    }
    
    if (!Array.isArray(jsonData.entities)) {
      console.error('地图数据的entities不是数组');
      
      // 绘制错误提示
      ctx.fillStyle = 'red';
      ctx.font = '14px sans-serif';
      ctx.fillText('地图数据的entities不是数组', 20, 30);
      return;
    }
    
    console.log('开始渲染JSON地图', jsonData);
    
    // 计算缩放以适应canvas
    const mapWidth = jsonData.width || 10; // 提供默认值，避免除以零
    const mapHeight = jsonData.height || 10; // 提供默认值，避免除以零
    
    if (mapWidth <= 0 || mapHeight <= 0) {
      console.error('地图尺寸无效:', mapWidth, mapHeight);
      
      // 绘制错误提示
      ctx.fillStyle = 'red';
      ctx.font = '14px sans-serif';
      ctx.fillText('地图尺寸无效', 20, 30);
      return;
    }
    
    const scale = Math.min(
      (canvasWidth - 40) / mapWidth,  // 留出更多边距
      (canvasHeight - 40) / mapHeight
    ) * 0.85; // 留出更多边距
    
    console.log('JSON地图尺寸:', mapWidth, 'x', mapHeight);
    console.log('Canvas尺寸:', canvasWidth, 'x', canvasHeight);
    console.log('计算缩放比例:', scale);
    
    // 计算偏移以居中显示
    const offsetX = (canvasWidth - mapWidth * scale) / 2;
    const offsetY = (canvasHeight - mapHeight * scale) / 2;
    
    console.log('偏移量:', offsetX, offsetY);
    
    // 清空画布
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);
    
    // 绘制背景和边框
    ctx.fillStyle = '#f8f8f8';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    ctx.strokeStyle = '#cccccc';
    ctx.lineWidth = 1;
    ctx.strokeRect(5, 5, canvasWidth - 10, canvasHeight - 10);
    
    // 绘制地图边界
    ctx.strokeStyle = '#999999';
    ctx.lineWidth = 2;
    ctx.strokeRect(
      offsetX, 
      offsetY, 
      mapWidth * scale, 
      mapHeight * scale
    );
    
    // 绘制网格
    ctx.strokeStyle = '#dddddd';
    ctx.lineWidth = 0.5;
    const gridSize = 1; // 网格大小（米）
    
    // 绘制水平网格线
    for (let y = 0; y <= mapHeight; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(offsetX, offsetY + y * scale);
      ctx.lineTo(offsetX + mapWidth * scale, offsetY + y * scale);
      ctx.stroke();
    }
    
    // 绘制垂直网格线
    for (let x = 0; x <= mapWidth; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(offsetX + x * scale, offsetY);
      ctx.lineTo(offsetX + x * scale, offsetY + mapHeight * scale);
      ctx.stroke();
    }
    
    // 绘制实体
    ctx.strokeStyle = '#333333';
    ctx.lineWidth = 2;
    
    let drawnEntities = 0;
    
    jsonData.entities.forEach(entity => {
      if (!entity || typeof entity !== 'object') {
        console.warn('跳过无效的实体:', entity);
        return;
      }
      
      if (entity.type === 'polyline' && entity.points && Array.isArray(entity.points) && entity.points.length > 0) {
        try {
          ctx.beginPath();
          
          // 检查第一个点是否有效
          if (!Array.isArray(entity.points[0]) || entity.points[0].length < 2) {
            console.warn('无效的点坐标:', entity.points[0]);
            return;
          }
          
          // 移动到第一个点
          const startX = entity.points[0][0] * scale + offsetX;
          const startY = offsetY + mapHeight * scale - entity.points[0][1] * scale; // 反转Y轴
          ctx.moveTo(startX, startY);
          
          // 连接所有点
          for (let i = 1; i < entity.points.length; i++) {
            if (!Array.isArray(entity.points[i]) || entity.points[i].length < 2) {
              console.warn('无效的点坐标，索引:', i, entity.points[i]);
              continue;
            }
            
            const x = entity.points[i][0] * scale + offsetX;
            const y = offsetY + mapHeight * scale - entity.points[i][1] * scale; // 反转Y轴
            ctx.lineTo(x, y);
          }
          
          // 如果是闭合的，连接回起点
          if (entity.closed) {
            ctx.closePath();
          }
          
          // 使用颜色填充
          ctx.fillStyle = entity.fillColor || 'rgba(240, 248, 255, 0.5)'; // 浅蓝色半透明
          ctx.fill();
          
          // 绘制边框
          ctx.strokeStyle = entity.strokeColor || '#333333';
          ctx.stroke();
          drawnEntities++;
        } catch (err) {
          console.error('绘制实体时出错:', err, entity);
        }
      } else {
        console.warn('不支持的实体类型或实体缺少points:', entity.type);
      }
    });
    
    // 绘制坐标轴标签
    ctx.fillStyle = '#666666';
    ctx.font = '12px sans-serif';
    
    // 绘制X轴标签
    for (let x = 0; x <= mapWidth; x += 1) {
      const labelX = x * scale + offsetX;
      const labelY = offsetY + mapHeight * scale + 15;
      ctx.fillText(x.toString(), labelX - 3, labelY);
    }
    
    // 绘制Y轴标签
    for (let y = 0; y <= mapHeight; y += 1) {
      const labelX = offsetX - 20;
      const labelY = offsetY + mapHeight * scale - y * scale + 4;
      ctx.fillText(y.toString(), labelX, labelY);
    }
    
    console.log('绘制完成，成功绘制实体数量:', drawnEntities);
    
    // 保存地图转换参数用于坐标映射
    this.setData({
      mapScale: scale,
      mapOffset: { 
        x: offsetX, 
        y: offsetY 
      },
      mapSize: {
        width: mapWidth,
        height: mapHeight
      },
      currentMapData: jsonData
    });
    
    // 绘制已配置的信标
    this.drawBeaconsOnMap(ctx);
  },

  // 确保在onShow生命周期也清理坐标选择
  onShow: function() {
    // 如果当前是地图标签页，每次页面显示都检查是否需要清理临时选择点
    if (this.data.activeTab === 'map' && this.data.tempSelectedCoords) {
      console.log('页面显示时发现临时选择点，执行清理');
      this.coordinateSelectionCleanup();
    }
  },
}); 