<?php
/**
 * Plugin Name: J1939 DM1 Calculator
 * Plugin URI: https://github.com/AKCX2002/wordpress-dm1-calculator
 * Description: 在线计算 J1939 DM1(0xFECA) 单帧/TP.BAM 报文，仅生成报文数据不发送。支持标准与高低位交换 B3 位域对照，提供短代码 [dm1_calc] 和后台工具页。
 * Version: 0.2.1
 * Author: Babel36acl
 * License: GPL-2.0-or-later
 * License URI: https://www.gnu.org/licenses/gpl-2.0.html
 */

if (!defined('ABSPATH')) {
    exit;
}

final class J1939_DM1_Calculator_Plugin {
    private const SLUG = 'j1939-dm1-calculator';
    private const VERSION = '0.2.1';

    public static function init(): void {
        add_shortcode('dm1_calc', [__CLASS__, 'render_shortcode']);
        add_action('admin_menu', [__CLASS__, 'register_admin_page']);
        add_action('wp_enqueue_scripts', [__CLASS__, 'enqueue_frontend_assets']);
        add_action('admin_enqueue_scripts', [__CLASS__, 'enqueue_admin_assets']);
    }

    public static function register_admin_page(): void {
        add_management_page(
            'J1939 DM1 Calculator',
            'J1939 DM1 Calculator',
            'manage_options',
            self::SLUG,
            [__CLASS__, 'render_admin_page']
        );
    }

    public static function render_admin_page(): void {
        echo '<div class="wrap">';
        echo '<h1>J1939 DM1 Calculator</h1>';
        echo self::render_app();
        echo '</div>';
    }

    public static function render_shortcode($atts = []): string {
        return self::render_app();
    }

    public static function enqueue_frontend_assets(): void {
        if (!is_singular()) {
            return;
        }

        global $post;
        if (!$post || !has_shortcode((string) ($post->post_content ?? ''), 'dm1_calc')) {
            return;
        }

        self::enqueue_assets();
    }

    public static function enqueue_admin_assets(string $hook): void {
        if ($hook !== 'tools_page_' . self::SLUG) {
            return;
        }

        self::enqueue_assets();
    }

    private static function enqueue_assets(): void {
        $base_url = plugin_dir_url(__FILE__);
        $base_dir = plugin_dir_path(__FILE__);

        wp_enqueue_style(
            'j1939-dm1-calculator',
            $base_url . 'assets/css/dm1-calculator.css',
            [],
            (string) filemtime($base_dir . 'assets/css/dm1-calculator.css')
        );

        wp_enqueue_script(
            'j1939-dm1-calculator',
            $base_url . 'assets/js/dm1-calculator.js',
            [],
            (string) filemtime($base_dir . 'assets/js/dm1-calculator.js'),
            true
        );

        wp_add_inline_script(
            'j1939-dm1-calculator',
            'window.DM1_CALC_CONFIG = ' . wp_json_encode(
                [
                    'version' => self::VERSION,
                    'labels' => [
                        'std' => '标准(J1939-73)',
                        'swap' => '高低位交换',
                    ],
                ],
                JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES
            ) . ';',
            'before'
        );
    }

    private static function render_app(): string {
        ob_start();
        ?>
        <div class="dm1calc" data-dm1calc>
            <section class="dm1calc__hero">
                <div class="dm1calc__hero-copy">
                    <p class="dm1calc__eyebrow">J1939 / DM1 / FECA</p>
                    <h2>在线校验 DM1 单帧与 TP.BAM 报文</h2>
                    <p class="dm1calc__desc">
                        输入灯状态和 DTC，直接生成 J1939 DM1 报文数据。工具只计算，不发送。
                        同时提供 Byte3 (B3) 标准位域与「高低位交换」对照，方便联调排错。
                    </p>
                </div>
                <div class="dm1calc__hero-note">
                    <div class="dm1calc__hero-chip">短代码 <code>[dm1_calc]</code></div>
                    <div class="dm1calc__hero-chip">后台工具页</div>
                    <div class="dm1calc__hero-chip">批量导入 DTC</div>
                </div>
            </section>

            <details class="dm1calc__details">
                <summary>协议说明与位域定义</summary>
                <div class="dm1calc__details-body">
                    <div class="dm1calc__info-grid">
                        <section class="dm1calc__info-card">
                            <h3>基本信息</h3>
                            <ul>
                                <li>PGN：<code>0xFECA</code> / <code>65226</code></li>
                                <li>用途：广播当前激活故障码和四个诊断灯状态</li>
                                <li>结构：前 2 字节灯状态，后续每 4 字节 1 条 DTC</li>
                                <li>长度：原始有效载荷 ≤ 8 字节时走单帧，否则走 TP.BAM</li>
                            </ul>
                        </section>
                        <section class="dm1calc__info-card">
                            <h3>DTC 编码</h3>
                            <ul>
                                <li><code>B1 = SPN[7:0]</code></li>
                                <li><code>B2 = SPN[15:8]</code></li>
                                <li>标准模式：<code>B3 = SPN[18:16]@bit0..2 + FMI@bit3..7</code></li>
                                <li>交换模式：<code>B3 = SPN[18:16]@bit5..7 + FMI@bit0..4</code></li>
                                <li><code>B4 = OC@bit0..6 + CM@bit7</code></li>
                            </ul>
                        </section>
                        <section class="dm1calc__info-card">
                            <h3>灯状态</h3>
                            <ul>
                                <li>Byte0：MIL / Red Stop / Amber Warning / Protect 状态</li>
                                <li>Byte1：对应四个灯的闪烁状态</li>
                                <li>每项 2 bit：0=关，1=开，2=保留，3=不可用</li>
                            </ul>
                        </section>
                    </div>
                    <div class="dm1calc__callout">
                        常见误解：把标准模式里的 <code>SPN[18:16]</code> 和 <code>FMI</code> 位置对调，会把示例
                        <code>SPN=1083, FMI=22</code> 错解成 <code>328763 / 16</code>。本工具会把两种模式并列显示。
                    </div>
                </div>
            </details>

            <div class="dm1calc__grid">
                <div class="dm1calc__status dm1calc__card--wide" data-status hidden></div>

                <section class="dm1calc__card">
                    <h3>基本参数</h3>
                    <div class="dm1calc__row">
                        <label for="dm1-sa">SA</label>
                        <input id="dm1-sa" type="text" value="0x80" data-sa>
                        <label for="dm1-priority">DM1 Priority</label>
                        <input id="dm1-priority" type="number" min="0" max="7" value="6" data-priority>
                        <label for="dm1-tp-priority">TP Priority</label>
                        <input id="dm1-tp-priority" type="number" min="0" max="7" value="6" data-tp-priority>
                        <button type="button" data-recalc>重新计算</button>
                    </div>
                    <p class="dm1calc__hint">
                        DM1 常见优先级为 6。TP.CM / TP.DT 也通常沿用同一优先级。
                    </p>
                </section>

                <section class="dm1calc__card">
                    <h3>灯状态</h3>
                    <div class="dm1calc__lamp-grid">
                        <?php foreach (self::lamp_definitions() as $lamp_key => $lamp_label) : ?>
                            <article class="dm1calc__lamp">
                                <div class="dm1calc__lamp-title"><?php echo esc_html($lamp_label); ?></div>
                                <label>状态</label>
                                <select data-lamp="<?php echo esc_attr($lamp_key); ?>" data-kind="status">
                                    <?php echo self::render_lamp_options(); ?>
                                </select>
                                <label>闪烁</label>
                                <select data-lamp="<?php echo esc_attr($lamp_key); ?>" data-kind="flash">
                                    <?php echo self::render_lamp_options(); ?>
                                </select>
                            </article>
                        <?php endforeach; ?>
                    </div>
                </section>

                <section class="dm1calc__card dm1calc__card--wide">
                    <div class="dm1calc__section-head">
                        <h3>DTC 列表</h3>
                        <p>支持输入十进制或 <code>0x</code> 十六进制，支持 <code>SPN1083</code> / <code>FMI=22</code> 前缀格式。</p>
                    </div>

                    <div class="dm1calc__row dm1calc__row--inputs">
                        <label for="dm1-spn">SPN</label>
                        <input id="dm1-spn" type="text" value="1083" data-spn>
                        <label for="dm1-fmi">FMI</label>
                        <input id="dm1-fmi" type="text" value="22" data-fmi>
                        <label for="dm1-oc">OC</label>
                        <input id="dm1-oc" type="text" value="1" data-oc>
                        <label for="dm1-cm">CM</label>
                        <input id="dm1-cm" type="text" value="0" data-cm>
                        <label for="dm1-b3-mode">B3 模式</label>
                        <select id="dm1-b3-mode" data-b3-mode>
                            <option value="std">标准(J1939-73)</option>
                            <option value="swap">高低位交换</option>
                        </select>
                    </div>

                    <div class="dm1calc__row dm1calc__row--actions">
                        <button type="button" data-add>添加</button>
                        <button type="button" data-update disabled>更新选中</button>
                        <button type="button" data-delete disabled>删除选中</button>
                        <button type="button" data-clear>清空</button>
                    </div>

                    <div class="dm1calc__table-wrap">
                        <table class="dm1calc__table" data-table>
                            <thead>
                                <tr>
                                    <th>#</th>
                                    <th>SPN</th>
                                    <th>FMI</th>
                                    <th>OC</th>
                                    <th>CM</th>
                                    <th>Bytes</th>
                                    <th>当前模式回读</th>
                                    <th>另一模式对照</th>
                                </tr>
                            </thead>
                            <tbody></tbody>
                        </table>
                    </div>

                    <details class="dm1calc__details dm1calc__details--compact">
                        <summary>批量导入</summary>
                        <div class="dm1calc__details-body">
                            <p class="dm1calc__hint">
                                每行一条：<code>SPN,FMI,OC[,CM]</code> 或 <code>SPN:FMI:OC[:CM]</code>。也支持 JSON：
                                <code>[{"spn":1083,"fmi":22,"oc":1}]</code> 或 <code>{"dtcs":[...]}</code>。
                            </p>
                            <textarea rows="6" data-import></textarea>
                            <div class="dm1calc__row dm1calc__row--actions">
                                <button type="button" data-import-btn>导入并覆盖列表</button>
                            </div>
                        </div>
                    </details>
                </section>

                <section class="dm1calc__card dm1calc__card--wide">
                    <div class="dm1calc__section-head">
                        <h3>计算结果</h3>
                        <p>输出格式面向联调复制，包含 29 位 ID 与 8 字节数据。</p>
                    </div>
                    <div class="dm1calc__row dm1calc__row--actions">
                        <button type="button" data-copy>复制输出</button>
                    </div>
                    <textarea rows="16" readonly data-output></textarea>
                </section>

                <section class="dm1calc__card">
                    <div class="dm1calc__section-head">
                        <h3>29 位 CAN ID 解析</h3>
                        <p>输入扩展帧 ID，快速拆出 Priority、PGN、PDU 类型和 SA。</p>
                    </div>
                    <div class="dm1calc__row dm1calc__row--inputs">
                        <label for="dm1-can-id">CAN ID</label>
                        <input id="dm1-can-id" type="text" value="0x18FECA80" data-can-id>
                        <button type="button" data-parse-can-id>解析</button>
                    </div>
                    <textarea rows="8" readonly data-can-id-output></textarea>
                </section>

                <section class="dm1calc__card">
                    <div class="dm1calc__section-head">
                        <h3>DTC 原始字节解码</h3>
                        <p>输入 4 字节原始 DTC，按标准或交换模式直接回读 SPN / FMI / OC / CM。</p>
                    </div>
                    <div class="dm1calc__row dm1calc__row--inputs">
                        <label for="dm1-dtc-bytes">Bytes</label>
                        <input id="dm1-dtc-bytes" type="text" value="3B 04 B0 01" data-dtc-bytes>
                        <label for="dm1-dtc-decode-mode">模式</label>
                        <select id="dm1-dtc-decode-mode" data-dtc-decode-mode>
                            <option value="std">标准(J1939-73)</option>
                            <option value="swap">高低位交换</option>
                        </select>
                        <button type="button" data-decode-dtc>解码</button>
                    </div>
                    <textarea rows="8" readonly data-dtc-decode-output></textarea>
                </section>
            </div>
        </div>
        <?php

        return (string) ob_get_clean();
    }

    private static function lamp_definitions(): array {
        return [
            'mil' => 'MIL',
            'red' => 'Red Stop',
            'amber' => 'Amber Warning',
            'protect' => 'Protect',
        ];
    }

    private static function render_lamp_options(): string {
        $options = [
            ['0', '关 / 不闪 (0)'],
            ['1', '开 / 慢闪 (1)'],
            ['2', '保留 / 快闪 (2)'],
            ['3', '不可用 (3)'],
        ];

        $html = '';
        foreach ($options as [$value, $label]) {
            $html .= '<option value="' . esc_attr($value) . '">' . esc_html($label) . '</option>';
        }

        return $html;
    }
}

J1939_DM1_Calculator_Plugin::init();
