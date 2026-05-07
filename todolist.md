# PICCO 需求改造 ToDo List

## （一）数据库修改
- [x] 在 `schema.sql` 新增 `hospitals` 表（`id`、`name`、`created_at`）
- [x] 把 `users.organization` 改为 `users.hospital_id`
- [x] 在 `users` 表新增 `parent_id` 字段，默认 `0`
- [x] 增加 `hospital_id`、`parent_id` 相关索引与外键约束
- [x] 更新示例初始化数据（把原医院名称改为 `hospital_id`）

## （二）单位名称验证功能
- [x] 前端注册页“单位名称”占位文案改为“单位名称，要求一字不差”
- [x] 后端注册流程改造：
  - [x] 先在 `hospitals` 表精确查询
  - [x] 命中时：查同医院 `parent_id=0` 用户，设置新用户 `parent_id`；若无则允许 `parent_id=0`
  - [x] 未命中时：调用高德地图精确查询
  - [x] 高德命中：新增医院，注册用户并设置 `parent_id=0`
  - [x] 高德未命中：返回“该医院不存在，如有问题，请联系管理员：13062334508”
- [x] 新增高德地图服务封装：`app/services/map_service.py`

## （三）前端用户审核功能
- [x] 登录后读取用户 `parent_id`
- [x] `parent_id=0` 才显示底部菜单“会员审核”
- [x] 新增“会员审核”页面（名字、电话、状态、操作）
- [x] 新增接口：获取同医院其他成员列表
- [x] 新增接口：对未审核成员执行“通过”
- [x] 非 `parent_id=0` 用户访问审核接口时返回 403

## （四）BUG 修改：拍照/上传按钮不可点击
- [x] 去掉按钮内联 `onclick`
- [x] 改为 JS 显式事件绑定触发 file input
- [x] 保持选择疾病 -> 进入拍照面板后的按钮可点击
- [x] 失败兜底不影响继续上传识别

## （五）数据迁移（一次性回填）
- [x] 增加一次性迁移方法：`migrate_hospital_data_once()`
- [x] 新增 CLI 命令：`flask --app app migrate-hospital`
- [x] 迁移逻辑：
  - [x] 从 `users.organization` 去重写入 `hospitals`
  - [x] 回填 `users.hospital_id`
  - [x] 若某医院没有 `parent_id=0`，将该医院最早用户设置为 `parent_id=0`

## （六）回归验证建议
- [ ] 注册：医院已存在场景
- [ ] 注册：医院不存在但高德可找到场景
- [ ] 注册：高德找不到场景
- [ ] 会员审核：`parent_id=0` 可见并可审核
- [ ] 会员审核：`parent_id!=0` 不可见且无权限
- [ ] 拍照与上传按钮在手机浏览器/WebView 可点击
