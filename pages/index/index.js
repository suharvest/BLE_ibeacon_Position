const app = getApp();
const beaconManager = require('../../utils/beaconManager');
const svgParser = require('../../utils/svgParser');

Page({
  data: {
    hasMap: false, // 是否已配置地图
    hasBeacons: false, // 是否已配置Beacon
    isLocating: false, // 是否正在进行定位
    detectedBeaconCount: 0, // 检测到的beacon数量
    currentPosition: null, // 当前位置坐标 {x, y}
    beaconsWithDistance: [], // 带距离信息的beacon列表
    showDebugInfo: true, // 是否显示调试信息
    debugPanelExpanded: false // 调试面板是否展开
  },
  
  // 页面加载
  onLoad() {
    // 加载存储的数据
    this.loadAppData();
    
    // 检查蓝牙可用性
    this.checkBluetoothAvailable();
  },
  
  // 页面显示
  onShow() {
    // 重新加载数据（由于可能从配置页返回）
    this.loadAppData();
    
    // 如果正在定位，继续更新画布
    if (this.data.isLocating) {
      this.setupCanvas();
    }
  },
  
  // 页面卸载
  onUnload() {
    // 确保停止定位
    if (this.data.isLocating) {
      this.stopLocating();
    }
  },
  
  // 从应用全局数据加载
  loadAppData() {
    const beacons = app.globalData.beacons || [];
    const mapInfo = app.globalData.mapInfo || null;
    
    this.setData({
      hasBeacons: beacons.length > 0,
      hasMap: !!mapInfo
    });
    
    // 如果有地图信息，初始化Canvas
    if (this.data.hasMap) {
      this.setupCanvas();
    }
  },
  
  // 检查蓝牙是否可用
  checkBluetoothAvailable() {
    wx.openBluetoothAdapter({
      success: () => {
        console.log('蓝牙适配器初始化成功');
        // 初始化完成后关闭适配器，在开始定位时再开启
        wx.closeBluetoothAdapter();
      },
      fail: (err) => {
        console.error('蓝牙适配器初始化失败', err);
        wx.showModal({
          title: '提示',
          content: '蓝牙初始化失败，请确保设备蓝牙已开启',
          showCancel: false
        });
      }
    });
  },
  
  // 设置Canvas并绘制地图
  setupCanvas() {
    const mapInfo = app.globalData.mapInfo;
    if (!mapInfo) return;
    
    const that = this;
    const query = wx.createSelectorQuery();
    
    query.select('#mapCanvas')
      .fields({ node: true, size: true })
      .exec((res) => {
        const canvas = res[0].node;
        // 保存canvas引用
        that.canvas = canvas;
        const ctx = canvas.getContext('2d');
        
        // 设置canvas大小
        canvas.width = res[0].width;
        canvas.height = res[0].height;
        
        // 保存绘图上下文
        that.ctx = ctx;
        
        // 绘制地图
        that.drawMap();
        
        // 如果有当前位置，绘制位置标记
        if (that.data.currentPosition) {
          that.drawPositionMarker(that.data.currentPosition);
        }
      });
  },
  
  // 绘制地图
  drawMap() {
    const mapInfo = app.globalData.mapInfo;
    if (!mapInfo || !mapInfo.svgContent || !this.ctx) return;
    
    // 清空画布
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    
    try {
      // 解析SVG
      const parsedSVG = svgParser.parseSVG(mapInfo.svgContent);
      
      // 计算缩放以适应画布
      const canvasRatio = this.canvas.width / this.canvas.height;
      const svgRatio = parsedSVG.viewBox.width / parsedSVG.viewBox.height;
      
      let scale, offsetX, offsetY;
      
      // 根据宽高比例确定缩放方式
      if (canvasRatio > svgRatio) {
        // Canvas更宽，以高度为基准缩放
        scale = this.canvas.height / parsedSVG.viewBox.height;
        offsetX = (this.canvas.width - parsedSVG.viewBox.width * scale) / 2;
        offsetY = 0;
      } else {
        // Canvas更高，以宽度为基准缩放
        scale = this.canvas.width / parsedSVG.viewBox.width;
        offsetX = 0;
        offsetY = (this.canvas.height - parsedSVG.viewBox.height * scale) / 2;
      }
      
      // 保存地图转换参数用于坐标映射
      this.mapTransform = {
        scale: scale * mapInfo.pixelsPerMeter, // 结合米到像素的比例
        offsetX: offsetX + mapInfo.originX * scale, // 原点X偏移
        offsetY: offsetY + mapInfo.originY * scale  // 原点Y偏移
      };
      
      // 绘制SVG到Canvas
      svgParser.drawSVGToCanvas(this.ctx, parsedSVG, scale, { x: offsetX, y: offsetY });
      
    } catch (e) {
      console.error('绘制地图时出错:', e);
      wx.showToast({
        title: '地图绘制失败',
        icon: 'none'
      });
    }
  },
  
  // 绘制位置标记
  drawPositionMarker(position) {
    if (!position || !this.ctx) return;
    
    // 清除上次绘制的位置
    this.drawMap();
    
    // 转换米坐标到Canvas像素坐标
    const pixelPos = this.meterToPixel(position.x, position.y);
    
    // 绘制定位点（一个圆圈）
    this.ctx.save();
    
    // 外圈
    this.ctx.beginPath();
    this.ctx.arc(pixelPos.x, pixelPos.y, 12, 0, Math.PI * 2);
    this.ctx.fillStyle = 'rgba(51, 102, 204, 0.3)';
    this.ctx.fill();
    
    // 内圈
    this.ctx.beginPath();
    this.ctx.arc(pixelPos.x, pixelPos.y, 6, 0, Math.PI * 2);
    this.ctx.fillStyle = '#3366cc';
    this.ctx.fill();
    
    this.ctx.restore();
  },
  
  // 米坐标转换为画布像素坐标
  meterToPixel(x, y) {
    if (!this.mapTransform) return { x: 0, y: 0 };
    
    const { scale, offsetX, offsetY } = this.mapTransform;
    
    return {
      x: x * scale + offsetX,
      // Canvas坐标系Y轴向下，可能需要反转
      y: y * scale + offsetY
    };
  },
  
  // 开始/停止定位
  toggleLocating() {
    if (this.data.isLocating) {
      this.stopLocating();
    } else {
      this.startLocating();
    }
  },
  
  // 开始定位
  startLocating() {
    // 检查是否有足够的beacon配置
    const beacons = app.globalData.beacons || [];
    if (beacons.length < 3) {
      wx.showModal({
        title: '提示',
        content: '需要至少3个Beacon配置才能进行定位',
        showCancel: false
      });
      return;
    }
    
    // 检查是否有地图
    if (!this.data.hasMap) {
      wx.showModal({
        title: '提示',
        content: '请先上传并配置地图',
        showCancel: false
      });
      return;
    }
    
    // 获取所有beacon的UUID列表
    const uuids = [...new Set(beacons.map(b => b.uuid))];
    
    // 启动beacon发现
    beaconManager.startBeaconDiscovery(uuids, (detectedBeacons) => {
      // 更新检测到的beacon计数
      this.setData({
        detectedBeaconCount: detectedBeacons.length
      });
      
      // 处理beacon数据
      this.processBeaconData(detectedBeacons);
    }).then(() => {
      this.setData({ isLocating: true });
      console.log('开始定位');
    }).catch(err => {
      console.error('开始定位失败', err);
      wx.showModal({
        title: '启动失败',
        content: '无法开始Beacon扫描，请确保蓝牙已开启且授予了定位权限',
        showCancel: false
      });
    });
  },
  
  // 停止定位
  stopLocating() {
    beaconManager.stopBeaconDiscovery().then(() => {
      this.setData({
        isLocating: false,
        detectedBeaconCount: 0,
        beaconsWithDistance: []
      });
      console.log('停止定位');
    }).catch(err => {
      console.error('停止定位失败', err);
    });
  },
  
  // 处理Beacon数据进行定位
  processBeaconData(detectedBeacons) {
    // 获取带距离信息的beacon列表
    const beaconsWithDistance = beaconManager.getBeaconsWithDistance(detectedBeacons);
    
    // 更新调试信息
    this.setData({
      beaconsWithDistance: beaconsWithDistance
    });
    
    // 如果有足够的beacon，计算位置
    if (beaconsWithDistance.length >= 3) {
      const position = beaconManager.calculatePosition(beaconsWithDistance);
      
      if (position) {
        // 更新当前位置
        this.setData({
          currentPosition: position
        });
        
        // 更新全局位置数据
        app.globalData.currentPosition = position;
        
        // 绘制位置标记
        this.drawPositionMarker(position);
      }
    }
  },
  
  // 切换调试面板展开状态
  toggleDebugPanel() {
    this.setData({
      debugPanelExpanded: !this.data.debugPanelExpanded
    });
  },
  
  // 跳转到配置页面
  goToConfig() {
    wx.switchTab({
      url: '/pages/config/config'
    });
  }
}); 