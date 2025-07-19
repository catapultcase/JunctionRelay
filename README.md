# JunctionRelay

**Unified Data Orchestration & IoT Device Management**

**Local-first. Cloud-optional. Always in control.**

🔗 [Visit junctionrelay.com](https://junctionrelay.com)
☁️ [Cloud Dashboard](https://dashboard.junctionrelay.com)

![Dashboard Demo](./assets/ActiveStreams.gif)

---

## Core Goals

1. **Device Streaming Orchestration**
2. **IoT Device Monitoring & Management**

---

## Device Streaming Orchestration

Collect, route, and transform data from your ecosystem of sensors and services.

* **Centralized orchestration** across your home lab or production fleet
* **Mix-and-match data sources** like:
  * Home Assistant
  * LibreHardwareMonitor
  * Uptime Kuma
  * And more!

* **Flexible forwarding and transformation pipelines** to route data to:
  * Local displays
  * Web dashboards
  * Other devices on your network

**Supported Protocols:**

* USB Serial
* HTTP
* WebSockets
* MQTT
* ESP-NOW

---

## IoT Device Monitoring and Management

Monitor existing devices or add JunctionRelay support with minimal changes.

* **Plug-and-play device monitoring** (no firmware changes required)
* **Drop-in Arduino or ESP32 support** for enhanced control
* **Track health status** with real-time heartbeats and uptime
* **Control onboard screens and define sensor payloads** from the web dashboard
* **Optional Cloud mode** with:
  * Remote access
  * Push notifications
  * Over-the-air firmware updates

---

## Native Mobile App

* Official Android app connects to your local and cloud backends  
* Enables Push notifications for devices you choose to sync to the cloud  
* Mobile-first design philosophy for the entire application  

<p float="left">
  <img src="./assets/Mobile1.png" alt="Mobile1" width="200" />
  <img src="./assets/Mobile2.png" alt="Mobile2" width="200" />
</p>

---

## Built For Makers and Tinkerers

* Self-hosted by default
* Lightweight C# backend
* Cross-platform with Docker and native builds
* TypeScript and React front-end

---

## Overview

JunctionRelay serves as a central hub for connected hardware: sensors, microcontrollers, and display screens. It manages real-time data collection, collation, routing, and visualization with minimal setup. Primarily designed to communicate with ESP32 devices embedded into CatapultCase designs, the system has evolved into a flexible backend-frontend stack deployable on everything from Raspberry Pi clusters to industrial-grade servers, now with cloud integration for simplified device management.

Most importantly, JunctionRelay connects seamlessly with existing services like:

* Home Assistant
* LibreHardwareMonitor
* MQTT Brokers
* Uptime Kuma
* Native Host Machine Sensors
* Cloud-managed ESP32 Devices

This allows you to consolidate data from your smart home, PC hardware, servers, monitoring dashboards, and cloud-managed IoT devices into a single orchestrated control interface.

---

## Key Features

* Containerized Deployment (launch instantly using Docker or compile for Windows)
* Modern React Web UI (intuitive browser-based control and configuration)
* Modular .NET 8 Backend (RESTful API support and robust data handling)
* Cloud Device Management (manage ESP32 devices through secure cloud registration)
* Multi-Protocol Output (supports LVGL, MQTT, and custom formats)
* Visual Screen Editor (build LVGL-based UI layouts directly from the web)
* Device Discovery (scan the network for compatible hardware and manage them remotely)
* Over-the-Air Firmware Flashing (push official JunctionRelay firmware to supported devices wirelessly)
* Small Footprint (optimized for low-power hardware like ESP32-S3)

---

## Built-in Data Collectors

JunctionRelay includes out-of-the-box collectors for:

- **Cloud Devices** – Monitor and collect data from cloud-registered ESP32 devices  
- **Cloudflare** – Track traffic and analytics from your Cloudflare-protected domains  
- **GitHub** – Monitor repository stats, activity, issues, and more  
- **Home Assistant** – Pull real-time sensor values from your smart home setup  
- **Host Device** – Collect data from the system running JunctionRelay  
- **LibreHardwareMonitor** – Monitor PC internals: CPU temperatures, fan speeds, voltages, etc.  
- **Render.com** – Fetch deployment and service status from your Render projects  
- **Stripe** – Pull live subscription, payment, and revenue metrics from your Stripe account  
- **Uptime Kuma** – Ingest service and uptime metrics from your existing Uptime Kuma instance  

Want more integrations? [Request additional collectors in Discussions](https://github.com/catapultcase/JunctionRelay/discussions)

![Dashboard Demo](./assets/Dashboard.gif)

---

## Authentication Options

JunctionRelay offers three flexible authentication modes to match your security needs and deployment environment:

| Mode                 | Security               | Online Required | Best For                      |
| -------------------- | ---------------------- | --------------- | ----------------------------- |
| No Authentication    | Open Access            | Offline         | Development, trusted networks |
| Local Authentication | Username and Password  | Offline         | Multi-user, basic protection  |
| Cloud Authentication | OAuth and Pro Features | Online          | Production, advanced features |

### No Authentication (Offline Mode)

Perfect for development and trusted environments. Zero setup, complete privacy, no external dependencies.

### Local Authentication (Offline Mode)

Secure local administrator account with offline operation. Create username and password protection while keeping all data local.

### Cloud Authentication (Online Mode)

Enterprise-grade security with cloud integration. You can register all your devices for free, however only one device can be 'Active' at a time on a free license. Consider a Pro subscription to support ongoing development and access for remote management, over-the-air updates, cloud backups, and priority support as they become available.

**Pro Subscription Benefits:**

* Remote device management and monitoring
* Over-the-air ESP32 firmware updates
* Automatic configuration backups
* Priority support and exclusive features
* Monthly or Annual subscription plans available

Configure authentication mode in Settings > User Management to match your deployment needs.

---

## Cloud Device Integration

JunctionRelay now supports cloud-managed ESP32 devices for simplified deployment and management. This allows you to register ESP32 devices through a secure cloud service and have them automatically appear in your local JunctionRelay instance.

### Cloud Device Benefits

* Zero Configuration (no network discovery or manual device setup required)
* Secure Registration (token-based device registration with user approval workflow)
* Automatic Management (devices appear automatically in your JunctionRelay instance)
* Remote Monitoring (monitor device health and status through the cloud dashboard)
* Seamless Integration (cloud devices work alongside local devices in the same interface)

### Using the ESP32 Sample Code

The `Arduino_Examples/Device_Registration/` folder contains sample ESP32 code that demonstrates cloud device registration:

#### Quick Start

1. Hardware Setup

   ```cpp
   // Update WiFi credentials in the sample code
   const char *ssid = "YOUR_WIFI_SSID";  
   const char *password = "YOUR_WIFI_PASSWORD";
   ```

2. Upload Sample Code

   * Install the ArduinoJson library via Arduino IDE Library Manager
   * Upload the sample code to your ESP32 device

3. Device Registration

   * Open the [Cloud Dashboard](https://dashboard.junctionrelay.com)
   * Click "Add Device" and generate a registration token
   * Enter the token into your ESP32 serial monitor when prompted
   * Approve the device in the cloud dashboard

4. Automatic Integration

   * The device will automatically appear in your local JunctionRelay instance
   * Health data and sensor readings are available immediately
   * No additional configuration required

#### Interactive Testing

The sample code includes a debug interface accessible via serial monitor:

| Command | Description                                      |
| ------- | ------------------------------------------------ |
| help    | Show all available commands                      |
| status  | Display device information and connection status |
| health  | Send health report immediately                   |
| expire  | Force token expiry to test refresh flow          |
| refresh | Test token refresh manually                      |

#### Security Features

* JWT Authentication (secure device-to-cloud communication)
* Automatic Token Refresh (seamless token renewal without user intervention)
* User Approval Workflow (manual confirmation required before device activation)
* Secure Storage (tokens stored in ESP32 non-volatile memory)

---

## ESP Device Protocols

JunctionRelay supports a wide range of communication protocols to interact with ESP32-based devices. This gives you flexibility depending on your hardware setup and reliability requirements:

| Protocol          | Description                                                                                              |
| ----------------- | -------------------------------------------------------------------------------------------------------- |
| Cloud Integration | Secure cloud-managed devices with automatic registration and health monitoring.                          |
| Ethernet          | Reliable and low-latency. Ideal for stationary or high-performance setups using devices like the WESP32. |
| Wi-Fi             | Most common option. Easy to configure and works well for mobile or wireless sensor nodes.                |
| COM / Serial      | Direct USB or UART connection. Useful for debugging or permanent wired installations.                    |
| WebSockets        | Full-duplex, low-latency communication with the backend. Perfect for real-time data and UI updates.      |
| HTTP              | Lightweight and easy to integrate. Devices can push or pull updates from RESTful endpoints.              |
| MQTT              | Publish and subscribe protocol for loosely coupled sensor networks. Compatible with external brokers.    |

You can configure the protocol per device depending on its capabilities and purpose. Many devices support fallback modes (e.g. Wi-Fi to Ethernet), and all communication methods can coexist within the same JunctionRelay instance.

---

## Quick Start with Docker Hub

You can now run JunctionRelay instantly using the prebuilt image hosted on Docker Hub:

```bash
docker run -d \
  --name junctionrelay \
  -p 7180:7180 \
  catapultcase/junctionrelay:latest
```

This pulls the latest version of JunctionRelay and exposes the web interface at [http://localhost:7180](http://localhost:7180).

**Docker Hub:** [catapultcase/junctionrelay](https://hub.docker.com/repository/docker/catapultcase/junctionrelay)

> Tip: Add `--restart unless-stopped` to run it automatically after reboot.

---

## Build from Source (Optional)

Prefer to build it yourself? You can compile and run the backend and frontend locally:

### Step 1: Clone the repository

```bash
git clone https://github.com/catapultcase/JunctionRelay.git
cd JunctionRelay\JunctionRelay_Server
```

### Step 2: Install frontend dependencies

The React-based Web UI is located in `junctionrelaywebui`. Before running the backend, install the required frontend dependencies:

```bash
cd junctionrelaywebui
npm install
npm run build
cd ..
```

This generates the production-ready frontend in `junctionrelaywebui/build`.

### Step 3: Copy frontend build to backend `wwwroot/static`

The backend expects static assets to be present in `JunctionRelay_Server/wwwroot/static`, but this folder is excluded from Git (`.gitignore`).

You must manually copy the frontend build output into the backend's static directory:

#### On Windows:

```bash
xcopy /E /I /Y junctionrelaywebui\build JunctionRelay_Server\wwwroot\static
```

#### On macOS or Linux:

```bash
cp -r junctionrelaywebui/build/* JunctionRelay_Server/wwwroot/static/
```

> If you skip this step, the web interface will not load correctly when running the backend.

### Step 4: Run the server

```bash
dotnet run
```

Once running, navigate to [http://localhost:7180](http://localhost:7180) to access the web interface.

---

## Example Projects

### Smart Sensor Network

Deploy multiple ESP32 devices with temperature, humidity, and motion sensors. Use cloud registration for easy setup and monitor all devices from a central JunctionRelay dashboard.

### Smart Home Integration

Combine Home Assistant data with cloud-managed ESP32 displays throughout your home. Create custom dashboards showing weather, security status, and energy usage.

### PC Monitoring Station

Build an ESP32-based external display showing real-time PC performance metrics from LibreHardwareMonitor, combined with custom sensor data.

### Industrial Monitoring

Deploy JunctionRelay on a Raspberry Pi to collect data from multiple ESP32 sensor nodes across a facility, with centralized logging and alerting.

---

## Screenshots

### Cloud Device Management

New cloud dashboard for managing ESP32 devices with secure registration and health monitoring.

### Plotters

![Plotters](./assets/Plotters.jpg)

### UI Thumbnails

| Dashboard                            | Cloud Dashboard                                | Devices                          |
| ------------------------------------ | ---------------------------------------------- | -------------------------------- |
| ![Dashboard](./assets/Dashboard.png) | ![CloudDashboard](./assets/CloudDashboard.png) | ![Devices](./assets/Devices.png) |

| Stats                        | Payloads                           | Settings                           |
| ---------------------------- | ---------------------------------- | ---------------------------------- |
| ![Stats](./assets/Stats.png) | ![Payloads](./assets/Payloads.png) | ![Settings](./assets/Settings.png) |

| Configure Device 1                             | Configure Device 2                             | Stream Monitor                            |
| ---------------------------------------------- | ---------------------------------------------- | ------------------------------------------ |
| ![ConfigureDevice1](./assets/ConfigureDevice1.png) | ![ConfigureDevice2](./assets/ConfigureDevice2.png) | ![StreamMonitor](./assets/StreamMonitor.png) |

| Mobile 1                             | Mobile 2                             | Mobile 3                             |
| ------------------------------------| ------------------------------------ | ------------------------------------ |
| ![Mobile1](./assets/Mobile3.png)    | ![Mobile2](./assets/Mobile4.png)    | ![Mobile3](./assets/Mobile5.png)    |

| Mobile 4                             | Mobile 5                             | Mobile 6                             |
| ------------------------------------ | ------------------------------------ | ------------------------------------ |
| ![Mobile4](./assets/Mobile6.png)    | ![Mobile5](./assets/Mobile7.png)    | ![Mobile6](./assets/Mobile8.png)    |

---


## Contributing

We welcome contributions! Whether you are fixing bugs, adding features, or improving documentation, your help makes JunctionRelay better for everyone.

* Bug Reports: [Open an issue](https://github.com/catapultcase/JunctionRelay/issues)
* Feature Requests: [Start a discussion](https://github.com/catapultcase/JunctionRelay/discussions)
* Documentation: Help improve our guides and examples
* Device Integrations: Add support for new hardware or protocols

---

## License

JunctionRelay is open-source software licensed under the GNU General Public License.

---

## Links

* Website: [junctionrelay.com](https://junctionrelay.com)
* Cloud Dashboard: [dashboard.junctionrelay.com](https://dashboard.junctionrelay.com)
* Docker Hub: [catapultcase/junctionrelay](https://hub.docker.com/repository/docker/catapultcase/junctionrelay)
* Discussions: [GitHub Discussions](https://github.com/catapultcase/JunctionRelay/discussions)
* Issues: [GitHub Issues](https://github.com/catapultcase/JunctionRelay/issues)