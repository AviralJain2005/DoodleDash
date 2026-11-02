// Flood fill runs off the React/UI thread so large canvas operations stay responsive.
// Handle one fill request from Canvas; all pixel processing happens off the UI thread.
self.onmessage = ({ data }) => {
  const { pixels, width, height, x, y, color, jobId } = data;
  // Work on a typed pixel buffer; the final buffer is transferred back without an extra copy.
  const buffer = new Uint8ClampedArray(pixels);
  if (x < 0 || x >= width || y < 0 || y >= height)
    return self.postMessage({ ok: false, jobId });
  const startIndex = (y * width + x) * 4;
  const source = [
    buffer[startIndex],
    buffer[startIndex + 1],
    buffer[startIndex + 2],
    buffer[startIndex + 3],
  ];
  if (source.every((channel, index) => channel === color[index]))
    return self.postMessage({ ok: false, jobId });
  // Treat nearby RGBA values as the same region, allowing small anti-aliasing differences.
  const similar = (index) =>
    Math.abs(buffer[index] - source[0]) < 15 &&
    Math.abs(buffer[index + 1] - source[1]) < 15 &&
    Math.abs(buffer[index + 2] - source[2]) < 15 &&
    Math.abs(buffer[index + 3] - source[3]) < 15;
  // Track visited pixels to avoid processing the same location repeatedly.
  const seen = new Uint8Array(width * height);
  const stack = [x, y];
  seen[y * width + x] = 1;
  // Iterative flood fill: pop a coordinate, recolor it, then queue eligible four-way neighbors.
  while (stack.length) {
    const cy = stack.pop(),
      cx = stack.pop();
    const pixelIndex = cy * width + cx,
      index = pixelIndex * 4;
    buffer[index] = color[0];
    buffer[index + 1] = color[1];
    buffer[index + 2] = color[2];
    buffer[index + 3] = color[3];
    for (const [nx, ny] of [
      [cx + 1, cy],
      [cx - 1, cy],
      [cx, cy + 1],
      [cx, cy - 1],
    ]) {
      if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
        const next = ny * width + nx;
        if (!seen[next] && similar(next * 4)) {
          seen[next] = 1;
          stack.push(nx, ny);
        }
      }
    }
  }
  // Transfer the completed pixel buffer back to the main thread with its request ID.
  self.postMessage({ ok: true, pixels: buffer.buffer, jobId }, [buffer.buffer]);
};
