# J1939 DM1 Calculator

WordPress 在线工具插件，用于计算 `J1939 DM1 (PGN 0xFECA / 65226)` 的单帧和 `TP.BAM` 多包报文。

本插件仅在浏览器本地计算并生成 CAN 报文数据，不发送 CAN 报文、不连接 CAN 设备、不上传输入数据。启用自动更新后，WordPress 只会向 GitHub Release 检查版本和下载 zip。

## 功能

- 短代码：`[dm1_calc]`
- 后台工具页：`工具 -> J1939 DM1 Calculator`
- 计算 DM1 单帧与 TP.BAM 分包
- 支持四个灯状态/闪烁 2 bit 编码
- 支持 `DTC Byte3(B3)` 两种模式：
  - `标准(J1939-73)`
  - `高低位交换`
- 支持批量导入：
  - `SPN,FMI,OC[,CM]`
  - `SPN:FMI:OC[:CM]`
  - JSON 数组或 `{ "dtcs": [...] }`
- 输出当前模式回读与另一模式对照，方便定位 `1083/22 -> 328763/16` 类解析错误
- 新增 `29 位 CAN ID 解析`
- 新增 `4 字节 DTC 原始字节解码`
- 页面内错误状态提示，不再只依赖弹窗或控制台

## 本地计算声明

- 所有 DM1、TP.BAM、CAN ID 和 DTC 解码计算均在浏览器内完成。
- 插件不提供 CAN 发送接口，不会写入总线，也不会连接任何硬件设备。
- 表单输入、DTC 列表和计算结果不会提交到本站服务器或第三方服务。
- 自动更新检查由 `Plugin Update Checker` 完成，只访问 GitHub Release 元数据和 Release zip。

## 许可证

本项目以 `GPL-2.0-or-later` 发布，仓库根目录包含 GNU General Public License v2.0 全文。

## 目录

```text
wordpress-dm1-calculator/
├── dm1-calculator.php
├── assets/
│   ├── css/dm1-calculator.css
│   └── js/dm1-calculator.js
├── scripts/verify-dm1.mjs
└── README.md
```

## 安装

1. 将 `wordpress-dm1-calculator/` 打包为 zip。
2. WordPress 后台 -> 插件 -> 安装插件 -> 上传 zip -> 启用。

## 自动更新

插件内置 `Plugin Update Checker`，从 GitHub Release 检查更新。仓库 `main` 分支有普通提交时，GitHub Actions 会自动：

- 递增插件补丁版本号
- 提交版本号变更并附加 `[skip ci]`
- 打包 `wordpress-dm1-calculator-{version}.zip`
- 创建 `v{version}` GitHub Release 并上传 zip

WordPress 后台检测到新 Release 后，会按普通插件更新流程提示升级。

## 校验结论

当前重构版本保留了远端活站 `0.1.2` 的核心算法行为，并额外做了本地脚本验证：

- 标准模式：`SPN=1083, FMI=22, OC=1, CM=0 -> 3B 04 B0 01`
- 高低位交换：`SPN=1083, FMI=22, OC=1, CM=0 -> 3B 04 16 01`
- 标准模式误按交换模式解码时：`1083/22 -> 328763/16`
- `SA=0x80, Priority=6` 时：
  - DM1 单帧 ID = `0x18FECA80`
  - TP.CM BAM ID = `0x18ECFF80`
  - TP.DT BAM ID = `0x18EBFF80`

运行验证脚本：

```bash
node scripts/verify-dm1.mjs
```

预期输出：

```text
verify-dm1: OK
```

## UI 方向

UI 按 `sakurairo-arcaea-blog-skill` 的 Arcaea 规则重整：使用 scoped `--arcaea-*` token、低饱和冷色玻璃层、可读的深色表格面、移动端堆叠表格和 Sakurairo 全局过渡防护，不再把大段 CSS/JS 内联塞进单个 PHP 文件。

## 验证状态

- 构建未验证：不涉及构建
- WordPress 页面渲染：本地未实际挂站验证
- 算法验证：已通过 `scripts/verify-dm1.mjs`
