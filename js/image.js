// js/image.js
//
// Proof-of-payment images get compressed here and stored directly as a
// base64 string on the Firestore submission document — no Cloud
// Storage, no Blaze plan required. Firestore documents cap at ~1MB;
// this progressively shrinks the image until it comfortably fits,
// which for a GCash receipt screenshot (mostly flat UI/text, compresses
// very well) almost always succeeds on the first or second attempt.

const MAX_DATA_URL_BYTES = 700_000; // leaves headroom under Firestore's 1MB doc cap

export async function compressImageToDataUrl(file) {
  const img = await loadImage(file);
  let scale = Math.min(1, 900 / Math.max(img.width, img.height));
  let quality = 0.7;

  for (let attempt = 0; attempt < 6; attempt++) {
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.width * scale));
    canvas.height = Math.max(1, Math.round(img.height * scale));
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", quality);

    if (dataUrl.length <= MAX_DATA_URL_BYTES) {
      URL.revokeObjectURL(img.src);
      return dataUrl;
    }
    // Still too big — shrink dimensions and quality further, try again.
    scale *= 0.75;
    quality = Math.max(0.35, quality - 0.1);
  }

  URL.revokeObjectURL(img.src);
  throw new Error("This image is too large even after compression. Please choose a smaller or simpler photo.");
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Couldn't read that image file."));
    img.src = URL.createObjectURL(file);
  });
}