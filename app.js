// app.js
App({
  onLaunch() {
    // 检查蓝牙可用状态
    this.checkBluetoothAvailable();
    
    // 加载本地存储的数据
    this.loadStorageData();
  },

  globalData: {
    beacons: [], // iBeacon配置列表
    mapInfo: null, // 地图信息
    signalPathLossExponent: 2.5, // 默认信号传播因子n
    currentPosition: null, // 当前位置（米坐标）
    isBluetoothAvailable: false // 蓝牙可用状态
  },

  // 检查蓝牙可用状态
  checkBluetoothAvailable() {
    const that = this;
    wx.openBluetoothAdapter({
      success() {
        that.globalData.isBluetoothAvailable = true;
        console.log('蓝牙适配器初始化成功');
        
        // 初始化完成后关闭蓝牙适配器，避免占用资源
        wx.closeBluetoothAdapter();
      },
      fail(err) {
        that.globalData.isBluetoothAvailable = false;
        console.error('蓝牙适配器初始化失败', err);
      }
    });
  },

  // 加载本地存储的数据
  loadStorageData() {
    try {
      // 加载Beacon配置
      const beacons = wx.getStorageSync('beacons');
      if (beacons) {
        this.globalData.beacons = beacons;
      }

      // 加载地图配置
      const mapInfo = wx.getStorageSync('mapInfo');
      if (mapInfo) {
        this.globalData.mapInfo = mapInfo;
      }

      // 加载信号传播因子n
      const n = wx.getStorageSync('signalPathLossExponent');
      if (n) {
        this.globalData.signalPathLossExponent = n;
      }
    } catch (e) {
      console.error('加载本地存储数据失败', e);
    }
  }
}); 