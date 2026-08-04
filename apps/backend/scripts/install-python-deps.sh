#!/bin/bash
# scripts/install-python-deps.sh
# Install Python dependencies for face recognition server

set -e

echo "Installing Python dependencies for face recognition server..."

# Check if Python 3 is available
if ! command -v python3 &> /dev/null; then
    echo "Python 3 is not installed. Please install Python 3.8 or higher."
    exit 1
fi

# Create virtual environment if it doesn't exist
if [ ! -d ".venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv .venv
fi

# Activate virtual environment
source .venv/bin/activate

# Upgrade pip
echo "Upgrading pip..."
pip install --upgrade pip > /dev/null

# Install dependencies
echo "Installing dependencies (this may take several minutes for dlib)..."
pip install -r requirements.txt

echo ""
echo "Python dependencies installed successfully"
echo ""
echo "To activate the virtual environment:"
echo "  source .venv/bin/activate"
echo ""
echo "To test the Python server:"
echo "  python3 scripts/test-python-server.py"
