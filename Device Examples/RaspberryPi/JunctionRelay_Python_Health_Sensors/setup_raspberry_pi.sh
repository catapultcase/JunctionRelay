#!/bin/bash

echo "🚀 Setting up JunctionRelay on Raspberry Pi..."

# Update system packages
echo "📦 Updating system packages..."
sudo apt update

# Install Python3 and pip if not already installed
echo "🐍 Installing Python dependencies..."
sudo apt install -y python3 python3-pip python3-venv

# Install system dependencies for cryptography
echo "🔐 Installing cryptographic dependencies..."
sudo apt install -y build-essential libssl-dev libffi-dev python3-dev

# Create virtual environment
echo "🌍 Creating virtual environment..."
python3 -m venv junction_relay_env

# Activate virtual environment and install Python packages
echo "📚 Installing Python packages..."
source junction_relay_env/bin/activate
pip install --upgrade pip
pip install -r requirements.txt

echo "✅ Setup complete!"
echo ""
echo "To run JunctionRelay:"
echo "  source junction_relay_env/bin/activate"
echo "  python3 junctionrelay_python.py"
echo ""
echo "To run as a service:"
echo "  # Copy service file (adjust paths as needed)"
echo "  sudo cp junctionrelay.service /etc/systemd/system/"