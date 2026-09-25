#!/usr/bin/env node
/**
 * PNG 像素统计：用于在无法肉眼看图时校验截图不是白屏/渲染失败。
 * 用法：node scripts/png-stats.mjs preview/*.png
 *
 * 纯 Node 实现（zlib 解压 + PNG 滤波还原），无第三方依赖。
 */
import { readFile } from 'node:fs/promises';
import { inflateSync } from 'node:zlib';

const files = process.argv.slice(2);
if (!files.length) {
  console.log('用法：node scripts/png-stats.mjs <文件.png> ...');
  process.exit(1);
}

for (const f of files) {
  try {
    const buf = await readFile(f);
    const img = decodePng(buf);
    const stats = analyze(img);
    console.log(
      `${f}\n` +
      `  尺寸 ${img.width}x${img.height}  平均亮度 ${stats.brightness.toFixed(1)}/255  色彩数 ${stats.uniqueColors}  ` +
      `主色 ${stats.dominant}\n` +
      `  判定：${verdict(stats, img)}`,
    );
  } catch (err) {
    console.log(`${f}\n  解码失败：${err.message}`);
  }
}

function verdict(s, img) {
  const problems = [];
  if (img.width < 100) problems.push('尺寸异常');
  // 纯色/空白页的特征是「色彩极少」而不是「亮或暗」——
  // 深色主题与浅色主题的平均亮度天然差很多，所以亮度只作为辅助判断。
  if (s.uniqueColors < 60) problems.push('色彩过少，疑似空白页或纯色');
  if (s.rowVariance < 1) problems.push('各行亮度完全一致，疑似纯色');
  if (s.brightness > 250 && s.uniqueColors < 200) problems.push('几乎全白且无内容');
  if (s.brightness < 3 && s.uniqueColors < 200) problems.push('几乎全黑且无内容');
  if (problems.length) return '⚠ ' + problems.join('；');
  const theme = s.brightness > 128 ? '浅色主题' : '深色主题';
  return `✓ 正常渲染（${theme}，内容密度 ${s.uniqueColors} 色）`;
}

/** 解析 PNG（8 位 RGB/RGBA，非隔行），返回像素数组 */
function decodePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('不是 PNG');
  let pos = 8;
  let width = 0, height = 0, bitDepth = 0, colorType = 0, interlace = 0;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  if (bitDepth !== 8) throw new Error('仅支持 8 位深度');
  if (interlace) throw new Error('不支持隔行扫描');
  const channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[colorType];
  if (!channels) throw new Error('不支持的颜色类型 ' + colorType);

  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const out = Buffer.alloc(height * stride);

  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
    const prev = y ? out.subarray((y - 1) * stride, y * stride) : Buffer.alloc(stride);
    const cur = out.subarray(y * stride, (y + 1) * stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? cur[x - channels] : 0;
      const b = prev[x];
      const c = x >= channels ? prev[x - channels] : 0;
      let v = line[x];
      switch (filter) {
        case 0: break;
        case 1: v += a; break;
        case 2: v += b; break;
        case 3: v += (a + b) >> 1; break;
        case 4: {
          const p = a + b - c;
          const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
          v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
          break;
        }
        default: throw new Error('未知滤波类型 ' + filter);
      }
      cur[x] = v & 0xff;
    }
  }
  return { width, height, channels, pixels: out };
}

function analyze(img) {
  const { width, height, channels, pixels } = img;
  const colors = new Set();
  let sum = 0, n = 0;
  const rowMeans = [];
  const buckets = new Map();
  for (let y = 0; y < height; y += 2) {
    let rowSum = 0, rowN = 0;
    for (let x = 0; x < width; x += 2) {
      const i = (y * width + x) * channels;
      const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2];
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      sum += lum; n++; rowSum += lum; rowN++;
      if (colors.size < 60000) colors.add((r << 16) | (g << 8) | b);
      const key = `${r >> 5},${g >> 5},${b >> 5}`;
      buckets.set(key, (buckets.get(key) || 0) + 1);
    }
    rowMeans.push(rowSum / rowN);
  }
  const mean = rowMeans.reduce((s, v) => s + v, 0) / rowMeans.length;
  const rowVariance = rowMeans.reduce((s, v) => s + (v - mean) ** 2, 0) / rowMeans.length;
  const top = [...buckets.entries()].sort((a, b) => b[1] - a[1])[0];
  return {
    brightness: sum / n,
    uniqueColors: colors.size,
    rowVariance,
    dominant: top ? `rgb(${top[0].split(',').map((v) => Number(v) * 32).join(',')})` : '—',
  };
}
