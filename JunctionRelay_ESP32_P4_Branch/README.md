# JunctionRelay

**Arduino Demo for ESP32 Family Devices**

## Device Mode Support

JunctionRelay supports multiple communication and gateway modes across its supported ESP32 family devices:

| Device                    | wifi | ethernet | usb_direct | espnow | gateway_wifi | gateway_eth | gateway_usb |
|---------------------------|------|----------|------------|--------|--------------|-------------|-------------|
| Silicognition wESP32      | ✅   |   ✅     |    ✅      |  ✅    |     ✅       |     ✅      |     ✅      |
| CrowPanel 5 inch          | ✅   |          |     ?      |  ✅    |     ✅       |             |     ?       |
| CrowPanel 7 inch          | ✅   |          |     ?      |  ✅    |     ✅       |             |     ?       |
| Adafruit QT Py ESP32-S3   | ✅   |          |    ✅      |  ✅    |     ✅       |             |     ✅      |
| Adafruit Matrix ESP32-S3  | ✅   |          |    ✅      |  ✅    |     ✅       |             |     ✅      |
| Adafruit Feather ESP32-S3 | ✅   |          |    ✅      |  ✅    |     ✅       |             |     ✅      |
| LilyGo T4 S3 ESP32-S3     | ✅   |          |    ✅      |  ✅    |     ✅       |             |     ✅      |
| Adafruit SparkleMotion    | ✅   |          |    ✅      |  ✅    |     ✅       |             |     ✅      |

---

## Device Functionality Matrix

The following table shows the default hardware capabilities and features enabled for each supported device. Feel free to modify the code to enable/expand functionality, either in the firmware or as an override in JunctionRelay.

| Feature/Capability | wESP32 | CrowPanel5 | CrowPanel7 | QT Py S3 | Matrix S3 | Feather S3 | LilyGo T4 | SparkleMotion |
|-------------------|--------|------------|------------|----------|-----------|------------|-----------|---------------|
| **Display & Visual** |
| Onboard Screen | ❌ | ✅ 5" RGB LCD | ✅ 7" RGB LCD | ❌ | ❌ | ❌ | ✅ AMOLED | ❌ |
| Onboard LED | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Onboard RGB LED | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| External Matrix | ❌ | ❌ | ❌ | ❌ | ✅ 64x32 | ❌ | ❌ | ❌ |
| External NeoPixels | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ |
| External I2C Devices | ❌ | ❌ | ❌ | ✅ | ❌ | ✅ | ❌ | ✅ |
| **Input & Sensors** |
| Buttons | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Touch Screen | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ |
| Battery Support | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Connectivity** |
| Wi-Fi | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Ethernet | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Bluetooth/BLE | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| USB Direct | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| ESP-NOW | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Protocols** |
| HTTP | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| MQTT | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| WebSockets | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Audio & Storage** |
| Speaker | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| MicroSD | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Role** |
| Gateway Device | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

### Hardware Specifications

| Device | MCU | Flash | PSRAM | Wireless |
|--------|-----|-------|-------|----------|
| **Silicognition wESP32** | ESP32 Dual Core 240MHz | 16 MB | 4 MB | 2.4 GHz Wi-Fi & Bluetooth 5 (LE) + Ethernet |
| **CrowPanel 5"** | ESP32-S3-WROOM-1-N4R8 | 4 MB | 8 MB | 2.4 GHz Wi-Fi & Bluetooth 5 (LE) |
| **CrowPanel 7"** | ESP32-S3-WROOM-1-N4R8 | 4 MB | 8 MB | 2.4 GHz Wi-Fi & Bluetooth 5 (LE) |
| **QT Py ESP32-S3** | ESP32-S3 Dual Core 240MHz | 4 MB | 2 MB | 2.4 GHz Wi-Fi & Bluetooth 5 (LE) |
| **Matrix ESP32-S3** | ESP32-S3 Dual Core 240MHz | 4 MB | 2 MB | 2.4 GHz Wi-Fi & Bluetooth 5 (LE) |
| **Feather ESP32-S3** | ESP32-S3 Dual Core 240MHz | 8 MB | N/A | 2.4 GHz Wi-Fi & Bluetooth 5 (LE) |
| **LilyGo T4 S3** | ESP32-S3R8 Dual-core LX7 | 16 MB | 8 MB | 2.4 GHz Wi-Fi & Bluetooth 5 (LE) |
| **SparkleMotion Mini** | ESP32 Dual Core 240MHz | 4 MB | N/A | 2.4 GHz Wi-Fi & Bluetooth 4.2 |

---

## Arduino IDE Configuration Settings

For all devices, if you wish to use OTA Firmware updates, be sure to set the Partition Scheme to **Minimal SPIFFS 1.9MB APP with OTA/190KB SPIFFS**.

To take advantage of Native USB functionality (**HIGHLY recommended if you plan to use the device in USB mode**), you must be sure to configure the device appropriately in Arduino IDE. Note that if you are flashing with 1 of the pre-compiled releases, these settings are already applied to the bootloader so go ahead and flash with the online ESPTOOL at https://espressif.github.io/esptool-js

| Device | Board Type | USB Mode | CDC On Boot | Upload Mode | Notes |
|--------|------------|----------|-------------|-------------|-------|
| Silicognition wESP32 | ESP32 | USB-OTG (TinyUSB) | N/A      | UART0/Hardware CDC | Standard ESP32 with USB-OTG |
| CrowPanel 5 inch | ESP32-S3 | USB-OTG (TinyUSB) | Disabled | UART0/Hardware CDC | **CDC on boot must stay disabled** |
| CrowPanel 7 inch | ESP32-S3 | USB-OTG (TinyUSB) | Disabled | UART0/Hardware CDC | **CDC on boot must stay disabled** |
| Adafruit QT Py ESP32-S3 | ESP32-S3 | USB-OTG (TinyUSB) | Enabled | UART0/Hardware CDC | Native USB with CDC |
| Adafruit Matrix ESP32-S3 | ESP32-S3 | USB-OTG (TinyUSB) | Enabled | UART0/Hardware CDC | Native USB with CDC |
| Adafruit Feather ESP32-S3 | ESP32-S3 | USB-OTG (TinyUSB) | Enabled | UART0/Hardware CDC | Native USB with CDC |
| LilyGo T4 S3 | ESP32-S3 | USB-OTG (TinyUSB) | Enabled | UART0/Hardware CDC | Native USB with CDC |
| Adafruit SparkleMotion | ESP32 | USB-OTG (TinyUSB) | Enabled | UART0/Hardware CDC | Native USB with CDC |

### Configuration Parameter Reference

| Setting | Value | Description |
|---------|-------|-------------|
| `USBMode=default` | USB-OTG (TinyUSB) | Native USB using TinyUSB stack |
| `USBMode=hwcdc` | Hardware CDC and JTAG | Hardware CDC with JTAG support |
| `CDCOnBoot=default` | Disabled | CDC not available on boot |
| `CDCOnBoot=cdc` | Enabled | CDC serial available on boot |
| `UploadMode=default` | UART0/Hardware CDC | Standard upload method |

## Device-Specific Notes

### wESP32 (Gateway Device)
- **Primary Role**: Network gateway with full connectivity options
- **Ethernet**: Built-in RTL8201 PHY with dedicated pins
- **I2C**: Should be supported, but scan returns no results. I have open case with mfg.
- **Gateway Features**: Supports all gateway modes (WiFi, Ethernet, USB)

### CrowPanel Series (Display Devices)
- **5" & 7" Models**: RGB LCD displays with capacitive touch
- **Display Interface**: Parallel RGB bus for high-speed graphics
- **Touch Controller**: I2C-based capacitive touch with gesture support
- **LVGL Integration**: Full LVGL support with hardware acceleration
- **USB Limitation**: Native USB works but with higher latency than other S3 devices

### Adafruit ESP32-S3 Series
- **QT Py**: Compact form factor with STEMMA QT connector (I2C: SDA: 41, SCL: 40)
- **Matrix**: Dedicated RGB matrix controller with hardwired pin configuration
- **Feather**: Standard development board with breadboard-friendly pinout
- **Native USB**: All support USB-OTG with CDC on boot enabled

### LilyGo T4 S3
- **AMOLED Display**: High-quality AMOLED screen with touch support
- **Premium Build**: High-end hardware with generous flash and PSRAM
- **LVGL Integration**: Optimized for smooth UI performance

### SparkleMotion Mini
- **LED Focus**: Optimized for driving NeoPixel installations
- **Dual Strips**: Support for two independent NeoPixel strips
- **I2C Sensors**: Compatible with environmental and motion sensors, i2c displays etc
- **Legacy ESP32**: Uses original ESP32 (not S3) with Bluetooth 4.2