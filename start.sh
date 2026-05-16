#!/bin/bash

echo "Starting PostgreSQL Database..."
docker-compose up -d postgres

echo "Starting FastAPI Backend in Conda environment (via WSL)..."
cd backend
wsl -d Ubuntu -e bash -ic "conda activate cling_env && python -m uvicorn app.main:app --reload" &
BACKEND_PID=$!

echo "Starting Vite Frontend..."
cd ../frontend
npm run dev &
FRONTEND_PID=$!

echo ""
echo "✅ All services are starting!"
echo "   - Frontend: http://localhost:5173"
echo "   - Backend: http://127.0.0.1:8000"
echo "   - Database: postgres:5432"
echo ""
echo "Press Ctrl+C to stop all services."

# Trap Ctrl+C (SIGINT) and kill the background processes automatically
trap 'echo "Stopping services..."; kill $BACKEND_PID $FRONTEND_PID; docker-compose stop postgres; exit' SIGINT

# Wait indefinitely so the script doesn't exit immediately
wait
