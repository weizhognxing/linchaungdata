#!/bin/bash

set -e

DB_NAME="picco"
DB_USER="root"
DB_PASS="root"
PROJECT_DIR=$(cd "$(dirname "$0")" && pwd)

echo "=============================="
echo " PICCO 系统安装脚本 (CentOS 7)"
echo "=============================="

echo "[1/6] 安装 Python 3..."
yum install -y epel-release
yum install -y python3 python3-pip

echo "[2/6] 安装 MariaDB..."
yum install -y mariadb-server mariadb
systemctl start mariadb
systemctl enable mariadb

echo "[3/6] 配置数据库..."
mysql -u${DB_USER} -e "CREATE DATABASE IF NOT EXISTS ${DB_NAME} DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
mysql -u${DB_USER} -e "ALTER USER '${DB_USER}'@'localhost' IDENTIFIED BY '${DB_PASS}';" 2>/dev/null || mysql -u${DB_USER} -e "SET PASSWORD FOR '${DB_USER}'@'localhost' = PASSWORD('${DB_PASS}');" 2>/dev/null || true
mysql -u${DB_USER} -p${DB_PASS} ${DB_NAME} < ${PROJECT_DIR}/schema.sql

echo "[4/6] 安装 Python 依赖..."
cd ${PROJECT_DIR}
pip3 install -r requirements.txt

echo "[5/6] 创建 systemd 服务..."
cat > /etc/systemd/system/picco.service << EOF
[Unit]
Description=PICCO Web Application
After=network.target mariadb.service

[Service]
User=root
WorkingDirectory=${PROJECT_DIR}
ExecStart=/usr/bin/python3 ${PROJECT_DIR}/app.py
Restart=always
RestartSec=5
Environment=FLASK_ENV=production

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable picco

echo "[6/6] 启动服务..."
systemctl start picco

echo ""
echo "=============================="
echo " 安装完成!"
echo "=============================="
echo ""
echo "访问地址: http://$(hostname -I | awk '{print $1}'):5000"
echo ""
echo "管理员账号: admin"
echo "管理员密码: admin123"
echo ""
echo "常用命令:"
echo "  启动: systemctl start picco"
echo "  停止: systemctl stop picco"
echo "  重启: systemctl restart picco"
echo "  状态: systemctl status picco"
echo "  日志: journalctl -u picco -f"
echo ""
