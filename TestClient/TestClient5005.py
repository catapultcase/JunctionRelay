from flask import Flask, request, jsonify
from datetime import datetime

app = Flask(__name__)

@app.route('/data', methods=['POST'])
def receive_data():
    data = request.json
    if data:
        timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        print(f"Received data at {timestamp}:")
        for sensor in data:
            sensor_id = sensor.get("ExternalId", "N/A")
            sensor_name = sensor.get("Name", "N/A")
            sensor_value = sensor.get("Value", "N/A")
            sensor_tag = sensor.get("SensorTag", "N/A")
            print(f"Sensor ID: {sensor_id}, Sensor Name: {sensor_name}, Sensor Tag: {sensor_tag}, Value: {sensor_value}")
        return jsonify({"status": "success"}), 200
    return jsonify({"status": "no data received"}), 400

if __name__ == "__main__":
    app.run(host='0.0.0.0', port=5005)
