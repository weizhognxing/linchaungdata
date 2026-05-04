#!/bin/bash

set -e

DB_NAME="picco"
DB_USER="root"
DB_PASS="bidos123"
DB_HOST="localhost"
PROJECT_DIR=$(cd "$(dirname "$0")" && pwd)

echo "=============================="
echo " PICCO 系统安装脚本 (CentOS 7)"
echo "=============================="

# 检测并安装 Python 3
echo "[1/6] 检查 Python 3..."
if command -v python3 &> /dev/null; then
    PYTHON_VERSION=$(python3 --version 2>&1)
    echo "  已安装: $PYTHON_VERSION"
else
    echo "  正在安装 Python 3..."
    yum install -y epel-release
    yum install -y python3 python3-pip
fi

# 检测并安装 MariaDB
echo "[2/6] 检查 MariaDB..."
if command -v mysql &> /dev/null; then
    MYSQL_VERSION=$(mysql --version 2>&1)
    echo "  已安装: $MYSQL_VERSION"
else
    echo "  正在安装 MariaDB..."
    yum install -y mariadb-server mariadb
fi

# 启动 MariaDB（如果未运行）
if ! systemctl is-active --quiet mariadb; then
    echo "  启动 MariaDB..."
    systemctl start mariadb
fi

# 设置开机自启
if ! systemctl is-enabled --quiet mariadb; then
    echo "  设置 MariaDB 开机自启..."
    systemctl enable mariadb
fi

# 配置数据库
echo "[3/6] 配置数据库..."
mysql -h${DB_HOST} -u${DB_USER} -e "CREATE DATABASE IF NOT EXISTS ${DB_NAME} DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;" 2>/dev/null || {
    echo "  尝试使用密码连接..."
    mysql -h${DB_HOST} -u${DB_USER} -p${DB_PASS} -e "CREATE DATABASE IF NOT EXISTS ${DB_NAME} DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
}

# 设置密码（如果需要）
mysql -h${DB_HOST} -u${DB_USER} -e "ALTER USER '${DB_USER}'@'localhost' IDENTIFIED BY '${DB_PASS}';" 2>/dev/null || \
mysql -h${DB_HOST} -u${DB_USER} -e "SET PASSWORD FOR '${DB_USER}'@'localhost' = PASSWORD('${DB_PASS}');" 2>/dev/null || \
true

# 导入数据库结构
echo "  导入数据库结构..."
mysql -h${DB_HOST} -u${DB_USER} -p${DB_PASS} ${DB_NAME} < ${PROJECT_DIR}/schema.sql 2>/dev/null || echo "  数据库可能已导入，跳过..."

# 安装 Python 依赖
echo "[4/6] 检查 Python 依赖..."
cd ${PROJECT_DIR}
if python3 -c "import flask; import pymysql" 2>/dev/null; then
    echo "  已安装: Flask, PyMySQL"
else
    echo "  正在安装依赖..."
    pip3 install -r requirements.txt
fi

# 创建 systemd 服务
echo "[5/6] 配置 systemd 服务..."
if [ -f /etc/systemd/system/picco.service ]; then
    echo "  服务文件已存在，更新中..."
else
    echo "  创建服务文件..."
fi

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

# 启动服务
echo "[6/6] 启动服务..."
systemctl restart picco

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
