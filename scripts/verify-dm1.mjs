function encodeDtc(dtc, mode) {
  const { spn, fmi, oc, cm } = dtc;
  const b1 = spn & 0xff;
  const b2 = (spn >> 8) & 0xff;
  const b3 =
    mode === "swap"
      ? (((spn >> 16) & 0x07) << 5) | (fmi & 0x1f)
      : ((spn >> 16) & 0x07) | ((fmi & 0x1f) << 3);
  const b4 = (oc & 0x7f) | ((cm & 0x01) << 7);
  return [b1, b2, b3, b4];
}

function decodeDtc(bytes, mode) {
  const [b1, b2, b3, b4] = bytes;
  return mode === "swap"
    ? {
        spn: b1 | (b2 << 8) | (((b3 >> 5) & 0x07) << 16),
        fmi: b3 & 0x1f,
        oc: b4 & 0x7f,
        cm: (b4 >> 7) & 0x01,
      }
    : {
        spn: b1 | (b2 << 8) | ((b3 & 0x07) << 16),
        fmi: (b3 >> 3) & 0x1f,
        oc: b4 & 0x7f,
        cm: (b4 >> 7) & 0x01,
      };
}

function make29bitId(priority, pgn, sa, dest) {
  const dp = (pgn >> 16) & 0x01;
  const pf = (pgn >> 8) & 0xff;
  const ps = pf < 240 ? dest : (pgn & 0xff);
  return (((priority & 0x07) << 26) | ((dp & 0x01) << 24) | ((pf & 0xff) << 16) | ((ps & 0xff) << 8) | (sa & 0xff)) >>> 0;
}

function lampBytes(lamps) {
  return [
    (lamps.mil & 0x03) | ((lamps.red & 0x03) << 2) | ((lamps.amber & 0x03) << 4) | ((lamps.protect & 0x03) << 6),
    (lamps.milFlash & 0x03) | ((lamps.redFlash & 0x03) << 2) | ((lamps.amberFlash & 0x03) << 4) | ((lamps.protectFlash & 0x03) << 6),
  ];
}

function buildDm1(sa, dtcs, lamps, mode) {
  const payload = lampBytes(lamps);
  dtcs.forEach((dtc) => payload.push(...encodeDtc(dtc, mode)));
  return payload;
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const sample = { spn: 1083, fmi: 22, oc: 1, cm: 0 };
const std = encodeDtc(sample, "std");
const swap = encodeDtc(sample, "swap");

assert(std.join(",") === "59,4,176,1", "标准模式编码错误");
assert(swap.join(",") === "59,4,22,1", "交换模式编码错误");

const stdBack = decodeDtc(std, "std");
const stdWrong = decodeDtc(std, "swap");
assert(stdBack.spn === 1083 && stdBack.fmi === 22, "标准模式回读错误");
assert(stdWrong.spn === 328763 && stdWrong.fmi === 16, "标准模式错误对照值不符");

const dm1Single = buildDm1(
  0x80,
  [sample],
  { mil: 0, red: 0, amber: 0, protect: 0, milFlash: 0, redFlash: 0, amberFlash: 0, protectFlash: 0 },
  "std"
);
assert(dm1Single.length === 6, "单帧原始 payload 长度应为 6");

const dm1Bam = buildDm1(
  0x80,
  [sample, { ...sample, spn: 1084 }],
  { mil: 0, red: 0, amber: 0, protect: 0, milFlash: 0, redFlash: 0, amberFlash: 0, protectFlash: 0 },
  "std"
);
assert(dm1Bam.length === 10, "两条 DTC 时 payload 长度应为 10");

assert(make29bitId(6, 0xfeca, 0x80) === 0x18feca80, "DM1 ID 错误");
assert(make29bitId(6, 0xec00, 0x80, 0xff) === 0x18ecff80, "TP.CM ID 错误");
assert(make29bitId(6, 0xeb00, 0x80, 0xff) === 0x18ebff80, "TP.DT ID 错误");

console.log("verify-dm1: OK");
