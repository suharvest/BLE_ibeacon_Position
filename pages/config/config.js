// config.js
const app = getApp();
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
    try {
      // 从本地存储加载beacon列表
      const beacons = wx.getStorageSync('beacons');
      if (beacons) {
        this.setData({ beacons });
        app.globalData.beacons = beacons;
      }
      
      // 加载地图信息
      const mapInfo = wx.getStorageSync('mapInfo');
      if (mapInfo) {
        this.setData({ mapInfo });
        app.globalData.mapInfo = mapInfo;
        
        // 如果有地图内容，初始化预览
        if (mapInfo.jsonContent) {
          this.initMapPreview();
        }
      }
      
      // 加载信号传播因子
      const n = wx.getStorageSync('signalPathLossExponent');
      if (n) {
        this.setData({ signalPathLossExponent: n });
        app.globalData.signalPathLossExponent = n;
      }
    } catch (e) {
      console.error('加载存储数据失败', e);
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
    
    // 确保临时选择点被清除
    if (this.data.tempSelectedCoords) {
      console.log('发现临时选择坐标，主动清除');
      this.setData({ tempSelectedCoords: null });
    }
    
    const query = wx.createSelectorQuery();
    query.select('#mapCanvas')  // 使用正确的canvas ID
      .fields({ node: true, size: true })
      .exec((res) => {
        if (!res[0] || !res[0].node) {
          console.error('获取Canvas节点失败');
          return;
        }
        
        const canvas = res[0].node;
        console.log('Canvas尺寸:', res[0].width, 'x', res[0].height);
        
        // 设置Canvas大小，适应不同设备
        const width = res[0].width || 300;
        const height = 280; // 固定高度
        canvas.width = width;
        canvas.height = height;
        
        const ctx = canvas.getContext('2d');
        
        // 清空Canvas
        ctx.clearRect(0, 0, width, height);
        
        // 添加边框，便于调试
        ctx.strokeStyle = '#cccccc';
        ctx.lineWidth = 1;
        ctx.strokeRect(0, 0, width, height);
        
        // 获取地图数据
        const mapInfo = this.data.mapInfo;
        
        // 绘制JSON
        if (mapInfo.jsonContent) {
          console.log('准备绘制JSON地图，实体数量:', mapInfo.jsonContent.entities.length);
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
        const tempFilePath = res.tempFiles[0].path;
        const fileName = res.tempFiles[0].name || '';
        const fileSize = res.tempFiles[0].size || 0;
        
        console.log(`选择的文件: 名称=${fileName}, 大小=${fileSize}字节, 路径=${tempFilePath}`);
        
        // 读取JSON文件
        wx.getFileSystemManager().readFile({
          filePath: tempFilePath,
          encoding: 'utf8',
          success: (readRes) => {
            try {
              console.log('JSON文件读取成功, 内容长度:', readRes.data.length);
              
              // 解析JSON
              const jsonData = JSON.parse(readRes.data);
              console.log('JSON解析结果:', jsonData);
              
              // 验证JSON格式
              if (!jsonData.entities || !Array.isArray(jsonData.entities) || !jsonData.width || !jsonData.height) {
                console.error('JSON格式无效, 缺少必要字段');
                wx.showModal({
                  title: '格式错误',
                  content: 'JSON地图格式无效，需要包含width、height和entities字段',
                  showCancel: false
                });
                return;
              }
              
              // 更新地图信息
              const mapInfo = this.data.mapInfo;
              mapInfo.jsonContent = jsonData;
              mapInfo.fileType = 'json';
              this.setData({ 
                mapInfo,
                activeTab: 'map'  // 切换到地图标签页
              });
              
              // 初始化地图预览
              setTimeout(() => {
                this.initMapPreview();
              }, 300);  // 添加延时确保DOM已更新
              
              wx.showToast({
                title: '地图导入成功',
                icon: 'success'
              });
            } catch (error) {
              console.error('JSON解析失败:', error);
              wx.showModal({
                title: 'JSON解析失败',
                content: `错误信息: ${error.message || '未知错误'}`,
                showCancel: false
              });
            }
          },
          fail: (err) => {
            console.error('JSON文件读取失败:', err);
            wx.showToast({
              title: '地图导入失败',
              icon: 'none'
            });
          }
        });
      },
      fail: (err) => {
        console.error('选择文件失败:', err);
      }
    });
  },
  
  // 保存地图配置
  saveMapConfig() {
    // 保存到全局数据和本地存储
    app.globalData.mapInfo = this.data.mapInfo;
    wx.setStorageSync('mapInfo', this.data.mapInfo);
    
    // 重新绘制预览
    this.initMapPreview();
    
    wx.showToast({
      title: '配置已保存',
      icon: 'success'
    });
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
    // 保存到全局数据和本地存储
    app.globalData.signalPathLossExponent = this.data.signalPathLossExponent;
    wx.setStorageSync('signalPathLossExponent', this.data.signalPathLossExponent);
    
    wx.showToast({
      title: '设置已保存',
      icon: 'success'
    });
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
    // 验证输入
    const { uuid, major, minor, x, y, txPower } = this.data.editingBeacon;
    
    if (!uuid) {
      wx.showModal({
        title: '输入错误',
        content: '请输入UUID',
        showCancel: false
      });
      return;
    }
    
    if (!major) {
      wx.showModal({
        title: '输入错误',
        content: '请输入Major值',
        showCancel: false
      });
      return;
    }
    
    if (!minor) {
      wx.showModal({
        title: '输入错误',
        content: '请输入Minor值',
        showCancel: false
      });
      return;
    }
    
    if (!x || !y) {
      wx.showModal({
        title: '输入错误',
        content: '请输入位置坐标',
        showCancel: false
      });
      return;
    }
    
    if (!txPower) {
      wx.showModal({
        title: '输入错误',
        content: '请输入信号功率',
        showCancel: false
      });
      return;
    }
    
    // 处理数据类型
    const beaconData = {
      uuid: uuid.trim(),
      major: parseInt(major),
      minor: parseInt(minor),
      x: parseFloat(x),
      y: parseFloat(y),
      txPower: parseFloat(txPower)
    };
    
    // 生成唯一ID
    beaconData.id = `${beaconData.uuid}-${beaconData.major}-${beaconData.minor}`;
    
    // 检查是否已存在相同的beacon
    const isExisting = this.data.beacons.findIndex(b => 
      b.uuid === beaconData.uuid && 
      b.major === beaconData.major && 
      b.minor === beaconData.minor && 
      this.data.editingBeaconIndex !== this.data.beacons.indexOf(b)
    );
    
    if (isExisting !== -1) {
      wx.showModal({
        title: '添加失败',
        content: '已存在相同UUID、Major和Minor的Beacon',
        showCancel: false
      });
      return;
    }
    
    // 更新或添加beacon
    const beacons = [...this.data.beacons];
    
    if (this.data.beaconModalMode === 'edit' && this.data.editingBeaconIndex >= 0) {
      // 编辑模式
      beacons[this.data.editingBeaconIndex] = beaconData;
    } else {
      // 添加模式
      beacons.push(beaconData);
    }
    
    // 更新数据
    this.setData({
      beacons: beacons,
      showBeaconModal: false
    });
    
    // 保存到全局数据和本地存储
    app.globalData.beacons = beacons;
    wx.setStorageSync('beacons', beacons);
    
    // 显示成功提示
    wx.showToast({
      title: this.data.beaconModalMode === 'edit' ? '编辑成功' : '添加成功',
      icon: 'success'
    });
    
    // 如果当前是地图标签页，立即更新地图显示
    if (this.data.activeTab === 'map' && this.canvasInstance) {
      // 获取Canvas绘图上下文
      const ctx = this.canvasInstance.getContext('2d');
      // 重新绘制地图和所有信标
      this.drawJSONMap(ctx, this.canvasInstance.width, this.canvasInstance.height);
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
    
    // 保存到全局数据和本地存储
    app.globalData.beacons = beacons;
    wx.setStorageSync('beacons', beacons);
    
    wx.showToast({
      title: '删除成功',
      icon: 'success'
    });
  },
  
  // 开始扫描Beacon，增加错误处理
  startScanBeacons() {
    // 显示扫描结果弹窗
    this.setData({
      showScanResultModal: true,
      isScanning: true,
      scanResults: [],
      bluetoothStatus: '初始化中',
      lastAdvertData: '',
      scannedDevicesCount: 0
    });
    
    const that = this;
    
    // 先尝试关闭蓝牙适配器，以防已经打开
    wx.closeBluetoothAdapter({
      complete: function() {
        console.log('尝试关闭蓝牙适配器');
        // 无论成功失败，都继续初始化
        that.initBluetooth();
      }
    });
  },
  
  // 初始化蓝牙
  initBluetooth() {
    const that = this;
    
    // 初始化蓝牙
    wx.openBluetoothAdapter({
      success: function() {
        console.log('蓝牙适配器初始化成功');
        that.setData({ bluetoothStatus: '已初始化' });
        
        // 获取蓝牙适配器状态
        wx.getBluetoothAdapterState({
          success: function(res) {
            console.log('蓝牙适配器状态:', res);
            that.setData({ 
              bluetoothStatus: `可用: ${res.available}, 搜索中: ${res.discovering}` 
            });
            
            if (res.available) {
              if (res.discovering) {
                // 如果已经在搜索，先停止
                wx.stopBluetoothDevicesDiscovery({
                  success: function() {
                    that.startDiscovery();
                  }
                });
              } else {
                that.startDiscovery();
              }
            } else {
              console.error('蓝牙适配器不可用');
              that.setData({ 
                isScanning: false,
                bluetoothStatus: '蓝牙不可用'
              });
              wx.showToast({
                title: '蓝牙不可用',
                icon: 'none'
              });
            }
          },
          fail: function(err) {
            console.error('获取蓝牙适配器状态失败', err);
            that.setData({ 
              isScanning: false,
              bluetoothStatus: '获取状态失败: ' + err.errMsg
            });
          }
        });
      },
      fail: function(err) {
        console.error('初始化蓝牙适配器失败', err);
        
        // 如果错误是已经打开，则继续
        if (err.errCode === 10001) {
          console.log('蓝牙适配器已经打开，继续扫描');
          that.setData({ bluetoothStatus: '蓝牙已打开，继续扫描' });
          // 获取蓝牙适配器状态并继续
          wx.getBluetoothAdapterState({
            success: function(res) {
              if (res.available) {
                if (res.discovering) {
                  wx.stopBluetoothDevicesDiscovery({
                    complete: function() {
                      that.startDiscovery();
                    }
                  });
                } else {
                  that.startDiscovery();
                }
              }
            },
            fail: function() {
              that.showBluetoothError('无法获取蓝牙状态');
            }
          });
          return;
        }
        
        that.setData({ 
          isScanning: false,
          bluetoothStatus: '初始化失败: ' + err.errMsg
        });
        
        // 显示更详细的错误信息
        that.showBluetoothError(err);
      }
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
  
  // 开始搜索设备
  startDiscovery() {
    const that = this;
    
    // 开始搜索附近的蓝牙设备
    wx.startBluetoothDevicesDiscovery({
      allowDuplicatesKey: true, // 允许重复上报，以更新RSSI
      powerLevel: 'high', // 高功率扫描
      success: function() {
        console.log('开始扫描蓝牙设备');
        that.setData({ bluetoothStatus: '扫描中' });
        
        // 先清除现有的监听器，避免重复
        wx.offBluetoothDeviceFound();
        
        // 清空已扫描到的设备计数
        that.setData({ 
          scannedDevicesCount: 0,
          allDevices: []
        });
        
        // 监听设备发现事件
        wx.onBluetoothDeviceFound(function(res) {
          console.log('发现蓝牙设备:', res);
          
          // 更新已扫描设备数
          that.setData({ 
            scannedDevicesCount: that.data.scannedDevicesCount + res.devices.length,
            allDevices: [...that.data.allDevices, ...res.devices.map(d => d.deviceId)]
          });
          
          // 处理搜索到的设备
          res.devices.forEach(function(device) {
            // 尝试作为普通蓝牙设备添加
            let isBeacon = false;
            let beaconData = null;
            
            // 调试信息：记录最近的广播数据
            if (device.advertisData) {
              const hexData = Array.from(new Uint8Array(device.advertisData))
                .map(b => '0x' + b.toString(16).padStart(2, '0'))
                .join(' ');
              
              console.log(`设备 ${device.deviceId} 广播数据:`, hexData);
              that.setData({ lastAdvertData: hexData });
              
              // 尝试解析iBeacon数据
              beaconData = that.parseAdvertisData(device.advertisData);
              if (beaconData && beaconData.isIBeacon) {
                isBeacon = true;
                console.log('成功识别为iBeacon:', beaconData);
              }
            }
            
            // 如果是iBeacon，添加到结果中
            if (isBeacon && beaconData) {
              that.addBeaconToScanResults({
                uuid: beaconData.uuid,
                major: beaconData.major,
                minor: beaconData.minor,
                rssi: device.RSSI,
                txPower: beaconData.txPower,
                id: `${beaconData.uuid}-${beaconData.major}-${beaconData.minor}`
              });
            } 
            // 如果不是iBeacon但有名称，也添加到列表
            else if (device.name) {
              // 一些设备可能不是标准的iBeacon格式，但仍可用于定位
              console.log('添加普通蓝牙设备:', device.name);
              that.addBeaconToScanResults({
                uuid: device.deviceId || 'unknown',
                major: undefined,
                minor: undefined,
                rssi: device.RSSI,
                name: device.name,
                id: device.deviceId
              });
            }
          });
        });
      },
      fail: function(err) {
        console.error('开始搜索蓝牙设备失败', err);
        that.setData({ 
          isScanning: false,
          bluetoothStatus: '扫描失败: ' + err.errMsg
        });
        wx.showToast({
          title: '扫描失败',
          icon: 'none'
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
  
  // 添加扫描到的beacon到结果列表
  addBeaconToScanResults(beacon) {
    // 检查是否已存在于已配置的Beacon列表中 - 仅根据UUID去重
    const isConfigured = this.data.beacons.some(item => 
      item.uuid === beacon.uuid
    );
    
    // 如果已配置过，忽略此Beacon
    if (isConfigured) {
      console.log('忽略已配置的Beacon UUID:', beacon.uuid);
      return;
    }
    
    // 检查是否已存在相同的beacon在扫描结果中
    const index = this.data.scanResults.findIndex(item => item.id === beacon.id);
    
    if (index >= 0) {
      // 更新已有的beacon
      const scanResults = [...this.data.scanResults];
      scanResults[index] = beacon;
      this.setData({ scanResults });
    } else {
      // 添加新的beacon
      this.setData({
        scanResults: [...this.data.scanResults, beacon]
      });
    }
  },
  
  // 从扫描结果中选择beacon
  selectBeaconFromScan(e) {
    console.log('选择扫描到的Beacon:', e);
    const index = e.currentTarget.dataset.index;
    const beacon = this.data.scanResults[index];
    
    console.log('选中的beacon:', beacon);
    
    // 使用选中的beacon初始化表单
    this.setData({
      showScanResultModal: false,
      isScanning: false,
      showBeaconModal: true,
      beaconModalMode: 'add',
      editingBeaconIndex: -1,
      editingBeacon: {
        uuid: beacon.uuid || '',
        major: beacon.major !== undefined ? beacon.major.toString() : '0',
        minor: beacon.minor !== undefined ? beacon.minor.toString() : '0',
        x: '',
        y: '',
        txPower: beacon.txPower ? beacon.txPower.toString() : '-59' // 默认值
      }
    });
    
    // 停止扫描
    this.stopScanBeacons();
  },
  
  // 停止扫描Beacon
  stopScanBeacons() {
    this.setData({ 
      isScanning: false,
      bluetoothStatus: '已停止扫描'
    });
    
    // 停止搜索蓝牙设备
    wx.stopBluetoothDevicesDiscovery({
      success: function(res) {
        console.log('停止扫描成功:', res);
      },
      fail: function(err) {
        console.error('停止扫描失败:', err);
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
  
  // 确认选择的坐标
  confirmCoordinateSelection() {
    if (!this.data.tempSelectedCoords) {
      wx.showToast({
        title: '请先选择位置',
        icon: 'none'
      });
      return;
    }
    
    // 获取临时保存的beacon数据和选中的坐标
    const tempBeacon = this.data.tempBeaconData || {};
    const { x, y } = this.data.tempSelectedCoords;
    
    // 更新坐标并返回编辑弹窗
    this.setData({
      coordSelectMode: false,  // 关闭坐标选择模式
      showBeaconModal: true,   // 重新显示编辑弹窗
      editingBeacon: {
        ...tempBeacon,
        x: x.toFixed(2),
        y: y.toFixed(2)
      }
    });
    
    // 使用统一的函数清理临时选择点并重绘地图
    this.coordinateSelectionCleanup();
    
    // 显示成功提示
    wx.showToast({
      title: '位置已确认',
      icon: 'success'
    });
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
    
    if (!jsonData || !jsonData.entities || !jsonData.entities.length) {
      console.error('无效的JSON地图数据');
      
      // 绘制错误提示
      ctx.fillStyle = 'red';
      ctx.font = '14px sans-serif';
      ctx.fillText('无效的JSON地图数据', 20, 30);
      return;
    }
    
    console.log('开始渲染JSON地图', jsonData);
    
    // 计算缩放以适应canvas
    const mapWidth = jsonData.width;
    const mapHeight = jsonData.height;
    
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
      if (entity.type === 'polyline' && entity.points && entity.points.length > 0) {
        ctx.beginPath();
        
        // 移动到第一个点
        const startX = entity.points[0][0] * scale + offsetX;
        const startY = offsetY + mapHeight * scale - entity.points[0][1] * scale; // 反转Y轴
        ctx.moveTo(startX, startY);
        
        // 连接所有点
        for (let i = 1; i < entity.points.length; i++) {
          const x = entity.points[i][0] * scale + offsetX;
          const y = offsetY + mapHeight * scale - entity.points[i][1] * scale; // 反转Y轴
          ctx.lineTo(x, y);
        }
        
        // 如果是闭合的，连接回起点
        if (entity.closed) {
          ctx.closePath();
        }
        
        // 使用颜色填充
        ctx.fillStyle = 'rgba(240, 248, 255, 0.5)'; // 浅蓝色半透明
        ctx.fill();
        
        // 绘制边框
        ctx.stroke();
        drawnEntities++;
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