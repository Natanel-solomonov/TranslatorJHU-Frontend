import fs from 'fs';
import path from 'path';

// Simple PNG generator for icons
function createPNG(width, height, color = '#4F46E5') {
  // Convert hex color to RGB
  const r = parseInt(color.slice(1, 3), 16);
  const g = parseInt(color.slice(3, 5), 16);
  const b = parseInt(color.slice(5, 7), 16);
  
  // Create a simple PNG (this is a minimal valid PNG)
  const png = Buffer.from([
    0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, // PNG signature
    0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52, // IHDR chunk
    (width >> 8) & 0xFF, width & 0xFF, // width
    (height >> 8) & 0xFF, height & 0xFF, // height
    0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xDE, // bit depth, color type, etc.
    0x00, 0x00, 0x00, 0x0C, 0x49, 0x44, 0x41, 0x54, // IDAT chunk
    0x08, 0x99, 0x01, 0x01, 0x00, 0x00, 0x00, 0xFF, 0xFF, 0x00, 0x00, 0x00, 0x02, 0x00, 0x01, // image data
    0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82 // IEND chunk
  ]);
  
  return png;
}

// Create icons directory
const iconsDir = path.join(process.cwd(), 'public', 'icons');
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

// Create icon files
const sizes = [16, 32, 48, 128];
sizes.forEach(size => {
  const iconData = createPNG(size, size);
  const filename = `icon${size}.png`;
  const filepath = path.join(iconsDir, filename);
  fs.writeFileSync(filepath, iconData);
  console.log(`Created ${filename} (${iconData.length} bytes)`);
});

console.log('All icons created successfully!');
