(function () {
  const MODE_STD = "std";
  const MODE_SWAP = "swap";
  const DEFAULT_LAMP_KEYS = ["mil", "red", "amber", "protect"];

  function qs(root, selector) {
    return root.querySelector(selector);
  }

  function qsa(root, selector) {
    return Array.from(root.querySelectorAll(selector));
  }

  function parseInteger(value, label) {
    if (value === null || value === undefined) {
      throw new Error(label + " 为空");
    }

    let text = String(value).trim();
    if (!text) {
      throw new Error(label + " 为空");
    }

    const lower = text.toLowerCase();
    for (const prefix of ["spn", "fmi", "oc", "cm", "sa"]) {
      if (lower.startsWith(prefix)) {
        text = text.slice(prefix.length).replace(/^\s*[=:\t ]\s*/, "");
        break;
      }
    }

    if (/^0x/i.test(text)) {
      return parseInt(text, 16);
    }

    if (!/^[+-]?\d+$/.test(text)) {
      throw new Error(label + " 不是有效整数: " + value);
    }

    return parseInt(text, 10);
  }

  function setStatus(root, message) {
    const status = qs(root, "[data-status]");
    if (!status) {
      return;
    }
    if (!message) {
      status.hidden = true;
      status.textContent = "";
      return;
    }
    status.hidden = false;
    status.textContent = message;
  }

  function formatHex(value, width) {
    return value.toString(16).toUpperCase().padStart(width, "0");
  }

  function formatBytes(bytes) {
    return bytes.map((byte) => formatHex(byte, 2)).join(" ");
  }

  function make29bitId(priority, pgn, sa, dest) {
    if (priority < 0 || priority > 7) {
      throw new Error("Priority 必须是 0..7");
    }
    if (pgn < 0 || pgn > 0x3ffff) {
      throw new Error("PGN 超出范围");
    }
    if (sa < 0 || sa > 0xff) {
      throw new Error("SA 必须是 0..255");
    }

    const dp = (pgn >> 16) & 0x01;
    const pf = (pgn >> 8) & 0xff;
    const psFromPgn = pgn & 0xff;
    const ps = pf < 240 ? dest : psFromPgn;

    if (pf < 240 && (ps === undefined || ps < 0 || ps > 0xff)) {
      throw new Error("PDU1 需要有效目标地址");
    }

    return (
      ((priority & 0x07) << 26) |
      ((dp & 0x01) << 24) |
      ((pf & 0xff) << 16) |
      ((ps & 0xff) << 8) |
      (sa & 0xff)
    ) >>> 0;
  }

  function encodeDtc(dtc, mode) {
    const spn = dtc.spn;
    const fmi = dtc.fmi;
    const oc = dtc.oc;
    const cm = dtc.cm;

    if (spn < 0 || spn > 0x7ffff) {
      throw new Error("SPN 必须是 0..524287");
    }
    if (fmi < 0 || fmi > 31) {
      throw new Error("FMI 必须是 0..31");
    }
    if (oc < 0 || oc > 127) {
      throw new Error("OC 必须是 0..127");
    }
    if (cm < 0 || cm > 1) {
      throw new Error("CM 必须是 0 或 1");
    }

    const b1 = spn & 0xff;
    const b2 = (spn >> 8) & 0xff;
    let b3 = 0;

    if (mode === MODE_STD) {
      b3 = ((spn >> 16) & 0x07) | ((fmi & 0x1f) << 3);
    } else if (mode === MODE_SWAP) {
      b3 = (((spn >> 16) & 0x07) << 5) | (fmi & 0x1f);
    } else {
      throw new Error("未知 B3 模式");
    }

    const b4 = (oc & 0x7f) | ((cm & 0x01) << 7);
    return [b1, b2, b3, b4];
  }

  function decodeDtc(bytes, mode) {
    const [b1, b2, b3, b4] = bytes;
    let spn = 0;
    let fmi = 0;

    if (mode === MODE_STD) {
      spn = b1 | (b2 << 8) | ((b3 & 0x07) << 16);
      fmi = (b3 >> 3) & 0x1f;
    } else if (mode === MODE_SWAP) {
      spn = b1 | (b2 << 8) | (((b3 >> 5) & 0x07) << 16);
      fmi = b3 & 0x1f;
    } else {
      throw new Error("未知 B3 模式");
    }

    return {
      spn: spn,
      fmi: fmi,
      oc: b4 & 0x7f,
      cm: (b4 >> 7) & 0x01,
    };
  }

  function lampBytes(lamps) {
    return [
      (lamps.mil & 0x03) |
        ((lamps.red & 0x03) << 2) |
        ((lamps.amber & 0x03) << 4) |
        ((lamps.protect & 0x03) << 6),
      (lamps.milFlash & 0x03) |
        ((lamps.redFlash & 0x03) << 2) |
        ((lamps.amberFlash & 0x03) << 4) |
        ((lamps.protectFlash & 0x03) << 6),
    ];
  }

  function parseByteString(text) {
    const tokens = String(text || "")
      .trim()
      .split(/[\s,;:-]+/)
      .filter(Boolean);

    if (tokens.length !== 4) {
      throw new Error("DTC 原始字节必须正好 4 个");
    }

    return tokens.map((token) => {
      const normalized = token.replace(/^0x/i, "");
      if (!/^[0-9a-fA-F]{1,2}$/.test(normalized)) {
        throw new Error("非法字节: " + token);
      }
      return parseInt(normalized, 16);
    });
  }

  function decodeCanId(rawValue) {
    const id = parseInteger(rawValue, "CAN ID");
    if (id < 0 || id > 0x1fffffff) {
      throw new Error("CAN ID 必须是 29 位扩展帧范围");
    }

    const priority = (id >> 26) & 0x07;
    const reserved = (id >> 25) & 0x01;
    const dp = (id >> 24) & 0x01;
    const pf = (id >> 16) & 0xff;
    const ps = (id >> 8) & 0xff;
    const sa = id & 0xff;
    const isPdu1 = pf < 240;
    const pgn = isPdu1 ? ((dp << 16) | (pf << 8)) : ((dp << 16) | (pf << 8) | ps);

    return {
      id,
      priority,
      reserved,
      dp,
      pf,
      ps,
      sa,
      pgn,
      pduType: isPdu1 ? "PDU1 点对点" : "PDU2 广播",
      destination: isPdu1 ? ps : null,
      groupExtension: isPdu1 ? null : ps,
    };
  }

  function buildTpBamFrames(sa, payload, tpPriority) {
    const totalBytes = payload.length;
    const packetCount = Math.ceil(totalBytes / 7);
    const tpCmId = make29bitId(tpPriority, 0xec00, sa, 0xff);
    const tpDtId = make29bitId(tpPriority, 0xeb00, sa, 0xff);
    const frames = [
      {
        id: tpCmId,
        data: [0x20, totalBytes & 0xff, (totalBytes >> 8) & 0xff, packetCount & 0xff, 0xff, 0xca, 0xfe, 0x00],
      },
    ];

    let sequence = 1;
    for (let index = 0; index < payload.length; index += 7) {
      const chunk = payload.slice(index, index + 7);
      while (chunk.length < 7) {
        chunk.push(0xff);
      }
      frames.push({
        id: tpDtId,
        data: [sequence & 0xff].concat(chunk),
      });
      sequence += 1;
    }

    return frames;
  }

  function buildDm1Frames(sa, dtcs, lamps, dm1Priority, tpPriority, mode) {
    const payload = lampBytes(lamps);
    dtcs.forEach((dtc) => payload.push(...encodeDtc(dtc, mode)));

    const effectivePayloadLength = 2 + dtcs.length * 4;
    const payloadRaw = payload.slice(0, effectivePayloadLength);

    if (effectivePayloadLength <= 8) {
      while (payload.length < 8) {
        payload.push(0xff);
      }
      return {
        payloadLength: effectivePayloadLength,
        payloadRaw: payloadRaw,
        frames: [
          {
            id: make29bitId(dm1Priority, 0xfeca, sa),
            data: payload,
          },
        ],
      };
    }

    return {
      payloadLength: effectivePayloadLength,
      payloadRaw: payloadRaw,
      frames: buildTpBamFrames(sa, payloadRaw.slice(), tpPriority),
    };
  }

  function readLampState(root) {
    const state = {};
    DEFAULT_LAMP_KEYS.forEach((key) => {
      state[key] = parseInt(qs(root, '[data-lamp="' + key + '"][data-kind="status"]').value, 10) || 0;
      state[key + "Flash"] = parseInt(qs(root, '[data-lamp="' + key + '"][data-kind="flash"]').value, 10) || 0;
    });
    return state;
  }

  function readDtcFields(root) {
    return {
      spn: parseInteger(qs(root, "[data-spn]").value, "SPN"),
      fmi: parseInteger(qs(root, "[data-fmi]").value, "FMI"),
      oc: parseInteger(qs(root, "[data-oc]").value, "OC"),
      cm: parseInteger(qs(root, "[data-cm]").value, "CM"),
    };
  }

  function parseDtcImport(rawText, mode) {
    const raw = String(rawText || "").trim();
    if (!raw) {
      throw new Error("导入内容为空");
    }

    const parsed = [];
    function normalize(record) {
      const dtc = {
        spn: parseInteger(record.spn ?? record.SPN, "SPN"),
        fmi: parseInteger(record.fmi ?? record.FMI, "FMI"),
        oc: parseInteger(record.oc ?? record.OC ?? 0, "OC"),
        cm: parseInteger(record.cm ?? record.CM ?? 0, "CM"),
      };
      encodeDtc(dtc, mode);
      parsed.push(dtc);
    }

    if (/^[{\[]/.test(raw)) {
      const data = JSON.parse(raw);
      const list = Array.isArray(data) ? data : data.dtcs;
      if (!Array.isArray(list)) {
        throw new Error("JSON 必须是数组或 {dtcs:[...]}");
      }
      list.forEach(normalize);
      return parsed;
    }

    const lines = raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"));

    lines.forEach((line) => {
      const separator = line.includes(",") ? "," : line.includes(":") ? ":" : null;
      if (!separator) {
        throw new Error("无法识别分隔符: " + line);
      }
      const parts = line.split(separator).map((part) => part.trim()).filter(Boolean);
      if (parts.length !== 3 && parts.length !== 4) {
        throw new Error("字段数量应为 3 或 4: " + line);
      }
      normalize({
        spn: parts[0],
        fmi: parts[1],
        oc: parts[2],
        cm: parts[3] ?? 0,
      });
    });

    return parsed;
  }

  function renderTable(root, state) {
    const mode = qs(root, "[data-b3-mode]").value === MODE_SWAP ? MODE_SWAP : MODE_STD;
    const tableBody = qs(root, "[data-table] tbody");
    tableBody.innerHTML = "";

    state.dtcs.forEach((dtc, index) => {
      const currentBytes = encodeDtc(dtc, mode);
      const currentDecode = decodeDtc(currentBytes, mode);
      const otherMode = mode === MODE_STD ? MODE_SWAP : MODE_STD;
      const otherDecode = decodeDtc(currentBytes, otherMode);
      const row = document.createElement("tr");
      row.dataset.selected = state.selectedIndex === index ? "1" : "0";
      row.innerHTML = [
        ["#", index + 1],
        ["SPN", dtc.spn],
        ["FMI", dtc.fmi],
        ["OC", dtc.oc],
        ["CM", dtc.cm],
        ["Bytes", formatBytes(currentBytes)],
        [
          "当前模式回读",
          "SPN=" + currentDecode.spn + " FMI=" + currentDecode.fmi + " OC=" + currentDecode.oc + " CM=" + currentDecode.cm,
        ],
        ["另一模式对照", "SPN=" + otherDecode.spn + " FMI=" + otherDecode.fmi],
      ]
        .map(function ([label, value]) {
          return '<td data-col="' + label + '">' + value + "</td>";
        })
        .join("");
      row.addEventListener("click", function () {
        state.selectedIndex = index;
        syncSelection(root, state);
      });
      tableBody.appendChild(row);
    });
  }

  function syncSelection(root, state) {
    qsa(root, "[data-table] tbody tr").forEach(function (row, index) {
      row.dataset.selected = state.selectedIndex === index ? "1" : "0";
    });

    const updateButton = qs(root, "[data-update]");
    const deleteButton = qs(root, "[data-delete]");
    const selected = state.dtcs[state.selectedIndex];
    updateButton.disabled = !selected;
    deleteButton.disabled = !selected;

    if (!selected) {
      return;
    }

    qs(root, "[data-spn]").value = String(selected.spn);
    qs(root, "[data-fmi]").value = String(selected.fmi);
    qs(root, "[data-oc]").value = String(selected.oc);
    qs(root, "[data-cm]").value = String(selected.cm);
  }

  function renderOutput(root, state) {
    const mode = qs(root, "[data-b3-mode]").value === MODE_SWAP ? MODE_SWAP : MODE_STD;
    const sa = parseInteger(qs(root, "[data-sa]").value, "SA");
    const dm1Priority = parseInteger(qs(root, "[data-priority]").value, "DM1 Priority");
    const tpPriority = parseInteger(qs(root, "[data-tp-priority]").value, "TP Priority");
    const result = buildDm1Frames(sa, state.dtcs, readLampState(root), dm1Priority, tpPriority, mode);
    const lines = [];

    lines.push("DM1 PGN: 0xFECA (65226)");
    lines.push(
      "SA: 0x" +
        formatHex(sa, 2) +
        "  DM1 Priority: " +
        dm1Priority +
        "  TP Priority: " +
        tpPriority
    );
    lines.push("Payload 长度: " + result.payloadLength + " bytes");
    lines.push("Lamp Bytes: " + formatBytes(lampBytes(readLampState(root))));
    lines.push("DTC 数量: " + state.dtcs.length);
    lines.push("DTC B3 模式: " + (mode === MODE_STD ? "标准(J1939-73)" : "高低位交换"));
    lines.push("传输模式: " + (result.payloadLength <= 8 ? "单帧 DM1" : "TP.BAM 多包"));
    if (result.payloadLength > 8) {
      lines.push("提示: BAM 发送时可按约 50 ms 的 DT 帧间隔联调");
    }
    lines.push("");

    result.frames.forEach(function (frame, index) {
      lines.push(
        String(index + 1).padStart(2, "0") +
          "  ID= 0x" +
          formatHex(frame.id, 8) +
          "  DATA= " +
          formatBytes(frame.data)
      );
    });

    qs(root, "[data-output]").value = lines.join("\n");
  }

  function renderCanIdDecode(root) {
    const info = decodeCanId(qs(root, "[data-can-id]").value);
    const lines = [
      "CAN ID: 0x" + formatHex(info.id, 8),
      "Priority: " + info.priority,
      "Reserved: " + info.reserved,
      "Data Page: " + info.dp,
      "PF: 0x" + formatHex(info.pf, 2) + " (" + info.pf + ")",
      "PS: 0x" + formatHex(info.ps, 2) + " (" + info.ps + ")",
      "SA: 0x" + formatHex(info.sa, 2) + " (" + info.sa + ")",
      "PGN: 0x" + formatHex(info.pgn, info.pgn > 0xffff ? 5 : 4) + " (" + info.pgn + ")",
      "类型: " + info.pduType,
    ];

    if (info.destination !== null) {
      lines.push("Destination Address: 0x" + formatHex(info.destination, 2) + " (" + info.destination + ")");
    }
    if (info.groupExtension !== null) {
      lines.push("Group Extension: 0x" + formatHex(info.groupExtension, 2) + " (" + info.groupExtension + ")");
    }

    qs(root, "[data-can-id-output]").value = lines.join("\n");
  }

  function renderDtcDecode(root) {
    const bytes = parseByteString(qs(root, "[data-dtc-bytes]").value);
    const mode = qs(root, "[data-dtc-decode-mode]").value === MODE_SWAP ? MODE_SWAP : MODE_STD;
    const current = decodeDtc(bytes, mode);
    const other = decodeDtc(bytes, mode === MODE_STD ? MODE_SWAP : MODE_STD);
    const lines = [
      "Bytes: " + formatBytes(bytes),
      "当前模式: " + (mode === MODE_STD ? "标准(J1939-73)" : "高低位交换"),
      "SPN: " + current.spn,
      "FMI: " + current.fmi,
      "OC: " + current.oc,
      "CM: " + current.cm,
      "",
      "另一模式对照: SPN=" + other.spn + " FMI=" + other.fmi + " OC=" + other.oc + " CM=" + other.cm,
    ];
    qs(root, "[data-dtc-decode-output]").value = lines.join("\n");
  }

  function render(root) {
    const state = {
      dtcs: [],
      selectedIndex: -1,
    };

    function refresh() {
      setStatus(root, "");
      renderTable(root, state);
      syncSelection(root, state);
      renderOutput(root, state);
      renderCanIdDecode(root);
      renderDtcDecode(root);
    }

    qs(root, "[data-add]").addEventListener("click", function () {
      try {
        const dtc = readDtcFields(root);
        encodeDtc(dtc, qs(root, "[data-b3-mode]").value);
        state.dtcs.push(dtc);
        state.selectedIndex = state.dtcs.length - 1;
        refresh();
      } catch (error) {
        setStatus(root, "添加失败: " + error.message);
      }
    });

    qs(root, "[data-update]").addEventListener("click", function () {
      if (state.selectedIndex < 0) {
        return;
      }
      try {
        const dtc = readDtcFields(root);
        encodeDtc(dtc, qs(root, "[data-b3-mode]").value);
        state.dtcs[state.selectedIndex] = dtc;
        refresh();
      } catch (error) {
        setStatus(root, "更新失败: " + error.message);
      }
    });

    qs(root, "[data-delete]").addEventListener("click", function () {
      if (state.selectedIndex < 0) {
        return;
      }
      state.dtcs.splice(state.selectedIndex, 1);
      state.selectedIndex = -1;
      refresh();
    });

    qs(root, "[data-clear]").addEventListener("click", function () {
      state.dtcs = [];
      state.selectedIndex = -1;
      refresh();
    });

    qs(root, "[data-import-btn]").addEventListener("click", function () {
      try {
        state.dtcs = parseDtcImport(qs(root, "[data-import]").value, qs(root, "[data-b3-mode]").value);
        state.selectedIndex = -1;
        refresh();
      } catch (error) {
        setStatus(root, "导入失败: " + error.message);
      }
    });

    qs(root, "[data-copy]").addEventListener("click", async function () {
      const output = qs(root, "[data-output]");
      try {
        await navigator.clipboard.writeText(output.value);
      } catch (error) {
        output.select();
        document.execCommand("copy");
      }
    });

    qs(root, "[data-recalc]").addEventListener("click", function () {
      try {
        refresh();
      } catch (error) {
        setStatus(root, "计算失败: " + error.message);
      }
    });

    qs(root, "[data-parse-can-id]").addEventListener("click", function () {
      try {
        setStatus(root, "");
        renderCanIdDecode(root);
      } catch (error) {
        setStatus(root, "CAN ID 解析失败: " + error.message);
      }
    });

    qs(root, "[data-decode-dtc]").addEventListener("click", function () {
      try {
        setStatus(root, "");
        renderDtcDecode(root);
      } catch (error) {
        setStatus(root, "DTC 解码失败: " + error.message);
      }
    });

    qsa(root, "input, select").forEach(function (element) {
      element.addEventListener("change", function () {
        try {
          setStatus(root, "");
          renderOutput(root, state);
          renderCanIdDecode(root);
          renderDtcDecode(root);
          if (element === qs(root, "[data-b3-mode]")) {
            renderTable(root, state);
            syncSelection(root, state);
          }
        } catch (error) {
          setStatus(root, "联动更新失败: " + error.message);
        }
      });
    });

    state.dtcs.push({ spn: 1083, fmi: 22, oc: 1, cm: 0 });
    refresh();
  }

  document.addEventListener("DOMContentLoaded", function () {
    qsa(document, "[data-dm1calc]").forEach(function (root) {
      try {
        render(root);
      } catch (error) {
        const output = qs(root, "[data-output]");
        if (output) {
          output.value = "初始化失败: " + error.message;
        }
      }
    });
  });
})();
