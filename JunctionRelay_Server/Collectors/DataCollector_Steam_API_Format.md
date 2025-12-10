# Steam Collector API Format

This document describes the expected JSON response format from the Steam monitoring application that will be polled by `DataCollector_Steam`.

## Endpoint

The Steam app should expose a local HTTP API endpoint (e.g., `http://localhost:5000/api/stats`)

## Authentication

The Steam app must validate requests using the `X-Collector-Token` header.

```
X-Collector-Token: your-access-token-here
```

## Response Format

### Root Structure

```json
{
  "success": true,
  "data": {
    "system": { ... },
    "gaming": { ... },
    "cpu": { ... },
    "gpu": { ... },
    "memory": { ... },
    "disk": { ... },
    "network": { ... },
    "battery": { ... }
  }
}
```

### System Section

Basic system information.

```json
"system": {
  "hostname": "steamdeck",
  "platform": "Linux",
  "uptime": 86400,
  "steam_version": "1.0.0.78"
}
```

### Gaming Section

Steam-specific gaming metrics. Optional - only include when a game is running.

```json
"gaming": {
  "current_game": "Elden Ring",
  "app_id": "1245620",
  "fps": 60,
  "frame_time": 16.67,
  "session_duration": 3600,
  "is_playing": true
}
```

### CPU Section

CPU metrics including per-core data.

```json
"cpu": {
  "name": "AMD Custom APU 0405",
  "usage_total": 45.5,
  "frequency": 3500,
  "temperature": 65.0,
  "core_count": 4,
  "thread_count": 8,
  "cores": [
    {
      "usage": 50.0,
      "frequency": 3500,
      "temperature": 65.0
    },
    {
      "usage": 40.0,
      "frequency": 3500,
      "temperature": 63.0
    }
  ]
}
```

**Notes:**
- `usage_total`: Total CPU usage percentage (0-100)
- `frequency`: Current frequency in MHz
- `temperature`: Temperature in Celsius
- `cores`: Array of per-core metrics (optional but recommended)

### GPU Section

GPU metrics including VRAM and power.

```json
"gpu": {
  "name": "AMD RADV VANGOGH",
  "usage": 85.0,
  "frequency": 1600,
  "temperature": 72.0,
  "vram_used": 6144,
  "vram_total": 8192,
  "vram_usage_percent": 75.0,
  "power_draw": 15.5,
  "fan_speed": 4500,
  "fan_speed_percent": 75.0
}
```

**Notes:**
- `usage`: GPU usage percentage (0-100)
- `frequency`: Current GPU frequency in MHz
- `vram_used/total`: VRAM in MB
- `power_draw`: Power consumption in Watts
- `fan_speed`: Fan speed in RPM (or omit if not available)
- `fan_speed_percent`: Fan speed as percentage (0-100)

### Memory Section

System RAM and swap information.

```json
"memory": {
  "used": 8192,
  "total": 16384,
  "available": 8192,
  "usage_percent": 50.0,
  "swap_used": 0,
  "swap_total": 2048
}
```

**Notes:**
- All values in MB except `usage_percent`

### Disk Section

Disk usage and I/O performance.

```json
"disk": {
  "used": 250.5,
  "total": 512.0,
  "free": 261.5,
  "usage_percent": 48.9,
  "read_speed": 125.5,
  "write_speed": 87.3
}
```

**Notes:**
- `used/total/free`: Storage in GB
- `read_speed/write_speed`: Current I/O speed in MB/s

### Network Section

Network traffic statistics.

```json
"network": {
  "download_speed": 12.5,
  "upload_speed": 1.2,
  "bytes_sent": 1073741824,
  "bytes_received": 5368709120
}
```

**Notes:**
- `download_speed/upload_speed`: Current speed in MB/s
- `bytes_sent/received`: Total bytes since boot

### Battery Section

Battery information (optional - only for portable devices like Steam Deck).

```json
"battery": {
  "percent": 75,
  "is_charging": false,
  "time_remaining": 120,
  "power_draw": 12.5
}
```

**Notes:**
- `percent`: Battery percentage (0-100)
- `time_remaining`: Estimated minutes remaining
- `power_draw`: Current power consumption in Watts

## Minimal Example Response

For testing, a minimal valid response:

```json
{
  "success": true,
  "data": {
    "system": {
      "hostname": "my-steam-pc",
      "platform": "Windows"
    },
    "cpu": {
      "usage_total": 25.0,
      "temperature": 55.0
    },
    "memory": {
      "used": 8192,
      "total": 16384,
      "usage_percent": 50.0
    }
  }
}
```

## Error Response

If authentication fails or an error occurs:

```json
{
  "success": false,
  "error": "Invalid access token"
}
```

## Implementation Notes

- All numeric values should be numbers, not strings
- All sections except `system` are optional
- Include only the metrics your platform supports
- Update values at reasonable intervals (avoid excessive CPU usage)
- Consider caching expensive operations between requests
