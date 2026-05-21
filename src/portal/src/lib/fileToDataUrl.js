// Read a File into a base64 data URL plus its intrinsic pixel dimensions.
// Used by the multi-image doc uploader; the server needs both bytes and
// dimensions to populate session_image.
export default async function fileToDataUrl(file) {
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error('file read failed'));
    reader.readAsDataURL(file);
  });
  const { width, height } = await new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error('image decode failed'));
    img.src = dataUrl;
  });
  return { dataUrl, width, height };
}
