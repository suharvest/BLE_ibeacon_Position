// beaconManager.js
const app = getApp();
// RSSI的历史记录，用于滑动平均滤波
const rssiHistory = new Map();
// 滑动平均窗口大小
const SLIDING_WINDOW_SIZE = 5;

/**
 * 开始搜索附近的iBeacon设备
 * @param {Array} uuids 要搜索的UUID列表
 * @param {Function} callback 搜索结果回调
 * @return {Promise}
 */
function startBeaconDiscovery(uuids, callback) {
  return new Promise((resolve, reject) => {
    // 先初始化蓝牙适配器
    wx.openBluetoothAdapter({
      success: () => {
        console.log('蓝牙适配器初始化成功');
        
        // 开始扫描iBeacon
        wx.startBeaconDiscovery({
          uuids: uuids,
          success: () => {
            console.log('开始搜索iBeacon设备', uuids);
            
            // 监听iBeacon设备变化
            wx.onBeaconUpdate((res) => {
              console.log('检测到iBeacon更新:', res.beacons.length);
              if (typeof callback === 'function') {
                callback(res.beacons);
              }
            });
            resolve();
          },
          fail: (err) => {
            console.error('搜索iBeacon设备失败', err);
            reject(err);
          }
        });
      },
      fail: (err) => {
        console.error('蓝牙适配器初始化失败', err);
        reject(err);
      }
    });
  });
}

/**
 * 停止搜索iBeacon设备
 */
function stopBeaconDiscovery() {
  return new Promise((resolve, reject) => {
    wx.stopBeaconDiscovery({
      success: () => {
        console.log('停止搜索iBeacon设备');
        wx.offBeaconUpdate(); // 移除监听器
        resolve();
      },
      fail: (err) => {
        console.error('停止搜索iBeacon设备失败', err);
        reject(err);
      },
      complete: () => {
        // 关闭蓝牙适配器
        wx.closeBluetoothAdapter();
      }
    });
  });
}

/**
 * RSSI滑动平均滤波
 * @param {String} beaconId 标识beacon的唯一ID (uuid-major-minor)
 * @param {Number} rssi 当前的RSSI值
 * @return {Number} 滤波后的RSSI值
 */
function applyRssiFilter(beaconId, rssi) {
  if (!rssiHistory.has(beaconId)) {
    rssiHistory.set(beaconId, []);
  }
  
  const history = rssiHistory.get(beaconId);
  history.push(rssi);
  
  // 保持窗口大小
  if (history.length > SLIDING_WINDOW_SIZE) {
    history.shift();
  }
  
  // 计算平均值
  const sum = history.reduce((acc, val) => acc + val, 0);
  return sum / history.length;
}

/**
 * 根据RSSI计算距离（米）
 * @param {Number} rssi 接收到的信号强度
 * @param {Number} txPower 1米处的参考信号强度
 * @param {Number} n 信号传播因子
 * @return {Number} 估算距离（米）
 */
function calculateDistance(rssi, txPower, n) {
  // 避免计算错误
  if (!rssi || !txPower || !n) {
    return -1;
  }
  
  // 应用公式：d = 10 ^ ((txPower - rssi) / (10 * n))
  return Math.pow(10, (txPower - rssi) / (10 * n));
}

/**
 * 三边测量计算位置
 * @param {Array} beaconDistances 至少3个beacon的距离数组 [{id, x, y, distance}, ...]
 * @return {Object|null} 计算得到的位置 {x, y} 或失败时返回null
 */
function calculatePosition(beaconDistances) {
  // 需要至少3个有效的beacon测距
  if (!beaconDistances || beaconDistances.length < 3) {
    return null;
  }
  
  // 这里使用最小二乘法求解超定方程组
  try {
    // 准备最小二乘法求解的矩阵
    const n = beaconDistances.length;
    
    // 创建系数矩阵A和常数向量b
    // 参考：https://en.wikipedia.org/wiki/True_range_multilateration
    
    // 选择第一个beacon作为参考点
    const refBeacon = beaconDistances[0];
    
    // 构造系数矩阵A和常数向量b
    const matrixA = [];
    const vectorB = [];
    
    for (let i = 1; i < n; i++) {
      const beacon = beaconDistances[i];
      
      // 构造方程：
      // (x - x_i)^2 + (y - y_i)^2 = d_i^2
      // 减去参考方程 (x - x_0)^2 + (y - y_0)^2 = d_0^2 后
      // 得到 2(x_0 - x_i)x + 2(y_0 - y_i)y = d_0^2 - d_i^2 - x_0^2 + x_i^2 - y_0^2 + y_i^2
      
      // 系数部分：2(x_0 - x_i)x + 2(y_0 - y_i)y
      matrixA.push([
        2 * (refBeacon.x - beacon.x),
        2 * (refBeacon.y - beacon.y)
      ]);
      
      // 常数部分：d_0^2 - d_i^2 - x_0^2 + x_i^2 - y_0^2 + y_i^2
      vectorB.push(
        Math.pow(refBeacon.distance, 2) - 
        Math.pow(beacon.distance, 2) - 
        Math.pow(refBeacon.x, 2) + 
        Math.pow(beacon.x, 2) - 
        Math.pow(refBeacon.y, 2) + 
        Math.pow(beacon.y, 2)
      );
    }
    
    // 调用最小二乘法求解
    const result = solveByLeastSquares(matrixA, vectorB);
    if (result) {
      return { x: result[0], y: result[1] };
    }
    
    return null;
  } catch (e) {
    console.error('计算位置时出错', e);
    return null;
  }
}

/**
 * 使用最小二乘法求解线性方程组 Ax = b
 * @param {Array} A 系数矩阵
 * @param {Array} b 常数向量
 * @return {Array|null} 解向量 [x, y] 或失败时返回null
 */
function solveByLeastSquares(A, b) {
  try {
    // 转置矩阵A
    const AT = transpose(A);
    
    // 计算AT*A
    const ATA = multiplyMatrices(AT, A);
    
    // 计算AT*b
    const ATb = multiplyMatrixVector(AT, b);
    
    // 计算(AT*A)的逆
    const inv = inverse2x2(ATA);
    
    if (!inv) {
      console.error('矩阵求逆失败');
      return null;
    }
    
    // 计算x = (AT*A)^(-1) * AT * b
    return multiplyMatrixVector(inv, ATb);
  } catch (e) {
    console.error('最小二乘法求解失败', e);
    return null;
  }
}

// 矩阵转置
function transpose(matrix) {
  const rows = matrix.length;
  const cols = matrix[0].length;
  const result = Array(cols).fill().map(() => Array(rows).fill(0));
  
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      result[j][i] = matrix[i][j];
    }
  }
  
  return result;
}

// 矩阵乘法
function multiplyMatrices(A, B) {
  const rowsA = A.length;
  const colsA = A[0].length;
  const rowsB = B.length;
  const colsB = B[0].length;
  
  if (colsA !== rowsB) {
    throw new Error('矩阵维度不匹配');
  }
  
  const result = Array(rowsA).fill().map(() => Array(colsB).fill(0));
  
  for (let i = 0; i < rowsA; i++) {
    for (let j = 0; j < colsB; j++) {
      for (let k = 0; k < colsA; k++) {
        result[i][j] += A[i][k] * B[k][j];
      }
    }
  }
  
  return result;
}

// 矩阵与向量相乘
function multiplyMatrixVector(A, b) {
  const rows = A.length;
  const cols = A[0].length;
  
  if (cols !== b.length) {
    throw new Error('矩阵与向量维度不匹配');
  }
  
  const result = Array(rows).fill(0);
  
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      result[i] += A[i][j] * b[j];
    }
  }
  
  return result;
}

// 2x2矩阵求逆
function inverse2x2(A) {
  if (A.length !== 2 || A[0].length !== 2) {
    throw new Error('必须是2x2矩阵');
  }
  
  const det = A[0][0] * A[1][1] - A[0][1] * A[1][0];
  
  if (Math.abs(det) < 1e-10) {
    console.error('矩阵接近奇异，不可逆');
    return null;
  }
  
  const invDet = 1 / det;
  
  return [
    [A[1][1] * invDet, -A[0][1] * invDet],
    [-A[1][0] * invDet, A[0][0] * invDet]
  ];
}

/**
 * 获取可用于定位的beacon列表
 * @param {Array} detectedBeacons 检测到的beacon列表
 * @return {Array} 匹配配置的beacon列表，包含位置信息和距离估计
 */
function getBeaconsWithDistance(detectedBeacons) {
  const configuredBeacons = app.globalData.beacons || [];
  const n = app.globalData.signalPathLossExponent || 2.5;
  const beaconsWithDistance = [];
  
  // 对于每个检测到的beacon
  detectedBeacons.forEach(detected => {
    // 在已配置的beacon中查找
    const configured = configuredBeacons.find(
      b => b.uuid === detected.uuid && 
           b.major === detected.major && 
           b.minor === detected.minor
    );
    
    if (configured) {
      // 生成唯一标识
      const beaconId = `${detected.uuid}-${detected.major}-${detected.minor}`;
      
      // 应用滑动平均滤波
      const filteredRssi = applyRssiFilter(beaconId, detected.rssi);
      
      // 计算距离
      const distance = calculateDistance(
        filteredRssi, 
        configured.txPower, 
        n
      );
      
      if (distance > 0) {
        beaconsWithDistance.push({
          id: beaconId,
          x: configured.x,
          y: configured.y,
          distance: distance,
          rssi: filteredRssi
        });
      }
    }
  });
  
  return beaconsWithDistance;
}

module.exports = {
  startBeaconDiscovery,
  stopBeaconDiscovery,
  calculateDistance,
  calculatePosition,
  getBeaconsWithDistance
}; 