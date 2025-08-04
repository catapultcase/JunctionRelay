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


## Device Notes

-- CrowPanels and Native USB Mode

The Elecrow.com WIKI does not indicate if the non-advanced models support OTG/Native USB, but the advanced model only calls out OTG for the three sizes of 2.4 inches, 2.8 inches, and 3.5 inches. CrowPanels 5" and 7" will boot with "USB Mode = CDC (TinyUSB)" as long as "CDC On Boot" remains disabled, and in limited testing, behaves as if Native USB is enabled. However, my tools show it has unexpectedly high latency so your milage my vary.