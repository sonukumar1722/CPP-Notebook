#!/bin/bash

echo "Stopping PostgreSQL Database..."
docker-compose stop

echo "Stopping Vite Frontend..."
# Uses npx to easily find and kill whatever is running on port 5173 (Vite default)
npx kill-port 5173 2>/dev/null || echo "Frontend already stopped."

echo "Stopping FastAPI Backend (WSL)..."
# Searches for the uvicorn process running inside WSL and kills it
wsl -d Ubuntu -e bash -c "pkill -f uvicorn" 2>/dev/null || echo "Backend already stopped."

echo ""
echo "✅ All services have been stopped successfully!"
