# J1939 DM1 Calculator

WordPress 在线工具插件，用于计算 `J1939 DM1 (PGN 0xFECA / 65226)` 的单帧和 `TP.BAM` 多包报文。  
插件只生成 CAN 报文数据，不负责发送。

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
