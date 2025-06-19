#!/bin/bash

echo "🔧 Testing A2A setup..."
echo ""

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "❌ npm is not installed. Please install Node.js first."
    exit 1
fi

# Check Node.js version
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 20 ]; then
    echo "❌ Node.js version 20 or higher is required. Current version: $(node -v)"
    exit 1
fi

echo "✅ Node.js version: $(node -v)"
echo "✅ npm version: $(npm -v)"
echo ""

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Build the project
echo ""
echo "🏗️  Building the project..."
npm run build

echo ""
echo "✅ A2A setup completed successfully!"
echo ""
echo "To run the demo:"
echo "  npm run demo"
echo ""
echo "To run agents individually:"
echo "  npm run start:coordinator  # Terminal 1"
echo "  npm run start:agent1       # Terminal 2"
echo "  npm run start:agent2       # Terminal 3"