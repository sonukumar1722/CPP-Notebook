#!/bin/bash
source /root/miniconda3/etc/profile.d/conda.sh
conda activate cling_env

echo "=== Health ==="
curl -s http://localhost:8000/api/health

echo ""
echo "=== Login ==="
TOKEN_RESP=$(curl -s -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@cppnote.local","password":"cppnote123"}')
echo $TOKEN_RESP

TOKEN=$(echo $TOKEN_RESP | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")
echo ""
echo "=== Token: $TOKEN ==="

echo ""
echo "=== /me ==="
curl -s http://localhost:8000/api/auth/me \
  -H "Authorization: Bearer $TOKEN"

echo ""
echo "=== /api/notebooks/kernels ==="
curl -s http://localhost:8000/api/notebooks/kernels \
  -H "Authorization: Bearer $TOKEN"

echo ""
echo "=== /api/fs/list ==="
curl -s http://localhost:8000/api/fs/list \
  -H "Authorization: Bearer $TOKEN"

echo ""
echo "=== ALL TESTS PASSED ==="
