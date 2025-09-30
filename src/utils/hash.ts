const hex = (buffer: ArrayBuffer) => {
  const view = new Uint8Array(buffer);
  let out = "";
  for (let index = 0; index < view.length; index += 1) {
    const value = view[index]!.toString(16).padStart(2, "0");
    out += value;
  }
  return out;
};

export const sha256Hex = async (input: ArrayBuffer | Uint8Array | Blob) => {
  const data =
    input instanceof ArrayBuffer
      ? input
      : input instanceof Uint8Array
        ? input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength)
        : await input.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", data);
  return hex(digest);
};
