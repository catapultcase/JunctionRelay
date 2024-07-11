# Junction Relay [http://junctionrelay.com](http://junctionrelay.com)

**Current Alpha:** [Junction Relay v0.3.7-Alpha](https://github.com/catapultcase/JunctionRelay/releases)

**Testing Tools:**

- Unraid docker is available [here](https://github.com/catapultcase/JunctionRelayAgent_Unraid).

- **TestServer** folder has python scritps which simulate HTTP services to broadcast fake sensors over ports 5001, 5002 and 5003. To connect to them in JunctionRelay, add the 'Generic HTTP Server' data source and enter a URL of http://localhost:5001/data.json (change the port as needed). You do not need to populate any of the other fields.

- **TestClient** folder has python scripts to simulate HTTP services that receive the data from JunctionRelay, over ports 5000 and 5005. Add 'Generic HTTP Client' as the data target and enter URL of http://localhost:5000/data.json (change port as needed).

- **TestDevices** folder has 2 ardruno projects for the following devices:
  - [Lilygo T4-S3 OLED Display with ESP32](https://www.lilygo.cc/products/t4-s3)
  - [Elecrow 7" ESP32 TFT](https://www.elecrow.com/esp32-display-7-inch-hmi-display-rgb-tft-lcd-touch-screen-support-lvgl.html?gad_source=1&gclid=Cj0KCQjwhb60BhClARIsABGGtw_E4hBQbKg1bA7LxD5juA1-ofPMn3kHmHzKcoNzTT2WczSiiXNT5L4aAkFuEALw_wcB)

To download the latest release of JunctionRelay (alpha), check out **[Releases](https://github.com/catapultcase/JunctionRelay/releases)**.

![alt text](https://github.com/catapultcase/JunctionRelay/blob/main/Images/JR1.png)
![alt text](https://github.com/catapultcase/JunctionRelay/blob/main/Images/JR2.png)
![alt text](https://github.com/catapultcase/JunctionRelay/blob/main/Images/UnraidDash.jpg)
![alt text](https://github.com/catapultcase/JunctionRelay/blob/main/Images/Panel.jpg)
