#ifndef UTILS_H
#define UTILS_H

#include <WiFi.h>

// Centralized firmware version
#define FIRMWARE_VERSION "JunctionRelay v0.6.6"

inline const char* getFirmwareVersion() {
    return FIRMWARE_VERSION;
}

inline String getFormattedMacAddress() {
    uint64_t mac = ESP.getEfuseMac();

    // Directly extract the MAC address bytes as they are, without reversing the byte order
    uint8_t macBytes[6];
    macBytes[0] = (mac >> 0) & 0xFF;   // LSB
    macBytes[1] = (mac >> 8) & 0xFF;
    macBytes[2] = (mac >> 16) & 0xFF;
    macBytes[3] = (mac >> 24) & 0xFF;
    macBytes[4] = (mac >> 32) & 0xFF;
    macBytes[5] = (mac >> 40) & 0xFF;  // MSB

    // Format the MAC address as a string
    char macStr[18];
    snprintf(macStr, sizeof(macStr), "%02X:%02X:%02X:%02X:%02X:%02X",
             macBytes[0], macBytes[1], macBytes[2],
             macBytes[3], macBytes[4], macBytes[5]);

    return String(macStr);
}

#endif // UTILS_H