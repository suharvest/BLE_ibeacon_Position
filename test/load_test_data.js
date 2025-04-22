/**
 * 测试数据加载工具
 * 用于初始化测试地图和测试信标数据
 */

// 测试地图数据
const TEST_MAP_DATA = {
  width: 4.5,
  height: 4.5,
  entities: [
    {
      type: 'polyline',
      points: [
        [0.2, 0.2],
        [4.3, 0.2],
        [4.3, 4.3],
        [0.2, 4.3],
        [0.2, 0.2]
      ],
      closed: true,
      strokeColor: '#333333',
      fillColor: 'rgba(240, 248, 255, 0.7)'
    }
  ]
};

// 获取应用实例
const app = getApp();

/**
 * 加载测试地图
 * @param {Function} callback 回调函数(success, error)
 */
function loadTestMap(callback) {
  try {
    console.log('正在加载测试地图...');
    
    // 创建地图信息对象
    const mapInfo = {
      jsonContent: TEST_MAP_DATA,
      fileType: 'json'
    };
    
    // 保存到本地存储
    wx.setStorageSync('mapInfo', mapInfo);
    
    // 更新全局数据
    app.globalData.mapInfo = mapInfo;
    
    console.log('测试地图加载成功');
    
    if (typeof callback === 'function') {
      callback(true);
    }
  } catch (e) {
    console.error('加载测试地图失败:', e);
    if (typeof callback === 'function') {
      callback(false, e.message || '未知错误');
    }
  }
}

/**
 * 创建测试信标
 * @param {Function} callback 回调函数(success, error)
 */
function createTestBeacons(callback) {
  try {
    console.log('正在创建测试信标...');
    
    // 创建三个测试信标
    const testBeacons = [
      {
        uuid: '0000FFFF-0000-1000-8000-00805F9B34FB',
        displayName: '测试信标1',
        major: 1,
        minor: 1,
        x: 1.0,
        y: 1.0,
        txPower: -59
      },
      {
        uuid: '0000FFFF-0000-1000-8000-00805F9B34FC',
        displayName: '测试信标2',
        major: 2,
        minor: 2,
        x: 3.5,
        y: 1.0,
        txPower: -59
      },
      {
        uuid: '0000FFFF-0000-1000-8000-00805F9B34FD',
        displayName: '测试信标3',
        major: 3,
        minor: 3,
        x: 2.0,
        y: 3.5,
        txPower: -59
      }
    ];
    
    // 保存到本地存储
    wx.setStorageSync('beacons', testBeacons);
    
    // 更新全局数据
    app.globalData.beacons = testBeacons;
    
    console.log('测试信标创建成功');
    
    if (typeof callback === 'function') {
      callback(true);
    }
  } catch (e) {
    console.error('创建测试信标失败:', e);
    if (typeof callback === 'function') {
      callback(false, e.message || '未知错误');
    }
  }
}

/**
 * 设置信号传播因子
 * @param {Function} callback 回调函数(success, error)
 */
function setSignalFactor(callback) {
  try {
    console.log('正在设置信号传播因子...');
    
    // 设置默认的信号传播因子
    const factor = 2.5;
    
    // 保存到本地存储
    wx.setStorageSync('signalPathLossExponent', factor);
    
    // 更新全局数据
    app.globalData.signalPathLossExponent = factor;
    
    console.log('信号传播因子设置成功');
    
    if (typeof callback === 'function') {
      callback(true);
    }
  } catch (e) {
    console.error('设置信号传播因子失败:', e);
    if (typeof callback === 'function') {
      callback(false, e.message || '未知错误');
    }
  }
}

/**
 * 加载所有测试数据
 * @param {Function} callback 主回调函数(success, error)
 */
function loadAllTestData(callback) {
  // 顺序加载测试数据
  loadTestMap((success, error) => {
    if (!success) {
      if (typeof callback === 'function') {
        callback(false, '加载测试地图失败: ' + (error || '未知错误'));
      }
      return;
    }
    
    createTestBeacons((success, error) => {
      if (!success) {
        if (typeof callback === 'function') {
          callback(false, '创建测试信标失败: ' + (error || '未知错误'));
        }
        return;
      }
      
      setSignalFactor((success, error) => {
        if (!success) {
          if (typeof callback === 'function') {
            callback(false, '设置信号传播因子失败: ' + (error || '未知错误'));
          }
          return;
        }
        
        console.log('所有测试数据加载成功');
        if (typeof callback === 'function') {
          callback(true);
        }
      });
    });
  });
}

// 导出模块
module.exports = {
  loadTestMap,
  createTestBeacons,
  setSignalFactor,
  loadAllTestData
}; 