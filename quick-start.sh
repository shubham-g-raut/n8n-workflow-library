#!/bin/bash

echo "🚀 n8n Workflow Library Crawler - Quick Start"
echo "=============================================="
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 18+ first."
    echo "   Visit: https://nodejs.org/"
    exit 1
fi

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "❌ npm is not installed. Please install npm first."
    exit 1
fi

# Check Node.js version
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "❌ Node.js version 18+ is required. Current version: $(node -v)"
    exit 1
fi

echo "✅ Node.js $(node -v) detected"
echo "✅ npm $(npm -v) detected"
echo ""

# Check if Docker is available
if command -v docker &> /dev/null && command -v docker-compose &> /dev/null; then
    echo "🐳 Docker and Docker Compose detected"
    echo "   You can use Docker for easy setup with: docker-compose up -d"
    echo ""
fi

# Install dependencies
echo "📦 Installing dependencies..."
npm install

if [ $? -ne 0 ]; then
    echo "❌ Failed to install dependencies"
    exit 1
fi

# Install Playwright browsers
echo "🌐 Installing Playwright browsers..."
npx playwright install chromium

if [ $? -ne 0 ]; then
    echo "❌ Failed to install Playwright browsers"
    exit 1
fi

# Build the project
echo "🔨 Building the project..."
npm run build

if [ $? -ne 0 ]; then
    echo "❌ Build failed"
    exit 1
fi

# Run tests
echo "🧪 Running tests..."
npm test

if [ $? -ne 0 ]; then
    echo "❌ Tests failed"
    exit 1
fi

echo ""
echo "🎉 Setup completed successfully!"
echo ""
echo "📋 Next steps:"
echo "1. Set up MongoDB (local or cloud)"
echo "2. Create a .env file with your MongoDB connection string"
echo "3. Run the crawler: npm start crawl"
echo ""
echo "📚 Available commands:"
echo "  npm start crawl              - Crawl all workflows from sitemap"
echo "  npm start crawl-specific     - Crawl specific workflow URLs"
echo "  npm start search <query>     - Search workflows"
echo "  npm start stats              - Show workflow statistics"
echo "  npm start health             - Perform health check"
echo ""
echo "🐳 Docker users:"
echo "  docker-compose up -d         - Start MongoDB and crawler"
echo "  docker-compose logs -f       - View logs"
echo "  docker-compose down          - Stop services"
echo ""
echo "📖 For more information, see README.md"
