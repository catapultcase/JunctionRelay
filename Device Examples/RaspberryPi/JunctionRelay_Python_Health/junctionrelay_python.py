#!/usr/bin/env python3
"""
junctionrelay_python.py for Raspberry Pi
Health-only version - NO SENSOR DATA
"""

import json
import time
import requests
import threading
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional, Dict, Any, Tuple
import uuid
import psutil
import subprocess


class JunctionRelay:
    def __init__(self, config_file: str = "junction_relay_config.json"):
        self.config_file = Path(config_file)
        self.cloud_base_url = "https://api.junctionrelay.com"
        
        # State variables
        self.jwt = ""
        self.refresh_token = ""
        self.device_id = ""
        self.registered = False
        self.jwt_expires_at = 0  # Unix timestamp
        self.refresh_token_expires_at = 0  # Unix timestamp
        self.last_token_refresh = 0
        self.last_report = 0
        
        # Constants (matching ESP32 version)
        self.JWT_REFRESH_BUFFER = 300  # 5 minutes in seconds
        self.TOKEN_REFRESH_INTERVAL = 3600  # 1 hour in seconds
        self.REFRESH_TOKEN_ROTATION_THRESHOLD = 86400  # 24 hours in seconds
        self.HEALTH_REPORT_INTERVAL = 60  # 60 seconds
        
        # TESTING OVERRIDES - Comment out to use production values
        self.TESTING_MODE = True
        if self.TESTING_MODE:
            self.TEST_JWT_REFRESH_INTERVAL = 300  # 5 minutes for testing
            self.TEST_REFRESH_TOKEN_ROTATION_THRESHOLD = 60  # 1 minute before expiry (17 min trigger)
            self.TEST_JWT_LIFETIME = 6 * 60  # 6 minutes
            self.TEST_REFRESH_LIFETIME = 18 * 60  # 18 minutes
        
        # Background thread control
        self.running = False
        self.background_thread = None
        
        # Initialize time (simplified for Python)
        self.initialize_time()
        
        # Load existing configuration
        self.load_config()
        
    def initialize_time(self):
        """Initialize time synchronization (simplified for Linux)"""
        print("🕒 Time initialized")
        current_time = datetime.utcnow()
        print(f"✅ Current time: {current_time.strftime('%Y-%m-%d %H:%M:%S')} UTC")
        
    def load_config(self):
        """Load configuration from file"""
        if self.config_file.exists():
            try:
                with open(self.config_file, 'r') as f:
                    config = json.load(f)
                
                self.jwt = config.get("jwt", "")
                self.refresh_token = config.get("refresh_token", "")
                self.device_id = config.get("device_id", "")
                
                # Load expiry timestamps (stored as ISO strings, parsed to Unix timestamps)
                jwt_expiry_str = config.get("jwt_expires_at", "")
                refresh_expiry_str = config.get("refresh_token_expires_at", "")
                
                self.jwt_expires_at = self.parse_iso8601(jwt_expiry_str)
                self.refresh_token_expires_at = self.parse_iso8601(refresh_expiry_str)
                self.last_token_refresh = config.get("last_token_refresh", 0)
                
                self.registered = bool(self.jwt)
                
                if self.registered:
                    print("✅ Device registered")
                    if self.refresh_token and self.device_id:
                        print("📱 Found stored refresh token")
                        print(f"🆔 Device ID: {self.device_id}")
                        
                        current_time = time.time()
                        if self.refresh_token_expires_at > 0:
                            if self.refresh_token_expires_at > current_time:
                                time_until_expiry = int(self.refresh_token_expires_at - current_time)
                                print(f"🕒 Refresh token expires in {time_until_expiry} seconds")
                            else:
                                print("⚠️ Refresh token has expired")
                        
                        if self.jwt_expires_at > 0:
                            if self.jwt_expires_at > current_time:
                                time_until_expiry = int(self.jwt_expires_at - current_time)
                                print(f"🕒 JWT expires in {time_until_expiry} seconds")
                            else:
                                print("⚠️ JWT has expired")
                    else:
                        print("ℹ️ No stored tokens found - will need fresh registration")
                else:
                    print("⏳ Need registration token")
                    
            except Exception as e:
                print(f"❌ Error loading config: {e}")
                
    def save_config(self):
        """Save configuration to file"""
        try:
            config = {
                "jwt": self.jwt,
                "refresh_token": self.refresh_token,
                "device_id": self.device_id,
                "jwt_expires_at": self.format_timestamp(self.jwt_expires_at),
                "refresh_token_expires_at": self.format_timestamp(self.refresh_token_expires_at),
                "last_token_refresh": self.last_token_refresh,
            }
            
            with open(self.config_file, 'w') as f:
                json.dump(config, f, indent=2)
                
            print("💾 Configuration saved")
            
            # Debug output
            current_time = time.time()
            if self.jwt_expires_at > current_time:
                print(f"DEBUG: JWT expires in {int(self.jwt_expires_at - current_time)} seconds")
            if self.refresh_token_expires_at > current_time:
                print(f"DEBUG: Refresh token expires in {int(self.refresh_token_expires_at - current_time)} seconds")
            
        except Exception as e:
            print(f"❌ Error saving config: {e}")
            
    def clear_stored_tokens(self):
        """Clear stored tokens and reset registration state"""
        self.refresh_token = ""
        self.device_id = ""
        self.jwt_expires_at = 0
        self.refresh_token_expires_at = 0
        self.last_token_refresh = 0
        self.jwt = ""
        self.registered = False
        self.save_config()
        print("🗑️ Cleared stored tokens")
        
    def parse_iso8601(self, iso_str: str) -> float:
        """Parse ISO 8601 timestamp to Unix timestamp"""
        if not iso_str:
            return 0
            
        try:
            # Remove 'Z' and parse
            if iso_str.endswith('Z'):
                iso_str = iso_str[:-1]
                
            # Handle microseconds
            if '.' in iso_str:
                dt = datetime.fromisoformat(iso_str)
            else:
                dt = datetime.fromisoformat(iso_str)
                
            return dt.timestamp()
            
        except Exception as e:
            print(f"❌ Failed to parse ISO8601 timestamp {iso_str}: {e}")
            return 0
            
    def format_timestamp(self, timestamp: float) -> str:
        """Format Unix timestamp to ISO 8601 string"""
        if timestamp <= 0:
            return ""
        try:
            dt = datetime.fromtimestamp(timestamp)
            return dt.strftime('%Y-%m-%dT%H:%M:%SZ')
        except:
            return ""
            
    def update_token_expiry(self, jwt_expiry_str: str, refresh_expiry_str: str):
        """Update token expiry times from server response"""
        if self.TESTING_MODE:
            # Override server values with test durations for testing
            current_time = time.time()
            test_jwt_expiry = current_time + self.TEST_JWT_LIFETIME
            test_refresh_expiry = current_time + self.TEST_REFRESH_LIFETIME
            
            self.jwt_expires_at = test_jwt_expiry
            self.refresh_token_expires_at = test_refresh_expiry
            
            print("DEBUG: Using test token lifetimes (6min JWT, 18min refresh)")
        else:
            # Use server's actual expiry times
            self.jwt_expires_at = self.parse_iso8601(jwt_expiry_str)
            self.refresh_token_expires_at = self.parse_iso8601(refresh_expiry_str)
            
        current_time = time.time()
        print(f"DEBUG: Updated JWT expiry to {int(self.jwt_expires_at)} (in {int(self.jwt_expires_at - current_time)} seconds)")
        print(f"DEBUG: Updated refresh expiry to {int(self.refresh_token_expires_at)} (in {int(self.refresh_token_expires_at - current_time)} seconds)")
        
    def get_device_id(self) -> str:
        """Get unique device identifier (MAC address equivalent)"""
        if not self.device_id:
            # Try to get MAC address, fallback to UUID
            try:
                # Get the first available network interface MAC
                import psutil
                for interface, addrs in psutil.net_if_addrs().items():
                    if interface != 'lo':  # Skip loopback
                        for addr in addrs:
                            if addr.family == psutil.AF_LINK:
                                self.device_id = addr.address.upper()
                                break
                        if self.device_id:
                            break
            except:
                pass
                
            # Fallback to UUID if MAC not available
            if not self.device_id:
                self.device_id = str(uuid.getnode())
                
        return self.device_id
        
    def set_token(self, token: str):
        """Set registration token and parse it"""
        if not self.registered and token:
            try:
                token_data = json.loads(token)
                if all(key in token_data for key in ["deviceName", "token"]):
                    print("🔑 Registration token validated")
                    print(f"Device: {token_data['deviceName']}")
                    
                    self.register_device(token_data)
                    
            except json.JSONDecodeError:
                print("❌ Invalid JSON format")
                
    def register_device(self, token_data: Dict[str, Any]):
        """Register device with the cloud service"""
        try:
            device_id = self.get_device_id()
            
            payload = {
                "registrationToken": token_data["token"],
                "actualDeviceId": device_id,
                "deviceName": token_data["deviceName"]
            }
            
            print("📡 Registering device...")
            
            response = requests.post(
                f"{self.cloud_base_url}/cloud-devices/register",
                json=payload,
                headers={"Content-Type": "application/json"},
                timeout=30
            )
            
            if response.status_code == 200:
                result = response.json()
                
                if "deviceJwt" in result:
                    self.jwt = result["deviceJwt"]
                    self.registered = True
                    
                    # Extract and store refresh token
                    if "refreshToken" in result:
                        self.refresh_token = result["refreshToken"]
                        self.device_id = device_id
                        
                        jwt_expiry_str = result.get("expiresAt", "")
                        refresh_expiry_str = result.get("refreshTokenExpiresAt", "")
                        
                        self.update_token_expiry(jwt_expiry_str, refresh_expiry_str)
                        self.last_token_refresh = time.time()
                        
                        self.save_config()
                        print("✅ Device registered with refresh token!")
                    else:
                        print("✅ Device registered!")
                        
            else:
                print(f"❌ Registration failed: {response.status_code}")
                print(f"Response: {response.text}")
                
        except Exception as e:
            print(f"❌ Registration error: {e}")
            
    def check_and_rotate_refresh_token(self):
        """Check if refresh token needs rotation and rotate if necessary"""
        if not self.refresh_token or not self.device_id or self.refresh_token_expires_at == 0:
            return
            
        current_time = time.time()
        
        # Check if refresh token expires within the threshold
        if self.TESTING_MODE:
            rotation_threshold = self.TEST_REFRESH_TOKEN_ROTATION_THRESHOLD
        else:
            rotation_threshold = self.REFRESH_TOKEN_ROTATION_THRESHOLD
            
        near_expiry = (self.refresh_token_expires_at > current_time and 
                      (self.refresh_token_expires_at - current_time) <= rotation_threshold)
        
        if near_expiry:
            time_until_expiry = int(self.refresh_token_expires_at - current_time)
            print(f"DEBUG: Current time: {int(current_time)}, Refresh expires at: {int(self.refresh_token_expires_at)}")
            print(f"DEBUG: Time until refresh token expiry: {time_until_expiry} seconds")
            print(f"DEBUG: Rotation threshold: {rotation_threshold} seconds")
            
            print("🔄 Refresh token rotation triggered - expires within threshold")
            
            if self.rotate_refresh_token():
                print("✅ Refresh token rotation successful")
            else:
                print("❌ Refresh token rotation failed - triggering re-registration")
                self.handle_token_refresh_failure()
                
    def rotate_refresh_token(self) -> bool:
        """Rotate refresh token (get new JWT + new refresh token)"""
        try:
            payload = {
                "RefreshToken": self.refresh_token,
                "DeviceId": self.device_id
            }
            
            print("📤 Sending refresh token rotation request")
            print(f"🔗 URL: {self.cloud_base_url}/cloud-devices/refresh-rotate")
            print(f"📋 Payload: {json.dumps(payload)}")
            
            response = requests.post(
                f"{self.cloud_base_url}/cloud-devices/refresh-rotate",
                json=payload,
                headers={"Content-Type": "application/json"},
                timeout=30
            )
            
            if response.status_code == 200:
                result = response.json()
                print("✅ Refresh token rotation successful")
                print(f"📨 Response: {response.text}")
                
                if result.get("success") and "token" in result and "refreshToken" in result:
                    new_jwt = result["token"]
                    new_refresh_token = result["refreshToken"]
                    jwt_expiry_str = result.get("expiresAt", "")
                    refresh_expiry_str = result.get("refreshTokenExpiresAt", "")
                    
                    # Update tokens and expiry times
                    self.jwt = new_jwt
                    self.refresh_token = new_refresh_token
                    self.update_token_expiry(jwt_expiry_str, refresh_expiry_str)
                    
                    # Save all tokens with new expiry times
                    self.save_config()
                    
                    return True
                else:
                    print("❌ Failed to parse rotation response or success=false")
                    return False
                    
            else:
                print(f"❌ Refresh token rotation failed with code: {response.status_code}")
                print(f"📨 Error response: {response.text}")
                return False
                
        except Exception as e:
            print(f"❌ Refresh token rotation error: {e}")
            return False
            
    def check_and_refresh_token(self):
        """Check if JWT token needs refresh and refresh if necessary"""
        if not self.refresh_token or not self.device_id:
            return
            
        current_time = time.time()
        
        # Check if TOKEN_REFRESH_INTERVAL has passed since last refresh attempt
        if self.TESTING_MODE:
            refresh_interval = self.TEST_JWT_REFRESH_INTERVAL
        else:
            refresh_interval = self.TOKEN_REFRESH_INTERVAL
            
        if current_time - self.last_token_refresh < refresh_interval:
            return  # Too soon to refresh again
            
        # Also check if JWT is near expiry (refresh early if we know the expiry)
        jwt_buffer = self.JWT_REFRESH_BUFFER
        near_expiry = (self.jwt_expires_at > 0 and current_time + jwt_buffer >= self.jwt_expires_at)
        interval_reached = (current_time - self.last_token_refresh >= refresh_interval)
        
        if interval_reached or near_expiry:
            print("🔄 JWT token refresh triggered")
            if interval_reached:
                if self.TESTING_MODE:
                    print("  📅 Reason: 5-minute test interval reached")
                else:
                    print("  📅 Reason: 1-hour interval reached")
            if near_expiry:
                print("  ⏰ Reason: Token near expiry")
                
            self.last_token_refresh = current_time
            if not self.refresh_device_token():
                # JWT refresh failed - try rotating refresh token as fallback
                print("⚠️ JWT refresh failed, attempting refresh token rotation as fallback...")
                if self.rotate_refresh_token():
                    print("✅ Fallback refresh token rotation successful")
                    # Token refresh timestamp updated in save_config
                else:
                    print("❌ Both JWT refresh and refresh token rotation failed")
                    self.handle_token_refresh_failure()
            else:
                # Save the successful refresh
                self.save_config()
                
    def refresh_device_token(self) -> bool:
        """Refresh the JWT token using refresh token"""
        try:
            payload = {
                "RefreshToken": self.refresh_token,
                "DeviceId": self.device_id
            }
            
            print("📤 Sending token refresh request")
            print(f"🔗 URL: {self.cloud_base_url}/cloud-devices/refresh")
            print(f"📋 Payload: {json.dumps(payload)}")
            
            response = requests.post(
                f"{self.cloud_base_url}/cloud-devices/refresh",
                json=payload,
                headers={"Content-Type": "application/json"},
                timeout=30
            )
            
            if response.status_code == 200:
                result = response.json()
                print("✅ Token refresh successful")
                print(f"📨 Response: {response.text}")
                
                if result.get("success") and "token" in result:
                    new_jwt = result["token"]
                    jwt_expiry_str = result.get("expiresAt", "")
                    
                    if self.TESTING_MODE:
                        # Override server values with test JWT lifetime
                        current_time = time.time()
                        test_jwt_expiry = current_time + self.TEST_JWT_LIFETIME
                        self.jwt_expires_at = test_jwt_expiry
                        print("DEBUG: Using test JWT lifetime (6 minutes)")
                    else:
                        # Use server's JWT expiry time
                        self.jwt_expires_at = self.parse_iso8601(jwt_expiry_str)
                        
                    # Update the JWT
                    self.jwt = new_jwt
                    
                    return True
                else:
                    print("❌ Failed to parse token refresh response or success=false")
                    return False
                    
            elif response.status_code in [401, 403]:
                # Unauthorized - likely expired refresh token, don't retry rotation
                print("❌ Token refresh failed with authentication error - refresh token likely expired")
                print(f"📨 Error response: {response.text}")
                return False
            else:
                print(f"❌ Token refresh failed with code: {response.status_code}")
                print(f"📨 Error response: {response.text}")
                return False
                
        except Exception as e:
            print(f"❌ Token refresh error: {e}")
            return False
            
    def handle_token_refresh_failure(self):
        """Handle token refresh failure by clearing tokens and requiring re-registration"""
        print("⚠️ Token refresh failed - clearing stored tokens")
        self.clear_stored_tokens()
        print("🔄 Device will need to re-register")
            
    def send_health(self):
        """Send health report to cloud service - health only, no sensor data"""
        try:
            if not self.registered or not self.jwt:
                return
                
            # Health-only payload - no sensor data
            payload = {
                "Status": "online",
                "SensorData": ""
            }
            
            print(f"DEBUG: HTTP payload: {json.dumps(payload)}")
            
            # Send request
            response = requests.post(
                f"{self.cloud_base_url}/cloud-devices/health",
                json=payload,
                headers={
                    "Authorization": f"Bearer {self.jwt}",
                    "Content-Type": "application/json"
                },
                timeout=30
            )
            
            if response.status_code == 200:
                print("✅ Health sent")
                
                # DEBUG: Print token timing info after each health report
                current_time = time.time()
                
                if self.jwt_expires_at > 0:
                    if self.jwt_expires_at > current_time:
                        jwt_time_left = int(self.jwt_expires_at - current_time)
                        print(f"DEBUG: JWT time remaining: {jwt_time_left} seconds")
                    else:
                        print("DEBUG: JWT has expired!")
                        
                if self.refresh_token_expires_at > 0:
                    if self.refresh_token_expires_at > current_time:
                        refresh_time_left = int(self.refresh_token_expires_at - current_time)
                        print(f"DEBUG: Refresh token time remaining: {refresh_time_left} seconds")
                    else:
                        print("DEBUG: Refresh token has expired!")
                        
            else:
                print(f"❌ Health failed: {response.status_code}")
                print(f"DEBUG: Error response: {response.text}")
                
        except Exception as e:
            print(f"❌ Health send error: {e}")
            
    def wait_for_token(self):
        """Wait for user to input registration token"""
        print("📋 Paste registration token (JSON) and press Enter:")
        try:
            token = input().strip()
            if token.startswith('{') and token.endswith('}'):
                self.set_token(token)
            else:
                print("❌ Invalid JSON format")
        except KeyboardInterrupt:
            print("\n👋 Goodbye!")
            return False
        return True
        
    def handle(self):
        """Main handling method (equivalent to ESP32 handle())"""
        if not self.registered:
            return self.wait_for_token()
            
        # Check if we need to rotate refresh token
        self.check_and_rotate_refresh_token()
        
        # Check if we need to refresh the JWT token
        self.check_and_refresh_token()
        
        # Send health report every minute
        current_time = time.time()
        if current_time - self.last_report > self.HEALTH_REPORT_INTERVAL:
            self.send_health()
            self.last_report = current_time
            
        return True
        
    def start_background_service(self):
        """Start background service thread"""
        if self.running:
            return
            
        self.running = True
        self.background_thread = threading.Thread(target=self._background_loop, daemon=True)
        self.background_thread.start()
        print("🚀 Background service started")
        
    def stop_background_service(self):
        """Stop background service"""
        self.running = False
        if self.background_thread:
            self.background_thread.join()
        print("⏹️ Background service stopped")
        
    def _background_loop(self):
        """Background loop for continuous operation"""
        while self.running:
            try:
                if not self.handle():
                    break
                time.sleep(1)  # Small delay to prevent busy waiting
            except KeyboardInterrupt:
                break
            except Exception as e:
                print(f"❌ Background loop error: {e}")
                time.sleep(5)  # Wait before retrying


def main():
    """Main function for standalone operation"""
    print("🚀 JunctionRelay Python Starting...")
    
    # Initialize JunctionRelay
    relay = JunctionRelay()
    
    print("📊 Device ready")
    
    try:
        # Main loop
        while True:
            if not relay.handle():
                break
                
            time.sleep(1)
            
    except KeyboardInterrupt:
        print("\n👋 Goodbye!")
    except Exception as e:
        print(f"❌ Main loop error: {e}")
    finally:
        relay.stop_background_service()


if __name__ == "__main__":
    main()