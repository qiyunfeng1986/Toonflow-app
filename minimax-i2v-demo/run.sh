#!/usr/bin/env bash
# MiniMax I2V Demo 启动脚本
set -e

DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

if [ -z "$MINIMAX_API_KEY" ]; then
  echo "⚠️  未设置 MINIMAX_API_KEY 环境变量，将以空 key 启动（无法生成视频）。"
  echo "   请先执行:  export MINIMAX_API_KEY=你的APIKey"
  echo ""
fi

if [ ! -d ".venv" ]; then
  echo "首次启动，正在创建虚拟环境..."
  python3 -m venv .venv
  . .venv/bin/activate
  pip install --upgrade pip
  pip install -r requirements.txt
else
  . .venv/bin/activate
fi

PORT=${PORT:-8000}
echo "🚀 启动服务于 http://0.0.0.0:${PORT}"
exec python -m uvicorn app:app --host 0.0.0.0 --port "${PORT}" --reload
