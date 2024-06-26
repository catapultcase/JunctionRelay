import threading
import time
from flask import Flask, jsonify

app = Flask(__name__)

# Configuration
REFRESH_RATE = 5  # Refresh rate in seconds
WEB_SERVER_PORT = 5002  # Hardcoded port

# Fake sensors data
sensors_data = [
    {
        "Text": "Fake Sensor 1",
        "Type": "Temperature",
        "Value": "33.0",
        "SensorId": "fake_sensor_1"
    },
    {
        "Text": "Fake Sensor 2",
        "Type": "Humidity",
        "Value": "63.0",
        "SensorId": "fake_sensor_2"
    },
    {
        "Text": "Fake Sensor 3",
        "Type": "Pressure",
        "Value": "550.0",
        "SensorId": "fake_sensor_3"
    }
]

def update_fake_sensors():
    while True:
        # Simulate sensor value changes
        sensors_data[0]["Value"] = "{:.1f}".format(float(sensors_data[0]["Value"]) + 0.1)
        sensors_data[1]["Value"] = "{:.1f}".format(float(sensors_data[1]["Value"]) + 0.1)
        sensors_data[2]["Value"] = "{:.1f}".format(float(sensors_data[2]["Value"]) + 0.1)
        time.sleep(REFRESH_RATE)

@app.route('/data.json')
def data_json():
    return jsonify(sensors_data)

if __name__ == '__main__':
    update_thread = threading.Thread(target=update_fake_sensors)
    update_thread.daemon = True
    update_thread.start()
    app.run(host='0.0.0.0', port=WEB_SERVER_PORT)
