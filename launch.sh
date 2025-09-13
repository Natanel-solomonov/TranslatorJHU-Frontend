#!/bin/bash

# TranslatorJHU Frontend Launch Script
echo "🚀 Starting TranslatorJHU Frontend..."

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

# Build the extension
echo "🔨 Building Chrome Extension..."
npm run build:extension

echo "✅ Chrome Extension built successfully!"
echo ""
echo "📋 To install the extension:"
echo "1. Open Chrome and go to chrome://extensions/"
echo "2. Enable 'Developer mode' in the top right"
echo "3. Click 'Load unpacked' and select the 'dist' folder"
echo "4. The TranslatorJHU extension should now appear in your extensions"
echo ""
echo "🎯 The extension is ready to use!"
