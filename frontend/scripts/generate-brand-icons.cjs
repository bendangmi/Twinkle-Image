const fs = require("node:fs/promises");
const path = require("node:path");
const sharp = require(process.env.SHARP_MODULE_PATH || "sharp");

const root = path.resolve(__dirname, "..");
const source = path.join(root, "public", "brand-mark.svg");

async function main() {
  const brandMark = await sharp(source)
    .resize(64, 64)
    .png({ compressionLevel: 9 })
    .toBuffer();

  const icon192 = await sharp(source)
    .resize(192, 192)
    .png({ compressionLevel: 9 })
    .toBuffer();

  const icon512 = await sharp(source)
    .resize(512, 512)
    .png({ compressionLevel: 9 })
    .toBuffer();

  const maskableIcon512 = await sharp({
    create: {
      width: 512,
      height: 512,
      channels: 4,
      background: "#faf9f5",
    },
  }).composite([{
    input: await sharp(source)
      .resize(410, 410)
      .png({ compressionLevel: 9 })
      .toBuffer(),
    left: 51,
    top: 51,
  }])
    .png({ compressionLevel: 9 })
    .toBuffer();

  await Promise.all([
    fs.writeFile(path.join(root, "public", "brand-mark-64.png"), brandMark),
    fs.writeFile(path.join(root, "public", "favicon.png"), brandMark),
    fs.writeFile(path.join(root, "src", "app", "favicon.png"), brandMark),
    fs.writeFile(path.join(root, "public", "icon-192.png"), icon192),
    fs.writeFile(path.join(root, "public", "icon-512.png"), icon512),
    fs.writeFile(path.join(root, "public", "icon-maskable-512.png"), maskableIcon512),
  ]);

  console.log("Generated Twinkle Image brand and PWA icon assets");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
