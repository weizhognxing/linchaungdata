# PICCO 临床检验数据录入系统

PICCO 是一个基于 Python + MySQL + HTML/CSS/jQuery 的临床检验数据录入系统，包含客户端 APP 页面和管理员 PC 后台。

## 功能范围

- 客户端：注册、登录、短信验证码找回密码占位、疾病选择、拍照/图片上传、图像识别接口占位、动态检验表单编辑、检验记录保存。
- 管理后台：管理员登录、会员审核/禁用、检验记录字段管理、按疾病配置表单显示字段。
- 数据库：管理员表、用户表、疾病表、病患表、检验记录表、字段设置表、表单设置表。

## 环境要求

- Python 3.11+
- MySQL 5.7+
- Python 依赖：`Flask`、`PyMySQL`

当前数据库配置在 `config.py`：

```python
DB_HOST = "127.0.0.1"
DB_PORT = 3306
DB_USER = "root"
DB_PASSWORD = "123123"
DB_NAME = "picco"
```

## 启动方式

安装依赖：

```bash
python -m pip install -r requirements.txt
```

初始化数据库：

```bash
python -m flask --app app init-db
```

启动服务：

```bash
python app.py
```

访问地址：

- 客户端 APP：`http://127.0.0.1:5000/app`
- 管理员后台：`http://127.0.0.1:5000/admin`

## 默认账号

- 管理员账号：`admin`
- 管理员密码：`admin123`

客户端用户注册后默认是 `pending` 状态，需要管理员在后台会员管理中点击“通过”后才能登录。

## 开发说明

- 短信验证码接口目前是开发占位，验证码固定为 `123456`，后续可在 `app.py` 的 `/api/password/sms` 接入真实短信服务。
- 图像识别接口目前是占位，上传图片后返回空的动态表单，后续可在 `app.py` 的 `/api/recognize` 接入阿里巴巴 AI 接口。
- 管理员新增检验字段时会同步执行 `ALTER TABLE lab_records ADD COLUMN`，字段名只允许小写字母、数字、下划线，并且必须以小写字母开头。
- 动态字段类型限制在 `varchar`、`text`、`int`、`decimal`、`date`、`datetime`，所有新增字段都允许为空。

## Android WebView 壳与自动打包

仓库已增加最小可用的 Android WebView 壳工程：`android-shell/`。

- 打开入口：`MainActivity` 会加载 `WEB_URL`。
- 默认地址：`http://117.78.1.19:5000/app`。
- 如果部署到公网，请在构建时覆盖 `WEB_URL`。

### 本地构建 APK

```bash
cd android-shell
gradle :app:assembleDebug -PWEB_URL="https://your-domain/app"
```

生成路径：

`android-shell/app/build/outputs/apk/debug/app-debug.apk`

### GitHub Actions 自动构建

已新增工作流：`.github/workflows/build-android-webview.yml`

- 触发方式 1：修改 `android-shell/` 后 push 到 `main`。
- 触发方式 2：手动 `workflow_dispatch`，并可传入 `web_url`。
- 产物：`picco-webview-debug-apk`（可在 Actions Artifacts 下载 APK）。
