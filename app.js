// app.js
App({
  onLaunch() {
    console.log('应用启动');
    // 初始化全局数据
    this.initGlobalData();
    
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
    isBluetoothAvailable: false, // 蓝牙可用状态
    appVersion: '1.1.0', // 应用版本号
    lastUpdateTime: Date.now() // 最后更新时间
  },
  
  // 初始化全局数据，确保所有字段存在
  initGlobalData() {
    if (!this.globalData.beacons) {
      this.globalData.beacons = [];
    }
    if (!this.globalData.mapInfo) {
      this.globalData.mapInfo = null;
    }
    if (typeof this.globalData.signalPathLossExponent !== 'number') {
      this.globalData.signalPathLossExponent = 2.5;
    }
    if (!this.globalData.currentPosition) {
      this.globalData.currentPosition = null;
    }
    this.globalData.isBluetoothAvailable = false;
    this.globalData.lastUpdateTime = Date.now();
    console.log('全局数据初始化完成');
  },

  // 检查蓝牙可用状态
  checkBluetoothAvailable() {
    const that = this;
    try {
      wx.openBluetoothAdapter({
        success() {
          that.globalData.isBluetoothAvailable = true;
          console.log('蓝牙适配器初始化成功');
          
          // 初始化完成后关闭蓝牙适配器，避免占用资源
          wx.closeBluetoothAdapter({
            fail(err) {
              console.warn('关闭蓝牙适配器失败', err);
            }
          });
        },
        fail(err) {
          that.globalData.isBluetoothAvailable = false;
          console.error('蓝牙适配器初始化失败', err);
        }
      });
    } catch (e) {
      console.error('检查蓝牙时发生异常:', e);
      that.globalData.isBluetoothAvailable = false;
    }
  },

  // 加载本地存储的数据
  loadStorageData() {
    try {
      // 加载Beacon配置
      const beacons = wx.getStorageSync('beacons');
      if (beacons && Array.isArray(beacons)) {
        console.log('从存储加载Beacon配置，数量:', beacons.length);
        this.globalData.beacons = beacons;
        
        // 验证每个beacon的数据有效性
        let hasInvalidBeacons = false;
        for (let i = 0; i < this.globalData.beacons.length; i++) {
          const beacon = this.globalData.beacons[i];
          if (!beacon.uuid) {
            console.warn(`Beacon ${i} 缺少UUID，无效的配置`);
            hasInvalidBeacons = true;
            continue;
          }
          
          if (typeof beacon.x !== 'number' || typeof beacon.y !== 'number' || typeof beacon.txPower !== 'number') {
            console.warn(`Beacon配置需要修复，索引 ${i}:`, beacon);
            // 尝试修复数据
            if (typeof beacon.x === 'string') beacon.x = parseFloat(beacon.x);
            if (typeof beacon.y === 'string') beacon.y = parseFloat(beacon.y);
            if (typeof beacon.txPower === 'string') beacon.txPower = parseFloat(beacon.txPower);
            
            // 再次检查修复后的数据
            if (isNaN(beacon.x) || isNaN(beacon.y) || isNaN(beacon.txPower)) {
              console.error(`无法修复Beacon ${i} 的数据，配置无效`);
              hasInvalidBeacons = true;
            }
          }
        }
        
        if (hasInvalidBeacons) {
          // 移除无效的Beacon
          this.globalData.beacons = this.globalData.beacons.filter(b => 
            b.uuid && !isNaN(b.x) && !isNaN(b.y) && !isNaN(b.txPower)
          );
          console.log('过滤后的有效Beacon数量:', this.globalData.beacons.length);
          
          // 如果过滤后没有有效的Beacon，创建一个空数组
          if (this.globalData.beacons.length === 0) {
            this.globalData.beacons = [];
          }
          
          // 保存修复后的数据
          wx.setStorageSync('beacons', this.globalData.beacons);
        }
      } else {
        console.log('未找到有效的Beacon配置');
        this.globalData.beacons = [];
      }

      // 加载地图配置
      const mapInfo = wx.getStorageSync('mapInfo');
      if (mapInfo) {
        console.log('从存储加载地图配置');
        
        // 验证地图数据
        let isMapValid = false;
        
        if (mapInfo.fileType === 'json') {
          if (mapInfo.jsonContent) {
            try {
              // 如果jsonContent存储为字符串，则解析它
              let jsonContent = mapInfo.jsonContent;
              if (typeof jsonContent === 'string') {
                jsonContent = JSON.parse(jsonContent);
                console.log('解析JSON地图字符串为对象');
              }
              
              // 验证JSON地图结构
              if (typeof jsonContent.width === 'number' && 
                  typeof jsonContent.height === 'number' && 
                  Array.isArray(jsonContent.entities)) {
                  
                // 有效的JSON地图
                this.globalData.mapInfo = {
                  ...mapInfo,
                  jsonContent: jsonContent
                };
                
                isMapValid = true;
                console.log('JSON地图数据有效');
              } else {
                console.warn('JSON地图结构异常，缺少必要字段');
              }
            } catch (e) {
              console.error('解析JSON地图数据失败:', e);
            }
          } else {
            console.warn('地图信息缺少JSON内容');
          }
        } else {
          console.warn('不支持的地图类型:', mapInfo.fileType);
        }
        
        if (!isMapValid) {
          console.warn('地图数据无效，重置为null');
          this.globalData.mapInfo = null;
        }
      } else {
        console.log('未找到存储的地图配置');
        this.globalData.mapInfo = null;
      }

      // 加载信号传播因子
      const n = wx.getStorageSync('signalPathLossExponent');
      if (n) {
        const nValue = Number(n);
        if (!isNaN(nValue) && nValue > 0) {
          console.log('从存储加载信号传播因子:', nValue);
          this.globalData.signalPathLossExponent = nValue;
        } else {
          console.warn('存储的信号传播因子无效，使用默认值:2.5');
          this.globalData.signalPathLossExponent = 2.5;
        }
      } else {
        console.log('未找到存储的信号传播因子，使用默认值:2.5');
        this.globalData.signalPathLossExponent = 2.5;
      }
      
      console.log('本地数据加载完成');
    } catch (e) {
      console.error('加载本地存储数据失败', e);
      // 确保全局数据有效
      this.initGlobalData();
      // 显示错误提示
      wx.showToast({
        title: '加载数据失败，请重新配置',
        icon: 'none',
        duration: 2000
      });
    }
  },
  
  // 保存全局数据到存储
  saveGlobalData() {
    try {
      // 保存beacon配置
      wx.setStorageSync('beacons', this.globalData.beacons);
      
      // 保存地图配置
      if (this.globalData.mapInfo) {
        wx.setStorageSync('mapInfo', this.globalData.mapInfo);
      }
      
      // 保存信号传播因子
      if (typeof this.globalData.signalPathLossExponent === 'number') {
        wx.setStorageSync('signalPathLossExponent', this.globalData.signalPathLossExponent);
      }
      
      this.globalData.lastUpdateTime = Date.now();
      console.log('全局数据保存成功');
      return true;
    } catch (e) {
      console.error('保存全局数据失败', e);
      return false;
    }
  }
}); 