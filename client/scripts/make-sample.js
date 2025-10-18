import fs from "fs";

const arg = process.argv[2] || "100"; // default 100 MB
const nMB = parseInt(arg, 10);

if (isNaN(nMB) || nMB <= 0) {
  console.error("Invalid size. Example: node scripts/make-sample.js 100");
  process.exit(1);
}

const bytesToWrite = nMB * 1024 * 1024;
const out = "./data/sample.bin";

fs.mkdirSync("./data", { recursive: true });

console.log(
  `Writing ${nMB} MB (${bytesToWrite.toLocaleString()} bytes) to ${out}`
);

const ws = fs.createWriteStream(out, { flags: "w" });
const chunk = Buffer.alloc(1024 * 1024, 0); // 1 MB of zeros
let written = 0;
let done = false;

function writeChunk() {
  if (done) return;

  while (written < bytesToWrite) {
    const remaining = bytesToWrite - written;
    const toWrite =
      remaining >= chunk.length ? chunk : chunk.subarray(0, remaining);
    const ok = ws.write(toWrite);
    written += toWrite.length;

    if (!ok) return;
  }

  done = true;
  ws.end();
  console.log(`Finished exactly ${(bytesToWrite / 1024 / 1024).toFixed(2)} MB`);
}

ws.on("drain", writeChunk);

ws.on("finish", () => {
  console.log("Stream closed");
  console.log(`Actual written: ${written.toLocaleString()} bytes`);
  process.exit(0);
});

ws.on("error", (err) => {
  console.error("Write error:", err);
  process.exit(1);
});

writeChunk();
