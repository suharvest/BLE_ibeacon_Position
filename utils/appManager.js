/**
 * 应用程序管理器
 * 整合各模块功能，管理应用程序全局状态
 */

const beaconManager = require('./beaconManager');
const jsonMapRenderer = require('./jsonMapRenderer');
const positionCalculator = require('./positionCalculator');

// 全局状态
let state = {
  initialized: false,
  locating: false,
  hasMap: false,
  configuredBeaconCount: 0,
  bluetoothState: beaconManager.BLUETOOTH_STATE.CLOSED,
  lastPosition: null,
  positionTimestamp: 0,
  positionCount: 0,
  detectedBeacons: [],
  errorMessage: null
};

// 存储命名空间
const STORAGE_KEYS = {
  MAP_INFO: 'app_map_info',
  BEACONS: 'app_beacons',
  SIGNAL_FACTOR: 'app_signal_factor',
  SETTINGS: 'app_settings'
};

// 全局设置
let settings = {
  positioningMethod: positionCalculator.POSITIONING_METHOD.TRILATERATION,
  enableTrajectory: true,
  showBeaconInfo: true,
  debugMode: false
};

// 回调函数
let callbacks = {
  onPositionUpdate: null,
  onStateChange: null,
  onBluetoothStateChange: null,
  onError: null,
  onMapLoaded: null,
  onBeaconsConfigured: null
};

/**
 * 初始化应用程序管理器
 * @param {Object} options 初始化选项
 * @returns {Promise} 初始化结果
 */
function init(options = {}) {
  return new Promise((resolve, reject) => {
    if (state.initialized) {
      resolve(true);
      return;
    }
    
    console.log('初始化应用程序管理器...');
    
    try {
      // 设置回调函数
      if (options.callbacks) {
        setCallbacks(options.callbacks);
      }
      
      // 初始化信标管理器
      beaconManager.init({
        callbacks: {
          onBeaconsDetected: handleBeaconsDetected,
          onBluetoothStateChanged: handleBluetoothStateChanged,
          onError: handleError
        }
      })
      .then(() => loadStoredData())
      .then(() => {
        state.initialized = true;
        updateState();
        console.log('应用程序管理器初始化完成');
        resolve(true);
      })
      .catch(err => {
        console.error('初始化应用程序管理器失败:', err);
        state.errorMessage = '初始化失败: ' + (err.message || err);
        updateState();
        reject(err);
      });
    } catch (err) {
      console.error('初始化应用程序管理器发生异常:', err);
      state.errorMessage = '初始化异常: ' + (err.message || err);
      updateState();
      reject(err);
    }
  });
}

/**
 * 设置回调函数
 * @param {Object} newCallbacks 回调函数
 */
function setCallbacks(newCallbacks) {
  if (typeof newCallbacks !== 'object') return;
  
  // 更新回调
  for (const key in newCallbacks) {
    if (typeof newCallbacks[key] === 'function' && callbacks.hasOwnProperty(key)) {
      callbacks[key] = newCallbacks[key];
    }
  }
}

/**
 * 加载存储的数据
 * @returns {Promise} 加载结果
 */
function loadStoredData() {
  return Promise.allSettled([
    loadMapFromStorage(),
    loadBeaconsFromStorage(),
    loadSettingsFromStorage(),
    loadSignalFactorFromStorage()
  ])
  .then(results => {
    console.log('存储数据加载完成:', 
      `Map=${results[0].status}, Beacons=${results[1].status}, Settings=${results[2].status}, SignalFactor=${results[3].status}`
    );
    results.forEach(result => {
      if (result.status === 'rejected') {
        console.warn('加载部分存储数据失败:', result.reason);
      }
    });
    return true;
  });
}

/**
 * 从存储加载地图
 * @returns {Promise} 加载结果
 */
function loadMapFromStorage() {
  return new Promise((resolve, reject) => {
    try {
      const mapInfoStr = wx.getStorageSync(STORAGE_KEYS.MAP_INFO);
      
      if (!mapInfoStr) {
        state.hasMap = false;
        updateState();
        resolve(false);
        return;
      }
      
      let mapInfo;
      try {
        mapInfo = JSON.parse(mapInfoStr);
      } catch (parseErr) {
        console.error('地图数据解析失败:', parseErr);
        reject(new Error('地图数据格式无效'));
        return;
      }
      
      if (!mapInfo || typeof mapInfo.width !== 'number' || typeof mapInfo.height !== 'number' || !Array.isArray(mapInfo.entities)) {
        console.warn('存储的地图数据无效, 结构:', JSON.stringify({
          hasWidth: typeof mapInfo.width === 'number',
          hasHeight: typeof mapInfo.height === 'number',
          hasEntities: Array.isArray(mapInfo.entities)
        }));
        reject(new Error('地图数据结构无效'));
        return;
      }
      
      state.hasMap = true;
      state.errorMessage = null;
      updateState();
      
      try {
        const success = jsonMapRenderer.setMapInfo(mapInfo);
        if (!success) {
          console.error('地图渲染器加载地图失败');
        }
      } catch (renderErr) {
        console.error('地图渲染器加载地图时出现异常:', renderErr);
      }
      
      if (typeof callbacks.onMapLoaded === 'function') {
        callbacks.onMapLoaded(mapInfo);
      }
      
      resolve(true);
    } catch (err) {
      console.error('从存储加载地图失败:', err);
      state.hasMap = false;
      state.errorMessage = '加载地图失败: ' + (err.message || String(err));
      updateState();
      reject(err);
    }
  });
}

/**
 * 从存储加载信标配置
 * @returns {Promise} 加载结果
 */
function loadBeaconsFromStorage() {
  return new Promise((resolve) => {
    try {
      // 从存储获取信标信息
      const beaconsStr = wx.getStorageSync(STORAGE_KEYS.BEACONS);
      
      if (!beaconsStr) {
        console.log('存储中无信标数据');
        state.configuredBeaconCount = 0;
        beaconManager.setConfiguredBeacons([]);
        updateState(); // 确保状态更新
        resolve(false);
        return;
      }
      
      // 解析信标数据
      let beacons;
      try {
        beacons = JSON.parse(beaconsStr);
      } catch (parseErr) {
        console.error('信标数据解析失败:', parseErr);
        state.configuredBeaconCount = 0;
        state.errorMessage = '信标数据格式无效';
        beaconManager.setConfiguredBeacons([]);
        updateState(); // 确保状态更新
        resolve(false);
        return;
      }
      
      if (!Array.isArray(beacons)) {
        console.warn('存储的信标数据无效');
        state.configuredBeaconCount = 0;
        beaconManager.setConfiguredBeacons([]);
        updateState(); // 确保状态更新
        resolve(false);
        return;
      }
      
      // 确保每个信标有有效的位置和UUID
      const validBeacons = beacons.filter(beacon => 
        beacon && 
        beacon.uuid && 
        typeof beacon.x === 'number' && 
        typeof beacon.y === 'number' &&
        typeof beacon.txPower === 'number'
      );
      
      // 更新信标配置
      beaconManager.setConfiguredBeacons(validBeacons);
      state.configuredBeaconCount = validBeacons.length;
      updateState(); // 确保状态更新
      
      console.log('从存储加载信标配置成功，数量:', validBeacons.length);
      
      // 通知信标配置完成
      if (typeof callbacks.onBeaconsConfigured === 'function') {
        callbacks.onBeaconsConfigured(validBeacons);
      }
      
      resolve(true);
    } catch (err) {
      console.error('从存储加载信标配置失败:', err);
      state.configuredBeaconCount = 0;
      state.errorMessage = '加载信标配置失败: ' + (err.message || String(err));
      beaconManager.setConfiguredBeacons([]);
      updateState(); // 确保状态更新
      resolve(false);
    }
  });
}

/**
 * 从存储加载信号因子
 * @returns {Promise} 加载结果
 */
function loadSignalFactorFromStorage() {
  return new Promise((resolve) => {
    try {
      // 从存储获取信号因子
      const factorStr = wx.getStorageSync(STORAGE_KEYS.SIGNAL_FACTOR);
      
      if (!factorStr) {
        console.log('存储中无信号因子数据，使用默认值');
        resolve(false);
        return;
      }
      
      // 解析信号因子
      const factor = parseFloat(factorStr);
      if (isNaN(factor) || factor <= 0) {
        console.warn('存储的信号因子无效，使用默认值');
        resolve(false);
        return;
      }
      
      // 设置信号因子
      beaconManager.setSignalFactor(factor);
      
      console.log('从存储加载信号因子成功:', factor);
      resolve(true);
    } catch (err) {
      console.error('从存储加载信号因子失败:', err);
      resolve(false);
    }
  });
}

/**
 * 从存储加载应用设置
 * @returns {Promise} 加载结果
 */
function loadSettingsFromStorage() {
  return new Promise((resolve) => {
    try {
      // 从存储获取设置
      const settingsStr = wx.getStorageSync(STORAGE_KEYS.SETTINGS);
      
      if (!settingsStr) {
        console.log('存储中无设置数据，使用默认值');
        resolve(false);
        return;
      }
      
      // 解析设置
      const storedSettings = JSON.parse(settingsStr);
      if (typeof storedSettings !== 'object') {
        console.warn('存储的设置无效，使用默认值');
        resolve(false);
        return;
      }
      
      // 合并设置
      settings = {
        ...settings,
        ...storedSettings
      };
      
      console.log('从存储加载设置成功');
      resolve(true);
    } catch (err) {
      console.error('从存储加载设置失败:', err);
      resolve(false);
    }
  });
}

/**
 * 保存地图信息到存储
 * @param {Object} mapInfo 地图信息
 * @returns {Promise} 保存结果
 */
function saveMapToStorage(mapInfo) {
  return new Promise((resolve, reject) => {
    try {
      if (!mapInfo || typeof mapInfo.width !== 'number' || typeof mapInfo.height !== 'number' || !Array.isArray(mapInfo.entities)) {
        console.error('保存地图失败：无效的地图数据', mapInfo);
        reject(new Error('无效的地图数据'));
        return;
      }
      
      const processedMapInfo = {
        width: mapInfo.width,
        height: mapInfo.height,
        entities: mapInfo.entities.map(entity => {
          // 创建实体的深拷贝
          const newEntity = JSON.parse(JSON.stringify(entity));
          
          // 确保特殊属性正确设置
          if (newEntity.type === 'polyline') {
            // 确保closed属性被保留
            if (entity.hasOwnProperty('closed')) {
              newEntity.closed = Boolean(entity.closed);
            }
            
            // 确保填充属性被保留
            if (entity.hasOwnProperty('fill')) {
              newEntity.fill = Boolean(entity.fill);
            }
            
            // 确保颜色属性被保留
            if (entity.hasOwnProperty('fillColor')) {
              newEntity.fillColor = String(entity.fillColor || 'rgba(240, 248, 255, 0.5)');
            }
            
            if (entity.hasOwnProperty('strokeColor') || entity.hasOwnProperty('color')) {
              newEntity.color = String(entity.strokeColor || entity.color || '#333333');
            }
          }
          
          return newEntity;
        })
      };
      
      const mapInfoStr = JSON.stringify(processedMapInfo);
      wx.setStorage({
        key: STORAGE_KEYS.MAP_INFO,
        data: mapInfoStr,
        success() {
          state.hasMap = true;
          updateState();
          
          // 确保也更新到渲染器
          try {
            const success = jsonMapRenderer.setMapInfo(processedMapInfo);
          } catch (renderErr) {
            console.error('更新渲染器时出错:', renderErr);
          }
          
          // 通知地图加载完成
          if (typeof callbacks.onMapLoaded === 'function') {
            callbacks.onMapLoaded(processedMapInfo);
          }
          
          resolve(true);
        },
        fail(err) {
          console.error('保存地图信息失败:', err);
          reject(err);
        }
      });
    } catch (err) {
      console.error('保存地图信息出错:', err);
      reject(err);
    }
  });
}

/**
 * 保存信标配置到存储
 * @param {Array} beacons 信标数组
 * @returns {Promise} 保存结果
 */
function saveBeaconsToStorage(beacons) {
  return new Promise((resolve, reject) => {
    try {
      if (!Array.isArray(beacons)) {
        console.error('保存信标失败：无效的信标数据');
        reject(new Error('无效的信标数据'));
        return;
      }
      
      // 将信标信息转换为字符串
      const beaconsStr = JSON.stringify(beacons);
      
      // 保存到存储
      wx.setStorage({
        key: STORAGE_KEYS.BEACONS,
        data: beaconsStr,
        success() {
          console.log('信标信息保存成功，数量:', beacons.length);
          
          // 更新信标管理器
          beaconManager.setConfiguredBeacons(beacons);
          state.configuredBeaconCount = beacons.length;
          updateState();
          
          // 通知信标配置完成
          if (typeof callbacks.onBeaconsConfigured === 'function') {
            callbacks.onBeaconsConfigured(beacons);
          }
          
          resolve(true);
        },
        fail(err) {
          console.error('保存信标信息失败:', err);
          reject(err);
        }
      });
    } catch (err) {
      console.error('保存信标信息出错:', err);
      reject(err);
    }
  });
}

/**
 * 保存信号因子到存储
 * @param {Number} factor 信号因子
 * @returns {Promise} 保存结果
 */
function saveSignalFactorToStorage(factor) {
  return new Promise((resolve, reject) => {
    try {
      if (typeof factor !== 'number' || factor <= 0) {
        console.error('保存信号因子失败：无效的参数');
        reject(new Error('无效的信号因子'));
        return;
      }
      
      // 设置到信标管理器
      beaconManager.setSignalFactor(factor);
      
      // 保存到存储
      wx.setStorage({
        key: STORAGE_KEYS.SIGNAL_FACTOR,
        data: factor.toString(),
        success() {
          console.log('信号因子保存成功:', factor);
          resolve(true);
        },
        fail(err) {
          console.error('保存信号因子失败:', err);
          reject(err);
        }
      });
    } catch (err) {
      console.error('保存信号因子出错:', err);
      reject(err);
    }
  });
}

/**
 * 保存设置到存储
 * @returns {Promise} 保存结果
 */
function saveSettingsToStorage() {
  return new Promise((resolve, reject) => {
    try {
      // 将设置转换为字符串
      const settingsStr = JSON.stringify(settings);
      
      // 保存到存储
      wx.setStorage({
        key: STORAGE_KEYS.SETTINGS,
        data: settingsStr,
        success() {
          console.log('设置保存成功');
          resolve(true);
        },
        fail(err) {
          console.error('保存设置失败:', err);
          reject(err);
        }
      });
    } catch (err) {
      console.error('保存设置出错:', err);
      reject(err);
    }
  });
}

/**
 * 更新设置
 * @param {Object} newSettings 新设置
 * @returns {Promise} 更新结果
 */
function updateSettings(newSettings) {
  return new Promise((resolve, reject) => {
    try {
      if (typeof newSettings !== 'object') {
        reject(new Error('无效的设置'));
        return;
      }
      
      // 更新设置
      settings = {
        ...settings,
        ...newSettings
      };
      
      // 保存到存储
      saveSettingsToStorage()
        .then(() => {
          console.log('设置更新并保存成功');
          resolve(true);
        })
        .catch(err => {
          console.warn('设置已更新但保存失败:', err);
          resolve(false);
        });
    } catch (err) {
      console.error('更新设置出错:', err);
      reject(err);
    }
  });
}

/**
 * 开始定位
 * @returns {Promise} 开始结果
 */
function startLocating() {
  if (state.locating) {
    console.log('已经在定位中，忽略重复调用');
    return Promise.resolve(true);
  }
  
  console.log('开始信标定位...');
  
  // 检查配置的信标
  if (state.configuredBeaconCount === 0) {
    const error = new Error('没有配置的信标，无法开始定位');
    handleError(error);
    return Promise.reject(error);
  }
  
  // 重置定位状态
  state.lastPosition = null;
  state.positionTimestamp = 0;
  state.positionCount = 0;
  state.detectedBeacons = [];
  state.errorMessage = null;
  state.locating = true;
  
  updateState();
  
  // 开始扫描信标
  return beaconManager.startScan()
    .catch(err => {
      state.locating = false;
      state.errorMessage = '启动扫描失败: ' + (err.message || err);
      updateState();
      return Promise.reject(err);
    });
}

/**
 * 停止定位
 * @returns {Promise} 停止结果
 */
function stopLocating() {
  if (!state.locating) {
    return Promise.resolve(true);
  }
  
  console.log('停止信标定位');
  state.locating = false;
  updateState();
  
  // 停止扫描
  return beaconManager.stopScan();
}

/**
 * 处理检测到的信标
 * @param {Array} beacons 检测到的信标
 */
function handleBeaconsDetected(beacons) {
  if (!Array.isArray(beacons) || beacons.length === 0) {
    return;
  }
  
  // 更新检测到的信标
  state.detectedBeacons = beacons;
  
  // 至少需要3个信标才能定位
  if (beacons.length < 3) {
    return;
  }
  
  // 根据设置选择定位方法
  const method = settings.positioningMethod;
  
  // 计算位置
  try {
    const position = positionCalculator.calculatePosition(beacons, method);
    
    if (position && typeof position.x === 'number' && typeof position.y === 'number') {
      // 更新位置信息
      state.lastPosition = position;
      state.positionTimestamp = Date.now();
      state.positionCount++;
      state.errorMessage = null;
      
      if (state.positionCount === 1) {
         console.log(`位置更新(${method}): (${position.x.toFixed(2)}, ${position.y.toFixed(2)})`);
      }
      
      // 通知位置更新
      if (typeof callbacks.onPositionUpdate === 'function') {
        callbacks.onPositionUpdate(position, beacons);
      }
    } else {
      console.warn('位置计算结果无效');
    }
  } catch (err) {
    console.error('计算位置出错:', err);
    state.errorMessage = '位置计算错误: ' + (err.message || err);
  }
  
  updateState();
}

/**
 * 处理蓝牙状态变更
 * @param {String} newState 新状态
 */
function handleBluetoothStateChanged(newState) {
  state.bluetoothState = newState;
  
  console.log('蓝牙状态变更:', newState);
  
  // 如果蓝牙不可用，停止定位
  if (state.locating && newState !== beaconManager.BLUETOOTH_STATE.AVAILABLE) {
    console.warn('蓝牙不可用，停止定位');
    stopLocating();
  }
  
  // 通知蓝牙状态变更
  if (typeof callbacks.onBluetoothStateChange === 'function') {
    callbacks.onBluetoothStateChange(newState);
  }
  
  updateState();
}

/**
 * 处理错误
 * @param {Error} error 错误对象
 */
function handleError(error) {
  console.error('应用程序错误:', error);
  
  state.errorMessage = error.message || String(error);
  
  // 通知错误
  if (typeof callbacks.onError === 'function') {
    callbacks.onError(error);
  }
  
  updateState();
}

/**
 * 更新状态
 */
function updateState() {
  // 通知状态变更
  if (typeof callbacks.onStateChange === 'function') {
    callbacks.onStateChange({
      ...state
    });
  }
}

/**
 * 获取应用程序状态
 * @returns {Object} 应用程序状态
 */
function getState() {
  // 获取beaconManager中配置的信标和信号因子
  let configuredBeacons = [];
  let signalFactor = 2.0; // 默认值
  
  try {
    if (beaconManager && typeof beaconManager.getConfiguredBeacons === 'function') {
      configuredBeacons = beaconManager.getConfiguredBeacons() || [];
    }
    
    if (beaconManager && typeof beaconManager.getSignalFactor === 'function') {
      signalFactor = beaconManager.getSignalFactor();
    }
  } catch (err) {
    console.error('获取信标配置信息出错:', err);
  }
  
  return {
    ...state,
    configuredBeacons,
    signalFactor
  };
}

/**
 * 获取设置
 * @returns {Object} 设置
 */
function getSettings() {
  return {
    ...settings
  };
}

/**
 * 初始化渲染器
 * @param {Object} context Canvas上下文
 * @param {Number} width 画布宽度
 * @param {Number} height 画布高度
 * @returns {Boolean} 初始化是否成功
 */
function initRenderer(context, width, height) {
  if (!context) {
    console.error('初始化渲染器失败：无效的上下文');
    return false;
  }
  
  return jsonMapRenderer.init(context, width, height);
}

/**
 * 加载地图数据
 * @param {Object} mapData 地图数据
 * @returns {Promise} 加载结果
 */
function loadMapData(mapData) {
  return new Promise((resolve, reject) => {
    try {
      // 检查地图数据是否有效
      if (!mapData) {
        console.error('加载地图数据失败：地图数据为空');
        reject(new Error('地图数据为空'));
        return;
      }
      
      // 验证地图数据格式
      if (typeof mapData.width !== 'number' || mapData.width <= 0 || 
          typeof mapData.height !== 'number' || mapData.height <= 0) {
        console.error('加载地图数据失败：无效的地图尺寸', mapData);
        reject(new Error('无效的地图尺寸，宽度和高度必须为正数'));
        return;
      }
      
      // 验证entities
      if (!Array.isArray(mapData.entities)) {
        console.error('加载地图数据失败：entities必须是数组');
        reject(new Error('无效的地图数据格式：entities必须是数组'));
        return;
      }
      
      // 检查entities是否有效，并确保关键属性被保留
      let validEntities = mapData.entities.filter(entity => {
        return entity && typeof entity === 'object' && entity.type;
      }).map(entity => {
        // 创建深拷贝并确保保留所有属性
        const newEntity = JSON.parse(JSON.stringify(entity));
        
        // 确保重要属性不丢失
        if (newEntity.type === 'polyline') {
          // 确保closed属性被保留
          if (entity.hasOwnProperty('closed')) {
            newEntity.closed = Boolean(entity.closed);
          }
          
          // 确保填充属性被保留
          if (entity.hasOwnProperty('fill')) {
            newEntity.fill = Boolean(entity.fill);
          }
          
          // 确保颜色属性被保留
          if (entity.hasOwnProperty('fillColor')) {
            newEntity.fillColor = String(entity.fillColor);
          }
          
          if (entity.hasOwnProperty('strokeColor') || entity.hasOwnProperty('color')) {
            newEntity.color = String(entity.strokeColor || entity.color);
          }
        }
        
        return newEntity;
      });
      
      if (validEntities.length === 0) {
        console.warn('地图数据中没有有效的实体');
      }
      
      // 确保地图数据是深拷贝的
      const mapInfoToSave = {
        width: mapData.width,
        height: mapData.height,
        entities: validEntities
      };
      
      // 设置地图信息到渲染器
      const success = jsonMapRenderer.setMapInfo(mapInfoToSave);
      
      if (!success) {
        console.error('设置地图信息到渲染器失败');
        reject(new Error('设置地图信息失败'));
        return;
      }
      
      // 保存到存储
      saveMapToStorage(mapInfoToSave)
        .then(() => {
          state.hasMap = true;
          updateState();
          resolve(true);
        })
        .catch(err => {
          console.warn('地图数据已加载但保存失败:', err);
          state.hasMap = true;
          updateState();
          resolve(false);
        });
    } catch (err) {
      console.error('加载地图数据出错:', err);
      reject(err);
    }
  });
}

/**
 * 渲染地图及元素
 * @param {Object} options 渲染选项
 * @returns {Boolean} 渲染是否成功
 */
function render(options = {}) {
  try {
    if (!jsonMapRenderer) {
      console.error('地图渲染器未初始化');
      return false;
    }
    
    // 检查地图状态
    if (!state.hasMap) {
      console.warn('渲染失败：没有加载地图数据');
      return false;
    }
    
    // 获取渲染器状态
    const rendererState = jsonMapRenderer.getRendererState();
    if (!rendererState || !rendererState.mapInfo || rendererState.mapInfo.width <= 0 || rendererState.mapInfo.height <= 0) {
      console.warn('渲染失败：渲染器中的地图数据无效', rendererState);
      return false;
    }
    
    // 记录地图尺寸和实体数量，用于调试
    console.log(`地图尺寸: ${rendererState.mapInfo.width}x${rendererState.mapInfo.height}, 实体数量: ${rendererState.mapInfo.entities ? rendererState.mapInfo.entities.length : 0}`);
    
    // --- 修改：获取并设置已配置的信标点 --- 
    let configuredBeacons = [];
    try {
      if (beaconManager && typeof beaconManager.getConfiguredBeacons === 'function') {
        configuredBeacons = beaconManager.getConfiguredBeacons() || [];
      }
    } catch (err) {
      console.error('获取已配置信标时出错:', err);
    }
    
    // 过滤掉没有有效坐标的信标
    const validConfiguredBeacons = configuredBeacons.filter(beacon => 
      beacon && typeof beacon.x === 'number' && typeof beacon.y === 'number'
    );
    
    if (validConfiguredBeacons.length > 0) {
      jsonMapRenderer.setBeaconPoints(validConfiguredBeacons);
    } else {
      // 如果没有已配置的信标，清空渲染器中的信标点
      jsonMapRenderer.setBeaconPoints([]);
    }
    // --- 结束修改 ---
    
    // 设置当前位置
    if (state.lastPosition && typeof state.lastPosition.x === 'number' && typeof state.lastPosition.y === 'number') {
      jsonMapRenderer.setCurrentPosition(state.lastPosition.x, state.lastPosition.y);
    }
    
    // 合并渲染选项，默认启用所有元素
    const renderOptions = {
      showGrid: true,
      showAxes: true,
      showMap: true,
      showBeacons: settings.showBeaconInfo !== false, // 确保显示信标的选项为true
      showPosition: true,
      showTrajectory: settings.enableTrajectory !== false,
      ...options
    };
    
    // 执行渲染
    const renderSuccess = jsonMapRenderer.render(renderOptions);
    
    if (!renderSuccess) {
      console.warn('渲染地图失败');
      return false;
    }
    
    return true;
  } catch (err) {
    console.error('渲染地图出错:', err);
    return false;
  }
}

/**
 * 获取渲染器状态
 * @returns {Object} 渲染器状态
 */
function getRendererState() {
  try {
    if (!jsonMapRenderer) {
      console.warn('获取渲染器状态失败：渲染器未初始化');
      return null;
    }
    
    const state = jsonMapRenderer.getRendererState();
    
    // 添加额外信息
    return {
      ...state,
      timestamp: Date.now(),
      appState: {
        initialized: state.initialized,
        locating: state.locating,
        hasMap: state.hasMap,
        configuredBeaconCount: state.configuredBeaconCount,
        detectedBeaconCount: state.detectedBeacons ? state.detectedBeacons.length : 0
      }
    };
  } catch (err) {
    console.error('获取渲染器状态时出错:', err);
    return null;
  }
}

/**
 * 清除轨迹数据
 */
function clearTrajectoryData() {
  try {
    if (jsonMapRenderer && typeof jsonMapRenderer.clearTrajectory === 'function') {
      jsonMapRenderer.clearTrajectory();
      console.log('Trajectory cleared via appManager.');
      // Optionally trigger a state update if needed, though rendering is usually handled by the caller
      // updateState(); 
    } else {
      console.warn('jsonMapRenderer or clearTrajectory function not available.');
    }
  } catch (err) {
    console.error('Error clearing trajectory via appManager:', err);
    handleError(new Error('清除轨迹失败')); // Notify user via error handler
  }
}

module.exports = {
  // 初始化和状态管理
  init,
  setCallbacks,
  getState,
  updateSettings,
  getSettings,
  getRendererState,
  
  // 定位控制
  startLocating,
  stopLocating,
  
  // 数据存储
  saveMapToStorage,
  saveBeaconsToStorage,
  saveSignalFactorToStorage,
  
  // 渲染相关
  initRenderer,
  loadMapData,
  render,
  clearTrajectoryData,
  
  // 常量
  BLUETOOTH_STATE: beaconManager.BLUETOOTH_STATE,
  POSITIONING_METHOD: positionCalculator.POSITIONING_METHOD
}; 