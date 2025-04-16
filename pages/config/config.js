// config.js
const app = getApp();
const svgParser = require('../../utils/svgParser');

Page({
  data: {
    activeTab: 'beacon', // 当前激活的标签页
    beacons: [], // beacon配置列表
    mapInfo: {
      svgContent: '', // SVG文件内容
      pixelsPerMeter: 50, // 比例尺：每米对应多少像素
      originX: 0, // 原点X坐标（像素）
      originY: 0 // 原点Y坐标（像素）
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
    allDevices: [] // 所有扫描到的设备，不仅限于iBeacon
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
        if (mapInfo.svgContent) {
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
    this.setData({ activeTab: tab });
    
    // 如果切换到地图标签页且有地图，初始化预览
    if (tab === 'map' && this.data.mapInfo.svgContent) {
      this.initMapPreview();
    }
  },
  
  // 初始化地图预览
  initMapPreview() {
    const that = this;
    wx.createSelectorQuery()
      .select('#mapPreviewCanvas')
      .fields({ node: true, size: true })
      .exec((res) => {
        if (!res[0]) return;
        
        const canvas = res[0].node;
        const ctx = canvas.getContext('2d');
        
        // 设置canvas大小
        canvas.width = res[0].width;
        canvas.height = res[0].height;
        
        try {
          // 解析SVG
          const parsedSVG = svgParser.parseSVG(that.data.mapInfo.svgContent);
          
          // 计算缩放以适应canvas
          let scale = Math.min(
            canvas.width / parsedSVG.viewBox.width,
            canvas.height / parsedSVG.viewBox.height
          ) * 0.9; // 留出一些边距
          
          // 计算偏移以居中显示
          const offsetX = (canvas.width - parsedSVG.viewBox.width * scale) / 2;
          const offsetY = (canvas.height - parsedSVG.viewBox.height * scale) / 2;
          
          // 绘制SVG
          svgParser.drawSVGToCanvas(ctx, parsedSVG, scale, { x: offsetX, y: offsetY });
          
          // 标记原点位置
          that.drawOriginMarker(ctx, scale, offsetX, offsetY);
        } catch (e) {
          console.error('预览地图出错', e);
        }
      });
  },
  
  // 在地图上标记原点位置
  drawOriginMarker(ctx, scale, offsetX, offsetY) {
    const { originX, originY } = this.data.mapInfo;
    
    // 计算原点在Canvas上的位置
    const x = originX * scale / this.data.mapInfo.pixelsPerMeter + offsetX;
    const y = originY * scale / this.data.mapInfo.pixelsPerMeter + offsetY;
    
    // 绘制原点标记
    ctx.save();
    
    // 十字线
    ctx.beginPath();
    ctx.strokeStyle = 'red';
    ctx.lineWidth = 2;
    
    // 横线
    ctx.moveTo(x - 10, y);
    ctx.lineTo(x + 10, y);
    
    // 竖线
    ctx.moveTo(x, y - 10);
    ctx.lineTo(x, y + 10);
    
    ctx.stroke();
    
    // 圆圈
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 0, 0, 0.5)';
    ctx.fill();
    
    // 标签
    ctx.font = '12px sans-serif';
    ctx.fillStyle = 'red';
    ctx.fillText('(0,0)', x + 8, y - 8);
    
    ctx.restore();
  },
  
  // 上传地图
  uploadMap() {
    const that = this;
    
    wx.chooseMessageFile({
      count: 1,
      type: 'file',
      extension: ['svg'],
      success(res) {
        const filePath = res.tempFiles[0].path;
        
        // 读取SVG文件内容
        const fs = wx.getFileSystemManager();
        fs.readFile({
          filePath: filePath,
          encoding: 'utf-8',
          success(readRes) {
            // 更新地图信息
            that.setData({
              mapInfo: {
                ...that.data.mapInfo,
                svgContent: readRes.data
              }
            });
            
            // 初始化预览
            that.initMapPreview();
            
            wx.showToast({
              title: '地图加载成功',
              icon: 'success'
            });
          },
          fail(err) {
            console.error('读取SVG文件失败', err);
            wx.showModal({
              title: '读取失败',
              content: '无法读取SVG文件，请确保文件格式正确',
              showCancel: false
            });
          }
        });
      },
      fail(err) {
        console.error('选择文件失败', err);
      }
    });
  },
  
  // 更新比例尺设置
  updatePixelsPerMeter(e) {
    const value = parseFloat(e.detail.value) || 0;
    this.setData({
      'mapInfo.pixelsPerMeter': value
    });
  },
  
  // 更新原点X坐标
  updateOriginX(e) {
    const value = parseFloat(e.detail.value) || 0;
    this.setData({
      'mapInfo.originX': value
    });
  },
  
  // 更新原点Y坐标
  updateOriginY(e) {
    const value = parseFloat(e.detail.value) || 0;
    this.setData({
      'mapInfo.originY': value
    });
  },
  
  // 保存地图配置
  saveMapConfig() {
    // 验证输入
    const { pixelsPerMeter } = this.data.mapInfo;
    if (!pixelsPerMeter || pixelsPerMeter <= 0) {
      wx.showModal({
        title: '输入错误',
        content: '请输入有效的比例尺值',
        showCancel: false
      });
      return;
    }
    
    // 保存到全局数据和本地存储
    app.globalData.mapInfo = this.data.mapInfo;
    wx.setStorageSync('mapInfo', this.data.mapInfo);
    
    // 重新绘制预览以更新原点位置
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
    this.setData({
      showBeaconModal: false
    });
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
    
    wx.showToast({
      title: this.data.beaconModalMode === 'edit' ? '编辑成功' : '添加成功',
      icon: 'success'
    });
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
  
  // 开始扫描Beacon
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
        that.setData({ 
          isScanning: false,
          bluetoothStatus: '初始化失败: ' + err.errMsg
        });
        
        // 显示更详细的错误信息
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
          title: '提示',
          content: errorMsg,
          showCancel: false
        });
      }
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
    // 检查是否已存在相同的beacon
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
    const index = e.currentTarget.dataset.index;
    const beacon = this.data.scanResults[index];
    
    // 使用选中的beacon初始化表单
    this.setData({
      showScanResultModal: false,
      isScanning: false,
      showBeaconModal: true,
      beaconModalMode: 'add',
      editingBeaconIndex: -1,
      editingBeacon: {
        uuid: beacon.uuid,
        major: beacon.major.toString(),
        minor: beacon.minor.toString(),
        x: '',
        y: '',
        txPower: '-59' // 默认值，可以根据实际情况调整
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
  }
}); 