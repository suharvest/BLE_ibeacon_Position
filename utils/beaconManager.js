/**
 * 蓝牙信标管理器
 * 负责扫描和处理蓝牙信标数据
 */

// 蓝牙状态常量
const BLUETOOTH_STATE = {
  CLOSED: 'closed',          // 蓝牙关闭
  UNAUTHORIZED: 'unauthorized', // 未授权
  UNSUPPORTED: 'unsupported',   // 设备不支持
  AVAILABLE: 'available'      // 可用
};

// 距离校准常量（1米处测得的信号强度）
// 这是一个默认值，实际应根据不同设备校准
const DISTANCE_CALIBRATION = -70;

// 信号衰减因子（信号传播环境特性，默认值为2.5）
let signalFactor = 2.5;

// --- NEW: RSSI Filter Settings ---
const RSSI_FILTER_WINDOW_SIZE = 5; // Number of readings to average
let rssiHistory = {}; // Stores recent RSSI values { 'uuid-major-minor': [rssi1, rssi2,...] }
// --- END NEW ---

// 内部状态
let initialized = false;
let isScanning = false;
let bluetoothState = BLUETOOTH_STATE.CLOSED;
let configuredBeacons = [];
let beaconBuffer = [];
let lastBufferProcessTime = 0;
let processTimer = null;

// 回调函数
let callbacks = {
  onBeaconsDetected: null,
  onBluetoothStateChanged: null,
  onError: null
};

/**
 * 初始化信标管理器
 * @param {Object} options 初始化选项
 * @returns {Promise} 初始化结果
 */
function init(options = {}) {
  return new Promise((resolve, reject) => {
    try {
      if (initialized) {
        resolve(true);
        return;
      }
      console.log('初始化信标管理器...');
      
      // 设置回调函数
      if (options.callbacks) {
        setCallbacks(options.callbacks);
      }
      
      checkBluetoothState()
        .then(state => {
          bluetoothState = state;
          console.log('蓝牙状态:', state);
          initialized = true;
          resolve(true);
        })
        .catch(err => {
          console.error('检查蓝牙状态失败:', err);
          bluetoothState = BLUETOOTH_STATE.UNSUPPORTED;
          initialized = true;
          if (callbacks.onBluetoothStateChanged) {
            callbacks.onBluetoothStateChanged(bluetoothState);
          }
          resolve(false);
        });
    } catch (error) {
      console.error('初始化信标管理器出错:', error);
      reject(error);
    }
  });
}

/**
 * 设置回调函数
 * @param {Object} newCallbacks 回调函数集合
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
 * 检查蓝牙状态
 * @returns {Promise<string>} 蓝牙状态
 */
function checkBluetoothState() {
  return new Promise((resolve, reject) => {
    wx.onBluetoothAdapterStateChange((res) => {
      const newRawState = res.available;
      let newState = newRawState ? BLUETOOTH_STATE.AVAILABLE : BLUETOOTH_STATE.CLOSED;

      if (newState !== bluetoothState) {
        console.log(`[beaconManager] 蓝牙状态改变: ${bluetoothState} -> ${newState}`);
        bluetoothState = newState;
        if (callbacks.onBluetoothStateChanged) {
          try {
            callbacks.onBluetoothStateChanged(bluetoothState);
          } catch (callbackErr) {
             console.error('[beaconManager] Error executing onBluetoothStateChanged callback:', callbackErr);
          }
        }
      }
    });
    
    wx.openBluetoothAdapter({
      success: (res) => {
        bluetoothState = BLUETOOTH_STATE.AVAILABLE;
        if (callbacks.onBluetoothStateChanged) {
          callbacks.onBluetoothStateChanged(bluetoothState);
        }
        resolve(bluetoothState);
      },
      fail: (err) => {
        console.error('[beaconManager] openBluetoothAdapter failed:', err);
        let errorState = BLUETOOTH_STATE.CLOSED;
        if (err.errCode === 10001) {
          console.error('[beaconManager] Error: Bluetooth not enabled on device.');
          errorState = BLUETOOTH_STATE.CLOSED; // Or a specific state like UNAVAILABLE?
        } else if (err.errCode === 10009 || err.errMsg.includes('auth')) {
          console.error('[beaconManager] Error: Bluetooth permission denied.');
          errorState = BLUETOOTH_STATE.UNAUTHORIZED;
        } else {
          console.error('[beaconManager] Error: Bluetooth adapter unavailable or unsupported.');
          errorState = BLUETOOTH_STATE.UNSUPPORTED;
        }
        bluetoothState = errorState;
        if (callbacks.onBluetoothStateChanged) {
          callbacks.onBluetoothStateChanged(bluetoothState);
        }
        reject(err);
      },
      complete: () => {
      }
    });
  });
}

/**
 * 设置已配置的信标列表
 * @param {Array} beacons 信标数组
 * @returns {Boolean} 设置是否成功
 */
function setConfiguredBeacons(beacons) {
  if (!Array.isArray(beacons)) {
    console.error('设置信标列表失败：参数必须是数组');
    return false;
  }
  
  // 过滤并验证信标数据
  configuredBeacons = beacons.filter(beacon => {
    // 必须有UUID且为字符串
    if (!beacon.uuid || typeof beacon.uuid !== 'string') {
      console.warn('忽略无效信标：缺少UUID', beacon);
      return false;
    }
    
    // 必须有坐标且为数字
    if (typeof beacon.x !== 'number' || typeof beacon.y !== 'number') {
      console.warn('忽略无效信标：缺少有效坐标', beacon);
      return false;
    }
    
    // 必须有发射功率且为数字
    if (typeof beacon.txPower !== 'number') {
      console.warn('忽略无效信标：缺少发射功率', beacon);
      return false;
    }
    
    return true;
  });
  
  console.log('已设置', configuredBeacons.length, '个有效信标');
  return true;
}

/**
 * 获取已配置的信标列表
 * @returns {Array} 信标数组
 */
function getConfiguredBeacons() {
  return [...configuredBeacons];
}

/**
 * 设置信号衰减因子
 * @param {Number} factor 衰减因子
 * @returns {Boolean} 设置是否成功
 */
function setSignalFactor(factor) {
  if (typeof factor !== 'number' || factor <= 0) {
    console.error('设置信号衰减因子失败：必须为正数');
    return false;
  }
  
  signalFactor = factor;
  console.log('信号衰减因子已设置为:', factor);
  return true;
}

/**
 * 获取当前信号衰减因子
 * @returns {Number} 衰减因子
 */
function getSignalFactor() {
  return signalFactor;
}

/**
 * 开始扫描信标
 * @returns {Promise} 扫描结果
 */
function startScan() {
  return new Promise((resolve, reject) => {
    try {
      if (!initialized) {
        reject(new Error('信标管理器未初始化'));
        return;
      }
      
      if (isScanning) {
        reject(new Error('已经在扫描中，忽略重复调用'));
        return;
      }
      
      if (configuredBeacons.length === 0) {
        reject(new Error('没有配置的信标'));
        return;
      }
      
      checkBluetoothState()
        .then(state => {
          bluetoothState = state;
          
          if (callbacks.onBluetoothStateChanged) {
            callbacks.onBluetoothStateChanged(bluetoothState);
          }
          
          if (state !== BLUETOOTH_STATE.AVAILABLE) {
            reject(new Error('蓝牙不可用'));
            return;
          }
          
          // --- NEW: Clear RSSI history on new scan --- 
          rssiHistory = {}; 
          // --- END NEW ---
          beaconBuffer = [];
          lastBufferProcessTime = 0;
          
          wx.openBluetoothAdapter({
            success: function() {
              startBluetoothDiscovery()
                .then(() => {
                  isScanning = true;
                  console.log('[beaconManager] 开始扫描');
                  startBufferProcessing();
                  resolve(true);
                })
                .catch(err => {
                  console.error('开始蓝牙发现失败:', err);
                  reject(err);
                });
            },
            fail: function(err) {
              console.error('打开蓝牙适配器失败:', err);
              
              if (err.errCode === 10001) {
                bluetoothState = BLUETOOTH_STATE.UNAUTHORIZED;
              } else if (err.errCode === 10000) {
                bluetoothState = BLUETOOTH_STATE.CLOSED;
              } else {
                bluetoothState = BLUETOOTH_STATE.UNSUPPORTED;
              }
              
              if (callbacks.onBluetoothStateChanged) {
                callbacks.onBluetoothStateChanged(bluetoothState);
              }
              
              reject(err);
            }
          });
        })
        .catch(err => {
          console.error('检查蓝牙状态失败:', err);
          reject(err);
        });
    } catch (error) {
      console.error('启动扫描出错:', error);
      reject(error);
    }
  });
}

/**
 * 停止扫描
 * @returns {Promise} 停止结果
 */
function stopScan() {
  return new Promise((resolve, reject) => {
    if (!isScanning) {
      resolve(true);
      return;
    }
    
    console.log('停止信标扫描...');
    
    stopBufferProcessing();
    
    beaconBuffer = [];
    
    isScanning = false;
    
    try {
      wx.stopBeaconDiscovery({
        success: function(res) {
          console.log('停止iBeacon发现成功:', res);
        },
        fail: function(err) {
          console.warn('停止iBeacon发现失败:', err);
        },
        complete: function() {
          wx.offBeaconUpdate();
        }
      });
    } catch (e) {
      console.warn('调用停止iBeacon发现时出错:', e);
    }
    
    wx.stopBluetoothDevicesDiscovery({
      success: function(res) {
        console.log('停止蓝牙设备发现成功:', res);
        
        wx.offBluetoothDeviceFound();
        
        wx.closeBluetoothAdapter({
          success: function(res) {
            console.log('关闭蓝牙适配器成功:', res);
            resolve(true);
          },
          fail: function(err) {
            console.warn('关闭蓝牙适配器失败:', err);
            resolve(true);
          }
        });
      },
      fail: function(err) {
        console.error('停止蓝牙设备发现失败:', err);
        wx.closeBluetoothAdapter({
          complete: function() {
            reject(err);
          }
        });
      }
    });
  });
}

/**
 * 开始蓝牙设备发现
 * @private
 * @returns {Promise} 开始结果
 */
function startBluetoothDiscovery() {
  return new Promise((resolve, reject) => {
    const uuids = configuredBeacons
      .map(beacon => beacon.uuid)
      .filter((uuid, index, self) => self.indexOf(uuid) === index);
    
    if (uuids.length === 0) {
      const error = new Error('没有配置的信标UUID');
      console.error(error.message);
      reject(error);
      return;
    }
    
    wx.onBluetoothDeviceFound(onDeviceFound);
    
    wx.startBeaconDiscovery({
      uuids: uuids,
      ignoreBluetoothAvailable: true, // Continue even if adapter state changes briefly
      success: function(res) {
        console.log('iBeacon discovery started successfully for UUIDs:', uuids);
        wx.onBeaconUpdate(function(res) {
          if (res && res.beacons) {
            res.beacons.forEach(function(beacon) {
                // --- NEW: Apply RSSI Filter for onBeaconUpdate ---
                const key = `${beacon.uuid}-${beacon.major}-${beacon.minor}`;
                if (!rssiHistory[key]) {
                    rssiHistory[key] = [];
                }
                let history = rssiHistory[key];
                history.push(beacon.rssi);
                if (history.length > RSSI_FILTER_WINDOW_SIZE) {
                    history.shift(); // Remove oldest reading
                }
                // Calculate average RSSI
                const sumRssi = history.reduce((acc, val) => acc + val, 0);
                const averageRssi = Math.round(sumRssi / history.length);
                // --- END FILTER LOGIC ---

              const matchingBeacon = configuredBeacons.find(b => 
                b.uuid.toLowerCase() === beacon.uuid.toLowerCase() && 
                b.major === beacon.major && 
                b.minor === beacon.minor
              );
              
              if (matchingBeacon) {
                const detectedBeacon = {
                  uuid: beacon.uuid,
                  major: beacon.major, // Include major/minor for accuracy
                  minor: beacon.minor,
                  name: matchingBeacon.name || '未命名信标', // Use configured display name
                  rssi: averageRssi, // <-- Use filtered RSSI
                  accuracy: beacon.accuracy, // Keep original accuracy if needed elsewhere
                  distance: calculateDistance(averageRssi, matchingBeacon.txPower), // Calculate distance with filtered RSSI
                  x: matchingBeacon.x,
                  y: matchingBeacon.y,
                  timestamp: Date.now()
                };
                
                addToBuffer(detectedBeacon);
              }
            });
          }
        });
        
        startGenericBluetoothDiscovery(resolve, reject);
      },
      fail: function(err) {
        console.warn('iBeacon专用API启动失败，尝试使用通用蓝牙API:', err);
        startGenericBluetoothDiscovery(resolve, reject);
      }
    });
  });
}

/**
 * 启动通用蓝牙设备发现
 * @private
 * @param {Function} resolve Promise解析函数
 * @param {Function} reject Promise拒绝函数
 */
function startGenericBluetoothDiscovery(resolve, reject) {
  wx.startBluetoothDevicesDiscovery({
    services: [],
    allowDuplicatesKey: true,
    success: function() {
      resolve(true);
    },
    fail: function(err) {
      console.error('启动通用蓝牙设备发现失败:', err);
      reject(err);
    }
  });
}

/**
 * 处理发现设备事件 (Generic fallback)
 * @private
 * @param {Object} res 设备信息
 */
function onDeviceFound(res) {
  try {
    if (!isScanning || !res.devices || !Array.isArray(res.devices) || res.devices.length === 0) return;
    res.devices.forEach(device => {
      // Avoid processing if already handled by onBeaconUpdate (check advertisData might not be reliable)
      // A better check might involve comparing deviceId or buffer contents, but can be complex.
      // For now, rely on processDevice filtering logic.
      processDevice(device); 
    });
  } catch (err) {
    console.error('处理发现设备事件出错:', err);
  }
}

/**
 * 处理设备数据 (Generic fallback)
 * @private
 * @param {Object} device 设备信息
 */
function processDevice(device) {
  try {
    if (!device || !device.advertisData) return;
    if (typeof device.RSSI !== 'number') return;

    // Attempt to parse iBeacon data from advertisement
    let iBeaconData = parseAdvertisDataStandard(device.advertisData) || parseAdvertisDataAlternative(device.advertisData);
    
    // If not identifiable as iBeacon via advertisement, skip
    if (!iBeaconData) return; 

    const matchingBeacon = configuredBeacons.find(b => 
        b.uuid.toLowerCase() === iBeaconData.uuid.toLowerCase() &&
        b.major === iBeaconData.major &&
        b.minor === iBeaconData.minor
    );

    // If it doesn't match a configured beacon, skip
    if (!matchingBeacon) return; 

    // --- NEW: Apply RSSI Filter for processDevice ---
    const key = `${iBeaconData.uuid}-${iBeaconData.major}-${iBeaconData.minor}`;
    if (!rssiHistory[key]) {
        rssiHistory[key] = [];
    }
    let history = rssiHistory[key];
    history.push(device.RSSI); // Use raw RSSI from device object
    if (history.length > RSSI_FILTER_WINDOW_SIZE) {
        history.shift();
    }
    const sumRssi = history.reduce((acc, val) => acc + val, 0);
    const averageRssi = Math.round(sumRssi / history.length);
    // --- END FILTER LOGIC ---

    const txPower = matchingBeacon.txPower || iBeaconData.txPower || DISTANCE_CALIBRATION;
    const distance = calculateDistance(averageRssi, txPower); // Calculate distance with filtered RSSI

    // Basic distance validity check
    if (distance === null || distance < 0 || distance > 100) { // Increased upper bound slightly
        // console.log(`Invalid distance calculated: ${distance} for ${key}`);
        return;
    }

    const detectedBeacon = {
      uuid: iBeaconData.uuid,
      major: iBeaconData.major,
      minor: iBeaconData.minor,
      name: matchingBeacon.name || '未命名信标',
      rssi: averageRssi, // <-- Use filtered RSSI
      distance: distance,
      x: matchingBeacon.x,
      y: matchingBeacon.y,
      timestamp: Date.now()
    };

    addToBuffer(detectedBeacon);
  } catch (err) {
    console.error('处理设备数据出错 (processDevice):', err, device);
  }
}

/**
 * 将信标添加到缓冲区
 * @private
 * @param {Object} beacon 信标数据
 */
function addToBuffer(beacon) {
  const existingIndex = beaconBuffer.findIndex(b => b.uuid === beacon.uuid);
  
  if (existingIndex >= 0) {
    beaconBuffer[existingIndex] = beacon;
  } else {
    beaconBuffer.push(beacon);
  }
}

/**
 * 开始处理缓冲区
 * @private
 */
function startBufferProcessing() {
  stopBufferProcessing();
  
  processTimer = setInterval(processBuffer, 1000);
}

/**
 * 停止处理缓冲区
 * @private
 */
function stopBufferProcessing() {
  if (processTimer) {
    clearInterval(processTimer);
    processTimer = null;
  }
}

/**
 * 处理缓冲区中的信标数据
 * @private
 */
function processBuffer() {
  try {
    if (!isScanning) {
      stopBufferProcessing();
      return;
    }
    
    const now = Date.now();
    lastBufferProcessTime = now;
    
    const validBeacons = beaconBuffer.filter(beacon => {
      return (now - beacon.timestamp) < 5000;
    });
    
    beaconBuffer = validBeacons;
    
    if (validBeacons.length > 0 && typeof callbacks.onBeaconsDetected === 'function') {
      callbacks.onBeaconsDetected(validBeacons);
    }
  } catch (err) {
    console.error('处理缓冲区出错:', err);
    
    if (typeof callbacks.onError === 'function') {
      callbacks.onError(err);
    }
  }
}

/**
 * 根据RSSI计算距离
 * @private
 * @param {Number} rssi 信号强度
 * @param {Number} txPower 发射功率
 * @returns {Number} 估算距离（米）
 */
function calculateDistance(rssi, txPower) {
  try {
    if (rssi > txPower) {
      return 0.1;
    }
    
    const distance = Math.pow(10, (txPower - rssi) / (10 * signalFactor));
    
    if (isNaN(distance) || !isFinite(distance) || distance <= 0) {
      return null;
    }
    
    return Math.min(distance, 50);
  } catch (err) {
    console.error('计算距离出错:', err);
    return null;
  }
}

/**
 * 将字节数组转换为十六进制字符串
 * @private
 * @param {Array|Uint8Array} array 字节数组
 * @returns {String} 十六进制字符串
 */
function arrayToHex(array) {
  return Array.prototype.map.call(array, x => ('00' + x.toString(16)).slice(-2)).join('');
}

// --- NEW Helper Functions for Parsing (copied from config.js - should ideally be in a shared util) ---
// Standard iBeacon解析 (主要依据Apple规范)
function parseAdvertisDataStandard(advertisData) {
  try {
      const dataView = new DataView(advertisData);
      for (let i = 0; i <= dataView.byteLength - 25; i++) {
          if (dataView.getUint8(i) === 0x4C && dataView.getUint8(i + 1) === 0x00 &&
              dataView.getUint8(i + 2) === 0x02 && dataView.getUint8(i + 3) === 0x15) {
              const startIndex = i + 4;
              let uuid = '';
              for (let j = 0; j < 16; j++) {
                  uuid += dataView.getUint8(startIndex + j).toString(16).padStart(2, '0');
                  if (j === 3 || j === 5 || j === 7 || j === 9) uuid += '-';
              }
              const major = dataView.getUint16(startIndex + 16, false); // Big-endian
              const minor = dataView.getUint16(startIndex + 18, false); // Big-endian
              const txPower = dataView.getInt8(startIndex + 20);
              return { isIBeacon: true, uuid: uuid.toUpperCase(), major, minor, txPower };
          }
      }
  } catch (e) { /* console.error('标准解析错误', e); */ } // Silence errors in production
  return null;
}

// 备用iBeacon解析 (针对可能省略Apple ID的情况)
function parseAdvertisDataAlternative(advertisData) {
  try {
      const dataView = new DataView(advertisData);
      for (let i = 0; i <= dataView.byteLength - 23; i++) { 
          if (dataView.getUint8(i) === 0x02 && dataView.getUint8(i + 1) === 0x15) {
              const startIndex = i + 2;
              let uuid = '';
              for (let j = 0; j < 16; j++) {
                  uuid += dataView.getUint8(startIndex + j).toString(16).padStart(2, '0');
                  if (j === 3 || j === 5 || j === 7 || j === 9) uuid += '-';
              }
              const major = dataView.getUint16(startIndex + 16, false);
              const minor = dataView.getUint16(startIndex + 18, false);
              const txPower = dataView.getInt8(startIndex + 20);
              return { isIBeacon: true, uuid: uuid.toUpperCase(), major, minor, txPower };
          }
      }
  } catch (e) { /* console.error('备用解析错误', e); */ } // Silence errors in production
  return null;
}
// --- END NEW Helper Functions ---

module.exports = {
  BLUETOOTH_STATE,
  init,
  setCallbacks,
  startScan,
  stopScan,
  setConfiguredBeacons,
  getConfiguredBeacons,
  setSignalFactor,
  getSignalFactor
}; 