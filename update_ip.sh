#!/bin/bash
# =====================================================
# UPDATE IP ADDRESS - FRONTEND & BACKEND
# =====================================================
# Usage: ./update_ip.sh <new_ip>
# Example: ./update_ip.sh 192.168.1.200
#
# This script updates the server IP address in:
# - frontend/.env
# - backend/.env
#
# NOTE: ESP32 files must be updated manually in Arduino IDE

if [ -z "$1" ]; then
    echo "Usage: $0 <new_ip_address>"
    echo "Example: $0 192.168.1.200"
    exit 1
fi

NEW_IP=$1
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "🔄 Updating IP address to: $NEW_IP"
echo ""

# Update frontend .env
if [ -f "$SCRIPT_DIR/frontend/.env" ]; then
    sed -i "s/VITE_SERVER_IP=.*/VITE_SERVER_IP=$NEW_IP/" "$SCRIPT_DIR/frontend/.env"
    echo "✅ Updated frontend/.env"
else
    echo "❌ frontend/.env not found"
fi

# Update backend .env
if [ -f "$SCRIPT_DIR/backend/.env" ]; then
    sed -i "s|mqtt://[0-9.]*:|mqtt://$NEW_IP:|" "$SCRIPT_DIR/backend/.env"
    echo "✅ Updated backend/.env"
else
    echo "❌ backend/.env not found"
fi

echo ""
echo "================================================"
echo "✨ IP address updated to: $NEW_IP"
echo ""
echo "📋 Next steps:"
echo "   1. Restart backend: cd backend && npm start"
echo "   2. Restart frontend: cd frontend && npm run dev"
echo ""
echo "⚠️  Don't forget to also update ESP32 sketches manually:"
echo "   - ESP32-CAM/ESP32-CAM-ino (line 22: mqtt_server)"
echo "   - ESP32-MAIN/ESP32-MAIN.ino (lines 15 & 23)"
echo "================================================"
